import type { Box3 } from 'three'
import type { BlockModel } from '../model/BlockModel.ts'

export interface PitParams {
  /** Pit floor centre, relative to the model origin. */
  centerX: number
  centerY: number
  /** Pit floor elevation, relative to the model origin. */
  floorZ: number
  /** Full length and width of the elliptical pit floor. */
  floorLength: number
  floorWidth: number
  /** Direction of the floor's long axis, in degrees clockwise from north. */
  azimuth: number
  benchHeight: number
  bermWidth: number
  /** Bench face (batter) angle, in degrees from horizontal. */
  faceAngle: number
}

export interface PitRing {
  kind: 'toe' | 'crest'
  z: number
  /** Horizontal distance from the pit floor outline. */
  offset: number
}

const SEGMENTS = 96

/**
 * A benched pit grown upwards from an elliptical floor. Each bench steps the
 * outline outwards by the face run, then by the berm width. No ramps yet.
 */
export class PitDesign {
  readonly params: PitParams
  private readonly baseX = new Float64Array(SEGMENTS)
  private readonly baseY = new Float64Array(SEGMENTS)
  private readonly normalX = new Float64Array(SEGMENTS)
  private readonly normalY = new Float64Array(SEGMENTS)
  /** Horizontal width of one bench face. */
  private readonly faceRun: number
  private readonly innerRadius: number
  private readonly outerRadius: number

  constructor(params: PitParams) {
    this.params = params
    const a = params.floorLength / 2
    const b = params.floorWidth / 2
    const azimuth = (params.azimuth * Math.PI) / 180
    // Long axis direction, and the axis 90° counter-clockwise from it.
    const ux = Math.sin(azimuth)
    const uy = Math.cos(azimuth)
    const vx = -uy
    const vy = ux

    for (let i = 0; i < SEGMENTS; i++) {
      const t = (i / SEGMENTS) * Math.PI * 2
      const cos = Math.cos(t)
      const sin = Math.sin(t)
      this.baseX[i] = params.centerX + a * cos * ux + b * sin * vx
      this.baseY[i] = params.centerY + a * cos * uy + b * sin * vy
      const nu = cos / a
      const nv = sin / b
      const length = Math.hypot(nu, nv)
      this.normalX[i] = (nu * ux + nv * vx) / length
      this.normalY[i] = (nu * uy + nv * vy) / length
    }

    this.faceRun = params.benchHeight / Math.tan((params.faceAngle * Math.PI) / 180)
    // Circles that fit inside and around the sampled floor outline.
    this.innerRadius = Math.min(a, b) * Math.cos(Math.PI / SEGMENTS)
    this.outerRadius = Math.max(a, b)
  }

  get segments(): number {
    return SEGMENTS
  }

  /** Overall wall angle from bench toe to bench toe, in degrees. */
  get overallAngle(): number {
    const { benchHeight, bermWidth } = this.params
    return (Math.atan2(benchHeight, this.faceRun + bermWidth) * 180) / Math.PI
  }

  /** How far the pit outline has stepped out at elevation z, or -1 below the floor. */
  offsetAt(z: number): number {
    const { floorZ, benchHeight, bermWidth } = this.params
    const height = z - floorZ
    if (height < 0) return -1
    const bench = Math.floor(height / benchHeight)
    const withinBench = (height - bench * benchHeight) / benchHeight
    return bench * (this.faceRun + bermWidth) + withinBench * this.faceRun
  }

  contains(x: number, y: number, z: number): boolean {
    const offset = this.offsetAt(z)
    if (offset < 0) return false
    const radius = Math.hypot(x - this.params.centerX, y - this.params.centerY)
    if (radius <= this.innerRadius + offset) return true
    if (radius > this.outerRadius + offset) return false
    return this.signedDistance(x, y) <= offset
  }

  /** Toe and crest outlines from the pit floor up to `topZ`. */
  rings(topZ: number): PitRing[] {
    const { floorZ, benchHeight, bermWidth } = this.params
    const rings: PitRing[] = []
    for (let bench = 0; floorZ + bench * benchHeight <= topZ; bench++) {
      const offset = bench * (this.faceRun + bermWidth)
      rings.push({ kind: 'toe', z: floorZ + bench * benchHeight, offset })
      rings.push({ kind: 'crest', z: floorZ + (bench + 1) * benchHeight, offset: offset + this.faceRun })
    }
    return rings
  }

  /** Point `index` of the floor outline, pushed outwards by `offset`. */
  ringPoint(index: number, offset: number): [number, number] {
    const i = index % SEGMENTS
    return [this.baseX[i] + this.normalX[i] * offset, this.baseY[i] + this.normalY[i] * offset]
  }

  /** Distance to the floor outline: negative inside, positive outside. */
  private signedDistance(x: number, y: number): number {
    let inside = true
    let nearest = Infinity
    for (let i = 0; i < SEGMENTS; i++) {
      const j = (i + 1) % SEGMENTS
      const ex = this.baseX[j] - this.baseX[i]
      const ey = this.baseY[j] - this.baseY[i]
      const px = x - this.baseX[i]
      const py = y - this.baseY[i]
      if (ex * py - ey * px < 0) inside = false
      const t = Math.min(Math.max((px * ex + py * ey) / (ex * ex + ey * ey), 0), 1)
      const dx = px - t * ex
      const dy = py - t * ey
      const distance = dx * dx + dy * dy
      if (distance < nearest) nearest = distance
    }
    return inside ? -Math.sqrt(nearest) : Math.sqrt(nearest)
  }
}

/** Marks every block whose centroid lies inside the pit. */
export function computeMined(model: BlockModel, pit: PitDesign): Uint8Array {
  const mined = new Uint8Array(model.count)
  const { positions } = model
  for (let i = 0; i < model.count; i++) {
    if (pit.contains(positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2])) mined[i] = 1
  }
  return mined
}

/** A starting design: a small floor under the high-grade centre of the deposit. */
export function defaultPitParams(model: BlockModel, bounds: Box3): PitParams {
  const { count, positions, grades, gradeMin, size } = model
  let weightSum = 0
  let x = 0
  let y = 0
  let z = 0
  for (let i = 0; i < count; i++) {
    const weight = (grades[i] - gradeMin) ** 2
    weightSum += weight
    x += weight * positions[i * 3]
    y += weight * positions[i * 3 + 1]
    z += weight * positions[i * 3 + 2]
  }
  if (weightSum > 0) {
    x /= weightSum
    y /= weightSum
    z /= weightSum
  }
  const floorSize = 0.15 * Math.min(bounds.max.x - bounds.min.x, bounds.max.y - bounds.min.y)
  return {
    centerX: x,
    centerY: y,
    floorZ: z,
    floorLength: floorSize,
    floorWidth: floorSize,
    azimuth: 0,
    benchHeight: size[2],
    bermWidth: 5,
    faceAngle: 65,
  }
}
