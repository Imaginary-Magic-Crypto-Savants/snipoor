import type { ChainConfig } from "~/lib/wallet/types"

export const CHAINS: Record<number, ChainConfig> = {
  1: {
    chainId: 1,
    name: "Ethereum",
    symbol: "ETH",
    rpcDefault: "https://eth.llamarpc.com",
    explorerUrl: "https://etherscan.io",
  },
  8453: {
    chainId: 8453,
    name: "Base",
    symbol: "ETH",
    rpcDefault: "https://mainnet.base.org",
    explorerUrl: "https://basescan.org",
  },
  42161: {
    chainId: 42161,
    name: "Arbitrum",
    symbol: "ETH",
    rpcDefault: "https://arb1.arbitrum.io/rpc",
    explorerUrl: "https://arbiscan.io",
  },
  4663: {
    chainId: 4663,
    name: "Robinhood",
    symbol: "ETH",
    rpcDefault: "https://robinhood-mainnet.g.alchemy.com/v2/rO2yUpLvIcHhjB32O_Fj3",
    explorerUrl: "https://robinhoodchain.com",
  },
}

export const RPC_FALLBACKS: Record<number, string[]> = {
  1: [
    "https://eth.llamarpc.com",
    "https://rpc.ankr.com/eth",
    "https://ethereum-rpc.publicnode.com",
    "https://1rpc.io/eth",
    "https://eth.drpc.org",
    "https://eth.meowrpc.com",
  ],
  8453: [
    "https://mainnet.base.org",
    "https://base.llamarpc.com",
    "https://base-rpc.publicnode.com",
    "https://base.drpc.org",
    "https://base.meowrpc.com",
    "https://1rpc.io/base",
  ],
  42161: [
    "https://arb1.arbitrum.io/rpc",
    "https://rpc.ankr.com/arbitrum",
    "https://arbitrum-one-rpc.publicnode.com",
    "https://arbitrum.drpc.org",
    "https://arbitrum.meowrpc.com",
    "https://1rpc.io/arb",
  ],
  4663: [
    "https://robinhood-mainnet.g.alchemy.com/v2/rO2yUpLvIcHhjB32O_Fj3",
  ],
}

export const CHAIN_IDS = Object.keys(CHAINS).map(Number)
export const DEFAULT_CHAIN_ID = 1

export function getChainByName(name: string): ChainConfig | undefined {
  return Object.values(CHAINS).find(
    (c) => c.name.toLowerCase() === name.toLowerCase()
  )
}
