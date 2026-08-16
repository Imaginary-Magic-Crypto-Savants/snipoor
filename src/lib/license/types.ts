// Access-gating (license) types. The extension redeems an access code issued by
// the Savant site for a short-TTL JWT, then refreshes it. The server can revoke
// (e.g. 24h cron finds the wallet no longer holds a Savant NFT) so access dies
// at the next refresh. See knowledge/savantsnipor-access-gating-architecture.md.

export type LicenseTier = "beta" | "nft" | "paid"

// Persisted locally in chrome.storage.local. The tokens are bearer credentials,
// not secrets like private keys — the real enforcement is server-side (refresh
// can be refused) plus the post-auth key delivery "tooth".
export interface LicenseState {
  accessToken: string // JWT, short TTL
  refreshToken: string // opaque, used to mint new JWTs
  tier: LicenseTier
  expiresAt: number // ms epoch; when accessToken is no longer valid
  activatedAt: number // ms epoch of first successful redeem
  // Max concurrent mint wallets, computed SERVER-side from Savant holdings
  // (tiered: min hold + per-extra-NFT). null = unlimited (beta / gate off).
  walletAllowance: number | null
}

// What the popup UI sees. Never exposes the raw tokens.
export interface LicenseStatus {
  licensed: boolean
  tier: LicenseTier | null
  expiresAt: number | null
  walletAllowance: number | null
  // Reason the gate is showing, for UX messaging. null when licensed.
  reason: "none" | "unactivated" | "expired" | "revoked" | "network" | null
}

// Server response shapes.
export interface RedeemResponse {
  accessToken: string
  refreshToken: string
  tier: LicenseTier
  expiresAt: number // ms epoch
  walletAllowance?: number | null
  // Phase 2 "tooth": server may deliver RPC keys post-auth. Optional for now.
  rpcKeys?: Record<string, string>
}

export interface RefreshResponse {
  accessToken: string
  refreshToken?: string // rotated refresh token, if the server rotates
  expiresAt: number
  walletAllowance?: number | null
  rpcKeys?: Record<string, string>
}

// GET /auth/entitlements — bearer access token, no refresh token involved. Safe
// to call as often as needed (no rotation to race). `stale: true` means the
// server couldn't recompute from chain right now and is returning the last
// known value -- still a real number, just not freshly verified this second.
export interface EntitlementsResponse {
  tier: LicenseTier
  walletAllowance: number | null
  status: string
  stale: boolean
}

// What the extension actually needs back from a live entitlements check.
export interface EntitlementsResult {
  walletAllowance: number | null
  stale: boolean
}
