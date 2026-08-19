import type { SpeedTier } from "~/lib/wallet/types"

export type ArgRole = "quantity" | "recipient" | "proof" | "referral" | "comment" | "tokenId" | "unknown"

export interface MintFunction {
  name: string
  signature: string
  inputs: Array<{ name: string; type: string }>
  payable: boolean
  stateMutability: string
}

export interface ClassifiedInput {
  name: string
  type: string
  role: ArgRole
  defaultValue: string
}

export interface MintConfig {
  chainId: number
  contractAddress: string
  functionName: string
  args: unknown[]
  value: string
  speed: SpeedTier
  walletAddresses: string[]
  gasLimit?: number
  /**
   * Per-wallet mint args, keyed by lowercased address. When present, each wallet
   * encodes its OWN args instead of the shared `args` — used for Scatter
   * allowlist mints where every wallet carries a distinct merkle proof. Wallets
   * absent from this map fall back to `args`.
   */
  argsPerWallet?: Record<string, unknown[]>
}

export interface MintResult {
  address: string
  hash: string
  status: "pending" | "confirmed" | "failed" | "timeout"
  gasUsed?: string
  error?: string
}
