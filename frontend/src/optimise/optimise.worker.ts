import type { BlockModel } from '../model/BlockModel.ts'
import { nestedShells } from './pushbacks.ts'
import type { NestedShells } from './pushbacks.ts'

export interface OptimiseRequest {
  model: BlockModel
  /** Block values from the highest price to the lowest; the first gives the ultimate pit. */
  valueSets: Float64Array[]
  slopeAngle: number
}

export type OptimiseResponse = { shells: NestedShells } | { error: string }

self.onmessage = (event: MessageEvent<OptimiseRequest>) => {
  const { model, valueSets, slopeAngle } = event.data
  let response: OptimiseResponse
  try {
    response = { shells: nestedShells(model, valueSets, slopeAngle) }
  } catch (error) {
    response = { error: error instanceof Error ? error.message : String(error) }
  }
  self.postMessage(response)
}
