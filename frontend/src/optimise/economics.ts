import type { BlockModel } from '../model/BlockModel.ts'

export interface EconomicParams {
  /** Revenue per tonne of ore for each unit of grade, before recovery. */
  price: number
  /** Processing recovery in percent. */
  recovery: number
  /** Cost per tonne of ore processed. */
  processingCost: number
  /** Cost per tonne of rock mined, ore or waste. */
  miningCost: number
}

export interface PitEconomics {
  blocks: number
  totalTonnes: number
  oreTonnes: number
  wasteTonnes: number
  stripRatio: number
  /** Undiscounted value of mining the pit. */
  value: number
}

/** Processing margin per tonne of a block at the given grade. */
export function processingMargin(grade: number, params: EconomicParams): number {
  return (grade * params.price * params.recovery) / 100 - params.processingCost
}

/** Grade above which processing a block pays for itself. */
export function breakEvenGrade(params: EconomicParams): number {
  const revenuePerGrade = (params.price * params.recovery) / 100
  return revenuePerGrade > 0 ? params.processingCost / revenuePerGrade : Infinity
}

/** Value of mining each block: processed if that pays, otherwise sent to waste. */
export function blockValues(model: BlockModel, density: number, params: EconomicParams): Float64Array {
  const tonnes = model.size[0] * model.size[1] * model.size[2] * density
  const values = new Float64Array(model.count)
  for (let i = 0; i < model.count; i++) {
    values[i] = tonnes * (Math.max(processingMargin(model.grades[i], params), 0) - params.miningCost)
  }
  return values
}

/** Tonnage and value of a pit, with ore defined as blocks that pay to process. */
export function summarisePit(
  model: BlockModel,
  mined: Uint8Array,
  density: number,
  params: EconomicParams,
): PitEconomics {
  const tonnes = model.size[0] * model.size[1] * model.size[2] * density
  let blocks = 0
  let oreBlocks = 0
  let value = 0
  for (let i = 0; i < model.count; i++) {
    if (!mined[i]) continue
    blocks++
    const blockMargin = processingMargin(model.grades[i], params)
    if (blockMargin > 0) oreBlocks++
    value += tonnes * (Math.max(blockMargin, 0) - params.miningCost)
  }
  const oreTonnes = oreBlocks * tonnes
  const wasteTonnes = (blocks - oreBlocks) * tonnes
  return {
    blocks,
    totalTonnes: blocks * tonnes,
    oreTonnes,
    wasteTonnes,
    stripRatio: oreBlocks > 0 ? wasteTonnes / oreTonnes : Infinity,
    value,
  }
}
