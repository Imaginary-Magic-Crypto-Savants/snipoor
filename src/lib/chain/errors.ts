// Maps raw ethers / RPC errors into clear, user-facing explanations AND an
// actionable category that drives auto-recovery. Goal: a non-technical user
// should know WHAT went wrong, and the engine should self-heal when it can.

interface ErrorLike {
  code?: string | number
  shortMessage?: string
  reason?: string
  message?: string
  info?: { error?: { message?: string; code?: number } }
  error?: { message?: string }
}

// "retryable" kinds get a fix applied and the tx is re-sent.
// "terminal" kinds are surfaced to the user (retrying won't help / is unsafe).
export type TxErrorKind =
  | "rate_limit"        // RPC throttled — wait / rotate, retry
  | "nonce"             // nonce desync / collision — refetch nonce, retry
  | "gas_price_low"     // maxFee below base — bump fee, retry
  | "gas_limit_low"     // intrinsic/out-of-gas — re-estimate higher, retry
  | "network"           // transient RPC/network — retry
  | "insufficient_funds" // terminal — can't conjure ETH
  | "reverted"          // terminal — contract rejected (deterministic)
  | "timeout"           // terminal — tx may have landed, do NOT resend
  | "unknown"           // terminal — surface raw

const RETRYABLE: Set<TxErrorKind> = new Set(["rate_limit", "nonce", "gas_price_low", "gas_limit_low", "network"])

export function isRetryable(kind: TxErrorKind): boolean {
  return RETRYABLE.has(kind)
}

function extractRevertReason(e: ErrorLike): string | null {
  const reason = e.reason || e.info?.error?.message || e.error?.message
  if (typeof reason === "string" && reason && !/execution reverted/i.test(reason)) {
    const cleaned = reason.replace(/^execution reverted:?\s*/i, "").trim()
    if (cleaned && cleaned.length < 120) return cleaned
  }
  const raw = e.shortMessage || e.message || ""
  const m = raw.match(/reverted(?: with reason string)?:?\s*["']([^"']+)["']/i)
  if (m && m[1]) return m[1]
  return null
}

export interface TxErrorInfo {
  kind: TxErrorKind
  message: string
}

export function analyzeTxError(e: unknown): TxErrorInfo {
  const err = (typeof e === "object" && e !== null ? e : {}) as ErrorLike
  const code = String(err.code ?? "")
  const raw = (err.shortMessage || err.message || (typeof e === "string" ? e : "")).toString()
  const lower = raw.toLowerCase()

  if (lower.includes("<!doctype") || lower.includes("<html"))
    return { kind: "rate_limit", message: "RPC rate limited. Retrying with backup node..." }
  if (lower.includes("429") || lower.includes("too many requests"))
    return { kind: "rate_limit", message: "RPC busy (rate limited). Retrying..." }
  if (lower.includes("503") || lower.includes("502") || lower.includes("service unavailable"))
    return { kind: "rate_limit", message: "RPC temporarily down. Retrying..." }

  if (code === "INSUFFICIENT_FUNDS" || lower.includes("insufficient funds"))
    return { kind: "insufficient_funds", message: "Insufficient ETH: wallet can't cover mint price + gas. Add funds or lower quantity." }

  if (code === "NONCE_EXPIRED" || lower.includes("nonce too low") || lower.includes("nonce has already been used"))
    return { kind: "nonce", message: "Nonce conflict (resolving automatically)..." }
  if (code === "REPLACEMENT_UNDERPRICED" || lower.includes("replacement transaction underpriced") || lower.includes("already known"))
    return { kind: "nonce", message: "Pending tx in mempool (replacing automatically)..." }

  if (lower.includes("max fee per gas less than block base fee") || lower.includes("fee cap less than block base fee"))
    return { kind: "gas_price_low", message: "Gas price below network base (bumping automatically)..." }
  if (lower.includes("intrinsic gas too low") || (lower.includes("gas") && lower.includes("too low")) || lower.includes("out of gas"))
    return { kind: "gas_limit_low", message: "Gas limit too low (re-estimating automatically)..." }

  if (code === "CALL_EXCEPTION" || lower.includes("execution reverted") || lower.includes("transaction reverted")) {
    const reason = extractRevertReason(err)
    if (reason) return { kind: "reverted", message: `Contract rejected mint: "${reason}"` }
    return { kind: "reverted", message: "Contract rejected mint. Likely wrong mint price, sold out, max-per-wallet hit, or wallet not on allowlist." }
  }

  if (code === "TIMEOUT" || lower.includes("timeout"))
    return { kind: "timeout", message: "Network timeout. The tx may still land — check Activity before retrying." }
  if (lower.includes("network") && lower.includes("error"))
    return { kind: "network", message: "Network error reaching RPC. Retrying..." }

  if (raw.length > 160) return { kind: "unknown", message: raw.slice(0, 160) + "..." }
  return { kind: "unknown", message: raw || "Transaction failed (unknown error)." }
}

// Short, clear explanation only (used where a category isn't needed).
export function explainTxError(e: unknown): string {
  return analyzeTxError(e).message
}

// Groups per-wallet failures by their explanation so the UI can show a clean summary.
export function summarizeFailures(errors: string[]): Array<{ reason: string; count: number }> {
  const map = new Map<string, number>()
  for (const e of errors) {
    const key = e || "Unknown error"
    map.set(key, (map.get(key) ?? 0) + 1)
  }
  return [...map.entries()]
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count)
}
