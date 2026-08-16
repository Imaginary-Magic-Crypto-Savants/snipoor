import { JsonRpcProvider, FetchRequest, formatEther } from "ethers"
import { CHAINS, RPC_FALLBACKS } from "./chains"
import { multicall, encodeGetEthBalance, decodeUint256 } from "./multicall"
import { getAllAlchemyKeys, markAlchemyKeyThrottled, getPaidAlchemyKey, getUserApiKeys, isAlchemyKeyThrottled, getBalanceKeyCandidates } from "~/lib/api/keys"
import { enqueue, markThrottled } from "./rpc-queue"

// One provider per distinct URL so switching endpoints doesn't churn instances.
const providerByUrl = new Map<string, JsonRpcProvider>()
const rpcPools = new Map<number, string[]>()
// Per-URL cooldown: an endpoint that just errored is skipped until this passes,
// so selection moves down the pool instead of hammering a dead/limited node.
const urlCooldownUntil = new Map<string, number>()
// 20s, not 60s: rate limits clear fast, and long per-URL cooldowns compound
// with the key throttle into minutes of "nothing works".
const RATE_LIMIT_COOLDOWN_MS = 20_000
const TRANSIENT_COOLDOWN_MS = 5_000

// Hard reset of endpoint cooldowns + health stats. Called on explicit user
// actions (manual refresh, mint start) so stale throttle state from a bad
// moment never blocks work the user is actively demanding.
export function clearRpcCooldowns(): void {
  urlCooldownUntil.clear()
  rpcHealth.clear()
}

// Hard per-request timeout. ethers' default FetchRequest timeout is 300s, so a
// silent/limited endpoint would stall detection for minutes.
const RPC_TIMEOUT_MS = 12_000

// Build a provider whose requests time out fast AND do NOT use ethers' built-in
// 429 throttle-retry (default ~12 attempts with backoff). A rate-limited endpoint
// then throws immediately to our own withRetry failover instead of the UI hanging
// while ethers silently retries the same dead key over and over.
export function makeProvider(url: string, chainId: number): JsonRpcProvider {
  const req = new FetchRequest(url)
  req.timeout = RPC_TIMEOUT_MS
  req.setThrottleParams({ maxAttempts: 1 })
  return new JsonRpcProvider(req, chainId, { staticNetwork: true })
}

function keyFromAlchemyUrl(url: string): string | null {
  const m = url.match(/g\.alchemy\.com\/(?:v2|nft\/v3)\/([^/?]+)/)
  return m ? m[1] : null
}

const ALCHEMY_CHAINS: Record<number, string> = {
  1: "eth-mainnet",
  8453: "base-mainnet",
  42161: "arb-mainnet",
}

// Alchemy subdomains for the balance-read path (includes Robinhood, which is
// served only over Alchemy). Kept separate from ALCHEMY_CHAINS above, which
// drives free-key pool insertion for the general RPC path.
const ALCHEMY_BALANCE_NETS: Record<number, string> = {
  1: "eth-mainnet",
  8453: "base-mainnet",
  42161: "arb-mainnet",
  4663: "robinhood-mainnet",
}

// One provider per distinct balance URL. Pinned to the paid key so refreshes stay
// reliable and outside the throttle pool.
const balanceProviderByUrl = new Map<string, JsonRpcProvider>()

// Picks the balance provider AND reports which Alchemy key it used, so a failed
// attempt can park that key and the next attempt lands on a different one.
// Candidates come from getBalanceKeyCandidates, which is chain-aware: on pinned
// chains (Robinhood) only keys with the network enabled are offered, so a free
// key can never 401 there and get itself globally throttled.
export async function pickBalanceProvider(
  chainId: number,
  avoid?: ReadonlySet<string>
): Promise<{ provider: JsonRpcProvider; key: string | null }> {
  const net = ALCHEMY_BALANCE_NETS[chainId]
  if (net) {
    const candidates = (await getBalanceKeyCandidates(chainId)).filter(Boolean)
    // Every candidate (including the paid key) respects the throttle cooldown —
    // re-hitting a 429'ing billed endpoint every attempt is exactly what we
    // don't want. `avoid` holds keys that failed transiently within THIS call:
    // rotate past them for the retry without the global 20s park (a timeout on
    // one endpoint is no reason to bench the key for everyone). If all are
    // cooling: chains with public fallbacks drop to the general pool; a pinned
    // chain with no alternative uses its best candidate anyway (it will fail
    // fast on the 12s timeout rather than silently hang).
    const key =
      candidates.find((k) => !isAlchemyKeyThrottled(k) && !avoid?.has(k)) ??
      candidates.find((k) => !isAlchemyKeyThrottled(k)) ??
      null
    if (!key) {
      const hasPublicFallback = (RPC_FALLBACKS[chainId] ?? []).some((u) => !u.includes("g.alchemy.com"))
      if (!hasPublicFallback && candidates[0]) {
        return { provider: getBalanceProviderFor(net, candidates[0], chainId), key: candidates[0] }
      }
      return { provider: getProvider(chainId), key: null }
    }
    return { provider: getBalanceProviderFor(net, key, chainId), key }
  }
  return { provider: getProvider(chainId), key: null }
}

function getBalanceProviderFor(net: string, key: string, chainId: number): JsonRpcProvider {
  const url = `https://${net}.g.alchemy.com/v2/${key}`
  let provider = balanceProviderByUrl.get(url)
  if (!provider) {
    provider = makeProvider(url, chainId)
    balanceProviderByUrl.set(url, provider)
  }
  return provider
}

export async function getBalanceProvider(chainId: number): Promise<JsonRpcProvider> {
  return (await pickBalanceProvider(chainId)).provider
}

// Retry loop for balance reads. Deliberately NOT withRetry: that helper
// attributes success/failure to selectRpcUrl's pick from the GENERAL pool, but
// balance requests go through pickBalanceProvider's separate key rotation — so
// withRetry would cool/throttle a URL the request never touched (polluting
// health stats and, on Robinhood, throttling the paid key for other callers).
// Here the key that actually failed is the key that gets parked.
export async function withBalanceRetry<T>(
  chainId: number,
  fn: (provider: JsonRpcProvider) => Promise<T>,
  attempts = 3
): Promise<T> {
  let lastError: Error | null = null
  const failedThisCall = new Set<string>()
  for (let attempt = 0; attempt < attempts; attempt++) {
    const { provider, key } = await pickBalanceProvider(chainId, failedThisCall)
    try {
      return await enqueue(chainId, () => fn(provider))
    } catch (e) {
      lastError = e instanceof Error ? e : new Error(String(e))
      if (key) failedThisCall.add(key)
      const msg = lastError.message.toLowerCase()
      // Park the key ONLY on signals that are actually about the key (rate
      // limit / auth). A generic timeout or network blip says nothing about the
      // key, and parking on it is how one flaky moment used to park EVERY key
      // for 60s and make the whole extension feel dead.
      const keyLevelFailure =
        msg.includes("429") || msg.includes("rate") || msg.includes("limit") ||
        msg.includes("401") || msg.includes("403") || msg.includes("unauthorized") || msg.includes("forbidden")
      if (key && keyLevelFailure) markAlchemyKeyThrottled(key)
      if (msg.includes("429") || msg.includes("rate") || msg.includes("limit")) markThrottled(chainId)
      if (attempt < attempts - 1) await new Promise((r) => setTimeout(r, 300 * (attempt + 1)))
    }
  }
  throw lastError
}

const rpcHealth = new Map<string, { errors: number; lastError: number; avgLatency: number }>()

function getPool(chainId: number): string[] {
  const cached = rpcPools.get(chainId)
  if (cached && cached.length > 0) return cached
  const pool = [...(RPC_FALLBACKS[chainId] ?? [CHAINS[chainId]?.rpcDefault].filter(Boolean))]
  rpcPools.set(chainId, pool)
  return pool
}

export async function initAlchemyRpc(): Promise<void> {
  const keys = await getAllAlchemyKeys()
  for (const chainId of Object.keys(ALCHEMY_CHAINS).map(Number)) {
    const pool = getPool(chainId)
    const prefix = `https://${ALCHEMY_CHAINS[chainId]}.g.alchemy.com/v2/`
    for (let i = pool.length - 1; i >= 0; i--) {
      if (pool[i].startsWith(prefix)) pool.splice(i, 1)
    }
    // Insert keys at the front in order so free keys lead and the pay-as-you-go
    // key trails them (still ahead of public fallbacks for mint reliability).
    // getAllAlchemyKeys already returns [user?, free1, free2, overflow].
    for (let i = keys.length - 1; i >= 0; i--) {
      const url = `https://${ALCHEMY_CHAINS[chainId]}.g.alchemy.com/v2/${keys[i]}`
      if (!pool.includes(url)) {
        pool.unshift(url)
      }
    }
    providerByUrl.clear()
  }
  await initRobinhoodRpc()
}

// Robinhood (4663) is served ONLY over Alchemy, and only a user-provided key or
// the pay-as-you-go key have the network enabled (the free keys 401 on it). Its
// bundled default in RPC_FALLBACKS is a single rate-limited key with no backup —
// so front-load the user key (preferred) and the paid key into its pool, letting
// a user-supplied Alchemy key override the throttled default. Without this, the
// general RPC path (detection, mint reads) on Robinhood never sees the user key.
async function initRobinhoodRpc(): Promise<void> {
  const net = ALCHEMY_BALANCE_NETS[4663] // "robinhood-mainnet"
  if (!net) return
  const pool = getPool(4663)
  const prefix = `https://${net}.g.alchemy.com/v2/`

  const candidates: string[] = []
  const userKey = (await getUserApiKeys()).alchemy?.trim()
  if (userKey) candidates.push(userKey)
  const paid = await getPaidAlchemyKey()
  if (paid && !candidates.includes(paid)) candidates.push(paid)
  if (candidates.length === 0) return

  // Pull any candidate URLs already present so they re-insert at the front (fresh
  // priority). The rate-limited bundled default stays as a last-resort tail entry.
  for (let i = pool.length - 1; i >= 0; i--) {
    if (pool[i].startsWith(prefix) && candidates.includes(pool[i].slice(prefix.length))) {
      pool.splice(i, 1)
    }
  }
  for (let i = candidates.length - 1; i >= 0; i--) {
    const url = `${prefix}${candidates[i]}`
    if (!pool.includes(url)) pool.unshift(url)
  }
  providerByUrl.clear()
}

export function setRpcOverride(chainId: number, url: string): void {
  const pool = getPool(chainId)
  if (!pool.includes(url)) pool.unshift(url)
  providerByUrl.clear()
}

// An endpoint is usable if it isn't in cooldown and hasn't piled up errors.
function urlUsable(url: string): boolean {
  const cd = urlCooldownUntil.get(url)
  if (cd !== undefined && Date.now() < cd) return false
  const health = rpcHealth.get(url)
  return !health || health.errors < 3 || Date.now() - health.lastError > 30_000
}

// Picks the first usable endpoint in pool order — free Alchemy keys lead, so
// selection naturally returns to them once they recover, and only falls through
// to the pay-as-you-go key / public nodes when the cheaper ones are down. If
// none are usable, takes the one whose cooldown/error is closest to clearing.
function selectRpcUrl(chainId: number): string {
  const pool = getPool(chainId)
  for (const url of pool) {
    if (urlUsable(url)) return url
  }
  let best = pool[0]
  let bestWhen = Infinity
  for (const url of pool) {
    const when = urlCooldownUntil.get(url) ?? rpcHealth.get(url)?.lastError ?? 0
    if (when < bestWhen) {
      bestWhen = when
      best = url
    }
  }
  return best
}

function trackRpcError(url: string): void {
  const health = rpcHealth.get(url) ?? { errors: 0, lastError: 0, avgLatency: 0 }
  health.errors++
  health.lastError = Date.now()
  rpcHealth.set(url, health)
}

function trackRpcSuccess(url: string, latency: number): void {
  const health = rpcHealth.get(url) ?? { errors: 0, lastError: 0, avgLatency: 0 }
  health.errors = Math.max(0, health.errors - 1)
  health.avgLatency = health.avgLatency > 0 ? (health.avgLatency * 0.7 + latency * 0.3) : latency
  rpcHealth.set(url, health)
}

export function getProvider(chainId: number): JsonRpcProvider {
  const chain = CHAINS[chainId]
  if (!chain) throw new Error(`Unknown chain: ${chainId}`)

  const url = selectRpcUrl(chainId)
  let provider = providerByUrl.get(url)
  if (!provider) {
    provider = makeProvider(url, chainId)
    providerByUrl.set(url, provider)
  }
  return provider
}

function getCurrentRpcUrl(chainId: number): string {
  return selectRpcUrl(chainId)
}

export async function withRetry<T>(chainId: number, fn: () => Promise<T>, maxRetries?: number): Promise<T> {
  const pool = getPool(chainId)
  const attempts = maxRetries ?? Math.max(pool.length, 3)
  let lastError: Error | null = null

  for (let attempt = 0; attempt < attempts; attempt++) {
    const url = selectRpcUrl(chainId)
    const start = performance.now()
    try {
      const result = await enqueue(chainId, fn)
      trackRpcSuccess(url, performance.now() - start)
      return result
    } catch (e) {
      lastError = e instanceof Error ? e : new Error(String(e))
      trackRpcError(url)
      const msg = lastError.message.toLowerCase()
      const isRateLimit = msg.includes("429") || msg.includes("rate") || msg.includes("too many") || msg.includes("limit")
      const isAuthFail = msg.includes("401") || msg.includes("403") || msg.includes("unauthorized") || msg.includes("forbidden")
      const isRetryable = isRateLimit || isAuthFail || msg.includes("503") || msg.includes("server_error") || msg.includes("failed to fetch") || msg.includes("network") || msg.includes("econnrefused") || msg.includes("timeout") || msg.includes("enotfound")

      // Cool the failed endpoint so the next attempt selects a different one
      // (and free keys are reused once their cooldown clears). Rate-limit / auth
      // failures also park the underlying Alchemy key for REST callers.
      if (isRetryable) {
        urlCooldownUntil.set(url, Date.now() + (isRateLimit || isAuthFail ? RATE_LIMIT_COOLDOWN_MS : TRANSIENT_COOLDOWN_MS))
      }
      if (isRateLimit || isAuthFail) {
        const key = keyFromAlchemyUrl(url)
        if (key) markAlchemyKeyThrottled(key)
      }
      if (isRateLimit) markThrottled(chainId)

      if (isRetryable && attempt < attempts - 1) {
        await new Promise((r) => setTimeout(r, 300 * (attempt + 1)))
        continue
      }
      break
    }
  }
  throw lastError
}

export function clearProviderCache(): void {
  providerByUrl.clear()
}

export async function testRpc(chainId: number): Promise<{ ok: boolean; latencyMs: number }> {
  try {
    const provider = getProvider(chainId)
    const start = performance.now()
    await provider.getBlockNumber()
    const latency = Math.round(performance.now() - start)
    trackRpcSuccess(getCurrentRpcUrl(chainId), latency)
    return { ok: true, latencyMs: latency }
  } catch {
    trackRpcError(getCurrentRpcUrl(chainId))
    return { ok: false, latencyMs: -1 }
  }
}

export async function getBalance(chainId: number, address: string): Promise<string> {
  return withBalanceRetry(chainId, async (provider) => {
    const balance = await provider.getBalance(address)
    return formatEther(balance)
  })
}

export async function getBalances(chainId: number, addresses: string[]): Promise<Record<string, string>> {
  if (addresses.length === 0) return {}

  return withBalanceRetry(chainId, async (provider) => {
    const calls = addresses.map(encodeGetEthBalance)
    const raw = await multicall(chainId, calls, provider)
    const results: Record<string, string> = {}

    for (let i = 0; i < addresses.length; i++) {
      if (raw[i].success) {
        results[addresses[i]] = formatEther(decodeUint256(raw[i].returnData))
      } else {
        results[addresses[i]] = "0"
      }
    }

    return results
  })
}
