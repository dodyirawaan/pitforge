export interface SliderOptions {
  label: string
  min: number
  max: number
  step: number
  value: number
  format?: (value: number) => string
}

/**
 * Appends a labelled range slider. Returns the initial value after the
 * browser has snapped it to the slider's range and step.
 */
export function addSlider(
  parent: HTMLElement,
  options: SliderOptions,
  onInput: (value: number) => void,
): number {
  const format = options.format ?? String
  const field = document.createElement('label')
  field.className = 'field'

  const head = document.createElement('span')
  head.className = 'field-head'
  const name = document.createElement('span')
  name.textContent = options.label
  const output = document.createElement('output')
  head.append(name, output)

  const input = document.createElement('input')
  input.type = 'range'
  input.min = String(options.min)
  input.max = String(options.max)
  input.step = String(options.step)
  input.value = String(options.value)
  output.textContent = format(Number(input.value))
  input.addEventListener('input', () => {
    const value = Number(input.value)
    output.textContent = format(value)
    onInput(value)
  })

  field.append(head, input)
  parent.append(field)
  return Number(input.value)
}

/** Fills a <dl> with label/value rows. */
export function renderRows(list: HTMLElement, rows: [string, string][]): void {
  list.replaceChildren(
    ...rows.flatMap(([label, value]) => {
      const dt = document.createElement('dt')
      dt.textContent = label
      const dd = document.createElement('dd')
      dd.textContent = value
      return [dt, dd]
    }),
  )
}
