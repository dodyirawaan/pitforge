import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'

// Mining convention: x = east, y = north, z = elevation.
THREE.Object3D.DEFAULT_UP.set(0, 0, 1)

/** Owns the scene, camera and controls. Renders on demand, not every frame. */
export class Viewer {
  private readonly container: HTMLElement
  private readonly scene = new THREE.Scene()
  private readonly renderer = new THREE.WebGLRenderer({ antialias: true })
  private readonly camera = new THREE.PerspectiveCamera(45, 1, 0.1, 1000)
  private readonly controls: OrbitControls
  private content: THREE.Object3D | null = null
  private renderQueued = false

  constructor(container: HTMLElement) {
    this.container = container
    this.scene.background = new THREE.Color(0x12161c)

    const sky = new THREE.HemisphereLight(0xffffff, 0x555a66, 1.6)
    sky.position.set(0, 0, 1)
    const sun = new THREE.DirectionalLight(0xffffff, 1.8)
    sun.position.set(-1, -2, 3)
    this.scene.add(sky, sun)

    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    container.appendChild(this.renderer.domElement)

    this.controls = new OrbitControls(this.camera, this.renderer.domElement)
    this.controls.addEventListener('change', () => this.requestRender())

    new ResizeObserver(() => this.resize()).observe(container)
    this.resize()
  }

  /** Replaces the displayed object and moves the camera to frame `bounds`. */
  setContent(object: THREE.Object3D, bounds: THREE.Box3): void {
    if (this.content) this.scene.remove(this.content)
    this.content = object
    this.scene.add(object)
    this.frame(bounds)
  }

  requestRender(): void {
    if (this.renderQueued) return
    this.renderQueued = true
    requestAnimationFrame(() => {
      this.renderQueued = false
      this.renderer.render(this.scene, this.camera)
    })
  }

  private frame(bounds: THREE.Box3): void {
    const sphere = bounds.getBoundingSphere(new THREE.Sphere())
    const radius = Math.max(sphere.radius, 1)
    // Look from the south-west, above the model.
    const direction = new THREE.Vector3(-1, -1, 0.8).normalize()
    this.camera.position.copy(sphere.center).addScaledVector(direction, radius * 2.4)
    this.camera.near = radius / 100
    this.camera.far = radius * 20
    this.camera.updateProjectionMatrix()
    this.controls.target.copy(sphere.center)
    this.controls.update()
    this.requestRender()
  }

  private resize(): void {
    const { clientWidth, clientHeight } = this.container
    if (clientWidth === 0 || clientHeight === 0) return
    this.renderer.setSize(clientWidth, clientHeight)
    this.camera.aspect = clientWidth / clientHeight
    this.camera.updateProjectionMatrix()
    this.requestRender()
  }
}
