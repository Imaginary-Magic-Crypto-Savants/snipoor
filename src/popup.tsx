import React, { useState, useEffect, useCallback } from "react"
import { createRoot } from "react-dom/client"
import "~/styles/global.css"
import "~/styles/layout.css"
import "~/styles/components.css"
import { Header } from "~/components/Header"
import { TabBar, type Tab } from "~/components/TabBar"
import { StatsBar } from "~/components/StatsBar"
import { Toast } from "~/components/Toast"
import { UnlockScreen } from "~/components/screens/UnlockScreen"
import { GateScreen } from "~/components/screens/GateScreen"
import { OnboardingWizard } from "~/components/screens/onboarding/OnboardingWizard"
import { MintPanel } from "~/components/panels/MintPanel"
import { WalletsPanel } from "~/components/panels/WalletsPanel"
import { ActivityPanel } from "~/components/panels/ActivityPanel"
import { useWallet } from "~/hooks/useWallet"
import { useToast } from "~/hooks/useToast"
import { keystoreExists } from "~/lib/storage/keystore"
import { sendMessage, type ActivityData, type LicenseStatusData } from "~/lib/messaging"
import type { ActivityEntry } from "~/lib/wallet/types"
import type { LicenseStatus } from "~/lib/license/types"
import { LICENSE_ENABLED } from "~/lib/license/config"

type Screen = "loading" | "gate" | "setup" | "unlock" | "main"

export interface TxProgress {
  current: number
  total: number
  label: string
}

function Popup() {
  const { wallets, locked, loading, error, ethPriceUsd, balanceLoading, balanceFetchedAt, unlock, lock, createWallet, refresh, fetchBalances, setError } = useWallet()
  const toast = useToast()
  const [screen, setScreen] = useState<Screen>("loading")
  const [activeTab, setActiveTab] = useState<Tab>("mint")
  const [mintStats, setMintStats] = useState({ hitRate: "-", minted: 0, spent: "0" })
  const [txProgress, setTxProgress] = useState<TxProgress | null>(null)
  // Access gate. `licensed` is null until the first status check resolves.
  const [licensed, setLicensed] = useState<boolean | null>(null)
  // Server-computed cap on concurrent mint wallets (Savant-holdings tiered).
  // null = unlimited (gate off / beta).
  const [walletAllowance, setWalletAllowance] = useState<number | null>(null)
  const [gateReason, setGateReason] = useState<LicenseStatus["reason"]>("unactivated")
  const [gateError, setGateError] = useState("")
  const [gateLoading, setGateLoading] = useState(false)

  useEffect(() => {
    const listener = (msg: { type?: string; current?: number; total?: number; label?: string }) => {
      if (msg?.type === "TX_PROGRESS") {
        setTxProgress({ current: msg.current ?? 0, total: msg.total ?? 0, label: msg.label ?? "" })
        if (msg.current === msg.total) {
          setTimeout(() => setTxProgress(null), 2000)
        }
      }
    }
    chrome.runtime.onMessage.addListener(listener)
    return () => chrome.runtime.onMessage.removeListener(listener)
  }, [])

  // Access gate runs before anything else. Checked once on mount; auto-refreshes
  // the JWT server-side. Gate off (dev build) short-circuits to licensed without
  // even messaging the background — so a stale/failed status call can never trap
  // a dev build behind the gate.
  useEffect(() => {
    if (!LICENSE_ENABLED) {
      setLicensed(true)
      return
    }
    sendMessage<LicenseStatusData>({ type: "LICENSE_STATUS" }).then((res) => {
      const status = res.ok ? (res.data as LicenseStatus | undefined) : undefined
      if (status?.licensed) {
        setLicensed(true)
        setWalletAllowance(status.walletAllowance ?? null)
      } else {
        setLicensed(false)
        setGateReason(status?.reason ?? "network")
        setScreen("gate")
      }
    })
  }, [])

  useEffect(() => {
    if (licensed !== true || loading) return
    keystoreExists().then((exists) => {
      if (!exists) setScreen("setup")
      else if (locked) setScreen("unlock")
      else setScreen("main")
    })
  }, [licensed, loading, locked])

  const handleRedeem = useCallback(async (code: string) => {
    setGateError("")
    setGateLoading(true)
    const res = await sendMessage<LicenseStatusData>({ type: "LICENSE_REDEEM", payload: { code } })
    setGateLoading(false)
    const status = res.ok ? (res.data as LicenseStatus | undefined) : undefined
    if (status?.licensed) {
      setLicensed(true) // keystore effect advances to setup/unlock/main
      setWalletAllowance(status.walletAllowance ?? null)
    } else {
      setGateReason(status?.reason ?? "network")
      setGateError(
        status?.reason === "revoked"
          ? "Code not recognized or access revoked."
          : status?.reason === "network"
            ? "Couldn't reach the server. Try again."
            : "Invalid access code.",
      )
    }
  }, [])

  const refreshMintStats = useCallback(() => {
    sendMessage<ActivityEntry[]>({ type: "GET_ACTIVITY" }).then((res) => {
      if (res.ok && res.data) {
        const mints = (res.data as ActivityEntry[]).filter((a) => a.type === "mint")
        const confirmed = mints.filter((a) => a.status === "confirmed").length
        const total = mints.length
        const spent = mints
          .filter((a) => a.status === "confirmed" && a.value)
          .reduce((s, a) => s + parseFloat(a.value!), 0)
        setMintStats({
          hitRate: total > 0 ? `${Math.round((confirmed / total) * 100)}%` : "-",
          minted: confirmed,
          spent: spent > 0 ? `${spent.toFixed(4)}` : "0",
        })
      }
    })
  }, [])

  useEffect(() => {
    if (screen === "main" && !locked) {
      refreshMintStats()
      // Surface auto-refresh failures: silently showing $0.00 with no
      // explanation is indistinguishable from "the app is broken".
      fetchBalances().then((res) => {
        if (res && !res.ok) toast.show("Balances may be stale - RPCs busy. Tap refresh to retry.", "warn")
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen, locked, refreshMintStats, fetchBalances])

  const handleRefreshBalances = useCallback(async () => {
    const res = await fetchBalances(true)
    if (res && !res.ok) toast.show(res.error || "Balance refresh failed", "error")
    else toast.show("Balances updated", "success")
  }, [fetchBalances, toast])

  const handleCreate = async (mnemonic: string, password: string, count: number) => {
    const res = await createWallet(mnemonic, password, count)
    // Only celebrate an actual success — failures set the error shown in the
    // wizard, and a green toast on top of a red error reads as broken.
    if (res.ok) toast.show("Wallet created", "success")
  }

  const handleUnlock = async (password: string) => {
    await unlock(password)
  }

  const handleLock = async () => {
    await lock()
    toast.show("Locked", "warn")
  }

  const masterAddress = wallets.find((w) => w.type === "hd-master")?.address
  const totalUsd = wallets.reduce((s, w) => s + (w.balances?.totalUsd ?? 0), 0)

  return (
    <>
      {screen === "main" && (
        <Header locked={locked} masterAddress={masterAddress} onLock={handleLock} onCopy={(msg) => toast.show(msg)} />
      )}

      {screen === "loading" && (
        <div className="screen-overlay" style={{ justifyContent: "center", alignItems: "center", gap: 10 }}>
          <span className="spinner" style={{ width: 24, height: 24 }} />
          <span style={{ fontSize: 9, color: "var(--text3)", letterSpacing: 2, fontFamily: "var(--mono)" }}>LOADING</span>
        </div>
      )}

      {screen === "gate" && (
        <GateScreen onRedeem={handleRedeem} error={gateError} loading={gateLoading} reason={gateReason} />
      )}

      {screen === "setup" && (
        <OnboardingWizard onCreate={handleCreate} error={error} loading={loading} />
      )}

      {screen === "unlock" && (
        <UnlockScreen onUnlock={handleUnlock} error={error} loading={loading} />
      )}

      {screen === "main" && (
        <>
          <TabBar active={activeTab} onSelect={setActiveTab} />

          {txProgress && (
            <div className="tx-progress-bar">
              <div className="tx-progress-fill" style={{ width: `${txProgress.total > 0 ? (txProgress.current / txProgress.total) * 100 : 0}%` }} />
              <span className="tx-progress-text">
                {txProgress.label} {txProgress.current}/{txProgress.total} ({txProgress.total > 0 ? Math.round((txProgress.current / txProgress.total) * 100) : 0}%)
              </span>
            </div>
          )}

          <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
            <div style={{ display: activeTab === "mint" ? "flex" : "none", flexDirection: "column", flex: 1, minHeight: 0, overflowY: "auto" }}>
              <MintPanel wallets={wallets} walletAllowance={walletAllowance} onToast={(msg, type) => toast.show(msg, type)} onMintComplete={refreshMintStats} />
            </div>
            <div style={{ display: activeTab === "wallets" ? "flex" : "none", flexDirection: "column", flex: 1, minHeight: 0 }}>
              <WalletsPanel wallets={wallets} ethPriceUsd={ethPriceUsd} balanceLoading={balanceLoading} balanceFetchedAt={balanceFetchedAt} onCopy={(msg) => toast.show(msg)} onRefresh={refresh} onRefreshBalances={handleRefreshBalances} />
            </div>
            <div style={{ display: activeTab === "activity" ? "flex" : "none", flexDirection: "column", flex: 1, minHeight: 0, overflowY: "auto" }}>
              <ActivityPanel />
            </div>
          </div>

          <StatsBar hitRate={mintStats.hitRate} minted={mintStats.minted} totalUsd={totalUsd} spent={mintStats.spent} />
        </>
      )}

      <Toast message={toast.message} type={toast.type} visible={toast.visible} />
    </>
  )
}

createRoot(document.getElementById("root")!).render(<Popup />)
