import './style.css'
import type * as THREE from 'three'
import { PitDesign, computeMined, defaultPitParams } from './design/PitDesign.ts'
import type { PitParams } from './design/PitDesign.ts'
import { computeReserves } from './design/reserves.ts'
import type { BlockModel } from './model/BlockModel.ts'
import { parseBlockModelCsv } from './model/csv.ts'
import { blockValues, breakEvenGrade, summarisePit } from './optimise/economics.ts'
import type { EconomicParams, PitEconomics } from './optimise/economics.ts'
import { assignPushbacks } from './optimise/pushbacks.ts'
import type { NestedShells } from './optimise/pushbacks.ts'
import { runOptimiser } from './optimise/runOptimiser.ts'
import { buildSchedule } from './schedule/schedule.ts'
import { renderScheduleTable } from './ui/scheduleTable.ts'
import { createSampleModel } from './model/sample.ts'
import { buildTopography } from './model/topography.ts'
import type { Topography } from './model/topography.ts'
import { addSlider, renderRows } from './ui/controls.ts'
import type { SliderOptions } from './ui/controls.ts'
import { BlockModelView } from './viewer/BlockModelView.ts'
import { LEGEND_GRADIENT, gradeColor } from './viewer/colormap.ts'
import { buildPitOutline, disposePitOutline } from './viewer/pitOutline.ts'
import { Viewer } from './viewer/Viewer.ts'

type BlockMode = 'remaining' | 'mined' | 'all'
type PitSource = 'design' | 'optimised'
type ColourMode = 'grade' | 'pushback' | 'period'

interface OptimisedShell {
  /** The ultimate pit and the nested shells inside it. */
  shells: NestedShells
  /** Block values, block tonnage and pit totals under the inputs of the run. */
  values: Float64Array
  blockTonnes: number
  economics: PitEconomics
}

type NumericPitParam = {
  [K in keyof PitParams]: PitParams[K] extends number ? K : never
}[keyof PitParams]

interface Session {
  model: BlockModel
  view: BlockModelView
  topography: Topography
  pit: PitParams
  shell: OptimisedShell | null
}

function element<T extends HTMLElement>(id: string): T {
  const found = document.getElementById(id)
  if (!found) throw new Error(`Missing element #${id}`)
  return found as T
}

const fileInput = element<HTMLInputElement>('file-input')
const sampleButton = element<HTMLButtonElement>('sample-button')
const status = element('status')
const cutoff = element<HTMLInputElement>('cutoff')
const cutoffValue = element('cutoff-value')
const legendTitle = element('legend-title')
const legendMin = element('legend-min')
const legendMax = element('legend-max')
const stats = element('stats')
const pitEnabled = element<HTMLInputElement>('pit-enabled')
const blockMode = element<HTMLSelectElement>('block-mode')
const pitControls = element('pit-controls')
const rampEnabled = element<HTMLInputElement>('ramp-enabled')
const rampControls = element('ramp-controls')
const rampClockwise = element<HTMLInputElement>('ramp-clockwise')
const pitSlope = element('pit-slope')
const economicControls = element('economic-controls')
const breakEven = element('break-even')
const optimiseButton = element<HTMLButtonElement>('optimise-button')
const optimiseStatus = element('optimise-status')
const optimiseResults = element('optimise-results')
const pitSource = element<HTMLSelectElement>('pit-source')
const scheduleEnabled = element<HTMLInputElement>('schedule-enabled')
const scheduleControls = element('schedule-controls')
const colourMode = element<HTMLSelectElement>('colour-mode')
const pushbackControls = element('pushback-controls')
const scheduleSummary = element('schedule-summary')
const schedulePanel = element('schedule-panel')
const playButton = element<HTMLButtonElement>('play-button')
const periodSlider = element<HTMLInputElement>('period-slider')
const periodLabel = element('period-label')
const scheduleTable = element<HTMLTableElement>('schedule-table')
const reserveControls = element('reserve-controls')
const reserves = element('reserves')

element('legend-bar').style.background = LEGEND_GRADIENT

const viewer = new Viewer(element('viewport'))
const integer = new Intl.NumberFormat('en-US')
let session: Session | null = null
let outline: THREE.LineSegments | null = null
let density = 2.7
const economics: EconomicParams = { price: 60, recovery: 90, processingCost: 20, miningCost: 3 }
let slopeAngle = 45
/** Tonnes mined per period. Set from the model size when a model is loaded. */
let miningRate = 0
let discountRate = 10
/** Period shown by the playback, or null to follow the end of the schedule. */
let playPeriod: number | null = null
let periodCount = 0
let playTimer: number | undefined
const UNSCHEDULED_COLOUR: [number, number, number] = [0.33, 0.36, 0.42]
const PLAYBACK_INTERVAL = 700
let pushbackTarget = 4
/** Fractions of the price at which nested shells are optimised, highest first. */
const REVENUE_FACTORS = Array.from({ length: 10 }, (_, i) => 1 - (i * 0.7) / 9)

function formatGrade(value: number): string {
  return value.toFixed(2)
}

function formatTonnes(tonnes: number): string {
  if (tonnes >= 1e6) return `${(tonnes / 1e6).toFixed(2)} Mt`
  return `${(tonnes / 1e3).toFixed(1)} kt`
}

function formatMoney(value: number): string {
  return `$${(value / 1e6).toFixed(1)} M`
}

function formatRatio(value: number): string {
  return Number.isFinite(value) ? value.toFixed(2) : '–'
}

function setOptimiseStatus(message: string, isError = false): void {
  optimiseStatus.textContent = message
  optimiseStatus.classList.toggle('error', isError)
}

function setStatus(message: string, isError = false): void {
  status.textContent = message
  status.classList.toggle('error', isError)
}

function setOutline(next: THREE.LineSegments | null): void {
  viewer.setOverlay(next)
  if (outline) disposePitOutline(outline)
  outline = next
}

/** Recomputes the pit, the visible blocks and every readout from the current inputs. */
function refresh(): void {
  if (!session) return
  const { model, view, topography } = session
  const cutoffGrade = Number(cutoff.value)
  const mode = blockMode.value as BlockMode
  session.pit.rampEnabled = rampEnabled.checked
  session.pit.rampClockwise = rampClockwise.checked
  const pit = pitEnabled.checked ? new PitDesign(session.pit) : null
  const designMined = pit ? computeMined(model, pit) : null
  const source = pitSource.value as PitSource
  const mined = source === 'optimised' ? (session.shell?.shells.mined ?? null) : designMined
  const pushbacks = session.shell ? assignPushbacks(session.shell.shells, pushbackTarget) : null
  // Pushbacks only apply while the optimised shell is the pit in use.
  const pushbackOf = source === 'optimised' ? pushbacks?.phaseOf : undefined

  const schedule =
    scheduleEnabled.checked && mined
      ? buildSchedule(model, mined, density, economics, miningRate, discountRate, pushbackOf)
      : null
  periodCount = schedule ? schedule.periods.length : 0
  const shownPeriod = Math.min(playPeriod ?? periodCount, periodCount)
  // With a schedule, only the blocks mined up to the period shown count as mined.
  const isMined = schedule
    ? (i: number) => schedule.periodOf[i] > 0 && schedule.periodOf[i] <= shownPeriod
    : (i: number) => mined !== null && mined[i] === 1
  // Colour by sequence number along the same ramp as the grades; blocks
  // without a number are grey. Falls back to grade when there is no sequence.
  const sequenceColour = (index: number, count: number) =>
    index > 0 ? gradeColor(count > 1 ? (index - 1) / (count - 1) : 0) : UNSCHEDULED_COLOUR
  let colouring = colourMode.value as ColourMode
  let colourCount = 0
  let colourOf: ((i: number) => [number, number, number]) | undefined
  if (colouring === 'period' && schedule) {
    colourCount = periodCount
    colourOf = (i) => sequenceColour(schedule.periodOf[i], periodCount)
  } else if (colouring === 'pushback' && pushbacks && pushbackOf) {
    colourCount = pushbacks.count
    colourOf = (i) => sequenceColour(pushbackOf[i], pushbacks.count)
  } else {
    colouring = 'grade'
  }

  const shown = view.setVisible((i) => {
    if (model.grades[i] < cutoffGrade) return false
    if (!mined || mode === 'all') return true
    return (mode === 'mined') === isMined(i)
  }, colourOf)

  const legendTitles = { grade: model.gradeName, pushback: 'Pushback', period: 'Period mined' }
  legendTitle.textContent = legendTitles[colouring]
  legendMin.textContent = colouring === 'grade' ? formatGrade(model.gradeMin) : '1'
  legendMax.textContent = colouring === 'grade' ? formatGrade(model.gradeMax) : String(colourCount)

  schedulePanel.hidden = schedule === null
  if (schedule) {
    periodSlider.max = String(periodCount)
    periodSlider.value = String(shownPeriod)
    periodLabel.textContent = shownPeriod === 0 ? 'Before mining' : `Period ${shownPeriod} of ${periodCount}`
    renderScheduleTable(scheduleTable, schedule, shownPeriod, showPeriod)
    scheduleSummary.textContent =
      `${periodCount} periods · NPV ${formatMoney(schedule.npv)} · ` +
      `undiscounted ${formatMoney(schedule.undiscounted)}`
  } else {
    stopPlayback()
    scheduleSummary.textContent =
      scheduleEnabled.checked ? 'There is no pit to schedule. Enable the pit or run the optimisation.' : ''
  }
  setOutline(pit && source === 'design' ? buildPitOutline(pit, topography) : null)

  cutoffValue.textContent = `≥ ${formatGrade(cutoffGrade)}`
  const [dx, dy, dz] = model.size
  renderRows(stats, [
    ['Blocks', integer.format(model.count)],
    ['Shown', integer.format(shown)],
    ['Block size', `${dx} × ${dy} × ${dz}`],
    ['Grade range', `${formatGrade(model.gradeMin)} – ${formatGrade(model.gradeMax)}`],
  ])

  if (pit) {
    const overall = pit.overallAngle(topography.top).toFixed(1)
    pitSlope.textContent = `Inter-ramp angle ${pit.interRampAngle.toFixed(1)}° · overall ${overall}°`
  } else {
    pitSlope.textContent = ''
  }

  if (mined) {
    const result = computeReserves(model, mined, cutoffGrade, density)
    renderRows(reserves, [
      ['Total', formatTonnes(result.totalTonnes)],
      ['Ore', formatTonnes(result.oreTonnes)],
      ['Waste', formatTonnes(result.wasteTonnes)],
      ['Strip ratio', formatRatio(result.stripRatio)],
      ['Ore grade', Number.isNaN(result.oreGrade) ? '–' : formatGrade(result.oreGrade)],
    ])
  } else {
    renderRows(reserves, [])
  }

  const cutoffText = Number.isFinite(breakEvenGrade(economics)) ? formatGrade(breakEvenGrade(economics)) : '–'
  breakEven.textContent = `Break-even cutoff grade ${cutoffText}`
  const rows: [string, string][] = []
  if (session.shell) {
    const shell = session.shell.economics
    rows.push(
      ['Shell value', formatMoney(shell.value)],
      ['Shell total', formatTonnes(shell.totalTonnes)],
      ['Shell ore', formatTonnes(shell.oreTonnes)],
      ['Shell waste', formatTonnes(shell.wasteTonnes)],
      ['Shell strip ratio', formatRatio(shell.stripRatio)],
    )
    if (pushbacks && pushbacks.count > 1) {
      const blocks = new Array<number>(pushbacks.count + 1).fill(0)
      const value = new Array<number>(pushbacks.count + 1).fill(0)
      for (let i = 0; i < model.count; i++) {
        blocks[pushbacks.phaseOf[i]]++
        value[pushbacks.phaseOf[i]] += session.shell.values[i]
      }
      for (let phase = 1; phase <= pushbacks.count; phase++) {
        const tonnes = formatTonnes(blocks[phase] * session.shell.blockTonnes)
        rows.push([`Pushback ${phase}`, `${tonnes} · ${formatMoney(value[phase])}`])
      }
    }
  }
  if (designMined) {
    rows.push(['Design value', formatMoney(summarisePit(model, designMined, density, economics).value)])
  }
  renderRows(optimiseResults, rows)
  viewer.requestRender()
}

function stopPlayback(): void {
  window.clearInterval(playTimer)
  playTimer = undefined
  playButton.textContent = 'Play'
}

/** Jumps the playback to the end of a period; 0 shows the ground before mining. */
function showPeriod(period: number): void {
  stopPlayback()
  playPeriod = period >= periodCount ? null : period
  refresh()
}

function togglePlayback(): void {
  if (playTimer !== undefined) {
    stopPlayback()
    return
  }
  // Start over when the playback is already at the end.
  playPeriod = playPeriod === null ? 0 : playPeriod
  playButton.textContent = 'Pause'
  refresh()
  playTimer = window.setInterval(() => {
    const next = (playPeriod ?? periodCount) + 1
    if (next >= periodCount) {
      playPeriod = null
      stopPlayback()
    } else {
      playPeriod = next
    }
    refresh()
  }, PLAYBACK_INTERVAL)
}

/** Called when an input of the optimisation changes, so an existing shell is out of date. */
function economicsChanged(): void {
  if (session?.shell) setOptimiseStatus('Inputs changed since the last run. Run again to update the shell.')
  refresh()
}

async function optimise(): Promise<void> {
  if (!session) return
  const current = session
  const inputs = { ...economics }
  const inputDensity = density
  optimiseButton.disabled = true
  setOptimiseStatus('Optimising…')
  const started = performance.now()
  try {
    const valueSets = REVENUE_FACTORS.map((factor) =>
      blockValues(current.model, inputDensity, { ...inputs, price: inputs.price * factor }),
    )
    const shells = await runOptimiser(current.model, valueSets, slopeAngle)
    // A different model may have been loaded while the optimiser was running.
    if (session !== current) return
    const [dx, dy, dz] = current.model.size
    current.shell = {
      shells,
      values: valueSets[0],
      blockTonnes: dx * dy * dz * inputDensity,
      economics: summarisePit(current.model, shells.mined, inputDensity, inputs),
    }
    pitSource.value = 'optimised'
    setOptimiseStatus(`Optimised in ${((performance.now() - started) / 1000).toFixed(1)} s.`)
    refresh()
  } catch (error) {
    if (session === current) setOptimiseStatus(error instanceof Error ? error.message : String(error), true)
  } finally {
    optimiseButton.disabled = false
  }
}

function buildEconomicControls(): void {
  const dollars = (value: number) => `$${value}`
  const slider = (key: keyof EconomicParams, options: Omit<SliderOptions, 'value'>) => {
    economics[key] = addSlider(economicControls, { ...options, value: economics[key] }, (value) => {
      economics[key] = value
      economicsChanged()
    })
  }
  slider('price', { label: 'Price per grade unit', min: 0, max: 200, step: 0.5, format: dollars })
  slider('recovery', { label: 'Recovery', min: 0, max: 100, step: 1, format: (value) => `${value}%` })
  slider('processingCost', { label: 'Processing cost per t ore', min: 0, max: 100, step: 0.5, format: dollars })
  slider('miningCost', { label: 'Mining cost per t', min: 0, max: 20, step: 0.1, format: dollars })
  slopeAngle = addSlider(
    economicControls,
    { label: 'Overall slope angle', min: 25, max: 70, step: 1, value: slopeAngle, format: (value) => `${value}°` },
    (value) => {
      slopeAngle = value
      economicsChanged()
    },
  )
  pushbackTarget = addSlider(
    pushbackControls,
    { label: 'Pushbacks', min: 1, max: 8, step: 1, value: pushbackTarget },
    (value) => {
      pushbackTarget = value
      refresh()
    },
  )
}

function buildPitControls(current: Session, bounds: THREE.Box3): void {
  const { model, pit } = current
  const [dx, dy, dz] = model.size
  const [originX, originY, originZ] = model.origin
  const metres = (value: number) => `${value} m`
  const degrees = (value: number) => `${value}°`
  let parent = pitControls
  const slider = (key: NumericPitParam, options: Omit<SliderOptions, 'value'>) => {
    pit[key] = addSlider(parent, { ...options, value: pit[key] }, (value) => {
      pit[key] = value
      refresh()
    })
  }

  pitControls.replaceChildren()
  slider('centerX', {
    label: 'Centre easting',
    min: bounds.min.x,
    max: bounds.max.x,
    step: dx,
    format: (value) => (value + originX).toFixed(0),
  })
  slider('centerY', {
    label: 'Centre northing',
    min: bounds.min.y,
    max: bounds.max.y,
    step: dy,
    format: (value) => (value + originY).toFixed(0),
  })
  slider('floorZ', {
    label: 'Floor elevation',
    min: bounds.min.z,
    max: bounds.max.z,
    step: dz,
    format: (value) => `${(value + originZ).toFixed(0)} m`,
  })
  const span = Math.max(bounds.max.x - bounds.min.x, bounds.max.y - bounds.min.y)
  const floorStep = Math.min(dx, dy)
  slider('floorLength', { label: 'Floor length', min: floorStep, max: span, step: floorStep, format: metres })
  slider('floorWidth', { label: 'Floor width', min: floorStep, max: span, step: floorStep, format: metres })
  slider('azimuth', { label: 'Floor azimuth', min: 0, max: 175, step: 5, format: degrees })
  slider('benchHeight', { label: 'Bench height', min: dz, max: dz * 4, step: dz, format: metres })
  slider('bermWidth', { label: 'Berm width', min: 0, max: 20, step: 0.5, format: metres })
  slider('faceAngle', { label: 'Face angle', min: 30, max: 85, step: 1, format: degrees })

  rampControls.replaceChildren()
  parent = rampControls
  slider('rampWidth', { label: 'Ramp width', min: 5, max: 40, step: 1, format: metres })
  slider('rampGradient', { label: 'Ramp gradient', min: 5, max: 15, step: 0.5, format: (value) => `${value}%` })
  slider('rampStart', { label: 'Ramp start bearing', min: 0, max: 355, step: 5, format: degrees })

  scheduleControls.replaceChildren()
  const modelTonnes = model.count * dx * dy * dz * density
  miningRate = addSlider(
    scheduleControls,
    {
      label: 'Mining rate per period',
      min: modelTonnes / 200,
      max: modelTonnes / 2,
      step: modelTonnes / 200,
      value: modelTonnes / 40,
      format: formatTonnes,
    },
    (value) => {
      miningRate = value
      refresh()
    },
  )
  discountRate = addSlider(
    scheduleControls,
    { label: 'Discount rate per period', min: 0, max: 25, step: 0.5, value: discountRate, format: (value) => `${value}%` },
    (value) => {
      discountRate = value
      refresh()
    },
  )

  reserveControls.replaceChildren()
  density = addSlider(
    reserveControls,
    { label: 'Density', min: 1.5, max: 4.5, step: 0.05, value: density, format: (value) => `${value.toFixed(2)} t/m³` },
    (value) => {
      density = value
      economicsChanged()
    },
  )
}

function show(model: BlockModel, message: string): void {
  session?.view.dispose()
  const view = new BlockModelView(model)
  const bounds = view.bounds()
  session = {
    model,
    view,
    topography: buildTopography(model),
    pit: defaultPitParams(model, bounds),
    shell: null,
  }
  pitSource.value = 'design'
  setOptimiseStatus('Not run yet.')
  viewer.setContent(view.mesh, bounds)
  stopPlayback()
  playPeriod = null

  cutoff.min = String(model.gradeMin)
  cutoff.max = String(model.gradeMax)
  cutoff.step = String((model.gradeMax - model.gradeMin) / 200 || 1)
  cutoff.value = String(model.gradeMin)

  buildPitControls(session, bounds)
  refresh()
  setStatus(message)
}

cutoff.addEventListener('input', refresh)
pitEnabled.addEventListener('change', refresh)
pitSource.addEventListener('change', refresh)
scheduleEnabled.addEventListener('change', refresh)
colourMode.addEventListener('change', refresh)
playButton.addEventListener('click', togglePlayback)
periodSlider.addEventListener('input', () => showPeriod(Number(periodSlider.value)))
optimiseButton.addEventListener('click', optimise)
rampEnabled.addEventListener('change', refresh)
rampClockwise.addEventListener('change', refresh)
blockMode.addEventListener('change', refresh)

sampleButton.addEventListener('click', () => show(createSampleModel(), 'Sample model loaded.'))

fileInput.addEventListener('change', async () => {
  const file = fileInput.files?.[0]
  fileInput.value = ''
  if (!file) return
  try {
    const { model, skipped } = parseBlockModelCsv(await file.text())
    const note = skipped > 0 ? ` (${integer.format(skipped)} invalid rows skipped)` : ''
    show(model, `${file.name} loaded${note}.`)
  } catch (error) {
    setStatus(error instanceof Error ? error.message : String(error), true)
  }
})

buildEconomicControls()
show(createSampleModel(), 'Sample model loaded.')
