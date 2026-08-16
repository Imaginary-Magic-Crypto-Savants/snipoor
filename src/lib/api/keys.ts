import { storageGet } from "~/lib/storage/chrome-storage"

declare const __ALCHEMY_KEY_1__: string
declare const __ALCHEMY_KEY_2__: string
declare const __ALCHEMY_KEY_3__: string
declare const __ETHERSCAN_KEY__: string
declare const __OPENSEA_KEY_1__: string
declare const __OPENSEA_KEY_2__: string

type ApiService = "opensea" | "etherscan" | "alchemy"

// Alchemy keys 1 & 2 are free-tier (round-robin normally). Key 3 is
// pay-as-you-go — reserved as last-resort overflow, used only when every free
// key is currently throttled, so it bills only when the free keys can't serve.
const FREE_ALCHEMY = [__ALCHEMY_KEY_1__, __ALCHEMY_KEY_2__].filter(Boolean)
const OVERFLOW_ALCHEMY = [__ALCHEMY_KEY_3__].filter(Boolean)

const INTERNAL_KEYS: Record<ApiService, string[]> = {
  alchemy: [...FREE_ALCHEMY, ...OVERFLOW_ALCHEMY],
  etherscan: [__ETHERSCAN_KEY__].filter(Boolean),
  opensea: [__OPENSEA_KEY_1__, __OPENSEA_KEY_2__].filter(Boolean),
}

const roundRobinIndex: Record<ApiService, number> = {
  alchemy: 0,
  etherscan: 0,
  opensea: 0,
}

// Per-key throttle, shared across REST (here) and RPC (provider reports 429s).
// A throttled key is skipped until the cooldown passes. 20s, not 60s: Alchemy
// rate limits clear in seconds, and a long global park is how one bad moment
// snowballed into "the whole extension is dead until I reopen it".
const KEY_THROTTLE_MS = 20_000
const keyThrottledUntil = new Map<string, number>()

// Hard reset of key throttles. Wired to explicit user actions (manual refresh,
// starting a mint): the user is saying "try NOW", so stale cooldown state must
// not stand in the way. This replaces the close-and-reopen ritual users
// discovered (killing the service worker wiped this map).
export function clearAlchemyThrottles(): void {
  keyThrottledUntil.clear()
}

export function markAlchemyKeyThrottled(key: string): void {
  if (key) keyThrottledUntil.set(key, Date.now() + KEY_THROTTLE_MS)
}

function keyThrottled(key: string): boolean {
  const until = keyThrottledUntil.get(key)
  return until !== undefined && Date.now() < until
}

// Exposed so the balance path can skip keys that are already known-bad instead
// of retrying the same dead key until its own timeout fires each attempt.
export function isAlchemyKeyThrottled(key: string): boolean {
  return keyThrottled(key)
}

// Ordered Alchemy key candidates for BALANCE reads on a chain, honoring per-chain
// network enablement. Critical for pinned chains (Robinhood 4663): the free keys
// don't have that network enabled and 401 — trying them both fails the read AND
// globally throttles the free keys, which silently funnels all other traffic onto
// the pay-as-you-go key. So pinned chains offer ONLY the user key and the pinned
// key. Other chains lead with the paid key (documented design: balance refreshes
// pin to the reliable high-limit endpoint) with free keys as backup.
export async function getBalanceKeyCandidates(chainId: number): Promise<string[]> {
  const userKeys = await storageGet<Record<string, string>>("savantsnipor_api_keys")
  const userKey = userKeys?.alchemy?.trim()
  const out: string[] = []
  if (userKey) out.push(userKey)
  const pinned = CHAIN_ALCHEMY_KEY[chainId]
  if (pinned) {
    if (!out.includes(pinned)) out.push(pinned)
    return out
  }
  for (const k of [...OVERFLOW_ALCHEMY, ...FREE_ALCHEMY]) {
    if (k && !out.includes(k)) out.push(k)
  }
  return out
}

// Picks an Alchemy key: a live free key by round-robin; the pay-as-you-go key
// only when all free keys are throttled; a free key anyway if everything is.
function pickAlchemyKey(): string | null {
  const freeLive = FREE_ALCHEMY.filter((k) => !keyThrottled(k))
  if (freeLive.length > 0) return freeLive[roundRobinIndex.alchemy++ % freeLive.length]
  const overflowLive = OVERFLOW_ALCHEMY.filter((k) => !keyThrottled(k))
  if (overflowLive.length > 0) return overflowLive[0]
  if (FREE_ALCHEMY.length > 0) return FREE_ALCHEMY[roundRobinIndex.alchemy++ % FREE_ALCHEMY.length]
  return OVERFLOW_ALCHEMY[0] ?? null
}

function getInternalKey(service: ApiService): string | null {
  if (service === "alchemy") return pickAlchemyKey()
  const pool = INTERNAL_KEYS[service]
  if (pool.length === 0) return null
  const idx = roundRobinIndex[service] % pool.length
  roundRobinIndex[service] = idx + 1
  return pool[idx]
}

// Some networks are only enabled on specific Alchemy apps. Robinhood mainnet
// (4663) is enabled solely on the pay-as-you-go key (key 3), so its REST calls
// must pin to that key instead of the free-key round-robin.
const CHAIN_ALCHEMY_KEY: Record<number, string | undefined> = {
  4663: __ALCHEMY_KEY_3__ || undefined,
}

export async function getApiKey(service: ApiService): Promise<string | null> {
  const userKeys = await storageGet<Record<string, string>>("savantsnipor_api_keys")
  const userKey = userKeys?.[service]?.trim()
  if (userKey) return userKey
  return getInternalKey(service)
}

// Alchemy key resolver aware of per-chain network enablement. Prefers the user's
// own key, then any chain-pinned key, then the normal round-robin.
export async function getAlchemyKeyForChain(chainId: number): Promise<string | null> {
  const userKeys = await storageGet<Record<string, string>>("savantsnipor_api_keys")
  const userKey = userKeys?.alchemy?.trim()
  if (userKey) return userKey
  const pinned = CHAIN_ALCHEMY_KEY[chainId]
  if (pinned) return pinned
  return getInternalKey("alchemy")
}

// The dedicated pay-as-you-go key (key 3). Balance reads pin to this so a refresh
// always hits a reliable, high-limit endpoint instead of the free-key round-robin
// that gets rate-limited. Never subject to the throttle cooldown. Falls back to a
// free key only if key 3 was never bundled.
export async function getPaidAlchemyKey(): Promise<string | null> {
  const userKeys = await storageGet<Record<string, string>>("savantsnipor_api_keys")
  const userKey = userKeys?.alchemy?.trim()
  if (userKey) return userKey
  return OVERFLOW_ALCHEMY[0] ?? FREE_ALCHEMY[0] ?? null
}

export async function getAllAlchemyKeys(): Promise<string[]> {
  const userKeys = await storageGet<Record<string, string>>("savantsnipor_api_keys")
  const userKey = userKeys?.alchemy?.trim()
  const keys: string[] = []
  if (userKey) keys.push(userKey)
  for (const k of INTERNAL_KEYS.alchemy) {
    if (!keys.includes(k)) keys.push(k)
  }
  return keys
}

export async function setUserApiKey(service: ApiService, key: string): Promise<void> {
  const existing = (await storageGet<Record<string, string>>("savantsnipor_api_keys")) ?? {}
  const trimmed = key.trim()
  if (trimmed) existing[service] = trimmed
  else delete existing[service]
  const { storageSet } = await import("~/lib/storage/chrome-storage")
  await storageSet("savantsnipor_api_keys", existing)
}

export async function getUserApiKeys(): Promise<Record<string, string>> {
  return (await storageGet<Record<string, string>>("savantsnipor_api_keys")) ?? {}
}
