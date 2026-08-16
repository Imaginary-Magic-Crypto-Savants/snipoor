import React, { useState, useEffect, useCallback } from "react"
import type { ActivityEntry } from "~/lib/wallet/types"
import { sendMessage, type ActivityData } from "~/lib/messaging"
import { shortenAddress } from "~/utils/address"
import { CHAINS } from "~/lib/chain/chains"

const TYPE_LABELS: Record<string, string> = {
  mint: "MINT",
  snipe: "SNIPE",
  buy: "BUY",
  sell: "SELL",
  list: "LIST",
  consolidate: "CONSOLIDATE",
  fund: "FUND",
  disperse: "DISPERSE",
  send: "SEND",
}

function getExplorerUrl(chainId: number, txHash: string): string | undefined {
  const chain = CHAINS[chainId]
  if (!chain || !txHash) return undefined
  return `${chain.explorerUrl}/tx/${txHash}`
}

export function ActivityPanel() {
  const [entries, setEntries] = useState<ActivityEntry[]>([])
  const [loading, setLoading] = useState(true)

  const fetchActivity = useCallback(() => {
    sendMessage<ActivityData>({ type: "GET_ACTIVITY" }).then((res) => {
      if (res.ok && res.data) {
        const sorted = [...(res.data as ActivityEntry[])].sort((a, b) => b.timestamp - a.timestamp)
        setEntries(sorted)
      }
      setLoading(false)
    })
  }, [])

  useEffect(() => {
    fetchActivity()
    const listener = (msg: { type?: string }) => {
      if (msg?.type === "ACTIVITY_ADDED") fetchActivity()
    }
    chrome.runtime.onMessage.addListener(listener)
    return () => chrome.runtime.onMessage.removeListener(listener)
  }, [fetchActivity])

  if (loading) {
    return (
      <div className="panel-body" style={{ display: "flex", justifyContent: "center", paddingTop: 40 }}>
        <span className="spinner" style={{ width: 20, height: 20 }} />
      </div>
    )
  }

  if (entries.length === 0) {
    return (
      <div className="panel-body">
        <div className="empty-state">
          <div className="empty-icon" style={{ fontSize: 16, opacity: 0.3 }}>---</div>
          No activity yet
        </div>
      </div>
    )
  }

  return (
    <div className="panel-body">
      <div className="activity-list">
        {entries.map((entry) => {
          const url = entry.txHash ? getExplorerUrl(entry.chainId, entry.txHash) : undefined
          return (
            <div key={entry.id} className="activity-item">
              <span className="activity-type">{TYPE_LABELS[entry.type] ?? entry.type.toUpperCase()}</span>
              <div className="activity-details">
                <div className="activity-addr">{shortenAddress(entry.walletAddress, 6)}</div>
                <div className="activity-meta">
                  {entry.contractAddress ? shortenAddress(entry.contractAddress, 4) : ""}
                  {entry.value && ` | ${entry.value} ETH`}
                  {entry.gasUsed && ` | gas ${entry.gasUsed}`}
                </div>
                {url && entry.txHash && (
                  <a
                    className="activity-tx-link"
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => { e.preventDefault(); chrome.tabs.create({ url: url! }) }}
                  >
                    {shortenAddress(entry.txHash, 6)}
                  </a>
                )}
              </div>
              <span className={`activity-status ${entry.status === "confirmed" ? "success" : entry.status === "failed" ? "failed" : entry.status === "timeout" ? "pending" : "pending"}`}>
                {entry.status.toUpperCase()}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
