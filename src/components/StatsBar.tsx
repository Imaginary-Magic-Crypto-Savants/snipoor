import React from "react"

interface StatsBarProps {
  hitRate: string
  minted: number
  totalUsd: number
  spent: string
}

export function StatsBar({ hitRate, minted, totalUsd, spent }: StatsBarProps) {
  const formatted = totalUsd >= 10000
    ? `$${(totalUsd / 1000).toFixed(1)}k`
    : totalUsd >= 1
    ? `$${totalUsd.toFixed(2)}`
    : `$${totalUsd.toFixed(4)}`

  return (
    <div className="stats-bar">
      <div className="stat-cell">
        <div className="stat-val green">{hitRate}</div>
        <div className="stat-lbl">Hit Rate</div>
      </div>
      <div className="stat-cell">
        <div className="stat-val accent">{minted}</div>
        <div className="stat-lbl">Minted</div>
      </div>
      <div className="stat-cell">
        <div className="stat-val cyan">{formatted}</div>
        <div className="stat-lbl">Portfolio</div>
      </div>
      <div className="stat-cell">
        <div className="stat-val warn">{spent}</div>
        <div className="stat-lbl">Spent</div>
      </div>
    </div>
  )
}
