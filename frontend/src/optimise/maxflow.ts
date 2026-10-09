const EPSILON = 1e-6

/**
 * Minimum cut by the push-relabel algorithm, on flat arrays so it scales to
 * millions of edges. Only the first phase is run: it finds the cut without
 * working out the full flow, which is all a closure problem needs.
 */
export class FlowNetwork {
  private readonly nodeCount: number
  // Edges as added, before they are packed for solving.
  private readonly addedFrom: Int32Array
  private readonly addedTo: Int32Array
  private readonly addedCapacity: Float64Array
  private added = 0
  /** Lower bound on each node's distance to the sink; `nodeCount` means unreachable. */
  private readonly label: Int32Array

  /** `maxEdges` is the most edges that will be added. */
  constructor(nodeCount: number, maxEdges: number) {
    this.nodeCount = nodeCount
    this.label = new Int32Array(nodeCount)
    this.addedFrom = new Int32Array(maxEdges)
    this.addedTo = new Int32Array(maxEdges)
    this.addedCapacity = new Float64Array(maxEdges)
  }

  addEdge(from: number, to: number, capacity: number): void {
    this.addedFrom[this.added] = from
    this.addedTo[this.added] = to
    this.addedCapacity[this.added] = capacity
    this.added++
  }

  /** Solves the minimum cut between source and sink. Query it with `onSourceSide`. */
  solve(source: number, sink: number): void {
    const { nodeCount, label } = this

    // Pack each node's edges side by side, forward and reverse alike, so that
    // scanning a node reads one stretch of memory. Edge e of node n lives at
    // first[n] <= e < first[n + 1], and reverse[e] is its opposite edge.
    const first = new Int32Array(nodeCount + 1)
    for (let i = 0; i < this.added; i++) {
      first[this.addedFrom[i] + 1]++
      first[this.addedTo[i] + 1]++
    }
    for (let node = 0; node < nodeCount; node++) first[node + 1] += first[node]
    const to = new Int32Array(this.added * 2)
    const reverse = new Int32Array(this.added * 2)
    const capacity = new Float64Array(this.added * 2)
    const fill = first.slice(0, nodeCount)
    for (let i = 0; i < this.added; i++) {
      const forward = fill[this.addedFrom[i]]++
      const backward = fill[this.addedTo[i]]++
      to[forward] = this.addedTo[i]
      capacity[forward] = this.addedCapacity[i]
      reverse[forward] = backward
      to[backward] = this.addedFrom[i]
      reverse[backward] = forward
    }

    /** Sets every label to the node's distance to the sink through edges with spare capacity. */
    const scratch = new Int32Array(nodeCount)
    const relabelFromSink = () => {
      label.fill(nodeCount)
      label[sink] = 0
      scratch[0] = sink
      let read = 0
      let write = 1
      while (read < write) {
        const node = scratch[read++]
        for (let edge = first[node]; edge < first[node + 1]; edge++) {
          const from = to[edge]
          if (label[from] < nodeCount || from === source || capacity[reverse[edge]] <= EPSILON) continue
          label[from] = label[node] + 1
          scratch[write++] = from
        }
      }
    }

    const excess = new Float64Array(nodeCount)
    const current = new Int32Array(nodeCount)
    const queued = new Uint8Array(nodeCount)
    // Circular queue of nodes holding excess flow.
    const queue = new Int32Array(nodeCount)
    let read = 0
    let size = 0
    const enqueue = (node: number) => {
      queued[node] = 1
      queue[(read + size++) % nodeCount] = node
    }

    relabelFromSink()
    current.set(first.subarray(0, nodeCount))
    for (let edge = first[source]; edge < first[source + 1]; edge++) {
      const amount = capacity[edge]
      if (amount <= EPSILON) continue
      const target = to[edge]
      capacity[edge] = 0
      capacity[reverse[edge]] += amount
      excess[target] += amount
      if (target !== sink && !queued[target]) enqueue(target)
    }

    let relabels = 0
    while (size > 0) {
      const node = queue[read]
      read = (read + 1) % nodeCount
      size--
      queued[node] = 0
      const end = first[node + 1]

      while (excess[node] > EPSILON && label[node] < nodeCount) {
        const edge = current[node]
        if (edge === end) {
          let lowest = nodeCount
          for (let e = first[node]; e < end; e++) {
            if (capacity[e] > EPSILON && label[to[e]] + 1 < lowest) lowest = label[to[e]] + 1
          }
          label[node] = lowest
          current[node] = first[node]
          relabels++
          continue
        }
        const target = to[edge]
        if (capacity[edge] > EPSILON && label[node] === label[target] + 1) {
          const amount = Math.min(excess[node], capacity[edge])
          capacity[edge] -= amount
          capacity[reverse[edge]] += amount
          excess[node] -= amount
          excess[target] += amount
          if (target !== sink && target !== source && !queued[target]) enqueue(target)
        } else {
          current[node] = edge + 1
        }
      }

      // Exact distances keep the search directed; recompute them periodically.
      if (relabels >= nodeCount / 4) {
        relabels = 0
        relabelFromSink()
        current.set(first.subarray(0, nodeCount))
      }
    }
    relabelFromSink()
  }

  /** After `solve`: whether a node is on the source side of the minimum cut. */
  onSourceSide(node: number): boolean {
    return this.label[node] >= this.nodeCount
  }
}
