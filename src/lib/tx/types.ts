import type { SpeedTier } from "~/lib/wallet/types"

export interface TxRequest {
  chainId: number
  to: string
  value: bigint
  data?: string
  gasLimit?: bigint
  speed: SpeedTier
}

export interface TxResult {
  hash: string
  from: string
  to: string
  status: "pending" | "confirmed" | "failed" | "timeout"
  gasUsed?: string
  error?: string
}
