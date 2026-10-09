import type { Schedule } from '../schedule/schedule.ts'

const HEADINGS = [
  'Period',
  'Pushback',
  'Rock (Mt)',
  'Ore (Mt)',
  'Waste (Mt)',
  'Strip ratio',
  'Ore grade',
  'Cash flow ($M)',
  'Discounted ($M)',
  'Cumulative NPV ($M)',
]

const megatonnes = (tonnes: number) => (tonnes / 1e6).toFixed(2)
const millions = (value: number) => (value / 1e6).toFixed(1)
const ratio = (value: number) => (Number.isFinite(value) ? value.toFixed(2) : '–')

function row(cells: string[], tag: 'td' | 'th'): HTMLTableRowElement {
  const tr = document.createElement('tr')
  for (const text of cells) {
    const cell = document.createElement(tag)
    cell.textContent = text
    tr.append(cell)
  }
  return tr
}

/** Fills the schedule table, one row per period, and marks the period being shown. */
export function renderScheduleTable(
  table: HTMLTableElement,
  schedule: Schedule,
  currentPeriod: number,
  onSelect: (period: number) => void,
): void {
  // The pushback column is the second one; leave it out when there are none.
  const columns = <T>(cells: T[]) => (schedule.hasPushbacks ? cells : cells.filter((_, i) => i !== 1))
  const head = document.createElement('thead')
  head.append(row(columns(HEADINGS), 'th'))

  const body = document.createElement('tbody')
  let cumulative = 0
  let tonnes = 0
  let oreTonnes = 0
  let wasteTonnes = 0
  for (const summary of schedule.periods) {
    cumulative += summary.discounted
    tonnes += summary.tonnes
    oreTonnes += summary.oreTonnes
    wasteTonnes += summary.wasteTonnes
    const pushbacks =
      summary.firstPushback === summary.lastPushback
        ? String(summary.firstPushback)
        : `${summary.firstPushback}–${summary.lastPushback}`
    const tr = row(
      columns([
        String(summary.period),
        pushbacks,
        megatonnes(summary.tonnes),
        megatonnes(summary.oreTonnes),
        megatonnes(summary.wasteTonnes),
        ratio(summary.stripRatio),
        Number.isNaN(summary.oreGrade) ? '–' : summary.oreGrade.toFixed(2),
        millions(summary.cashFlow),
        millions(summary.discounted),
        millions(cumulative),
      ]),
      'td',
    )
    if (summary.period === currentPeriod) tr.className = 'current'
    tr.addEventListener('click', () => onSelect(summary.period))
    body.append(tr)
  }

  const foot = document.createElement('tfoot')
  foot.append(
    row(
      columns([
        'Total',
        '',
        megatonnes(tonnes),
        megatonnes(oreTonnes),
        megatonnes(wasteTonnes),
        ratio(oreTonnes > 0 ? wasteTonnes / oreTonnes : Infinity),
        '',
        millions(schedule.undiscounted),
        millions(schedule.npv),
        '',
      ]),
      'td',
    ),
  )
  table.replaceChildren(head, body, foot)
}
