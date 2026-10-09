import type { BlockModel } from '../model/BlockModel.ts'
import { optimisePit } from './ultimatePit.ts'

export interface NestedShells {
  /** The ultimate pit: the largest shell. */
  mined: Uint8Array
  /** For each block, the smallest shell containing it (1 = innermost), or 0 outside the pit. */
  shellRank: Uint8Array
  shellCount: number
}

export interface Pushbacks {
  /** Pushback each block belongs to, starting at 1; 0 outside the pit. */
  phaseOf: Uint8Array
  count: number
}

/**
 * Finds a family of nested pits, one per set of block values. The sets must
 * run from the highest prices to the lowest, so each pit lies inside the one
 * before it; the first set gives the ultimate pit.
 */
export function nestedShells(model: BlockModel, valueSets: Float64Array[], slopeAngle: number): NestedShells {
  const containing = new Uint8Array(model.count)
  let mined: Uint8Array | undefined
  let within: Uint8Array | undefined
  let shellCount = 0
  for (const values of valueSets) {
    const shell = optimisePit(model, values, slopeAngle, within)
    mined ??= shell
    let blocks = 0
    for (let i = 0; i < model.count; i++) {
      if (!shell[i]) continue
      containing[i]++
      blocks++
    }
    if (blocks === 0) break
    shellCount++
    within = shell
  }

  const shellRank = new Uint8Array(model.count)
  for (let i = 0; i < model.count; i++) {
    if (containing[i] > 0) shellRank[i] = shellCount - containing[i] + 1
  }
  return { mined: mined ?? new Uint8Array(model.count), shellRank, shellCount }
}

/**
 * Groups nested shells into at most `target` pushbacks of similar size, by
 * cutting at the shells whose cumulative size is closest to an even split.
 * Gaps between shells can leave fewer, uneven pushbacks.
 */
export function assignPushbacks(shells: NestedShells, target: number): Pushbacks {
  const { shellRank, shellCount } = shells
  const cumulative = new Float64Array(shellCount + 1)
  for (const rank of shellRank) {
    if (rank > 0) cumulative[rank]++
  }
  for (let rank = 1; rank <= shellCount; rank++) cumulative[rank] += cumulative[rank - 1]
  const total = cumulative[shellCount]

  // Last shell of each pushback.
  const cuts: number[] = []
  let previous = 0
  for (let k = 1; k < target; k++) {
    let best = -1
    for (let rank = previous + 1; rank < shellCount; rank++) {
      if (cumulative[rank] === cumulative[previous]) continue
      const error = Math.abs(cumulative[rank] - (k / target) * total)
      if (best < 0 || error < Math.abs(cumulative[best] - (k / target) * total)) best = rank
    }
    if (best < 0) break
    cuts.push(best)
    previous = best
  }
  if (shellCount > 0) cuts.push(shellCount)

  const phaseOfRank = new Uint8Array(shellCount + 1)
  let phase = 0
  for (let rank = 1; rank <= shellCount; rank++) {
    phaseOfRank[rank] = phase + 1
    if (rank === cuts[phase]) phase++
  }
  const phaseOf = new Uint8Array(shellRank.length)
  for (let i = 0; i < shellRank.length; i++) phaseOf[i] = phaseOfRank[shellRank[i]]
  return { phaseOf, count: cuts.length }
}
