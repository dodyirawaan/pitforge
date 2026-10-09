import type { BlockModel } from '../model/BlockModel.ts'
import { optimisePit } from './ultimatePit.ts'

export interface OptimiseRequest {
  model: BlockModel
  values: Float64Array
  slopeAngle: number
}

export type OptimiseResponse = { mined: Uint8Array } | { error: string }

self.onmessage = (event: MessageEvent<OptimiseRequest>) => {
  const { model, values, slopeAngle } = event.data
  let response: OptimiseResponse
  try {
    response = { mined: optimisePit(model, values, slopeAngle) }
  } catch (error) {
    response = { error: error instanceof Error ? error.message : String(error) }
  }
  self.postMessage(response)
}
