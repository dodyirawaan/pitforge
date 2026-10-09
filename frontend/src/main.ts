import './style.css'
import type * as THREE from 'three'
import { PitDesign, computeMined, defaultPitParams } from './design/PitDesign.ts'
import type { PitParams } from './design/PitDesign.ts'
import { computeReserves } from './design/reserves.ts'
import type { BlockModel } from './model/BlockModel.ts'
import { parseBlockModelCsv } from './model/csv.ts'
import { createSampleModel } from './model/sample.ts'
import { buildTopography } from './model/topography.ts'
import type { Topography } from './model/topography.ts'
import { addSlider, renderRows } from './ui/controls.ts'
import type { SliderOptions } from './ui/controls.ts'
import { BlockModelView } from './viewer/BlockModelView.ts'
import { LEGEND_GRADIENT } from './viewer/colormap.ts'
import { buildPitOutline, disposePitOutline } from './viewer/pitOutline.ts'
import { Viewer } from './viewer/Viewer.ts'

type BlockMode = 'remaining' | 'mined' | 'all'

type NumericPitParam = {
  [K in keyof PitParams]: PitParams[K] extends number ? K : never
}[keyof PitParams]

interface Session {
  model: BlockModel
  view: BlockModelView
  topography: Topography
  pit: PitParams
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
const reserveControls = element('reserve-controls')
const reserves = element('reserves')

element('legend-bar').style.background = LEGEND_GRADIENT

const viewer = new Viewer(element('viewport'))
const integer = new Intl.NumberFormat('en-US')
let session: Session | null = null
let outline: THREE.LineSegments | null = null
let density = 2.7

function formatGrade(value: number): string {
  return value.toFixed(2)
}

function formatTonnes(tonnes: number): string {
  if (tonnes >= 1e6) return `${(tonnes / 1e6).toFixed(2)} Mt`
  return `${(tonnes / 1e3).toFixed(1)} kt`
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
  const mined = pit ? computeMined(model, pit) : null

  const shown = view.setVisible((i) => {
    if (model.grades[i] < cutoffGrade) return false
    if (!mined || mode === 'all') return true
    return mode === 'mined' ? mined[i] === 1 : mined[i] === 0
  })
  setOutline(pit ? buildPitOutline(pit, topography) : null)

  cutoffValue.textContent = `≥ ${formatGrade(cutoffGrade)}`
  const [dx, dy, dz] = model.size
  renderRows(stats, [
    ['Blocks', integer.format(model.count)],
    ['Shown', integer.format(shown)],
    ['Block size', `${dx} × ${dy} × ${dz}`],
    ['Grade range', `${formatGrade(model.gradeMin)} – ${formatGrade(model.gradeMax)}`],
  ])

  if (pit && mined) {
    const result = computeReserves(model, mined, cutoffGrade, density)
    const overall = pit.overallAngle(topography.top).toFixed(1)
    pitSlope.textContent = `Inter-ramp angle ${pit.interRampAngle.toFixed(1)}° · overall ${overall}°`
    renderRows(reserves, [
      ['Total', formatTonnes(result.totalTonnes)],
      ['Ore', formatTonnes(result.oreTonnes)],
      ['Waste', formatTonnes(result.wasteTonnes)],
      ['Strip ratio', Number.isFinite(result.stripRatio) ? result.stripRatio.toFixed(2) : '–'],
      ['Ore grade', Number.isNaN(result.oreGrade) ? '–' : formatGrade(result.oreGrade)],
    ])
  } else {
    pitSlope.textContent = ''
    renderRows(reserves, [])
  }
  viewer.requestRender()
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

  reserveControls.replaceChildren()
  density = addSlider(
    reserveControls,
    { label: 'Density', min: 1.5, max: 4.5, step: 0.05, value: density, format: (value) => `${value.toFixed(2)} t/m³` },
    (value) => {
      density = value
      refresh()
    },
  )
}

function show(model: BlockModel, message: string): void {
  session?.view.dispose()
  const view = new BlockModelView(model)
  const bounds = view.bounds()
  session = { model, view, topography: buildTopography(model), pit: defaultPitParams(model, bounds) }
  viewer.setContent(view.mesh, bounds)

  legendTitle.textContent = model.gradeName
  legendMin.textContent = formatGrade(model.gradeMin)
  legendMax.textContent = formatGrade(model.gradeMax)

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

show(createSampleModel(), 'Sample model loaded.')
