import type { LicenseState, LicenseStatus, RedeemResponse, RefreshResponse } from "./types"
import { loadLicense, saveLicense, clearLicense, getDeviceId } from "./storage"
import { LICENSE_ENABLED, LICENSE_API_URL, DEV_BYPASS_CODE } from "./config"

// Refresh a little before actual expiry so a request never races the deadline.
const EXPIRY_SKEW_MS = 60_000

// Far-future expiry for the synthetic dev-bypass license (no refresh ever needed).
const DEV_BYPASS_TTL_MS = 100 * 365 * 24 * 60 * 60 * 1000

// Phase 2 "tooth": RPC keys the server delivers post-auth. Held in memory only
// (service-worker lifetime). keys.ts will prefer these once wired up. Empty until
// the backend returns them.
let deliveredRpcKeys: Record<string, string> = {}
export function getDeliveredRpcKeys(): Record<string, string> {
  return deliveredRpcKeys
}
function stashRpcKeys(keys?: Record<string, string>): void {
  if (keys && Object.keys(keys).length > 0) deliveredRpcKeys = keys
}

function apiUrl(path: string): string {
  const base = LICENSE_API_URL.replace(/\/$/, "")
  return `${base}${path}`
}

// Synthetic local license for the admin/dev bypass. Never hits the backend.
async function grantDevBypass(): Promise<LicenseStatus> {
  const state: LicenseState = {
    accessToken: "dev-bypass",
    refreshToken: "dev-bypass",
    tier: "beta",
    expiresAt: Date.now() + DEV_BYPASS_TTL_MS,
    activatedAt: Date.now(),
    walletAllowance: null,
  }
  await saveLicense(state)
  return licensedStatus(state)
}

function licensedStatus(s: LicenseState): LicenseStatus {
  return { licensed: true, tier: s.tier, expiresAt: s.expiresAt, walletAllowance: s.walletAllowance ?? null, reason: null }
}

const GATED = (reason: LicenseStatus["reason"]): LicenseStatus => ({
  licensed: false,
  tier: null,
  expiresAt: null,
  walletAllowance: null,
  reason,
})

// Dev bypass: when the gate is compiled off, the app is always "licensed" so
// wallet/mint work is never blocked by a missing backend.
export function gateDisabled(): boolean {
  return !LICENSE_ENABLED
}

// Redeem an access code for a fresh license. Called from the gate screen.
export async function redeemCode(code: string): Promise<LicenseStatus> {
  // Admin/dev bypass — works even with the gate enabled, so the gate UI can be
  // tested and still let a dev in. No-op in builds that don't set the code.
  if (DEV_BYPASS_CODE && code.trim() === DEV_BYPASS_CODE) return grantDevBypass()
  if (gateDisabled()) return { licensed: true, tier: "beta", expiresAt: null, walletAllowance: null, reason: null }
  if (!LICENSE_API_URL) return GATED("network")

  const deviceId = await getDeviceId()
  let res: Response
  try {
    res = await fetch(apiUrl("/auth/redeem"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code: code.trim(), deviceId }),
    })
  } catch {
    return GATED("network")
  }
  if (res.status === 401 || res.status === 403) return GATED("revoked")
  if (!res.ok) return GATED("network")

  const data = (await res.json()) as RedeemResponse
  const state: LicenseState = {
    accessToken: data.accessToken,
    refreshToken: data.refreshToken,
    tier: data.tier,
    expiresAt: data.expiresAt,
    activatedAt: Date.now(),
    walletAllowance: data.walletAllowance ?? null,
  }
  await saveLicense(state)
  stashRpcKeys(data.rpcKeys)
  return licensedStatus(state)
}

// Exchange the refresh token for a new JWT. Server refuses (401) if the code was
// revoked (e.g. the 24h ownership cron pruned the wallet) — that's the kill switch.
async function refreshLicense(state: LicenseState): Promise<LicenseStatus> {
  if (!LICENSE_API_URL) return GATED("network")
  const deviceId = await getDeviceId()
  let res: Response
  try {
    res = await fetch(apiUrl("/auth/refresh"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ refreshToken: state.refreshToken, deviceId }),
    })
  } catch {
    // Network error: keep the stored license, report so UI can decide. We do NOT
    // clear here — a flaky connection should not log the user out.
    return GATED("network")
  }
  if (res.status === 401 || res.status === 403) {
    await clearLicense()
    return GATED("revoked")
  }
  if (!res.ok) return GATED("network")

  const data = (await res.json()) as RefreshResponse
  const next: LicenseState = {
    ...state,
    accessToken: data.accessToken,
    refreshToken: data.refreshToken ?? state.refreshToken,
    expiresAt: data.expiresAt,
    // Refresh always carries the CURRENT allowance (cron recomputes it from
    // holdings) — buying/selling Savants changes the cap within one TTL.
    walletAllowance: data.walletAllowance !== undefined ? data.walletAllowance : state.walletAllowance ?? null,
  }
  await saveLicense(next)
  stashRpcKeys(data.rpcKeys)
  return licensedStatus(next)
}

// Resolve current gate state. Auto-refreshes when the JWT is near/at expiry.
export async function resolveStatus(): Promise<LicenseStatus> {
  if (gateDisabled()) return { licensed: true, tier: "beta", expiresAt: null, walletAllowance: null, reason: null }

  const state = await loadLicense()
  if (!state) return GATED("unactivated")

  if (Date.now() < state.expiresAt - EXPIRY_SKEW_MS) return licensedStatus(state)

  // Expired or within skew window — try to refresh.
  const refreshed = await refreshLicense(state)
  if (refreshed.licensed) return refreshed
  // Refresh failed. Distinguish revoked (cleared, hard gate) from network (kept).
  if (refreshed.reason === "network") return GATED("expired")
  return refreshed
}

export async function deactivate(): Promise<void> {
  const state = await loadLicense()
  if (state && LICENSE_API_URL) {
    const deviceId = await getDeviceId()
    // Best-effort server-side refresh-token revoke; ignore failures.
    try {
      await fetch(apiUrl("/auth/deactivate"), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ refreshToken: state.refreshToken, deviceId }),
      })
    } catch {
      /* ignore */
    }
  }
  deliveredRpcKeys = {}
  await clearLicense()
}
