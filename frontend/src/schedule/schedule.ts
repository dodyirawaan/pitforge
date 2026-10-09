import type { BlockModel } from '../model/BlockModel.ts'
import { processingMargin } from '../optimise/economics.ts'
import type { EconomicParams } from '../optimise/economics.ts'

export interface PeriodSummary {
  period: number
  tonnes: number
  oreTonnes: number
  wasteTonnes: number
  stripRatio: number
  /** Mean grade of the ore blocks, or NaN when the period has none. */
  oreGrade: number
  cashFlow: number
  /** Cash flow discounted to the start of the schedule. */
  discounted: number
}

export interface Schedule {
  /** Period in which each block is mined, starting at 1; 0 for blocks outside the pit. */
  periodOf: Uint16Array
  periods: PeriodSummary[]
  undiscounted: number
  npv: number
}

/**
 * Schedules a pit bench by bench from the top down, filling each period up to
 * the mining rate. Within a bench, mining starts nearest the pit's centre.
 * Mining top-down always respects precedence, but the sequence is not
 * optimised for value. Ore is any block that pays to process, and cash flows
 * are discounted from the end of each period.
 */
export function buildSchedule(
  model: BlockModel,
  mined: Uint8Array,
  density: number,
  economics: EconomicParams,
  tonnesPerPeriod: number,
  discountRate: number,
): Schedule {
  const { count, positions, grades, size } = model
  const blockTonnes = size[0] * size[1] * size[2] * density

  const order: number[] = []
  let centreX = 0
  let centreY = 0
  for (let i = 0; i < count; i++) {
    if (!mined[i]) continue
    order.push(i)
    centreX += positions[i * 3]
    centreY += positions[i * 3 + 1]
  }
  centreX /= order.length || 1
  centreY /= order.length || 1
  const distance = (i: number) => (positions[i * 3] - centreX) ** 2 + (positions[i * 3 + 1] - centreY) ** 2
  order.sort((a, b) => positions[b * 3 + 2] - positions[a * 3 + 2] || distance(a) - distance(b))

  const periodOf = new Uint16Array(count)
  const periods: PeriodSummary[] = []
  const oreBlocks: number[] = []
  const gradeSums: number[] = []
  const blocksPerPeriod = Math.max(1, Math.round(tonnesPerPeriod / blockTonnes))

  order.forEach((block, position) => {
    const index = Math.floor(position / blocksPerPeriod)
    if (index === periods.length) {
      periods.push({
        period: index + 1,
        tonnes: 0,
        oreTonnes: 0,
        wasteTonnes: 0,
        stripRatio: Infinity,
        oreGrade: NaN,
        cashFlow: 0,
        discounted: 0,
      })
      oreBlocks.push(0)
      gradeSums.push(0)
    }
    periodOf[block] = index + 1
    const summary = periods[index]
    const margin = processingMargin(grades[block], economics)
    summary.tonnes += blockTonnes
    if (margin > 0) {
      oreBlocks[index]++
      gradeSums[index] += grades[block]
      summary.oreTonnes += blockTonnes
    } else {
      summary.wasteTonnes += blockTonnes
    }
    summary.cashFlow += blockTonnes * (Math.max(margin, 0) - economics.miningCost)
  })

  let undiscounted = 0
  let npv = 0
  periods.forEach((summary, index) => {
    if (oreBlocks[index] > 0) {
      summary.stripRatio = summary.wasteTonnes / summary.oreTonnes
      summary.oreGrade = gradeSums[index] / oreBlocks[index]
    }
    summary.discounted = summary.cashFlow / (1 + discountRate / 100) ** summary.period
    undiscounted += summary.cashFlow
    npv += summary.discounted
  })

  return { periodOf, periods, undiscounted, npv }
}
