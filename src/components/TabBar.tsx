import React from "react"
import { MintIcon, WalletsIcon, ActivityIcon } from "./icons/TabIcons"

export type Tab = "mint" | "wallets" | "activity"

interface TabBarProps {
  active: Tab
  onSelect: (tab: Tab) => void
}

const TABS: { id: Tab; label: string; Icon: React.FC }[] = [
  { id: "mint", label: "SNIPE", Icon: MintIcon },
  { id: "wallets", label: "WALLETS", Icon: WalletsIcon },
  { id: "activity", label: "ACTIVITY", Icon: ActivityIcon },
]

export function TabBar({ active, onSelect }: TabBarProps) {
  return (
    <div className="tab-bar" role="tablist">
      {TABS.map(({ id, label, Icon }) => (
        <button
          key={id}
          role="tab"
          aria-selected={active === id}
          className={`tab-btn ${active === id ? "active" : ""}`}
          onClick={() => onSelect(id)}
        >
          <span aria-hidden="true"><Icon /></span>
          {label}
        </button>
      ))}
    </div>
  )
}
