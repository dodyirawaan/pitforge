import type { BlockModel } from '../model/BlockModel.ts'

export interface Reserves {
  blocks: number
  totalTonnes: number
  oreTonnes: number
  wasteTonnes: number
  /** Waste tonnes per ore tonne. Infinite when the pit holds no ore. */
  stripRatio: number
  /** Mean grade of the ore blocks, or NaN when there are none. */
  oreGrade: number
}

/** Tonnage inside the pit, with ore defined as blocks at or above the cutoff. */
export function computeReserves(
  model: BlockModel,
  mined: Uint8Array,
  cutoff: number,
  density: number,
): Reserves {
  const blockTonnes = model.size[0] * model.size[1] * model.size[2] * density
  let blocks = 0
  let oreBlocks = 0
  let gradeSum = 0
  for (let i = 0; i < model.count; i++) {
    if (!mined[i]) continue
    blocks++
    if (model.grades[i] >= cutoff) {
      oreBlocks++
      gradeSum += model.grades[i]
    }
  }
  const oreTonnes = oreBlocks * blockTonnes
  const wasteTonnes = (blocks - oreBlocks) * blockTonnes
  return {
    blocks,
    totalTonnes: blocks * blockTonnes,
    oreTonnes,
    wasteTonnes,
    stripRatio: oreBlocks > 0 ? wasteTonnes / oreTonnes : Infinity,
    oreGrade: oreBlocks > 0 ? gradeSum / oreBlocks : NaN,
  }
}
