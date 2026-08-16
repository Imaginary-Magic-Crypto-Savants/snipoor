import { storageGet, storageSet } from "~/lib/storage/chrome-storage"

interface CachedPrice {
  usd: number
  fetchedAt: number
}

const CACHE_KEY = "savantsnipor_eth_price"
const CACHE_TTL = 60_000
const PRICE_TIMEOUT_MS = 6_000

export async function getEthPriceUsd(): Promise<number> {
  const cached = await storageGet<CachedPrice>(CACHE_KEY)
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL) {
    return cached.usd
  }

  // Hard timeout: this call gates the whole balance refresh, and a bare fetch()
  // can stall indefinitely (CoinGecko's free tier throttles hard). Without an
  // abort, a hung price request leaves the balance spinner running forever.
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), PRICE_TIMEOUT_MS)
  try {
    const resp = await fetch(
      "https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd",
      { signal: ctrl.signal }
    )
    const data = await resp.json()
    const usd = data.ethereum?.usd ?? cached?.usd ?? 0
    await storageSet(CACHE_KEY, { usd, fetchedAt: Date.now() })
    return usd
  } catch {
    // Timed out / offline / rate-limited: fall back to the last known price
    // (even if stale) so balances still render instead of blocking.
    return cached?.usd ?? 0
  } finally {
    clearTimeout(timer)
  }
}
