import './style.css'
import type { BlockModel } from './model/BlockModel.ts'
import { parseBlockModelCsv } from './model/csv.ts'
import { createSampleModel } from './model/sample.ts'
import { BlockModelView } from './viewer/BlockModelView.ts'
import { LEGEND_GRADIENT } from './viewer/colormap.ts'
import { Viewer } from './viewer/Viewer.ts'

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

element('legend-bar').style.background = LEGEND_GRADIENT

const viewer = new Viewer(element('viewport'))
const integer = new Intl.NumberFormat('en-US')
let model: BlockModel | null = null
let view: BlockModelView | null = null

function formatGrade(value: number): string {
  return value.toFixed(2)
}

function setStatus(message: string, isError = false): void {
  status.textContent = message
  status.classList.toggle('error', isError)
}

function renderStats(shown: number): void {
  if (!model) return
  const [dx, dy, dz] = model.size
  const rows: [string, string][] = [
    ['Blocks', integer.format(model.count)],
    ['Shown', integer.format(shown)],
    ['Block size', `${dx} × ${dy} × ${dz}`],
    ['Grade range', `${formatGrade(model.gradeMin)} – ${formatGrade(model.gradeMax)}`],
  ]
  stats.replaceChildren(
    ...rows.flatMap(([label, value]) => {
      const dt = document.createElement('dt')
      dt.textContent = label
      const dd = document.createElement('dd')
      dd.textContent = value
      return [dt, dd]
    }),
  )
}

function applyCutoff(): void {
  if (!view) return
  const value = Number(cutoff.value)
  const shown = view.setCutoff(value)
  cutoffValue.textContent = `≥ ${formatGrade(value)}`
  renderStats(shown)
  viewer.requestRender()
}

function show(next: BlockModel, message: string): void {
  view?.dispose()
  model = next
  view = new BlockModelView(next)
  viewer.setContent(view.mesh, view.bounds())

  legendTitle.textContent = next.gradeName
  legendMin.textContent = formatGrade(next.gradeMin)
  legendMax.textContent = formatGrade(next.gradeMax)

  cutoff.min = String(next.gradeMin)
  cutoff.max = String(next.gradeMax)
  cutoff.step = String((next.gradeMax - next.gradeMin) / 200 || 1)
  cutoff.value = String(next.gradeMin)
  applyCutoff()
  setStatus(message)
}

cutoff.addEventListener('input', applyCutoff)

sampleButton.addEventListener('click', () => show(createSampleModel(), 'Sample model loaded.'))

fileInput.addEventListener('change', async () => {
  const file = fileInput.files?.[0]
  fileInput.value = ''
  if (!file) return
  try {
    const { model: parsed, skipped } = parseBlockModelCsv(await file.text())
    const note = skipped > 0 ? ` (${integer.format(skipped)} invalid rows skipped)` : ''
    show(parsed, `${file.name} loaded${note}.`)
  } catch (error) {
    setStatus(error instanceof Error ? error.message : String(error), true)
  }
})

show(createSampleModel(), 'Sample model loaded.')
