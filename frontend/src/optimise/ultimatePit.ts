import type { BlockModel } from '../model/BlockModel.ts'
import { FlowNetwork } from './maxflow.ts'
import { buildPrecedencePattern } from './precedence.ts'

const MAX_GRID_CELLS = 50_000_000
const MAX_ARCS = 8_000_000
const MAX_PATTERN_LEVELS = 8
const MAX_PATTERN_SIZE = 40

/** The most detailed precedence pattern that stays within the size budget. */
function choosePattern(model: BlockModel, slopeAngle: number, levels: number) {
  for (let maxLevels = Math.min(MAX_PATTERN_LEVELS, levels); maxLevels > 1; maxLevels--) {
    const pattern = buildPrecedencePattern(model.size, slopeAngle, maxLevels)
    if (pattern.length <= MAX_PATTERN_SIZE) return pattern
  }
  return buildPrecedencePattern(model.size, slopeAngle, Math.min(1, levels))
}

/**
 * Finds the ultimate pit: the set of blocks with the highest total value that
 * respects the wall slope. Solved exactly as a maximum closure problem, where
 * the minimum cut separates the blocks worth mining from the rest.
 */
export function optimisePit(model: BlockModel, values: Float64Array, slopeAngle: number): Uint8Array {
  const { count, positions, size } = model
  const min = [Infinity, Infinity, Infinity]
  const max = [-Infinity, -Infinity, -Infinity]
  for (let i = 0; i < count; i++) {
    for (let axis = 0; axis < 3; axis++) {
      const value = positions[i * 3 + axis]
      if (value < min[axis]) min[axis] = value
      if (value > max[axis]) max[axis] = value
    }
  }
  const [nx, ny, nz] = [0, 1, 2].map((axis) => Math.round((max[axis] - min[axis]) / size[axis]) + 1)
  if (nx * ny * nz > MAX_GRID_CELLS) {
    throw new Error('The block model is not on a regular grid, so it cannot be optimised.')
  }

  const cell = (i: number, axis: number) => Math.round((positions[i * 3 + axis] - min[axis]) / size[axis])
  const blockAt = new Int32Array(nx * ny * nz).fill(-1)
  for (let i = 0; i < count; i++) {
    blockAt[(cell(i, 2) * ny + cell(i, 1)) * nx + cell(i, 0)] = i
  }

  const pattern = choosePattern(model, slopeAngle, nz - 1)
  /** Calls `visit` with each existing block that must be mined before block i. */
  const forEachAbove = (i: number, visit: (above: number) => void) => {
    const ix = cell(i, 0)
    const iy = cell(i, 1)
    const iz = cell(i, 2)
    for (const [di, dj, dk] of pattern) {
      const jx = ix + di
      const jy = iy + dj
      const jz = iz + dk
      if (jx < 0 || jx >= nx || jy < 0 || jy >= ny || jz >= nz) continue
      const above = blockAt[(jz * ny + jy) * nx + jx]
      if (above >= 0) visit(above)
    }
  }

  // Only blocks that pay, and the blocks above them, can ever be in the pit.
  // Sweeping upwards marks them all, because precedence only points up.
  const candidate = new Uint8Array(count)
  let candidates = 0
  for (const i of blockAt) {
    if (i < 0) continue
    if (values[i] > 0) candidate[i] = 1
    if (!candidate[i]) continue
    candidates++
    forEachAbove(i, (above) => {
      candidate[above] = 1
    })
  }
  if (candidates * pattern.length > MAX_ARCS) {
    throw new Error('The block model is too large to optimise in the browser.')
  }

  const source = count
  const sink = count + 1
  const network = new FlowNetwork(count + 2, candidates * (pattern.length + 1))
  for (let i = 0; i < count; i++) {
    if (!candidate[i]) continue
    if (values[i] > 0) network.addEdge(source, i, values[i])
    else if (values[i] < 0) network.addEdge(i, sink, -values[i])
    forEachAbove(i, (above) => network.addEdge(i, above, Infinity))
  }

  network.solve(source, sink)
  const mined = new Uint8Array(count)
  for (let i = 0; i < count; i++) {
    // Blocks left out of the network have no path to the sink either.
    if (candidate[i] && network.onSourceSide(i)) mined[i] = 1
  }
  return mined
}
