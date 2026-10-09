import * as THREE from 'three'
import type { BlockModel } from '../model/BlockModel.ts'
import { gradeColor } from './colormap.ts'

/** Renders a block model as one instanced mesh, coloured by grade. */
export class BlockModelView {
  readonly mesh: THREE.InstancedMesh
  private readonly model: BlockModel

  constructor(model: BlockModel) {
    this.model = model
    const geometry = new THREE.BoxGeometry(...model.size)
    const material = new THREE.MeshLambertMaterial()
    this.mesh = new THREE.InstancedMesh(geometry, material, model.count)
    // The instance set changes with the filter, so skip per-mesh culling
    // rather than recomputing the bounding sphere on every change.
    this.mesh.frustumCulled = false
    this.setVisible(() => true)
  }

  /**
   * Shows only the blocks whose index passes `isVisible`. Blocks are coloured
   * by grade unless `colourOf` gives sRGB components for a block. Returns the
   * number shown.
   */
  setVisible(
    isVisible: (index: number) => boolean,
    colourOf?: (index: number) => [number, number, number],
  ): number {
    const { count, positions, grades, gradeMin, gradeMax } = this.model
    const range = gradeMax - gradeMin
    const matrix = new THREE.Matrix4()
    const color = new THREE.Color()
    let shown = 0

    for (let i = 0; i < count; i++) {
      if (!isVisible(i)) continue
      matrix.makeTranslation(positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2])
      this.mesh.setMatrixAt(shown, matrix)
      const t = range > 0 ? (grades[i] - gradeMin) / range : 0
      color.setRGB(...(colourOf ? colourOf(i) : gradeColor(t)), THREE.SRGBColorSpace)
      this.mesh.setColorAt(shown, color)
      shown++
    }

    this.mesh.count = shown
    this.mesh.instanceMatrix.needsUpdate = true
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true
    return shown
  }

  /** Bounds of the whole model, independent of the current filter. */
  bounds(): THREE.Box3 {
    const box = new THREE.Box3()
    const point = new THREE.Vector3()
    const { count, positions, size } = this.model
    for (let i = 0; i < count; i++) {
      box.expandByPoint(point.fromArray(positions, i * 3))
    }
    return box.expandByVector(new THREE.Vector3(...size).multiplyScalar(0.5))
  }

  dispose(): void {
    this.mesh.geometry.dispose()
    ;(this.mesh.material as THREE.Material).dispose()
    this.mesh.dispose()
  }
}
