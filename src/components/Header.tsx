import React, { useState, useEffect } from "react"
import { shortenAddress, copyToClipboard } from "~/utils/address"
import { sendMessage } from "~/lib/messaging"
import { WalletAvatar } from "./WalletAvatar"
import { LockIcon, SidebarIcon } from "./icons/UIIcons"

interface HeaderProps {
  locked: boolean
  masterAddress?: string
  onLock: () => void
  onCopy?: (msg: string) => void
}

export function Header({ locked, masterAddress, onLock, onCopy }: HeaderProps) {
  const [copied, setCopied] = useState(false)
  const [panelMode, setPanelMode] = useState<"popup" | "sidebar">("popup")

  useEffect(() => {
    sendMessage<{ mode: string }>({ type: "GET_PANEL_MODE" }).then((res) => {
      if (res.ok && res.data) setPanelMode(res.data.mode as "popup" | "sidebar")
    })
  }, [])

  const handleCopyAddress = () => {
    if (!masterAddress) return
    copyToClipboard(masterAddress)
    setCopied(true)
    onCopy?.(`Copied ${shortenAddress(masterAddress)}`)
    setTimeout(() => setCopied(false), 1500)
  }

  const handleTogglePanel = async () => {
    const newMode = panelMode === "popup" ? "sidebar" : "popup"
    await sendMessage({ type: "SET_PANEL_MODE", payload: { mode: newMode } })
    setPanelMode(newMode)
    if (newMode === "sidebar") {
      window.close()
    }
  }

  return (
    <div className="header">
      <div className="logo">
        <div className="logo-text">
          <span className="p">SAVANT</span><span className="c">SNIPOOR</span>
        </div>
      </div>
      {!locked && (
        <div className="header-right">
          <button className="btn-icon" onClick={handleTogglePanel} title={panelMode === "popup" ? "Open as sidebar" : "Open as popup"}>
            <SidebarIcon size={12} />
          </button>
          <button className="btn-icon" onClick={onLock} title="Lock">
            <LockIcon size={12} />
          </button>
          {masterAddress && (
            <button className="addr-badge" onClick={handleCopyAddress} title="Click to copy address">
              <WalletAvatar address={masterAddress} size={14} />
              <span>{copied ? "COPIED" : shortenAddress(masterAddress)}</span>
            </button>
          )}
          <div className="status-dot" />
        </div>
      )}
    </div>
  )
}
