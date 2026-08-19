import React from "react"
import { CHAINS } from "~/lib/chain"

const CHAIN_COLORS: Record<number, string> = {
  1: "#627eea",
  8453: "#0052ff",
  42161: "#28a0f0",
  4663: "#00c805",
}

const CHAIN_LABELS: Record<number, string> = {
  1: "ETH",
  8453: "BASE",
  42161: "ARB",
  4663: "RH",
}

interface ChainBarProps {
  activeChain: number
  onSelect: (chainId: number) => void
}

export function ChainBar({ activeChain, onSelect }: ChainBarProps) {
  return (
    <div className="chain-bar">
      {Object.values(CHAINS).map((chain) => (
        <button
          key={chain.chainId}
          className={`chain-pill ${activeChain === chain.chainId ? "active" : ""}`}
          onClick={() => onSelect(chain.chainId)}
        >
          <div className="chain-dot" style={{ background: CHAIN_COLORS[chain.chainId] }} />
          {CHAIN_LABELS[chain.chainId] || chain.name.toUpperCase()}
        </button>
      ))}
    </div>
  )
}
