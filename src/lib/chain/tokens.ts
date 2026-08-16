export type TokenId = "ETH" | "WETH" | "USDC"

export const ALL_TOKENS: TokenId[] = ["ETH", "WETH", "USDC"]

export const TOKEN_ADDRESSES: Record<string, Record<number, string>> = {
  WETH: {
    1: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
    8453: "0x4200000000000000000000000000000000000006",
    42161: "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1",
  },
  USDC: {
    1: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
    8453: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    42161: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
  },
}

export const TOKEN_DECIMALS: Record<TokenId, number> = {
  ETH: 18,
  WETH: 18,
  USDC: 6,
}
