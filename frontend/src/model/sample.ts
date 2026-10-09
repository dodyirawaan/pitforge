import { createBlockModel } from './BlockModel.ts'
import type { BlockColumns, BlockModel } from './BlockModel.ts'

function mulberry32(seed: number): () => number {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Synthetic deposit: a dipping gold ore body under gently rolling topography. */
export function createSampleModel(): BlockModel {
  const nx = 60
  const ny = 60
  const nz = 24
  const size = 10
  const random = mulberry32(7)
  const columns: BlockColumns = { x: [], y: [], z: [], grade: [] }

  for (let i = 0; i < nx; i++) {
    for (let j = 0; j < ny; j++) {
      const u = i / nx
      const v = j / ny
      const surface = nz - 4 + 2.5 * Math.sin(u * 5) * Math.cos(v * 4) + 1.5 * u
      for (let k = 0; k < nz; k++) {
        if (k > surface) continue
        const w = k / nz
        // Ore body centre line dips to the east as it gets deeper.
        const cx = 0.62 - 0.35 * w
        const d2 = ((u - cx) / 0.14) ** 2 + ((v - 0.5) / 0.26) ** 2 + ((w - 0.45) / 0.3) ** 2
        const grade = 3.2 * Math.exp(-d2) * (0.75 + 0.5 * random()) + 0.05 * random()
        columns.x.push(500_000 + (i + 0.5) * size)
        columns.y.push(9_200_000 + (j + 0.5) * size)
        columns.z.push(100 + (k + 0.5) * size)
        columns.grade.push(grade)
      }
    }
  }

  return createBlockModel(columns, 'Au (g/t)', [size, size, size])
}
