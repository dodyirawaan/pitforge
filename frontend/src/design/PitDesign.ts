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
  rampEnabled: boolean
  rampWidth: number
  /** Ramp gradient in percent. */
  rampGradient: number
  /** Bearing from the pit centre to the foot of the ramp, in degrees clockwise from north. */
  rampStart: number
  /** Whether the ramp turns clockwise (seen from above) as it climbs. */
  rampClockwise: boolean
}

export interface PitRing {
  kind: 'toe' | 'crest'
  z: number
  /** Horizontal distance from the pit floor outline, before any ramp widening. */
  offset: number
}

export interface RampEdges {
  /** Pit-side and wall-side edges of the road, packed as x, y, z. */
  inner: number[]
  outer: number[]
}

const SEGMENTS = 96
const TWO_PI = Math.PI * 2

function fraction(value: number): number {
  return value - Math.floor(value)
}

/**
 * A benched pit grown upwards from an elliptical floor. Each bench steps the
 * outline outwards by the face run, then by the berm width.
 *
 * An optional haul ramp spirals up the wall from the floor. Positions around
 * the pit are measured in turns along the floor outline. Where the ramp has
 * passed below a point on the wall, the wall is pushed out by the ramp width,
 * and the push grows linearly along the spiral so the road stays continuous.
 */
export class PitDesign {
  readonly params: PitParams
  private readonly semiLength: number
  private readonly semiWidth: number
  // Long axis direction, and the axis 90° counter-clockwise from it.
  private readonly ux: number
  private readonly uy: number
  private readonly vx: number
  private readonly vy: number
  /** Length of the floor outline. */
  private readonly perimeter: number
  /** Horizontal width of one bench face. */
  private readonly faceRun: number
  private readonly innerRadius: number
  private readonly outerRadius: number
  private readonly rampStartTurns: number
  private readonly rampDirection: 1 | -1
  private readonly rampStep: number
  /** Turns the ramp has completed at each `rampStep` of height above the floor. */
  private readonly rampTurns: number[] = [0]
  /** Outline position (in turns) nearest to the last point given to distanceOutside. */
  private nearestTurns = 0

  constructor(params: PitParams) {
    this.params = params
    this.semiLength = params.floorLength / 2
    this.semiWidth = params.floorWidth / 2
    const azimuth = (params.azimuth * Math.PI) / 180
    this.ux = Math.sin(azimuth)
    this.uy = Math.cos(azimuth)
    this.vx = -this.uy
    this.vy = this.ux

    let perimeter = 0
    let [previousX, previousY] = this.outlinePoint(0, 0)
    for (let i = 1; i <= SEGMENTS; i++) {
      const [x, y] = this.outlinePoint(i / SEGMENTS, 0)
      perimeter += Math.hypot(x - previousX, y - previousY)
      previousX = x
      previousY = y
    }
    this.perimeter = perimeter

    this.faceRun = params.benchHeight / Math.tan((params.faceAngle * Math.PI) / 180)
    // Circles that fit inside and around the floor outline.
    this.innerRadius = Math.min(this.semiLength, this.semiWidth)
    this.outerRadius = Math.max(this.semiLength, this.semiWidth)

    // The outline runs counter-clockwise from the long axis, so convert the
    // start bearing into that parameterisation.
    const bearing = ((params.rampStart - params.azimuth) * Math.PI) / 180
    this.rampStartTurns = fraction(
      Math.atan2(-Math.sin(bearing) / this.semiWidth, Math.cos(bearing) / this.semiLength) / TWO_PI,
    )
    this.rampDirection = params.rampClockwise ? -1 : 1
    this.rampStep = params.benchHeight / 40
  }

  get segments(): number {
    return SEGMENTS
  }

  /** Wall angle from bench toe to bench toe, ignoring the ramp, in degrees. */
  get interRampAngle(): number {
    const { benchHeight, bermWidth } = this.params
    return (Math.atan2(benchHeight, this.faceRun + bermWidth) * 180) / Math.PI
  }

  /** Wall angle from the pit floor up to `topZ`, including ramp widening, in degrees. */
  overallAngle(topZ: number): number {
    const height = topZ - this.params.floorZ
    if (height <= 0) return this.interRampAngle
    const ramp = this.params.rampEnabled ? this.params.rampWidth * this.turnsAt(height) : 0
    return (Math.atan2(height, this.smoothOffset(height) + ramp) * 180) / Math.PI
  }

  /** How far the benches have stepped out at elevation z, or -1 below the floor. */
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
    const { centerX, centerY, floorZ, rampEnabled, rampWidth } = this.params
    const dx = x - centerX
    const dy = y - centerY
    const radius = Math.hypot(dx, dy)
    if (radius <= this.innerRadius + offset) return true
    const height = z - floorZ
    const maxWidening = rampEnabled ? rampWidth * (Math.floor(this.turnsAt(height)) + 2) : 0
    if (radius > this.outerRadius + offset + maxWidening) return false
    // Position along the floor's long and short axes.
    const u = dx * this.ux + dy * this.uy
    const v = dx * this.vx + dy * this.vy
    if ((u / this.semiLength) ** 2 + (v / this.semiWidth) ** 2 <= 1) return true
    const distance = this.distanceOutside(u, v)
    if (distance <= offset) return true
    return rampEnabled && distance <= offset + this.rampWidening(height, this.nearestTurns)
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

  /** Point `index` of a ring, including any ramp widening at that position. */
  ringPoint(index: number, ring: PitRing): [number, number] {
    const turns = (index % SEGMENTS) / SEGMENTS
    let offset = ring.offset
    if (this.params.rampEnabled) {
      // Sample just inside the bench the ring belongs to: above a toe, below a crest.
      const nudge = this.params.benchHeight * (ring.kind === 'toe' ? 1e-3 : -1e-3)
      offset += this.rampWidening(ring.z - this.params.floorZ + nudge, turns)
    }
    return this.outlinePoint(turns, offset)
  }

  /**
   * Edges of the ramp from the pit floor up to `topZ`, or null without a ramp.
   * The edges follow the average wall slope rather than each bench step, so
   * they can sit up to one berm width off the benched wall.
   */
  rampEdges(topZ: number): RampEdges | null {
    const { floorZ, rampEnabled, rampWidth } = this.params
    if (!rampEnabled || topZ <= floorZ) return null
    const steps = Math.ceil((topZ - floorZ) / this.rampStep)
    this.extendRamp(steps)
    const edges: RampEdges = { inner: [], outer: [] }
    for (let step = 0; step <= steps; step++) {
      const height = step * this.rampStep
      const turns = this.rampTurns[step]
      const position = this.rampStartTurns + this.rampDirection * turns
      const offset = this.smoothOffset(height) + rampWidth * turns
      edges.inner.push(...this.outlinePoint(position, offset), floorZ + height)
      edges.outer.push(...this.outlinePoint(position, offset + rampWidth), floorZ + height)
    }
    return edges
  }

  /** Point on the floor outline at `turns` around it, pushed outwards by `offset`. */
  private outlinePoint(turns: number, offset: number): [number, number] {
    const cos = Math.cos(turns * TWO_PI)
    const sin = Math.sin(turns * TWO_PI)
    const a = this.semiLength
    const b = this.semiWidth
    const nu = cos / a
    const nv = sin / b
    const length = Math.hypot(nu, nv)
    const u = a * cos + (nu / length) * offset
    const v = b * sin + (nv / length) * offset
    return [
      this.params.centerX + u * this.ux + v * this.vx,
      this.params.centerY + u * this.uy + v * this.vy,
    ]
  }

  /** Bench offset averaged over the bench steps: a straight line through the toes. */
  private smoothOffset(height: number): number {
    return (height / this.params.benchHeight) * (this.faceRun + this.params.bermWidth)
  }

  /** Extra wall offset caused by the ramp at a height above the floor and a position in turns. */
  private rampWidening(height: number, turns: number): number {
    // Position measured along the ramp's direction of travel from its foot.
    const along = fraction(this.rampDirection * (turns - this.rampStartTurns))
    const passesBelow = Math.max(0, Math.ceil(this.turnsAt(height) - along))
    return this.params.rampWidth * (along + passesBelow)
  }

  /** Turns the ramp has completed by the time it reaches a height above the floor. */
  private turnsAt(height: number): number {
    if (height <= 0) return 0
    const position = height / this.rampStep
    const index = Math.floor(position)
    this.extendRamp(index + 1)
    const lower = this.rampTurns[index]
    return lower + (this.rampTurns[index + 1] - lower) * (position - index)
  }

  private extendRamp(index: number): void {
    const { rampWidth, rampGradient } = this.params
    while (this.rampTurns.length <= index) {
      const step = this.rampTurns.length - 1
      const turns = this.rampTurns[step]
      // A curve offset outwards by d from a convex outline is 2πd longer.
      const offset = this.smoothOffset(step * this.rampStep) + rampWidth * (turns + 0.5)
      const lapLength = this.perimeter + TWO_PI * offset
      this.rampTurns.push(turns + this.rampStep / ((rampGradient / 100) * lapLength))
    }
  }

  /**
   * Distance from a point outside the floor ellipse to the ellipse, given in
   * floor-axis coordinates. Iterates towards the nearest point by matching
   * the ellipse's local centre of curvature.
   */
  private distanceOutside(u: number, v: number): number {
    const a = this.semiLength
    const b = this.semiWidth
    const pu = Math.abs(u)
    const pv = Math.abs(v)
    let cos = Math.SQRT1_2
    let sin = Math.SQRT1_2
    for (let i = 0; i < 4; i++) {
      const eu = ((a * a - b * b) * cos ** 3) / a
      const ev = ((b * b - a * a) * sin ** 3) / b
      const r = Math.hypot(a * cos - eu, b * sin - ev)
      const q = Math.hypot(pu - eu, pv - ev)
      cos = Math.min(Math.max((((pu - eu) * r) / q + eu) / a, 0), 1)
      sin = Math.min(Math.max((((pv - ev) * r) / q + ev) / b, 0), 1)
      const length = Math.hypot(cos, sin)
      cos /= length
      sin /= length
    }
    this.nearestTurns = Math.atan2(Math.sign(v) * sin, Math.sign(u) * cos) / TWO_PI
    return Math.hypot(pu - a * cos, pv - b * sin)
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
    rampEnabled: true,
    rampWidth: 25,
    rampGradient: 10,
    rampStart: 0,
    rampClockwise: false,
  }
}
