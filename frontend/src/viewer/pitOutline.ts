import * as THREE from 'three'
import type { PitDesign } from '../design/PitDesign.ts'
import type { Topography } from '../model/topography.ts'

const TOE_COLOR = new THREE.Color(0xe0a23a)
const CREST_COLOR = new THREE.Color(0xffffff)

/** Bench toe and crest lines, cut off where they would rise above the ground. */
export function buildPitOutline(pit: PitDesign, topography: Topography): THREE.LineSegments {
  const positions: number[] = []
  const colors: number[] = []

  for (const ring of pit.rings(topography.top)) {
    const color = ring.kind === 'toe' ? TOE_COLOR : CREST_COLOR
    let [x0, y0] = pit.ringPoint(0, ring.offset)
    let below0 = ring.z <= topography.surfaceAt(x0, y0) + 1e-3
    for (let i = 1; i <= pit.segments; i++) {
      const [x1, y1] = pit.ringPoint(i, ring.offset)
      const below1 = ring.z <= topography.surfaceAt(x1, y1) + 1e-3
      if (below0 && below1) {
        positions.push(x0, y0, ring.z, x1, y1, ring.z)
        colors.push(color.r, color.g, color.b, color.r, color.g, color.b)
      }
      x0 = x1
      y0 = y1
      below0 = below1
    }
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
