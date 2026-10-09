import type { Vec3 } from '../model/BlockModel.ts'

/** Offset in block steps (east, north, up) to a block that must be mined first. */
export type PrecedenceOffset = [number, number, number]

const KEY_SPAN = 4096

function key(di: number, dj: number): number {
  return (di + KEY_SPAN / 2) * KEY_SPAN + (dj + KEY_SPAN / 2)
}

/**
 * Blocks above a block that must be removed before it, for a given wall slope.
 *
 * A block `m` levels up is required when it lies inside the upward cone of
 * that slope. Offsets already implied by chaining shallower offsets are left
 * out. Above `maxLevels` the cone is only followed by chaining, so walls can
 * come out slightly steeper than the slope in some directions.
 */
export function buildPrecedencePattern(size: Vec3, slopeAngle: number, maxLevels: number): PrecedenceOffset[] {
  const [dx, dy, dz] = size
  const reachPerLevel = dz / Math.tan((slopeAngle * Math.PI) / 180)
  const pattern: PrecedenceOffset[] = []
  // implied[m] holds every horizontal offset reachable m levels up.
  const implied: Map<number, [number, number]>[] = [new Map([[key(0, 0), [0, 0]]])]

  for (let level = 1; level <= maxLevels; level++) {
    const reachable = new Map<number, [number, number]>()
    for (const [di, dj, dk] of pattern) {
      for (const [fromI, fromJ] of implied[level - dk].values()) {
        reachable.set(key(fromI + di, fromJ + dj), [fromI + di, fromJ + dj])
      }
    }
    const reach = level * reachPerLevel + 1e-9
    const maxI = Math.floor(reach / dx)
    const maxJ = Math.floor(reach / dy)
    for (let di = -maxI; di <= maxI; di++) {
      for (let dj = -maxJ; dj <= maxJ; dj++) {
        if (Math.hypot(di * dx, dj * dy) > reach || reachable.has(key(di, dj))) continue
        pattern.push([di, dj, level])
        reachable.set(key(di, dj), [di, dj])
      }
    }
    implied.push(reachable)
  }
  return pattern
}
