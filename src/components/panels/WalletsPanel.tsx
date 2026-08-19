import React, { useState } from "react"
import type { WalletInfo, SpeedTier } from "~/lib/wallet/types"
import type { WalletNFTBalance, NFTContractInfo } from "~/lib/nft/balance"
import type { NFTTransferResult } from "~/lib/consolidate/nft"
import { shortenAddress, copyToClipboard } from "~/utils/address"
import { sendMessage, type WalletsData, type ExportData, type ApiKeysData, type LicenseStatusData } from "~/lib/messaging"
import { WalletAvatar } from "~/components/WalletAvatar"
import { KeyIcon, TrashIcon, ChevronLeftIcon, SettingsIcon, DownloadIcon, UploadIcon, SendIcon, ImageIcon } from "~/components/icons/UIIcons"
import { CHAIN_IDS, DEFAULT_CHAIN_ID } from "~/lib/chain"

const CHAIN_COLORS: Record<number, string> = { 1: "#627eea", 8453: "#0052ff", 42161: "#28a0f0", 4663: "#00c805" }
const CHAIN_LABELS: Record<number, string> = { 1: "ETH", 8453: "BASE", 42161: "ARB", 4663: "RH" }

interface WalletsPanelProps {
  wallets: WalletInfo[]
  ethPriceUsd: number
  balanceLoading?: boolean
  balanceFetchedAt?: number
  onCopy: (text: string) => void
  onRefresh: () => void
  onRefreshBalances?: () => void
  // Lifts a fresh wallet-mint allowance up to the popup so other panels (the
  // Snipe/mint page) see it immediately -- no popup close/reopen needed.
  onWalletAllowanceChange?: (allowance: number | null) => void
}

type View = "list" | "import-menu" | "import-key" | "import-seed" | "add-subs" | "manage-menu" | "fund-subs" | "consolidate" | "export-menu" | "export" | "export-all" | "export-seed" | "nft-view" | "consolidate-nfts" | "settings" | "remove-wallet"

function walletBadgeClass(type: WalletInfo["type"]): string {
  if (type === "hd-master") return "wallet-badge master"
  if (type === "imported") return "wallet-badge imported"
  return ""
}

function walletBadgeLabel(w: WalletInfo): string {
  if (w.type === "hd-master") return "M"
  if (w.type === "imported") return "IMP"
  return ""
}

// "just now" / "42s ago" / "3m ago" / "2h ago" — cached-balance age label.
function ageLabel(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000)
  if (s < 10) return "just now"
  if (s < 60) return `${s}s ago`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  return `${Math.floor(m / 60)}h ago`
}

export function WalletsPanel({ wallets, ethPriceUsd, balanceLoading, balanceFetchedAt, onCopy, onRefresh, onRefreshBalances, onWalletAllowanceChange }: WalletsPanelProps) {
  const [view, setView] = useState<View>("list")
  const [chainFilter, setChainFilter] = useState<number | null>(null)
  const [operationChain, setOperationChain] = useState(DEFAULT_CHAIN_ID)
  const [exportAddr, setExportAddr] = useState("")
  const [exportPK, setExportPK] = useState("")
  const [bulkKeys, setBulkKeys] = useState<Array<{ address: string; privateKey: string; label: string }>>([])
  const [password, setPassword] = useState("")
  const [importKey, setImportKey] = useState("")
  const [importLabel, setImportLabel] = useState("")
  const [importSeed, setImportSeed] = useState("")
  const [importSeedLabel, setImportSeedLabel] = useState("")
  const [importSubCount, setImportSubCount] = useState(1)
  const [fundAmount, setFundAmount] = useState("0.01")
  const [fundFrom, setFundFrom] = useState("")
  const [fundSpeed, setFundSpeed] = useState<SpeedTier>("normal")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)
  const [savingService, setSavingService] = useState<string | null>(null)
  const [maxLoading, setMaxLoading] = useState(false)
  const [result, setResult] = useState("")
  const [nftContract, setNftContract] = useState("")
  const [nftInfo, setNftInfo] = useState<NFTContractInfo | null>(null)
  const [nftBalances, setNftBalances] = useState<WalletNFTBalance[]>([])
  const [nftDest, setNftDest] = useState("")
  const [nftSpeed, setNftSpeed] = useState<SpeedTier>("normal")
  // "all" moves every token; "custom" sends nftAmountPer from each holding wallet.
  const [nftAmountMode, setNftAmountMode] = useState<"all" | "custom">("all")
  const [nftAmountPer, setNftAmountPer] = useState("1")
  const [consolidateDest, setConsolidateDest] = useState("")
  const [nftResults, setNftResults] = useState<NFTTransferResult[]>([])
  const [apiKeys, setApiKeys] = useState<Record<string, string>>({})
  const [apiKeyDraft, setApiKeyDraft] = useState<Record<string, string>>({})
  const [walletAllowance, setWalletAllowance] = useState<number | null | undefined>(undefined)
  const [allowanceStale, setAllowanceStale] = useState(false)
  const [syncingAllowance, setSyncingAllowance] = useState(false)
  const [newAccessCode, setNewAccessCode] = useState("")
  const [redeemingCode, setRedeemingCode] = useState(false)
  const [selectedWallet, setSelectedWallet] = useState("")
  const [fundTargets, setFundTargets] = useState<Set<string>>(new Set())
  const [exportMnemonic, setExportMnemonic] = useState("")
  const [drawerSend, setDrawerSend] = useState(false)
  const [sendTo, setSendTo] = useState("")
  const [sendAmount, setSendAmount] = useState("")
  const [sendChain, setSendChain] = useState(DEFAULT_CHAIN_ID)
  const [sendSpeed, setSendSpeed] = useState<SpeedTier>("normal")
  const [sendLoading, setSendLoading] = useState(false)
  const [sendResult, setSendResult] = useState("")
  const [sendError, setSendError] = useState("")
  const [sendExplorerUrl, setSendExplorerUrl] = useState("")
  const [fundMode, setFundMode] = useState<"each" | "split">("each")
  const [addCount, setAddCount] = useState(5)
  const [removeAddr, setRemoveAddr] = useState("")
  const [resetPhrase, setResetPhrase] = useState("")
  const [resetArmed, setResetArmed] = useState(false)

  const handleCopy = (addr: string) => {
    copyToClipboard(addr)
    onCopy(`Copied ${shortenAddress(addr)}`)
  }

  const handleToggle = async (addr: string, enabled: boolean) => {
    await sendMessage({ type: "TOGGLE_WALLET", payload: { address: addr, enabled } })
    onRefresh()
  }

  const handleExport = async () => {
    setError("")
    setLoading(true)
    const res = await sendMessage<ExportData>({ type: "EXPORT_KEY", payload: { address: exportAddr, password } })
    if (res.ok && res.data) {
      setExportPK(res.data.privateKey)
    } else if (!res.ok) {
      setError(res.error)
    }
    setLoading(false)
  }

  const handleImportKey = async () => {
    setError("")
    setLoading(true)
    const res = await sendMessage<WalletsData>({ type: "IMPORT_KEY", payload: { privateKey: importKey, label: importLabel || "Imported", password } })
    if (res.ok) {
      setView("list")
      setImportKey("")
      setImportLabel("")
      setPassword("")
      onRefresh()
    } else if (!res.ok) {
      setError(res.error)
    }
    setLoading(false)
  }

  const handleImportSeed = async () => {
    setError("")
    setLoading(true)
    const res = await sendMessage<WalletsData>({
      type: "IMPORT_MNEMONIC",
      payload: { mnemonic: importSeed.trim(), label: importSeedLabel || "Wallet 2", password, subWalletCount: importSubCount },
    })
    if (res.ok) {
      setView("list")
      setImportSeed("")
      setImportSeedLabel("")
      setPassword("")
      onRefresh()
    } else if (!res.ok) {
      setError(res.error)
    }
    setLoading(false)
  }

  const resetView = () => {
    setView("list")
    setExportAddr("")
    setExportPK("")
    setBulkKeys([])
    setPassword("")
    setError("")
    setResult("")
    setImportKey("")
    setImportLabel("")
    setImportSeed("")
    setImportSeedLabel("")
    setNftContract("")
    setNftInfo(null)
    setNftBalances([])
    setNftResults([])
    setNftDest("")
    setNftAmountMode("all")
    setNftAmountPer("1")
    setConsolidateDest("")
    setExportMnemonic("")
  }

  const handleFundSubs = async () => {
    setError("")
    setLoading(true)
    setResult("")
    const fromAddress = fundFrom || masterAddr
    const targetAddrs = Array.from(fundTargets)
    if (targetAddrs.length === 0) { setError("Select at least one wallet"); setLoading(false); return }
    // "each" sends the entered amount to every wallet; "split" divides the entered
    // total evenly across the selected wallets.
    const perWallet = fundMode === "split"
      ? (parseFloat(fundAmount || "0") / targetAddrs.length).toFixed(18).replace(/\.?0+$/, "")
      : fundAmount
    if (!perWallet || parseFloat(perWallet) <= 0) { setError("Enter an amount"); setLoading(false); return }
    const res = await sendMessage<{ succeeded: number; failed: number }>({
      type: "FUND_SUBWALLETS",
      payload: { chainId: operationChain, amountPerWallet: perWallet, speed: fundSpeed, addresses: targetAddrs, fromAddress },
    })
    if (res.ok && res.data) {
      setResult(`${res.data.succeeded} funded, ${res.data.failed} failed`)
      onRefresh()
      onRefreshBalances?.()
    } else if (!res.ok) {
      setError(res.error)
    }
    setLoading(false)
  }

  const handleConsolidate = async () => {
    setError("")
    setLoading(true)
    setResult("")
    const res = await sendMessage<{ succeeded: number; failed: number }>({
      type: "CONSOLIDATE",
      payload: { chainId: operationChain, speed: fundSpeed, destination: consolidateDest || undefined },
    })
    if (res.ok && res.data) {
      if (res.data.succeeded === 0 && res.data.failed === 0) {
        setResult("No funds to consolidate — everything already at the destination")
      } else if (res.data.failed === 0) {
        setResult(`${res.data.succeeded} consolidated`)
      } else {
        setResult(`${res.data.succeeded} consolidated, ${res.data.failed} failed`)
      }
      onRefresh()
      onRefreshBalances?.()
    } else if (!res.ok) {
      setError(res.error)
    }
    setLoading(false)
  }

  const handleAddSubs = async () => {
    setError("")
    setResult("")
    setLoading(true)
    const res = await sendMessage<{ wallets: unknown[] }>({ type: "DERIVE_MORE", payload: { count: addCount, password } })
    if (res.ok) {
      setResult(`Added ${addCount} wallet${addCount !== 1 ? "s" : ""}`)
      setPassword("")
      onRefresh()
    } else if (!res.ok) {
      setError(res.error)
    }
    setLoading(false)
  }

  const handleResetWallet = async () => {
    setError("")
    setLoading(true)
    const res = await sendMessage({ type: "RESET_WALLET" })
    if (res.ok) {
      // Full wipe — restart the popup so it lands on the setup screen.
      window.location.reload()
    } else if (!res.ok) {
      setError(res.error)
      setLoading(false)
    }
  }

  const handleBulkExport = async () => {
    setError("")
    setLoading(true)
    const res = await sendMessage<{ keys: Array<{ address: string; privateKey: string; label: string }> }>({ type: "EXPORT_ALL_KEYS", payload: { password } })
    if (res.ok && res.data) {
      setBulkKeys(res.data.keys)
    } else if (!res.ok) {
      setError(res.error)
    }
    setLoading(false)
  }

  const handleFetchNFTs = async () => {
    setError("")
    setLoading(true)
    setNftBalances([])
    setNftInfo(null)
    setNftResults([])
    const [infoRes, balRes] = await Promise.all([
      sendMessage<NFTContractInfo>({ type: "GET_NFT_CONTRACT_INFO", payload: { chainId: operationChain, contractAddress: nftContract } }),
      sendMessage<{ balances: WalletNFTBalance[] }>({ type: "GET_NFT_BALANCES", payload: { chainId: operationChain, contractAddress: nftContract } }),
    ])
    if (infoRes.ok && infoRes.data) setNftInfo(infoRes.data)
    if (balRes.ok && balRes.data) setNftBalances(balRes.data.balances)
    else if (!balRes.ok) setError(balRes.error)
    setLoading(false)
  }

  const handleConsolidateNFTs = async () => {
    setError("")
    setLoading(true)
    setNftResults([])
    const amountPerWallet = nftAmountMode === "custom" ? parseInt(nftAmountPer, 10) || 0 : undefined
    const res = await sendMessage<{ results: NFTTransferResult[] }>({
      type: "CONSOLIDATE_NFTS",
      payload: { chainId: operationChain, contractAddress: nftContract, destination: nftDest, speed: nftSpeed, amountPerWallet },
    })
    if (res.ok && res.data) {
      setNftResults(res.data.results ?? [])
      onRefresh()
      onRefreshBalances?.()
    } else if (!res.ok) {
      setError(res.error)
    }
    setLoading(false)
  }

  const handleRemoveWallet = async () => {
    setError("")
    setLoading(true)
    const res = await sendMessage({ type: "REMOVE_WALLET", payload: { address: removeAddr, password } })
    setLoading(false)
    if (res.ok) {
      onCopy("Wallet removed")
      setPassword("")
      setRemoveAddr("")
      resetView()
      onRefresh()
    } else if (!res.ok) {
      setError(res.error)
    }
  }

  const handleOpenSettings = () => {
    // Switch the view immediately so the click feels instant; the keys populate
    // a beat later when the round-trip returns (inputs render empty until then).
    setView("settings")
    sendMessage<ApiKeysData>({ type: "GET_API_KEYS" }).then((res) => {
      if (res.ok && res.data) {
        const keys = res.data as Record<string, string>
        setApiKeys(keys)
        setApiKeyDraft({ ...keys })
      }
    })
    handleSyncAccess()
  }

  // Live, rotation-free read of the current mint-wallet allowance (no refresh
  // token touched, safe to call any time — see LICENSE_ENTITLEMENTS). Runs on
  // Settings open and on the manual SYNC button.
  const handleSyncAccess = async () => {
    setSyncingAllowance(true)
    const res = await sendMessage<{ walletAllowance: number | null; stale: boolean }>({ type: "LICENSE_ENTITLEMENTS" })
    if (res.ok && res.data) {
      setWalletAllowance(res.data.walletAllowance)
      setAllowanceStale(res.data.stale)
      onWalletAllowanceChange?.(res.data.walletAllowance)
    }
    setSyncingAllowance(false)
  }

  // Lets a holder switch to a different access code (e.g. an unlimited one
  // handed out separately) without leaving the extension or re-onboarding --
  // LICENSE_REDEEM just overwrites whatever license was already stored.
  const handleRedeemNewCode = async () => {
    const code = newAccessCode.trim()
    if (!code) return
    setRedeemingCode(true)
    setError("")
    const res = await sendMessage<LicenseStatusData>({ type: "LICENSE_REDEEM", payload: { code } })
    const status = res.ok ? res.data : undefined
    if (status?.licensed) {
      setWalletAllowance(status.walletAllowance ?? null)
      setAllowanceStale(false)
      onWalletAllowanceChange?.(status.walletAllowance ?? null)
      setNewAccessCode("")
      setResult(
        status.walletAllowance == null
          ? "New code active - unlimited mint wallets"
          : `New code active - ${status.walletAllowance} mint wallet${status.walletAllowance !== 1 ? "s" : ""}`
      )
    } else {
      setError(
        status?.reason === "revoked" ? "Code not recognized or already used on another device."
          : status?.reason === "network" ? "Couldn't reach the server. Try again."
          : "Invalid access code."
      )
    }
    setRedeemingCode(false)
  }

  const handleSaveApiKey = async (service: string) => {
    const key = apiKeyDraft[service] ?? ""
    setSavingService(service)
    const res = await sendMessage({ type: "SET_API_KEYS", payload: { service, key } })
    if (res.ok) {
      setApiKeys((prev) => ({ ...prev, [service]: key }))
      setResult(`${service} key saved`)
    } else if (!res.ok) {
      setError(res.error)
    }
    setSavingService(null)
  }

  const totalNFTs = nftBalances.reduce((sum, b) => sum + b.count, 0)
  const masterAddr = wallets.find((w) => w.type === "hd-master")?.address ?? ""
  const nonMasterNFTs = nftBalances.filter((b) => b.address.toLowerCase() !== masterAddr.toLowerCase()).reduce((s, b) => s + b.count, 0)

  const handleCopyAllKeys = () => {
    const text = bulkKeys.map((k) => `${k.label}: ${k.address} | ${k.privateKey}`).join("\n")
    copyToClipboard(text)
    onCopy("All keys copied to clipboard")
  }

  if (view === "remove-wallet") {
    const target = wallets.find((w) => w.address.toLowerCase() === removeAddr.toLowerCase())
    const targetUsd = target?.balances?.totalUsd ?? 0
    const isImported = target?.type === "imported"
    return (
      <div className="panel-body">
        <div className="panel-header-row">
          <button className="btn-back" onClick={() => { setRemoveAddr(""); setPassword(""); resetView() }}><ChevronLeftIcon size={12} /></button>
          <span className="panel-title">Remove Wallet</span>
        </div>

        <div style={{ fontSize: 11, fontFamily: "var(--mono)", color: "var(--text2)", marginBottom: 4 }}>
          {target ? shortenAddress(target.address, 8) : shortenAddress(removeAddr, 8)}
          {target && (
            <span style={{ marginLeft: 8, color: targetUsd > 0 ? "var(--warn)" : "var(--text3)" }}>
              ${targetUsd.toFixed(2)}
            </span>
          )}
        </div>

        {targetUsd > 0 && (
          <div className="card" style={{ padding: "8px 10px", border: "1px solid rgba(255,160,64,0.4)", background: "rgba(255,160,64,0.07)", marginBottom: 6 }}>
            <div style={{ fontSize: 10, color: "var(--warn)", fontWeight: 700, lineHeight: 1.4 }}>
              This wallet still holds ~${targetUsd.toFixed(2)}. Move funds out before removing.
            </div>
          </div>
        )}

        <div className="card" style={{ padding: "8px 10px", border: "1px solid rgba(255,82,82,0.35)", background: "rgba(255,82,82,0.06)", marginBottom: 6 }}>
          <div style={{ fontSize: 10, color: "var(--text2)", lineHeight: 1.5 }}>
            {isImported
              ? "This removes the imported key from the app permanently. Without your own backup of the private key, access to this wallet is GONE. We cannot recover it for you."
              : "This hides the sub-wallet from the app. It can only be restored by re-importing your seed phrase in a wallet app. Back up your seed first. We cannot recover funds for you."}
          </div>
        </div>

        <div className="input-group">
          <label className="input-label">Password to confirm</label>
          <input
            type="password"
            className="key-input"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Enter password..."
            autoFocus
          />
        </div>

        {error && <div className="error-msg">{error}</div>}

        <button className="btn-primary danger" onClick={handleRemoveWallet} disabled={loading || !password}>
          {loading ? <span className="spinner" /> : "REMOVE WALLET"}
        </button>
      </div>
    )
  }

  if (view === "settings") {
    // OpenSea intentionally absent: nothing in the extension calls the OpenSea
    // REST API (the "OpenSea" mint path is the on-chain SeaDrop ABI, no key
    // needed) — an input for it would collect a key and silently do nothing.
    // Alchemy first: it's the key that actually accelerates everything.
    const API_SERVICES = [
      { id: "alchemy", label: "Alchemy", placeholder: "Your Alchemy API key" },
      { id: "etherscan", label: "Etherscan", placeholder: "Your Etherscan API key" },
    ]
    return (
      <div className="panel-body">
        <div className="panel-header-row">
          <button className="btn-back" onClick={resetView}><ChevronLeftIcon size={12} /></button>
          <span className="panel-title">Settings</span>
        </div>
        <div className="step-desc" style={{ marginBottom: 10 }}>
          Enter your own API keys for better performance.
        </div>

        {walletAllowance !== undefined && (
          <div className="input-group" style={{ marginBottom: 14 }}>
            <label className="input-label">Access</label>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 10, fontFamily: "var(--font-mono)" }}>
              <span>
                {walletAllowance == null ? "Unlimited mint wallets" : `${walletAllowance} mint wallet${walletAllowance !== 1 ? "s" : ""}`}
                {allowanceStale && <span style={{ color: "var(--warn)", marginLeft: 6 }}>(may be outdated)</span>}
              </span>
              <button className="btn-link" onClick={handleSyncAccess} disabled={syncingAllowance} style={{ fontSize: 9 }}>
                {syncingAllowance ? "SYNCING..." : "SYNC"}
              </button>
            </div>
            <div style={{ fontSize: 9, color: "var(--text3)", marginTop: 2 }}>
              Bought or sold Savants? Hit sync to check now instead of waiting up to 24h.
            </div>

            <div style={{ marginTop: 10, display: "flex", gap: 6 }}>
              <input
                type="text"
                className="key-input"
                value={newAccessCode}
                onChange={(e) => setNewAccessCode(e.target.value)}
                placeholder="Have a different access code? Paste it here"
                style={{ flex: 1 }}
              />
              <button
                className="btn-add"
                onClick={handleRedeemNewCode}
                disabled={redeemingCode || !newAccessCode.trim()}
              >
                {redeemingCode ? <span className="spinner" /> : "REDEEM"}
              </button>
            </div>
          </div>
        )}

        {error && <div className="error-msg">{error}</div>}
        {result && <div className="result-msg success">{result}</div>}
        {API_SERVICES.map(({ id, label, placeholder }) => (
          <div key={id} className="input-group" style={{ marginBottom: 10 }}>
            <label className="input-label">{label}</label>
            <div style={{ display: "flex", gap: 6 }}>
              <input
                type="text"
                className="key-input"
                value={apiKeyDraft[id] ?? ""}
                onChange={(e) => setApiKeyDraft((prev) => ({ ...prev, [id]: e.target.value }))}
                placeholder={placeholder}
                style={{ flex: 1 }}
              />
              <button
                className="btn-add"
                onClick={() => handleSaveApiKey(id)}
                disabled={savingService !== null || (apiKeyDraft[id] ?? "") === (apiKeys[id] ?? "")}
              >
                {savingService === id ? <span className="spinner" /> : "SAVE"}
              </button>
            </div>
            {apiKeys[id] && (
              <div style={{ fontSize: 9, color: "var(--success)", marginTop: 2 }}>
                Key set ({apiKeys[id].slice(0, 6)}...)
              </div>
            )}
          </div>
        ))}

        <div style={{ marginTop: 20, paddingTop: 14, borderTop: "1px solid var(--border)" }}>
          <div className="input-label" style={{ color: "var(--danger)", marginBottom: 6 }}>Danger Zone</div>
          <div className="step-desc" style={{ marginBottom: 8 }}>
            Reset wipes every wallet, key, and seed from this device permanently. Export your keys first. This cannot be undone.
          </div>
          {!resetArmed ? (
            <button className="btn-primary danger" onClick={() => { setError(""); setResetPhrase(""); setResetArmed(true) }} style={{ marginTop: 0 }}>
              RESET WALLET
            </button>
          ) : (
            <>
              <div className="step-warning" style={{ marginBottom: 8 }}>
                Type <b>reset and delete keys from app</b> to confirm.
              </div>
              <input
                type="text"
                className="key-input"
                value={resetPhrase}
                onChange={(e) => setResetPhrase(e.target.value)}
                placeholder="reset and delete keys from app"
                style={{ marginBottom: 8 }}
              />
              <div style={{ display: "flex", gap: 6 }}>
                <button className="btn-add" onClick={() => { setResetArmed(false); setResetPhrase("") }} style={{ flex: 1 }}>
                  CANCEL
                </button>
                <button
                  className="btn-primary danger"
                  onClick={handleResetWallet}
                  disabled={loading || resetPhrase.trim().toLowerCase() !== "reset and delete keys from app"}
                  style={{ marginTop: 0, flex: 1 }}
                >
                  {loading ? <span className="spinner" /> : "DELETE EVERYTHING"}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    )
  }

  if (view === "nft-view") {
    return (
      <div className="panel-body">
        <div className="panel-header-row">
          <button className="btn-back" onClick={resetView}><ChevronLeftIcon size={12} /></button>
          <span className="panel-title">NFT Balances</span>
        </div>
        <div className="toggle-row" style={{ marginTop: 0, marginBottom: 8 }}>
          {CHAIN_IDS.map((id) => (
            <button
              key={id}
              className={`chain-pill ${operationChain === id ? "active" : ""}`}
              onClick={() => setOperationChain(id)}
            >
              <div className="chain-dot" style={{ background: CHAIN_COLORS[id] }} />
              {CHAIN_LABELS[id]}
            </button>
          ))}
        </div>
        <div className="input-group">
          <label className="input-label">Contract Address</label>
          <input type="text" className="key-input" value={nftContract} onChange={(e) => setNftContract(e.target.value)} placeholder="0x..." />
        </div>
        <button className="btn-primary" onClick={handleFetchNFTs} disabled={loading || !nftContract} style={{ marginBottom: 8 }}>
          {loading ? <span className="spinner" /> : "FETCH NFT BALANCES"}
        </button>
        {error && <div className="error-msg">{error}</div>}
        {nftInfo && (
          <div style={{ fontSize: 10, color: "var(--text2)", marginBottom: 6, letterSpacing: 1 }}>
            {nftInfo.name} ({nftInfo.symbol}) {nftInfo.isEnumerable && <span style={{ color: "var(--accent)" }}>ENUMERABLE</span>}
          </div>
        )}
        {nftBalances.length > 0 && (
          <>
            <div style={{ fontSize: 10, color: "var(--accent)", marginBottom: 4, fontWeight: 700 }}>
              {totalNFTs} NFT{totalNFTs !== 1 ? "s" : ""} across {nftBalances.filter((b) => b.count > 0).length} wallets
            </div>
            <div className="wallet-list" style={{ maxHeight: 160 }}>
              {nftBalances.filter((b) => b.count > 0).map((b) => (
                <div key={b.address} className="wallet-card enabled" style={{ padding: 6 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <WalletAvatar address={b.address} size={16} />
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text)" }}>{shortenAddress(b.address, 6)}</span>
                    </div>
                    <span style={{ fontSize: 10, color: "var(--accent)", fontWeight: 700 }}>{b.count}</span>
                  </div>
                  {b.tokenIds.length > 0 && (
                    <div style={{ fontSize: 8, color: "var(--text3)", marginTop: 2 }}>
                      IDs: {b.tokenIds.join(", ")}
                    </div>
                  )}
                </div>
              ))}
            </div>
            {nonMasterNFTs > 0 && (
              <button
                className="btn-action btn-danger"
                style={{ marginTop: 8, width: "100%" }}
                onClick={() => { setNftDest(masterAddr); setView("consolidate-nfts") }}
              >
                CONSOLIDATE {nonMasterNFTs} NFTs
              </button>
            )}
          </>
        )}
        {nftBalances.length > 0 && totalNFTs === 0 && (
          <div className="empty-state" style={{ padding: 12 }}>No NFTs found for this contract</div>
        )}
      </div>
    )
  }

  if (view === "consolidate-nfts") {
    // Per-wallet cap: "custom" sends at most N tokens from each holding wallet.
    const perWalletCap = nftAmountMode === "custom" ? parseInt(nftAmountPer, 10) || 0 : Infinity
    const transferCount = nftBalances
      .filter((b) => b.address.toLowerCase() !== nftDest.toLowerCase())
      .reduce((sum, b) => sum + Math.min(b.count, perWalletCap), 0)
    const confirmed = nftResults.filter((r) => r.status === "confirmed").length
    const failed = nftResults.filter((r) => r.status === "failed").length
    return (
      <div className="panel-body">
        <div className="panel-header-row">
          <button className="btn-back" onClick={() => { setNftResults([]); setView("nft-view") }}><ChevronLeftIcon size={12} /></button>
          <span className="panel-title">Consolidate NFTs</span>
        </div>
        {nftInfo && (
          <div style={{ fontSize: 10, color: "var(--text2)", marginBottom: 8, letterSpacing: 1 }}>
            {nftInfo.name} - {transferCount} NFT{transferCount !== 1 ? "s" : ""} to transfer
            {totalNFTs - transferCount > 0 && (
              <span style={{ color: "var(--text3)" }}> ({totalNFTs - transferCount} {nftAmountMode === "custom" ? "staying put" : "already at dest"})</span>
            )}
          </div>
        )}
        <div className="input-group">
          <label className="input-label">Destination Wallet</label>
          <select className="key-input" value={nftDest} onChange={(e) => setNftDest(e.target.value)}>
            {wallets.map((w) => (
              <option key={w.address} value={w.address}>
                {walletBadgeLabel(w)} - {shortenAddress(w.address, 6)}
              </option>
            ))}
          </select>
        </div>
        <div className="input-group">
          <label className="input-label">Amount From Each Wallet</label>
          <div style={{ display: "flex", gap: 6 }}>
            <div className="speed-selector" style={{ flex: 1 }}>
              <button className={`speed-btn ${nftAmountMode === "all" ? "active normal" : ""}`} onClick={() => setNftAmountMode("all")}>All</button>
              <button className={`speed-btn ${nftAmountMode === "custom" ? "active normal" : ""}`} onClick={() => setNftAmountMode("custom")}>Custom</button>
            </div>
            {nftAmountMode === "custom" && (
              <input
                type="number"
                className="key-input"
                min="1"
                step="1"
                value={nftAmountPer}
                onChange={(e) => setNftAmountPer(e.target.value)}
                style={{ width: 64 }}
              />
            )}
          </div>
          {nftAmountMode === "custom" && (
            <div style={{ fontSize: 9, color: "var(--text3)", marginTop: 2 }}>
              Sends up to {parseInt(nftAmountPer, 10) || 0} NFT{(parseInt(nftAmountPer, 10) || 0) !== 1 ? "s" : ""} from every wallet that holds this collection.
            </div>
          )}
        </div>
        <div className="input-group">
          <label className="input-label">Speed</label>
          <div className="speed-selector">
            <button className={`speed-btn ${nftSpeed === "normal" ? "active normal" : ""}`} onClick={() => setNftSpeed("normal")}>Normal</button>
            <button className={`speed-btn ${nftSpeed === "fast" ? "active fast" : ""}`} onClick={() => setNftSpeed("fast")}>Fast</button>
            <button className={`speed-btn ${nftSpeed === "turbo" ? "active turbo" : ""}`} onClick={() => setNftSpeed("turbo")}>Turbo</button>
          </div>
        </div>
        {error && <div className="error-msg">{error}</div>}
        {nftResults.length > 0 && (
          <div style={{ marginBottom: 8 }}>
            <div style={{ fontSize: 10, color: confirmed > 0 ? "var(--success)" : "var(--danger)", fontWeight: 700, marginBottom: 4 }}>
              {confirmed} transferred, {failed} failed
            </div>
            <div className="wallet-list" style={{ maxHeight: 120 }}>
              {nftResults.map((r, i) => (
                <div key={i} className="wallet-card enabled" style={{ padding: 4 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9 }}>
                    <span style={{ color: "var(--text2)" }}>{shortenAddress(r.from, 4)} #{r.tokenId}</span>
                    <span style={{ color: r.status === "confirmed" ? "var(--success)" : "var(--danger)" }}>
                      {r.status === "confirmed" ? "OK" : "FAIL"}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        {nftResults.length === 0 ? (
          <button className="btn-primary danger" onClick={handleConsolidateNFTs} disabled={loading || !nftDest || transferCount === 0}>
            {loading ? <span className="spinner" /> : transferCount === 0 ? "ALL NFTs AT DESTINATION" : `CONSOLIDATE ${transferCount} NFTs`}
          </button>
        ) : (
          // After a run, offer a fresh pass (rescans balances so already-moved
          // tokens drop out) instead of dead-ending with no button at all.
          <button
            className="btn-primary"
            onClick={() => { setNftResults([]); setView("nft-view"); handleFetchNFTs() }}
            disabled={loading}
          >
            {failed > 0 ? "RESCAN & RETRY FAILED" : "DONE - RESCAN NFTs"}
          </button>
        )}
      </div>
    )
  }

  const closeDrawer = () => {
    setSelectedWallet("")
    setDrawerSend(false)
    setSendTo("")
    setSendAmount("")
    setSendError("")
    setSendResult("")
    setSendLoading(false)
  }

  const handleSendEth = async () => {
    if (!selectedWallet || !sendTo || !sendAmount) return
    setSendError("")
    setSendResult("")
    setSendLoading(true)
    const res = await sendMessage<{ hash: string; status: string; explorerUrl?: string }>({
      type: "SEND_ETH",
      payload: { chainId: sendChain, fromAddress: selectedWallet, toAddress: sendTo, amount: sendAmount, speed: sendSpeed },
    })
    if (res.ok && res.data) {
      const short = res.data.hash.slice(0, 10) + "..." + res.data.hash.slice(-6)
      setSendExplorerUrl(res.data.explorerUrl ?? "")
      setSendResult(`Sent! ${short}`)
      setSendAmount("")
      setSendTo("")
      onRefresh()
      onRefreshBalances?.()
    } else if (!res.ok) {
      setSendError(res.error)
    }
    setSendLoading(false)
  }

  const fmtUsd = (v: number) => v >= 10000 ? `$${(v / 1000).toFixed(1)}k` : v >= 0.01 ? `$${v.toFixed(2)}` : v > 0 ? "<$0.01" : "$0.00"
  const fmtAmt = (v: number, tok: string) => {
    if (tok === "USDC") return v.toFixed(2)
    if (v >= 1) return v.toFixed(4)
    if (v > 0) return v.toFixed(6)
    return "0"
  }

  if (view === "fund-subs") {
    const fromAddr = fundFrom || masterAddr
    const fromWallet = wallets.find((w) => w.address.toLowerCase() === fromAddr.toLowerCase())
    const fromChainBal = fromWallet?.balances?.byChain[operationChain]
    const fromEth = fromChainBal ? parseFloat(fromChainBal.ETH.formatted) : 0
    const enteredAmount = parseFloat(fundAmount || "0")
    // "each": total = amount x wallets. "split": total = amount, per-wallet = amount / wallets.
    const totalCost = fundMode === "split" ? enteredAmount : enteredAmount * fundTargets.size
    const perWalletEth = fundMode === "split" && fundTargets.size > 0 ? enteredAmount / fundTargets.size : enteredAmount
    const insufficient = fromEth > 0 && totalCost > fromEth
    const usd = (eth: number) => ethPriceUsd > 0 ? ` ($${(eth * ethPriceUsd).toFixed(2)})` : ""

    const handleFundFromChange = (addr: string) => {
      setFundFrom(addr)
      const from = addr || masterAddr
      setFundTargets(new Set(wallets.filter((w) => w.enabled && w.address.toLowerCase() !== from.toLowerCase()).map((w) => w.address)))
    }
    const toggleFundTarget = (addr: string) => {
      const next = new Set(fundTargets)
      if (next.has(addr)) next.delete(addr)
      else next.add(addr)
      setFundTargets(next)
    }
    const selectableFund = wallets.filter((w) => w.enabled && w.address.toLowerCase() !== fromAddr.toLowerCase())
    const toggleAllFund = () => {
      if (fundTargets.size === selectableFund.length) setFundTargets(new Set())
      else setFundTargets(new Set(selectableFund.map((w) => w.address)))
    }
    return (
      <div className="panel-body">
        <div className="panel-header-row">
          <button className="btn-back" onClick={() => { setError(""); setResult(""); setView("manage-menu") }}><ChevronLeftIcon size={12} /></button>
          <span className="panel-title">Disperse ETH</span>
        </div>
        <div className="toggle-row" style={{ marginTop: 0, marginBottom: 8 }}>
          {CHAIN_IDS.map((id) => (
            <button
              key={id}
              className={`chain-pill ${operationChain === id ? "active" : ""}`}
              onClick={() => setOperationChain(id)}
            >
              <div className="chain-dot" style={{ background: CHAIN_COLORS[id] }} />
              {CHAIN_LABELS[id]}
            </button>
          ))}
        </div>
        <div className="input-group">
          <label className="input-label">From Wallet</label>
          <select className="key-input" value={fromAddr} onChange={(e) => handleFundFromChange(e.target.value)}>
            {wallets.map((w) => {
              const eth = w.balances?.byChain[operationChain] ? parseFloat(w.balances.byChain[operationChain].ETH.formatted) : 0
              const name = w.type === "hd-master" ? "Master" : (w.label || shortenAddress(w.address, 4))
              return (
                <option key={w.address} value={w.address}>
                  {name} — {eth.toFixed(4)} ETH{usd(eth)}
                </option>
              )
            })}
          </select>
        </div>
        <div style={{ fontSize: 10, color: fromEth > 0 ? "var(--cyan)" : "var(--warn)", marginBottom: 8, fontFamily: "var(--font-mono)" }}>
          Balance on {CHAIN_LABELS[operationChain]}: {fromEth.toFixed(6)} ETH{usd(fromEth)}
          {fromEth === 0 && <span style={{ color: "var(--danger)", marginLeft: 6 }}>NO FUNDS ON THIS CHAIN</span>}
        </div>

        <div className="speed-selector" style={{ marginBottom: 8 }}>
          <button className={`speed-btn ${fundMode === "each" ? "active normal" : ""}`} onClick={() => setFundMode("each")}>Same each</button>
          <button className={`speed-btn ${fundMode === "split" ? "active normal" : ""}`} onClick={() => setFundMode("split")}>Split evenly</button>
        </div>
        <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
          <div style={{ flex: 1 }}>
            <label className="input-label">{fundMode === "split" ? "Total to Split (ETH)" : "Amount Per Wallet (ETH)"}</label>
            <input type="number" className="key-input" value={fundAmount} step="0.001" onChange={(e) => setFundAmount(e.target.value)} />
          </div>
        </div>
        {fundTargets.size > 0 && (
          <div style={{ fontSize: 9, color: insufficient ? "var(--danger)" : "var(--text3)", marginBottom: 6 }}>
            {fundMode === "split"
              ? `${perWalletEth.toFixed(6)} ETH${usd(perWalletEth)} each · total ${totalCost.toFixed(6)} ETH${usd(totalCost)}`
              : `Total: ${totalCost.toFixed(6)} ETH${usd(totalCost)} to ${fundTargets.size} wallets`}
            {insufficient && " — EXCEEDS BALANCE"}
          </div>
        )}
        <div className="input-group">
          <label className="input-label">Speed</label>
          <div className="speed-selector">
            <button className={`speed-btn ${fundSpeed === "normal" ? "active normal" : ""}`} onClick={() => setFundSpeed("normal")}>Normal</button>
            <button className={`speed-btn ${fundSpeed === "fast" ? "active fast" : ""}`} onClick={() => setFundSpeed("fast")}>Fast</button>
            <button className={`speed-btn ${fundSpeed === "turbo" ? "active turbo" : ""}`} onClick={() => setFundSpeed("turbo")}>Turbo</button>
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4, marginTop: 4 }}>
          <label className="input-label">Wallets ({fundTargets.size}/{selectableFund.length})</label>
          <button className="btn-link" onClick={toggleAllFund} style={{ fontSize: 9 }}>
            {fundTargets.size === selectableFund.length ? "DESELECT ALL" : "SELECT ALL"}
          </button>
        </div>
        <div className="wallet-list" style={{ flex: "none", minHeight: 120, maxHeight: 200, marginBottom: 8 }}>
          {selectableFund.map((w) => (
            <div
              key={w.address}
              className={`wallet-card ${fundTargets.has(w.address) ? "enabled" : ""}`}
              onClick={() => toggleFundTarget(w.address)}
              style={{ cursor: "pointer", padding: "5px 8px" }}
            >
              <div className="wallet-card-top">
                <WalletAvatar address={w.address} size={14} />
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text2)" }}>{w.label}</span>
                <span className="wallet-addr" style={{ marginLeft: "auto", cursor: "default" }}>{shortenAddress(w.address, 4)}</span>
              </div>
            </div>
          ))}
        </div>

        {error && <div className="error-msg">{error}</div>}
        {result && <div className="result-msg success">{result}</div>}
        <button className="btn-primary" onClick={handleFundSubs} disabled={loading || !fundAmount || fundTargets.size === 0}>
          {loading ? <span className="spinner" /> : `FUND ${fundTargets.size} WALLET${fundTargets.size !== 1 ? "S" : ""}`}
        </button>
      </div>
    )
  }

  if (view === "consolidate") {
    const destAddr = consolidateDest || masterAddr
    // Sources: every enabled wallet except the destination (sweeping to a sub
    // pulls from the master too).
    const sources = wallets.filter((w) => w.enabled && w.address.toLowerCase() !== destAddr.toLowerCase())
    const subCount = sources.length
    // Sweepable = ETH held by source wallets on the SELECTED chain (this is what
    // consolidate actually moves — funds on other chains are ignored).
    const sweepEth = sources.reduce((s, w) => s + (w.balances?.byChain[operationChain] ? parseFloat(w.balances.byChain[operationChain].ETH.formatted) : 0), 0)
    const fundedCount = sources.filter((w) => (w.balances?.byChain[operationChain] ? parseFloat(w.balances.byChain[operationChain].ETH.formatted) : 0) > 0).length
    const sweepUsd = ethPriceUsd > 0 ? ` ($${(sweepEth * ethPriceUsd).toFixed(2)})` : ""
    return (
      <div className="panel-body">
        <div className="panel-header-row">
          <button className="btn-back" onClick={() => { setError(""); setResult(""); setView("manage-menu") }}><ChevronLeftIcon size={12} /></button>
          <span className="panel-title">Consolidate ETH</span>
        </div>
        <div className="toggle-row" style={{ marginTop: 0, marginBottom: 8 }}>
          {CHAIN_IDS.map((id) => (
            <button
              key={id}
              className={`chain-pill ${operationChain === id ? "active" : ""}`}
              onClick={() => setOperationChain(id)}
            >
              <div className="chain-dot" style={{ background: CHAIN_COLORS[id] }} />
              {CHAIN_LABELS[id]}
            </button>
          ))}
        </div>
        <div style={{ fontSize: 10, marginBottom: 8, fontFamily: "var(--font-mono)", color: sweepEth > 0 ? "var(--cyan)" : "var(--warn)" }}>
          Sweepable on {CHAIN_LABELS[operationChain]}: {sweepEth.toFixed(6)} ETH{sweepUsd} from {fundedCount} wallet{fundedCount !== 1 ? "s" : ""}
          {sweepEth === 0 && <span style={{ color: "var(--danger)", marginLeft: 6 }}>NO ETH HERE — SWITCH CHAIN</span>}
        </div>
        <div className="step-desc" style={{ marginBottom: 8 }}>
          Consolidate ETH from {subCount} wallet{subCount !== 1 ? "s" : ""} to the destination below.
        </div>
        <div className="input-group">
          <label className="input-label">Destination Wallet</label>
          <select className="key-input" value={destAddr} onChange={(e) => setConsolidateDest(e.target.value)}>
            {wallets.map((w) => {
              const name = w.type === "hd-master" ? "Master" : (w.label || shortenAddress(w.address, 4))
              return (
                <option key={w.address} value={w.address}>
                  {name} — {shortenAddress(w.address, 6)}
                </option>
              )
            })}
          </select>
        </div>
        <div className="input-group">
          <label className="input-label">Speed</label>
          <div className="speed-selector">
            <button className={`speed-btn ${fundSpeed === "normal" ? "active normal" : ""}`} onClick={() => setFundSpeed("normal")}>Normal</button>
            <button className={`speed-btn ${fundSpeed === "fast" ? "active fast" : ""}`} onClick={() => setFundSpeed("fast")}>Fast</button>
            <button className={`speed-btn ${fundSpeed === "turbo" ? "active turbo" : ""}`} onClick={() => setFundSpeed("turbo")}>Turbo</button>
          </div>
        </div>
        {error && <div className="error-msg">{error}</div>}
        {result && <div className="result-msg success">{result}</div>}
        <button className="btn-primary danger" onClick={handleConsolidate} disabled={loading || sweepEth === 0}>
          {loading ? <span className="spinner" /> : sweepEth === 0 ? "NOTHING TO SWEEP" : `CONSOLIDATE ${fundedCount} WALLET${fundedCount !== 1 ? "S" : ""}`}
        </button>
      </div>
    )
  }

  if (view === "export-all") {
    return (
      <div className="panel-body">
        <div className="panel-header-row">
          <button className="btn-back" onClick={() => { setError(""); setBulkKeys([]); setPassword(""); setView("export-menu") }}><ChevronLeftIcon size={12} /></button>
          <span className="panel-title">Bulk Export Keys</span>
        </div>
        {bulkKeys.length === 0 ? (
          <>
            <div className="step-warning" style={{ marginBottom: 8 }}>
              This will display ALL private keys. Make sure no one is watching.
            </div>
            <div className="input-group">
              <label className="input-label">Password</label>
              <input type="password" className="key-input" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Enter password..." />
            </div>
            {error && <div className="error-msg">{error}</div>}
            <button className="btn-primary" onClick={handleBulkExport} disabled={loading || !password}>
              {loading ? <span className="spinner" /> : "SHOW ALL KEYS"}
            </button>
          </>
        ) : (
          <>
            <div className="wallet-list" style={{ maxHeight: 220 }}>
              {bulkKeys.map((k) => (
                <div key={k.address} className="wallet-card enabled" style={{ padding: 6 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                    <WalletAvatar address={k.address} size={14} />
                    <span style={{ fontSize: 9, color: "var(--text2)", letterSpacing: 1 }}>{k.label}</span>
                  </div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text)", wordBreak: "break-all" }}>{k.address}</div>
                  <div
                    style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--warn)", wordBreak: "break-all", cursor: "pointer" }}
                    onClick={() => { copyToClipboard(k.privateKey); onCopy(`Copied key for ${shortenAddress(k.address)}`) }}
                  >
                    {k.privateKey}
                  </div>
                </div>
              ))}
            </div>
            <button className="btn-secondary" onClick={handleCopyAllKeys} style={{ marginTop: 8 }}>COPY ALL KEYS</button>
          </>
        )}
      </div>
    )
  }

  if (view === "export") {
    return (
      <div className="panel-body">
        <div className="panel-header-row">
          <button className="btn-back" onClick={() => { setError(""); setExportPK(""); setPassword(""); setView("list") }}><ChevronLeftIcon size={12} /></button>
          <span className="panel-title">Export Private Key</span>
        </div>
        <div className="step-desc" style={{ marginBottom: 8 }}>
          {shortenAddress(exportAddr, 8)}
        </div>
        {!exportPK ? (
          <>
            <div className="input-group">
              <label className="input-label">Password</label>
              <input type="password" className="key-input" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Enter password..." />
            </div>
            {error && <div className="error-msg">{error}</div>}
            <button className="btn-primary" onClick={handleExport} disabled={loading || !password}>
              {loading ? <span className="spinner" /> : "EXPORT"}
            </button>
          </>
        ) : (
          <div className="input-group">
            <label className="input-label">Private Key</label>
            <div className="pk-display" onClick={() => { copyToClipboard(exportPK); onCopy("Private key copied") }}>
              {exportPK}
            </div>
            <div className="step-warning">Click to copy. Never share this key.</div>
          </div>
        )}
      </div>
    )
  }

  if (view === "import-key") {
    return (
      <div className="panel-body">
        <div className="panel-header-row">
          <button className="btn-back" onClick={() => { setError(""); setPassword(""); setImportKey(""); setImportLabel(""); setView("import-menu") }}><ChevronLeftIcon size={12} /></button>
          <span className="panel-title">Import Private Key</span>
        </div>
        <div className="input-group">
          <label className="input-label">Private Key</label>
          <input type="password" className="key-input" value={importKey} onChange={(e) => setImportKey(e.target.value)} placeholder="0x..." />
        </div>
        <div className="input-group">
          <label className="input-label">Label</label>
          <input type="text" className="key-input" value={importLabel} onChange={(e) => setImportLabel(e.target.value)} placeholder="My Wallet" />
        </div>
        <div className="input-group">
          <label className="input-label">Password</label>
          <input type="password" className="key-input" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Wallet password..." />
        </div>
        {error && <div className="error-msg">{error}</div>}
        <button className="btn-primary" onClick={handleImportKey} disabled={loading || !importKey || !password}>
          {loading ? <span className="spinner" /> : "IMPORT"}
        </button>
      </div>
    )
  }

  if (view === "import-seed") {
    return (
      <div className="panel-body">
        <div className="panel-header-row">
          <button className="btn-back" onClick={() => { setError(""); setPassword(""); setImportSeed(""); setImportSeedLabel(""); setView("import-menu") }}><ChevronLeftIcon size={12} /></button>
          <span className="panel-title">Import Seed Phrase</span>
        </div>
        <div className="input-group">
          <label className="input-label">Seed Phrase</label>
          <textarea className="key-input seed-input" rows={3} value={importSeed} onChange={(e) => setImportSeed(e.target.value)} placeholder="12 or 24 words..." autoComplete="off" autoCorrect="off" spellCheck={false} />
        </div>
        <div className="input-group">
          <label className="input-label">Label</label>
          <input type="text" className="key-input" value={importSeedLabel} onChange={(e) => setImportSeedLabel(e.target.value)} placeholder="Wallet 2" />
        </div>
        <div className="input-group">
          <label className="input-label">Sub-Wallets</label>
          <div className="wallet-preset-row">
            {[1, 10, 25].map((n) => (
              <button type="button" key={n} className={`preset-btn ${importSubCount === n ? "active" : ""}`} onClick={() => setImportSubCount(n)}>
                {n}
              </button>
            ))}
          </div>
        </div>
        <div className="input-group">
          <label className="input-label">Password</label>
          <input type="password" className="key-input" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Wallet password..." />
        </div>
        {error && <div className="error-msg">{error}</div>}
        <button className="btn-primary" onClick={handleImportSeed} disabled={loading || !importSeed || !password}>
          {loading ? <span className="spinner" /> : "IMPORT WALLET"}
        </button>
      </div>
    )
  }

  if (view === "import-menu") {
    return (
      <div className="panel-body">
        <div className="panel-header-row">
          <button className="btn-back" onClick={resetView}><ChevronLeftIcon size={12} /></button>
          <span className="panel-title">Import Wallet</span>
        </div>
        <div className="step-desc" style={{ marginBottom: 12 }}>
          Add more sub-wallets to your master, or import an existing wallet.
        </div>
        <button className="btn-primary" onClick={() => { setError(""); setResult(""); setPassword(""); setView("add-subs") }} style={{ marginTop: 0, marginBottom: 8 }}>
          ADD SUB-WALLETS
        </button>
        <button className="btn-primary" onClick={() => setView("import-seed")} style={{ marginTop: 0, marginBottom: 8, background: "var(--surface2)", color: "var(--text)" }}>
          IMPORT SEED PHRASE
        </button>
        <button className="btn-primary" onClick={() => setView("import-key")} style={{ marginTop: 0, background: "var(--surface2)", color: "var(--text)" }}>
          IMPORT PRIVATE KEY
        </button>
      </div>
    )
  }

  if (view === "add-subs") {
    const PRESETS = [1, 5, 10, 25, 50]
    return (
      <div className="panel-body">
        <div className="panel-header-row">
          <button className="btn-back" onClick={() => { setError(""); setResult(""); setPassword(""); setView("import-menu") }}><ChevronLeftIcon size={12} /></button>
          <span className="panel-title">Add Sub-Wallets</span>
        </div>
        <div className="step-desc" style={{ marginBottom: 12 }}>
          Derive more wallets from your existing master seed. They append to your current set.
        </div>
        <div className="input-group">
          <label className="input-label">How many to add</label>
          <div className="wallet-preset-row">
            {PRESETS.map((n) => (
              <button type="button" key={n} className={`preset-btn ${addCount === n ? "active" : ""}`} onClick={() => setAddCount(n)}>
                {n}
              </button>
            ))}
          </div>
        </div>
        <div className="input-group">
          <label className="input-label">Password</label>
          <input type="password" className="key-input" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Wallet password..." />
        </div>
        {error && <div className="error-msg">{error}</div>}
        {result && <div className="result-msg success">{result}</div>}
        <button className="btn-primary" onClick={handleAddSubs} disabled={loading || !password}>
          {loading ? <span className="spinner" /> : `ADD ${addCount} WALLET${addCount !== 1 ? "S" : ""}`}
        </button>
      </div>
    )
  }

  if (view === "manage-menu") {
    return (
      <div className="panel-body">
        <div className="panel-header-row">
          <button className="btn-back" onClick={resetView}><ChevronLeftIcon size={12} /></button>
          <span className="panel-title">Manage Funds</span>
        </div>
        <div className="step-desc" style={{ marginBottom: 12 }}>
          Disperse ETH to sub-wallets or consolidate into any wallet.
        </div>
        <button className="btn-primary" onClick={() => {
          setFundTargets(new Set(wallets.filter((w) => w.enabled && w.address.toLowerCase() !== masterAddr.toLowerCase()).map((w) => w.address)))
          setFundFrom("")
          setView("fund-subs")
        }} style={{ marginTop: 0, marginBottom: 8 }}>
          DISPERSE
        </button>
        <button className="btn-primary danger" onClick={() => {
          // Open on the chain where the sub/imported wallets actually hold ETH,
          // so consolidate doesn't default to a chain with nothing on it.
          const sources = wallets.filter((w) => (w.type === "hd-sub" || w.type === "imported") && w.enabled)
          let best = operationChain
          let bestEth = -1
          for (const id of CHAIN_IDS) {
            const sum = sources.reduce((s, w) => s + (w.balances?.byChain[id] ? parseFloat(w.balances.byChain[id].ETH.formatted) : 0), 0)
            if (sum > bestEth) { bestEth = sum; best = id }
          }
          setOperationChain(best)
          setView("consolidate")
        }} style={{ marginTop: 0 }}>
          CONSOLIDATE
        </button>
      </div>
    )
  }

  if (view === "export-menu") {
    return (
      <div className="panel-body">
        <div className="panel-header-row">
          <button className="btn-back" onClick={resetView}><ChevronLeftIcon size={12} /></button>
          <span className="panel-title">Export</span>
        </div>
        <div className="step-desc" style={{ marginBottom: 12 }}>
          Export keys or seed phrase. Never share these.
        </div>
        <button className="btn-primary" onClick={() => setView("export-seed")} style={{ marginTop: 0, marginBottom: 8 }}>
          SEED PHRASE
        </button>
        <button className="btn-primary" onClick={() => setView("export-all")} style={{ marginTop: 0, marginBottom: 8, background: "var(--surface2)", color: "var(--text)" }}>
          ALL PRIVATE KEYS
        </button>
      </div>
    )
  }

  if (view === "export-seed") {
    const handleExportSeed = async () => {
      setError("")
      setLoading(true)
      const res = await sendMessage<{ mnemonic: string }>({ type: "EXPORT_MNEMONIC", payload: { password } })
      if (res.ok && res.data) {
        setExportMnemonic(res.data.mnemonic)
      } else if (!res.ok) {
        setError(res.error)
      }
      setLoading(false)
    }
    return (
      <div className="panel-body">
        <div className="panel-header-row">
          <button className="btn-back" onClick={() => { setExportMnemonic(""); setPassword(""); setError(""); setView("export-menu") }}><ChevronLeftIcon size={12} /></button>
          <span className="panel-title">Export Seed Phrase</span>
        </div>
        {!exportMnemonic ? (
          <>
            <div className="step-warning" style={{ marginBottom: 8 }}>
              Your seed phrase gives full access to all HD wallets. Never share it.
            </div>
            <div className="input-group">
              <label className="input-label">Password</label>
              <input type="password" className="key-input" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Enter password..." />
            </div>
            {error && <div className="error-msg">{error}</div>}
            <button className="btn-primary" onClick={handleExportSeed} disabled={loading || !password}>
              {loading ? <span className="spinner" /> : "REVEAL SEED PHRASE"}
            </button>
          </>
        ) : (
          <div className="input-group">
            <label className="input-label">Seed Phrase</label>
            <div className="pk-display" onClick={() => { copyToClipboard(exportMnemonic); onCopy("Seed phrase copied") }} style={{ fontSize: 11, lineHeight: 1.6 }}>
              {exportMnemonic}
            </div>
            <div className="step-warning">Click to copy. Store securely.</div>
          </div>
        )}
      </div>
    )
  }

  const getWalletUsd = (w: WalletInfo) => {
    if (!w.balances) return 0
    if (chainFilter) return w.balances.byChain[chainFilter]?.totalUsd ?? 0
    return w.balances.totalUsd
  }

  const totalUsd = wallets.reduce((s, w) => s + getWalletUsd(w), 0)
  const totalUsdFmt = totalUsd >= 10000 ? `$${(totalUsd / 1000).toFixed(1)}k` : `$${totalUsd.toFixed(2)}`

  return (
    <div className="panel-body no-scroll">
      <div style={{ display: "flex", gap: 4, marginBottom: 4 }}>
        <button className={`chain-pill ${chainFilter === null ? "active" : ""}`} onClick={() => setChainFilter(null)}>
          ALL
        </button>
        {CHAIN_IDS.map((id) => (
          <button
            key={id}
            className={`chain-pill ${chainFilter === id ? "active" : ""}`}
            onClick={() => setChainFilter(id)}
          >
            <div className="chain-dot" style={{ background: CHAIN_COLORS[id] }} />
            {CHAIN_LABELS[id]}
          </button>
        ))}
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
          <span style={{ fontFamily: "var(--mono)", fontSize: 18, fontWeight: 700, color: "var(--accent)" }}>{wallets.filter(w => w.enabled).length}</span>
          <span style={{ fontSize: 9, color: "var(--text3)", letterSpacing: 1.5, textTransform: "uppercase" as const, fontWeight: 600 }}>active wallets</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {balanceLoading ? (
            <span style={{ fontSize: 9, color: "var(--text3)", letterSpacing: 1, textTransform: "uppercase" as const, fontWeight: 600 }}>
              Syncing…
            </span>
          ) : balanceFetchedAt ? (
            // Cached numbers paint instantly on open; this says how fresh they
            // are so a fast load doesn't read as a wrong/stale display.
            <span style={{ fontSize: 8, color: "var(--text3)", letterSpacing: 0.5, fontFamily: "var(--mono)" }}>
              {ageLabel(balanceFetchedAt)}
            </span>
          ) : null}
          <span style={{ fontFamily: "var(--mono)", fontSize: 15, fontWeight: 700, color: "var(--cyan)" }}>
            {totalUsdFmt}
          </span>
          <button
            className="lock-btn"
            onClick={() => onRefreshBalances?.()}
            disabled={balanceLoading}
            title="Refresh balances"
            style={{ width: 22, height: 22 }}
          >
            {balanceLoading
              ? <span className="spinner" style={{ width: 10, height: 10 }} />
              : <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 2v6h-6"/><path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M3 22v-6h6"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/></svg>
            }
          </button>
        </div>
      </div>

      {wallets.length === 0 ? (
        <div className="empty-state">No wallets loaded</div>
      ) : (
        <div className="wallet-list">
          {wallets.map((w) => {
            const usd = getWalletUsd(w)
            return (
              <div
                key={w.address}
                className={`wallet-card ${w.enabled ? "enabled" : "disabled"}`}
                onClick={() => { setSelectedWallet(w.address); setDrawerSend(false); setSendError(""); setSendResult("") }}
                style={{ cursor: "pointer" }}
              >
                <div className="wallet-card-top">
                  <WalletAvatar address={w.address} size={18} />
                  {walletBadgeLabel(w) && <span className={walletBadgeClass(w.type)}>{walletBadgeLabel(w)}</span>}
                  <span className="wallet-addr" onClick={(e) => { e.stopPropagation(); handleCopy(w.address) }} title={w.address} style={{ flex: "none" }}>
                    {w.type === "imported" && w.label ? w.label : shortenAddress(w.address, 6)}
                  </span>
                  <span style={{ flex: 1 }} />
                  <span style={{ fontFamily: "var(--mono)", fontSize: 10, color: usd > 0 ? "var(--cyan)" : "var(--text3)", whiteSpace: "nowrap" }}>
                    ${usd.toFixed(2)}
                  </span>
                  <div className="wallet-actions">
                    <button className="btn-icon" title="Export key" onClick={(e) => { e.stopPropagation(); setExportAddr(w.address); setView("export") }}>
                      <KeyIcon size={12} />
                    </button>
                    {w.type !== "hd-master" && (
                      <button className="btn-icon" title="Remove wallet" onClick={(e) => { e.stopPropagation(); setRemoveAddr(w.address); setError(""); setPassword(""); setView("remove-wallet") }}>
                        <TrashIcon size={12} />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      <div className="wallet-actions-row">
        <button className="btn-action" onClick={() => setView("import-menu")}>
          <UploadIcon size={10} /> IMPORT
        </button>
        <button className="btn-action" onClick={() => setView("manage-menu")}>
          <SendIcon size={10} /> MANAGE
        </button>
        <button className="btn-action" onClick={() => setView("nft-view")}>
          <ImageIcon size={10} /> NFTs
        </button>
        <button className="btn-action" onClick={() => setView("export-menu")}>
          <DownloadIcon size={10} /> EXPORT
        </button>
        <button className="btn-action" onClick={handleOpenSettings}>
          <SettingsIcon size={10} /> SETTINGS
        </button>
      </div>

      {selectedWallet && (() => {
        const w = wallets.find((x) => x.address === selectedWallet)
        if (!w) return null
        const wUsd = w.balances?.totalUsd ?? 0

        type TokenAgg = { total: number; usd: number; chains: Array<{ chainId: number; amount: number }> }
        const tokens: Record<string, TokenAgg> = { ETH: { total: 0, usd: 0, chains: [] }, WETH: { total: 0, usd: 0, chains: [] }, USDC: { total: 0, usd: 0, chains: [] } }
        if (w.balances) {
          for (const [cid, chain] of Object.entries(w.balances.byChain)) {
            for (const tid of ["ETH", "WETH", "USDC"] as const) {
              const amt = parseFloat(chain[tid].formatted)
              tokens[tid].total += amt
              tokens[tid].usd += chain[tid].usd
              if (amt > 0) tokens[tid].chains.push({ chainId: Number(cid), amount: amt })
            }
          }
        }
        const hasAny = Object.values(tokens).some((t) => t.total > 0)
        const sendChainBal = w.balances?.byChain[sendChain] ? parseFloat(w.balances.byChain[sendChain].ETH.formatted) : 0

        return (
          <>
            <div className="wallet-drawer-backdrop" onClick={closeDrawer} />
            <div className="wallet-drawer">
              <div className="drawer-handle" />

              <div className="drawer-header">
                <WalletAvatar address={w.address} size={32} />
                <div style={{ flex: 1 }}>
                  <div className="drawer-addr" onClick={() => handleCopy(w.address)}>
                    {shortenAddress(w.address, 8)}
                    {walletBadgeLabel(w) && <span className={walletBadgeClass(w.type)} style={{ marginLeft: 6 }}>{walletBadgeLabel(w)}</span>}
                  </div>
                  <div className="drawer-usd">{fmtUsd(wUsd)}</div>
                </div>
              </div>

              <div className="drawer-tokens">
                {(["ETH", "WETH", "USDC"] as const).map((tid) => {
                  const t = tokens[tid]
                  if (t.total === 0 && t.usd === 0) return null
                  return (
                    <div key={tid} className="drawer-token-row">
                      <div>
                        <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text)" }}>{tid}</span>
                        <span style={{ fontSize: 10, color: "var(--text3)", marginLeft: 8 }}>{fmtAmt(t.total, tid)}</span>
                        {t.chains.length > 1 && (
                          <div style={{ display: "flex", gap: 8, marginTop: 2 }}>
                            {t.chains.map(({ chainId, amount }) => (
                              <span key={chainId} style={{ fontSize: 8, color: "var(--text3)" }}>
                                <span style={{ color: CHAIN_COLORS[chainId] }}>{CHAIN_LABELS[chainId]}</span> {fmtAmt(amount, tid)}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                      <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text)" }}>{fmtUsd(t.usd)}</span>
                    </div>
                  )
                })}
                {!hasAny && <div style={{ padding: 10, fontSize: 10, color: "var(--text3)", textAlign: "center" }}>No balances</div>}
              </div>

              <div className="drawer-actions">
                <button className="btn-action" onClick={() => handleCopy(w.address)} style={{ flex: 1 }}>
                  COPY ADDRESS
                </button>
                <button className="btn-action" onClick={() => { setExportAddr(w.address); closeDrawer(); setView("export") }} style={{ flex: 1 }}>
                  <KeyIcon size={10} /> EXPORT KEY
                </button>
                <button
                  className={`btn-action ${drawerSend ? "active" : ""}`}
                  onClick={() => { setDrawerSend(!drawerSend); setSendError(""); setSendResult(""); setSendExplorerUrl("") }}
                  style={{ flex: 1, borderColor: drawerSend ? "var(--accent)" : undefined, color: drawerSend ? "var(--accent)" : undefined }}
                >
                  <SendIcon size={10} /> SEND
                </button>
              </div>

              {drawerSend && (
                <div className="drawer-send-form">
                  <div className="toggle-row" style={{ margin: 0 }}>
                    {CHAIN_IDS.map((id) => (
                      <button
                        key={id}
                        className={`chain-pill ${sendChain === id ? "active" : ""}`}
                        onClick={() => setSendChain(id)}
                      >
                        <div className="chain-dot" style={{ background: CHAIN_COLORS[id] }} />
                        {CHAIN_LABELS[id]}
                      </button>
                    ))}
                  </div>
                  <div style={{ fontSize: 9, color: sendChainBal > 0 ? "var(--cyan)" : "var(--warn)", fontFamily: "var(--mono)" }}>
                    {CHAIN_LABELS[sendChain]}: {sendChainBal.toFixed(6)} ETH
                  </div>
                  <div className="input-group" style={{ gap: 4 }}>
                    <label className="input-label">To Address</label>
                    <input type="text" className="key-input" value={sendTo} onChange={(e) => setSendTo(e.target.value)} placeholder="0x..." style={{ fontSize: 10 }} />
                  </div>
                  <div className="input-group" style={{ gap: 4 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <label className="input-label">Amount (ETH)</label>
                      <button
                        className="btn-link"
                        style={{ fontSize: 8, fontWeight: 700, letterSpacing: 1, color: "var(--accent)" }}
                        disabled={maxLoading}
                        onClick={async () => {
                          setMaxLoading(true)
                          const res = await sendMessage<{ maxEth: string }>({
                            type: "ESTIMATE_MAX_SEND",
                            payload: { chainId: sendChain, fromAddress: selectedWallet, speed: sendSpeed },
                          })
                          if (res.ok && res.data) {
                            const val = parseFloat(res.data.maxEth)
                            setSendAmount(val > 0 ? val.toFixed(6) : "0")
                          }
                          setMaxLoading(false)
                        }}
                      >
                        {maxLoading ? "..." : "MAX"}
                      </button>
                    </div>
                    <input type="number" className="key-input" value={sendAmount} step="0.001" onChange={(e) => setSendAmount(e.target.value)} placeholder="0.01" style={{ fontSize: 10 }} />
                  </div>
                  <div style={{ display: "flex", gap: 4 }}>
                    <button className={`speed-btn ${sendSpeed === "normal" ? "active normal" : ""}`} onClick={() => setSendSpeed("normal")}>Normal</button>
                    <button className={`speed-btn ${sendSpeed === "fast" ? "active fast" : ""}`} onClick={() => setSendSpeed("fast")}>Fast</button>
                    <button className={`speed-btn ${sendSpeed === "turbo" ? "active turbo" : ""}`} onClick={() => setSendSpeed("turbo")}>Turbo</button>
                  </div>
                  {sendError && <div className="error-msg">{sendError}</div>}
                  {sendResult && (
                    <div className="result-msg success">
                      {sendResult}
                      {sendExplorerUrl && (
                        <a className="activity-tx-link" href={sendExplorerUrl} onClick={(e) => { e.preventDefault(); chrome.tabs.create({ url: sendExplorerUrl }) }} style={{ display: "block", marginTop: 4 }}>
                          View on Explorer
                        </a>
                      )}
                    </div>
                  )}
                  <button className="btn-primary" onClick={handleSendEth} disabled={sendLoading || !sendTo || !sendAmount} style={{ marginTop: 0 }}>
                    {sendLoading ? <span className="spinner" /> : "SEND ETH"}
                  </button>
                </div>
              )}
            </div>
          </>
        )
      })()}
    </div>
  )
}
