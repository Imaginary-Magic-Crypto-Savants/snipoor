type QueuedTask<T> = {
  fn: () => Promise<T>
  resolve: (value: T) => void
  reject: (error: Error) => void
}

const queues = new Map<number, QueuedTask<unknown>[]>()
const active = new Map<number, number>()
const limits = new Map<number, number>()
const DEFAULT_CONCURRENCY = 5
const THROTTLED_CONCURRENCY = 2
const THROTTLE_COOLDOWN_MS = 10_000

const throttledUntil = new Map<number, number>()

function getLimit(chainId: number): number {
  const now = Date.now()
  const until = throttledUntil.get(chainId) ?? 0
  if (now < until) return THROTTLED_CONCURRENCY
  return limits.get(chainId) ?? DEFAULT_CONCURRENCY
}

function getQueue(chainId: number): QueuedTask<unknown>[] {
  let q = queues.get(chainId)
  if (!q) {
    q = []
    queues.set(chainId, q)
  }
  return q
}

function drain(chainId: number): void {
  const q = getQueue(chainId)
  const limit = getLimit(chainId)
  // Fill up to the concurrency limit. (The old condition subtracted the
  // already-running count a second time, so a queue draining from a finished
  // task stalled until it fell to ~limit/2 — capping real concurrency at 3 of 5
  // and roughly halving throughput.)
  while (q.length > 0 && (active.get(chainId) ?? 0) < limit) {
    const task = q.shift()!
    active.set(chainId, (active.get(chainId) ?? 0) + 1)
    task
      .fn()
      .then(task.resolve)
      .catch(task.reject)
      .finally(() => {
        active.set(chainId, (active.get(chainId) ?? 0) - 1)
        drain(chainId)
      })
  }
}

export function enqueue<T>(chainId: number, fn: () => Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const q = getQueue(chainId)
    q.push({ fn, resolve, reject } as QueuedTask<unknown>)
    drain(chainId)
  })
}

export function markThrottled(chainId: number): void {
  throttledUntil.set(chainId, Date.now() + THROTTLE_COOLDOWN_MS)
}

export function setConcurrency(chainId: number, max: number): void {
  limits.set(chainId, max)
}

export function getQueueStats(chainId: number): { active: number; queued: number; limit: number } {
  return {
    active: active.get(chainId) ?? 0,
    queued: (queues.get(chainId) ?? []).length,
    limit: getLimit(chainId),
  }
}
