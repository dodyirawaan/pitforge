const EPSILON = 1e-6

/**
 * Minimum cut by the push-relabel algorithm, on flat arrays so it scales to
 * millions of edges. Only the first phase is run: it finds the cut without
 * working out the full flow, which is all a closure problem needs.
 */
export class FlowNetwork {
  private readonly nodeCount: number
  private readonly head: Int32Array
  private readonly next: Int32Array
  private readonly to: Int32Array
  private readonly capacity: Float64Array
  /** Lower bound on each node's distance to the sink; `nodeCount` means unreachable. */
  private readonly label: Int32Array
  private edgeCount = 0

  /** `maxEdges` is the most edges that will be added; each also stores its reverse. */
  constructor(nodeCount: number, maxEdges: number) {
    this.nodeCount = nodeCount
    this.head = new Int32Array(nodeCount).fill(-1)
    this.label = new Int32Array(nodeCount)
    this.next = new Int32Array(maxEdges * 2)
    this.to = new Int32Array(maxEdges * 2)
    this.capacity = new Float64Array(maxEdges * 2)
  }

  addEdge(from: number, to: number, capacity: number): void {
    this.link(from, to, capacity)
    this.link(to, from, 0)
  }

  /** Solves the minimum cut between source and sink. Query it with `onSourceSide`. */
  solve(source: number, sink: number): void {
    const { nodeCount, head, next, to, capacity, label } = this
    const excess = new Float64Array(nodeCount)
    const current = new Int32Array(nodeCount)
    const queued = new Uint8Array(nodeCount)
    // Circular queue of nodes holding excess flow.
    const queue = new Int32Array(nodeCount)
    const scratch = new Int32Array(nodeCount)
    let read = 0
    let size = 0
    const enqueue = (node: number) => {
      queued[node] = 1
      queue[(read + size++) % nodeCount] = node
    }

    this.relabelFromSink(source, sink, scratch)
    current.set(head)
    for (let edge = head[source]; edge !== -1; edge = next[edge]) {
      const amount = capacity[edge]
      if (amount <= EPSILON) continue
      const target = to[edge]
      capacity[edge] = 0
      capacity[edge ^ 1] += amount
      excess[target] += amount
      if (target !== sink && !queued[target]) enqueue(target)
    }

    let relabels = 0
    while (size > 0) {
      const node = queue[read]
      read = (read + 1) % nodeCount
      size--
      queued[node] = 0

      while (excess[node] > EPSILON && label[node] < nodeCount) {
        const edge = current[node]
        if (edge === -1) {
          let lowest = nodeCount
          for (let e = head[node]; e !== -1; e = next[e]) {
            if (capacity[e] > EPSILON && label[to[e]] + 1 < lowest) lowest = label[to[e]] + 1
          }
          label[node] = lowest
          current[node] = head[node]
          relabels++
          continue
        }
        const target = to[edge]
        if (capacity[edge] > EPSILON && label[node] === label[target] + 1) {
          const amount = Math.min(excess[node], capacity[edge])
          capacity[edge] -= amount
          capacity[edge ^ 1] += amount
          excess[node] -= amount
          excess[target] += amount
          if (target !== sink && target !== source && !queued[target]) enqueue(target)
        } else {
          current[node] = next[edge]
        }
      }

      // Exact distances keep the search directed; recompute them periodically.
      if (relabels >= nodeCount / 4) {
        relabels = 0
        this.relabelFromSink(source, sink, scratch)
        current.set(head)
      }
    }
    this.relabelFromSink(source, sink, scratch)
  }

  /** After `solve`: whether a node is on the source side of the minimum cut. */
  onSourceSide(node: number): boolean {
    return this.label[node] >= this.nodeCount
  }

  private link(from: number, to: number, capacity: number): void {
    const edge = this.edgeCount++
    this.to[edge] = to
    this.capacity[edge] = capacity
    this.next[edge] = this.head[from]
    this.head[from] = edge
  }

  /** Sets every label to the node's distance to the sink through edges with spare capacity. */
  private relabelFromSink(source: number, sink: number, queue: Int32Array): void {
    const { nodeCount, head, next, to, capacity, label } = this
    label.fill(nodeCount)
    label[sink] = 0
    queue[0] = sink
    let read = 0
    let write = 1
    while (read < write) {
      const node = queue[read++]
      for (let edge = head[node]; edge !== -1; edge = next[edge]) {
        const from = to[edge]
        // The paired edge runs from `from` into `node`.
        if (label[from] < nodeCount || from === source || capacity[edge ^ 1] <= EPSILON) continue
        label[from] = label[node] + 1
        queue[write++] = from
      }
    }
  }
}
