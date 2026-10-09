import * as THREE from 'three'
import type { PitDesign } from '../design/PitDesign.ts'
import type { Topography } from '../model/topography.ts'

const TOE_COLOR = new THREE.Color(0xe0a23a)
const CREST_COLOR = new THREE.Color(0xffffff)
const RAMP_COLOR = new THREE.Color(0x5ad1ff)

/** Bench toe and crest lines plus ramp edges, cut off where they would rise above the ground. */
export function buildPitOutline(pit: PitDesign, topography: Topography): THREE.LineSegments {
  const positions: number[] = []
  const colors: number[] = []

  /** Adds a polyline packed as x, y, z, keeping only the segments below ground level. */
  const addPolyline = (points: number[], color: THREE.Color) => {
    const below = (i: number) => points[i + 2] <= topography.surfaceAt(points[i], points[i + 1]) + 1e-3
    let previousBelow = below(0)
    for (let i = 3; i < points.length; i += 3) {
      const currentBelow = below(i)
      if (previousBelow && currentBelow) {
        positions.push(points[i - 3], points[i - 2], points[i - 1], points[i], points[i + 1], points[i + 2])
        colors.push(color.r, color.g, color.b, color.r, color.g, color.b)
      }
      previousBelow = currentBelow
    }
  }

  for (const ring of pit.rings(topography.top)) {
    const points: number[] = []
    for (let i = 0; i <= pit.segments; i++) {
      points.push(...pit.ringPoint(i, ring), ring.z)
    }
    addPolyline(points, ring.kind === 'toe' ? TOE_COLOR : CREST_COLOR)
  }

  const ramp = pit.rampEdges(topography.top)
  if (ramp) {
    addPolyline(ramp.inner, RAMP_COLOR)
    addPolyline(ramp.outer, RAMP_COLOR)
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
  // Drawn over the blocks: the design surface cuts through the blocky pit
  // wall, so depth testing would hide the lines in patches.
  const material = new THREE.LineBasicMaterial({ vertexColors: true, depthTest: false, transparent: true })
  const lines = new THREE.LineSegments(geometry, material)
  lines.renderOrder = 1
  return lines
}

export function disposePitOutline(lines: THREE.LineSegments): void {
  lines.geometry.dispose()
  ;(lines.material as THREE.Material).dispose()
}
