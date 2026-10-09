import type { BlockModel } from '../model/BlockModel.ts'
import type { OptimiseRequest, OptimiseResponse } from './optimise.worker.ts'
import type { NestedShells } from './pushbacks.ts'

/**
 * Optimises the ultimate pit and the nested shells inside it, off the main
 * thread so the page stays responsive. `valueSets` runs from the highest
 * price to the lowest.
 */
export function runOptimiser(
  model: BlockModel,
  valueSets: Float64Array[],
  slopeAngle: number,
): Promise<NestedShells> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./optimise.worker.ts', import.meta.url), { type: 'module' })
    worker.onmessage = (event: MessageEvent<OptimiseResponse>) => {
      worker.terminate()
      if ('error' in event.data) reject(new Error(event.data.error))
      else resolve(event.data.shells)
    }
    worker.onerror = (event) => {
      worker.terminate()
      reject(new Error(event.message || 'The optimisation failed.'))
    }
    const request: OptimiseRequest = { model, valueSets, slopeAngle }
    worker.postMessage(request)
  })
}
