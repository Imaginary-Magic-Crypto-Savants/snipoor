export const mockWallets = [
  { address: "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D", type: "hd-master" as const, label: "Master", enabled: true, balance: "2.4518", index: 0 },
  { address: "0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984", type: "hd-sub" as const, label: "Sub 1", enabled: true, balance: "0.0500", index: 1 },
  { address: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", type: "hd-sub" as const, label: "Sub 2", enabled: true, balance: "0.0500", index: 2 },
  { address: "0x6B175474E89094C44Da98b954EedeAC495271d0F", type: "hd-sub" as const, label: "Sub 3", enabled: true, balance: "0.0500", index: 3 },
  { address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", type: "hd-sub" as const, label: "Sub 4", enabled: false, balance: "0.0000", index: 4 },
  { address: "0xdAC17F958D2ee523a2206206994597C13D831ec7", type: "imported" as const, label: "Burner", enabled: true, balance: "0.1200", index: 5 },
]

export const mockActivity = [
  { id: "1", type: "mint", walletAddress: "0x1f98...F984", contractAddress: "0xBC4C...a1ED", status: "confirmed" as const, value: "0.08", gasUsed: "124,500", timestamp: Date.now() - 120000 },
  { id: "2", type: "mint", walletAddress: "0xC02a...6Cc2", contractAddress: "0xBC4C...a1ED", status: "confirmed" as const, value: "0.08", gasUsed: "124,500", timestamp: Date.now() - 118000 },
  { id: "3", type: "mint", walletAddress: "0x6B17...1d0F", contractAddress: "0xBC4C...a1ED", status: "failed" as const, value: "0.08", gasUsed: "21,000", timestamp: Date.now() - 115000 },
  { id: "4", type: "fund", walletAddress: "0x7a25...488D", contractAddress: "-", status: "confirmed" as const, value: "0.15", gasUsed: "21,000", timestamp: Date.now() - 300000 },
  { id: "5", type: "consolidate", walletAddress: "0xdAC1...1ec7", contractAddress: "-", status: "confirmed" as const, value: "0.045", gasUsed: "21,000", timestamp: Date.now() - 600000 },
]

export const mockMintTarget = {
  contractAddress: "0xBC4CA0EdA7647A8aB7C2061c2E118A18a936f13D",
  name: "Bored Ape Yacht Club",
  symbol: "BAYC",
  mintFunction: "mint(uint256 quantity)",
  price: "0.08",
  maxPerWallet: 3,
}

export const mockGasInfo = {
  baseFee: "12.4",
  priorityFee: "0.5",
  estimatedGas: "124,500",
}

export function shortenAddr(addr: string, chars = 4): string {
  return `${addr.slice(0, chars + 2)}...${addr.slice(-chars)}`
}

export function timeAgo(ts: number): string {
  const diff = Date.now() - ts
  if (diff < 60000) return `${Math.floor(diff / 1000)}s ago`
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`
  return `${Math.floor(diff / 3600000)}h ago`
}
