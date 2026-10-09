import type { BlockModel } from './BlockModel.ts'

export interface Topography {
  /** Elevation of the top of the model, relative to the model origin. */
  top: number
  /** Ground elevation at a point, or -Infinity outside the model. */
  surfaceAt(x: number, y: number): number
}

const MAX_CELLS = 25_000_000

/** Derives the ground surface from the highest block in each column. */
export function buildTopography(model: BlockModel): Topography {
  const { count, positions, size } = model
  let xMin = Infinity
  let xMax = -Infinity
  let yMin = Infinity
  let yMax = -Infinity
  let top = -Infinity
  for (let i = 0; i < count; i++) {
    const x = positions[i * 3]
    const y = positions[i * 3 + 1]
    const blockTop = positions[i * 3 + 2] + size[2] / 2
    if (x < xMin) xMin = x
    if (x > xMax) xMax = x
    if (y < yMin) yMin = y
    if (y > yMax) yMax = y
    if (blockTop > top) top = blockTop
  }

  const nx = Math.round((xMax - xMin) / size[0]) + 1
  const ny = Math.round((yMax - yMin) / size[1]) + 1
  // Irregular centroids can imply an absurd grid; fall back to a flat surface.
  if (nx * ny > MAX_CELLS) return { top, surfaceAt: () => top }

  const heights = new Float32Array(nx * ny).fill(-Infinity)
  for (let i = 0; i < count; i++) {
    const ix = Math.round((positions[i * 3] - xMin) / size[0])
    const iy = Math.round((positions[i * 3 + 1] - yMin) / size[1])
    const blockTop = positions[i * 3 + 2] + size[2] / 2
    if (blockTop > heights[iy * nx + ix]) heights[iy * nx + ix] = blockTop
  }

  return {
    top,
    surfaceAt(x, y) {
      const ix = Math.round((x - xMin) / size[0])
      const iy = Math.round((y - yMin) / size[1])
      if (ix < 0 || ix >= nx || iy < 0 || iy >= ny) return -Infinity
      return heights[iy * nx + ix]
    },
  }
}
