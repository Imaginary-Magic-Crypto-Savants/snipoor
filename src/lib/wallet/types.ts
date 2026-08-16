export interface EncryptedPayload {
  ciphertext: string
  iv: string
  salt: string
}

export interface MasterWalletEntry {
  id: string
  label: string
  encryptedMnemonic: EncryptedPayload
  derivedCount: number
}

export interface EncryptedKeystore {
  version: 2
  masters: MasterWalletEntry[]
  activeMasterId: string
  importedKeys: ImportedKeyEntry[]
  createdAt: number
  disabledAddresses: string[]
  // HD sub-wallet addresses the user removed (lowercased). Derivation is
  // deterministic, so "removal" hides them from the app; re-importing the seed
  // elsewhere restores access. Optional for pre-existing keystores.
  removedAddresses?: string[]
}

export interface ImportedKeyEntry {
  id: string
  label: string
  address: string
  encryptedKey: EncryptedPayload
}

export interface DerivedWallet {
  index: number
  address: string
  path: string
  privateKey: string
}

export interface TokenBalance {
  formatted: string
  usd: number
}

export interface ChainBalances {
  ETH: TokenBalance
  WETH: TokenBalance
  USDC: TokenBalance
  totalUsd: number
}

export interface AggregatedBalances {
  byChain: Record<number, ChainBalances>
  totalUsd: number
  totalEth: number
}

export interface WalletInfo {
  address: string
  label: string
  type: "hd-master" | "hd-sub" | "imported"
  index?: number
  enabled: boolean
  balance?: string
  balances?: AggregatedBalances
}

export type SpeedTier = "normal" | "fast" | "turbo"

export interface ChainConfig {
  chainId: number
  name: string
  symbol: string
  rpcDefault: string
  rpcUser?: string
  explorerUrl: string
}

export interface SniperTarget {
  id: string
  contractAddress: string
  chainId: number
  functionSig: string
  args: unknown[]
  value: string
  triggerMode: "manual" | "timed" | "event"
  triggerTime?: number
  triggerEvent?: string
  status: "watching" | "armed" | "firing" | "done" | "failed"
}

export interface ActivityEntry {
  id: string
  timestamp: number
  chainId: number
  type: "mint" | "snipe" | "buy" | "sell" | "list" | "consolidate" | "fund" | "disperse" | "send"
  contractAddress: string
  walletAddress: string
  txHash?: string
  status: "pending" | "confirmed" | "failed" | "timeout"
  gasUsed?: string
  value?: string
  error?: string
}
