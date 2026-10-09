import type { BlockModel } from '../model/BlockModel.ts'
import type { OptimiseRequest, OptimiseResponse } from './optimise.worker.ts'

/** Runs the ultimate pit optimisation off the main thread so the page stays responsive. */
export function runOptimiser(model: BlockModel, values: Float64Array, slopeAngle: number): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./optimise.worker.ts', import.meta.url), { type: 'module' })
    worker.onmessage = (event: MessageEvent<OptimiseResponse>) => {
      worker.terminate()
      if ('error' in event.data) reject(new Error(event.data.error))
      else resolve(event.data.mined)
    }
    worker.onerror = (event) => {
      worker.terminate()
      reject(new Error(event.message || 'The optimisation failed.'))
    }
    const request: OptimiseRequest = { model, values, slopeAngle }
    worker.postMessage(request)
  })
}
