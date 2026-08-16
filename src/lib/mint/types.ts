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
}

export interface MintResult {
  address: string
  hash: string
  status: "pending" | "confirmed" | "failed" | "timeout"
  gasUsed?: string
  error?: string
}
