export type Vec3 = [number, number, number]

export interface BlockModel {
  count: number
  /** Block centroids relative to `origin`, packed as x, y, z. */
  positions: Float32Array
  grades: Float32Array
  /** Block dimensions along x, y, z. All blocks share one size. */
  size: Vec3
  /** Real-world coordinates of the model centre. */
  origin: Vec3
  gradeName: string
  gradeMin: number
  gradeMax: number
}

export interface BlockColumns {
  x: number[]
  y: number[]
  z: number[]
  grade: number[]
}

function extent(values: number[]): [number, number] {
  let min = Infinity
  let max = -Infinity
  for (const v of values) {
    if (v < min) min = v
    if (v > max) max = v
  }
  return [min, max]
}

/** Smallest gap between distinct coordinates, i.e. the block size on a regular grid. */
function inferSpacing(values: number[]): number | null {
  const unique = Float64Array.from(new Set(values)).sort()
  let min = Infinity
  for (let i = 1; i < unique.length; i++) {
    const gap = unique[i] - unique[i - 1]
    if (gap > 1e-6 && gap < min) min = gap
  }
  return Number.isFinite(min) ? min : null
}

function inferSize(columns: BlockColumns): Vec3 {
  const spacings = [columns.x, columns.y, columns.z].map(inferSpacing)
  const fallback = spacings.find((s) => s !== null) ?? 1
  return spacings.map((s) => s ?? fallback) as Vec3
}

export function createBlockModel(columns: BlockColumns, gradeName: string, size?: Vec3): BlockModel {
  const count = columns.x.length
  if (count === 0) throw new Error('The block model contains no blocks.')

  const [xMin, xMax] = extent(columns.x)
  const [yMin, yMax] = extent(columns.y)
  const [zMin, zMax] = extent(columns.z)
  // Take the grade range from the 32-bit values that are actually stored, so
  // a cutoff equal to the minimum never hides the lowest-grade block.
  const grades = Float32Array.from(columns.grade)
  let gradeMin = Infinity
  let gradeMax = -Infinity
  for (const grade of grades) {
    if (grade < gradeMin) gradeMin = grade
    if (grade > gradeMax) gradeMax = grade
  }
  // Mine coordinates (e.g. UTM) are too large for 32-bit floats on the GPU,
  // so positions are stored relative to the model centre.
  const origin: Vec3 = [(xMin + xMax) / 2, (yMin + yMax) / 2, (zMin + zMax) / 2]

  const positions = new Float32Array(count * 3)
  for (let i = 0; i < count; i++) {
    positions[i * 3] = columns.x[i] - origin[0]
    positions[i * 3 + 1] = columns.y[i] - origin[1]
    positions[i * 3 + 2] = columns.z[i] - origin[2]
  }

  return {
    count,
    positions,
    grades,
    size: size ?? inferSize(columns),
    origin,
    gradeName,
    gradeMin,
    gradeMax,
  }
}
