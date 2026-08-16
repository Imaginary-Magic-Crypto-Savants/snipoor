import type { WalletInfo, SpeedTier, ActivityEntry } from "./wallet/types"

export type Message =
  | { type: "GENERATE_MNEMONIC" }
  | { type: "UNLOCK"; payload: { password: string } }
  | { type: "LOCK" }
  | { type: "CREATE_WALLET"; payload: { mnemonic: string; password: string; subWalletCount: number } }
  | { type: "IMPORT_MNEMONIC"; payload: { mnemonic: string; label: string; password: string; subWalletCount: number } }
  | { type: "IMPORT_KEY"; payload: { privateKey: string; label: string; password: string } }
  | { type: "DERIVE_MORE"; payload: { count: number; password: string } }
  | { type: "GET_WALLETS" }
  | { type: "SET_MASTER"; payload: { masterId: string } }
  | { type: "TOGGLE_WALLET"; payload: { address: string; enabled: boolean } }
  | { type: "GET_BALANCES"; payload: { chainId: number } }
  | { type: "EXPORT_KEY"; payload: { address: string; password: string } }
  | { type: "SET_API_KEYS"; payload: { service: string; key: string } }
  | { type: "GET_API_KEYS" }
  | { type: "FUND_SUBWALLETS"; payload: { chainId: number; amountPerWallet: string; speed: SpeedTier; addresses: string[]; fromAddress?: string } }
  | { type: "CONSOLIDATE"; payload: { chainId: number; speed: SpeedTier; tokenAddress?: string } }
  | { type: "FETCH_ABI"; payload: { chainId: number; contractAddress: string } }
  | { type: "DETECT_CONTRACT"; payload: { chainId: number; contractAddress: string; quantity: number } }
  | { type: "DETECT_MINT_FUNCTIONS"; payload: { abiJson: string; chainId: number; contractAddress: string } }
  | { type: "PROBE_MINT_SELECTORS"; payload: { chainId: number; contractAddress: string } }
  | { type: "EXECUTE_MINT"; payload: { chainId: number; contractAddress: string; functionName: string; args: unknown[]; value: string; speed: SpeedTier; walletAddresses: string[]; gasLimit?: number; abiJson: string } }
  | { type: "CLEAR_STUCK_TX"; payload: { chainId: number; walletAddresses: string[] } }
  | { type: "GET_NFT_BALANCES"; payload: { chainId: number; contractAddress: string } }
  | { type: "GET_NFT_CONTRACT_INFO"; payload: { chainId: number; contractAddress: string } }
  | { type: "CONSOLIDATE_NFTS"; payload: { chainId: number; contractAddress: string; destination: string; speed: SpeedTier } }
  | { type: "GET_ACTIVITY" }
  | { type: "EXPORT_ALL_KEYS"; payload: { password: string } }
  | { type: "EXPORT_MNEMONIC"; payload: { password: string } }
  | { type: "SEND_ETH"; payload: { chainId: number; fromAddress: string; toAddress: string; amount: string; speed: SpeedTier } }
  | { type: "RPC_OVERRIDE"; payload: { chainId: number; url: string } }
  | { type: "CHANGE_PASSWORD"; payload: { oldPassword: string; newPassword: string } }
  | { type: "GET_ALL_BALANCES"; payload?: { force?: boolean } }
  | { type: "ESTIMATE_MAX_SEND"; payload: { chainId: number; fromAddress: string; speed: SpeedTier } }
  | { type: "REMOVE_WALLET"; payload: { address: string; password: string } }
  | { type: "RESET_WALLET" }
  | { type: "SET_PANEL_MODE"; payload: { mode: "popup" | "sidebar" } }
  | { type: "GET_PANEL_MODE" }
  | { type: "GET_LAST_MINT" }
  | { type: "LICENSE_STATUS" }
  | { type: "LICENSE_REDEEM"; payload: { code: string } }
  | { type: "LICENSE_REFRESH" }
  | { type: "LICENSE_DEACTIVATE" }

export type Response =
  | { ok: true; data?: unknown }
  | { ok: false; error: string }

export type WalletsData = { wallets: WalletInfo[]; locked: boolean; cachedEthPriceUsd?: number; balanceFetchedAt?: number }
export type BalancesData = Record<string, string>
export type MnemonicData = { mnemonic: string }
export type ExportData = { privateKey: string }
export type ActivityData = ActivityEntry[]
export type ApiKeysData = Record<string, string>
export type MastersData = { masters: Array<{ id: string; label: string; derivedCount: number }>; activeMasterId: string }
export type AllBalancesData = { balances: Record<string, import("~/lib/wallet/types").AggregatedBalances>; ethPriceUsd: number }
export type LicenseStatusData = import("~/lib/license/types").LicenseStatus

// Long-running jobs that legitimately take minutes (many wallets, waiting on tx
// confirmations) must not be cut off by the generic watchdog below.
const LONG_RUNNING: ReadonlySet<Message["type"]> = new Set([
  "EXECUTE_MINT",
  "FUND_SUBWALLETS",
  "CONSOLIDATE",
  "CONSOLIDATE_NFTS",
  "SEND_ETH",
  "CLEAR_STUCK_TX",
  "CREATE_WALLET",
  "IMPORT_MNEMONIC",
  "DERIVE_MORE",
  // A full multi-chain sweep over 100 wallets can legitimately exceed 45s when
  // endpoints are slow; a false watchdog fire wastes the whole (still-running)
  // fetch and shows a spurious error.
  "GET_ALL_BALANCES",
])

const DEFAULT_TIMEOUT_MS = 45_000

// Watchdog: if the service worker dies mid-request (MV3 terminates idle workers)
// the callback never fires and the promise would hang forever — leaving the UI
// spinning with no error. Always settle so the UI can show a failure instead.
export async function sendMessage<T = unknown>(msg: Message): Promise<{ ok: true; data?: T } | { ok: false; error: string }> {
  return new Promise((resolve) => {
    let settled = false
    const done = (r: { ok: true; data?: T } | { ok: false; error: string }) => {
      if (settled) return
      settled = true
      resolve(r)
    }

    const timer = LONG_RUNNING.has(msg.type)
      ? null
      : setTimeout(() => done({ ok: false, error: "Request timed out. Try again." }), DEFAULT_TIMEOUT_MS)

    chrome.runtime.sendMessage(msg, (response) => {
      if (timer) clearTimeout(timer)
      // Reading lastError avoids an unchecked-error warning when the channel closed.
      const lastError = chrome.runtime.lastError
      done(response ?? { ok: false, error: lastError?.message ?? "No response from service worker" })
    })
  })
}
