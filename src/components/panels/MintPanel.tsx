import React, { useState } from "react"
import { parseEther, formatEther } from "ethers"
import type { SpeedTier, WalletInfo } from "~/lib/wallet/types"
import type { MintFunction } from "~/lib/mint/types"
import type { RankedMintFunction } from "~/lib/mint/detector"
import { sendMessage } from "~/lib/messaging"
import { shortenAddress } from "~/utils/address"
import { WalletAvatar } from "~/components/WalletAvatar"
import { ChevronLeftIcon } from "~/components/icons/UIIcons"
import { PLATFORM_PRESETS, getPreset, resolveDefaults, type PlatformPreset } from "~/lib/mint/presets"
import type { ContractDetection } from "~/lib/mint/detect"
import { slugFromInput, type WalletEligibility } from "~/lib/mint/scatter"
import { summarizeFailures } from "~/lib/chain/errors"
import { CHAINS } from "~/lib/chain"
import { DEFAULT_CHAIN_ID } from "~/lib/chain"

// Scales a per-mint ETH price by quantity using integer wei math (no float /
// scientific-notation drift). Falls back to the unit price if it can't parse.
function scaleEth(unitEth: string, qty: number): string {
  try {
    return formatEther(parseEther(unitEth) * BigInt(qty > 0 ? qty : 1))
  } catch {
    return unitEth
  }
}

const CHAIN_COLORS: Record<number, string> = { 1: "#627eea", 8453: "#0052ff", 42161: "#28a0f0", 4663: "#00c805" }
const CHAIN_LABELS: Record<number, string> = { 1: "ETH", 8453: "BASE", 42161: "ARB", 4663: "RH" }

const ROLE_LABELS: Record<string, string> = {
  quantity: "Quantity",
  recipient: "Recipient (auto: caller)",
  proof: "Merkle Proof",
  referral: "Referral (auto: 0x0)",
  comment: "Comment",
  tokenId: "Token ID",
  unknown: "Custom",
}

interface MintPanelProps {
  wallets: WalletInfo[]
  // Server-computed cap on concurrent mint wallets (Savant-holdings tiered).
  // null = unlimited (gate off / beta).
  walletAllowance?: number | null
  onToast: (msg: string, type?: "success" | "error" | "warn") => void
  onMintComplete?: () => void
}

type Step = "config" | "params" | "execute"

interface LastMintSummary {
  finishedAt: number
  chainId: number
  contractAddress: string
  succeeded: number
  failed: number
  total: number
}

// How long a finished mint's summary stays visible on reopen. Old enough to
// cover "walked away during a mint", short enough to not haunt next session.
const LAST_MINT_TTL_MS = 30 * 60_000

export function MintPanel({ wallets, walletAllowance, onToast, onMintComplete }: MintPanelProps) {
  const [activeChain, setActiveChain] = useState(DEFAULT_CHAIN_ID)
  const [step, setStep] = useState<Step>("config")
  const [contractAddress, setContractAddress] = useState("")
  const [abiJson, setAbiJson] = useState("")
  const [mintFunctions, setMintFunctions] = useState<RankedMintFunction[]>([])
  const [selectedIdx, setSelectedIdx] = useState(0)
  const [args, setArgs] = useState<Record<string, string>>({})
  const [value, setValue] = useState("0")
  const [quantity, setQuantity] = useState("1")
  const [speed, setSpeed] = useState<SpeedTier>("fast")
  const [gasLimit, setGasLimit] = useState("")
  const [selectedWallets, setSelectedWallets] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState("")
  const [error, setError] = useState("")
  const [result, setResult] = useState("")
  const [resultOk, setResultOk] = useState(false)
  const [failures, setFailures] = useState<Array<{ reason: string; count: number }>>([])
  const [clearing, setClearing] = useState(false)
  const [abiMode, setAbiMode] = useState<string>("auto")
  const [manualAbi, setManualAbi] = useState("")
  const [callTarget, setCallTarget] = useState("")
  const [advanced, setAdvanced] = useState(false)
  const [detectedPrice, setDetectedPrice] = useState<string | null>(null)
  const [probed, setProbed] = useState(false)
  const [platform, setPlatform] = useState<string | null>(null)
  const [detectWarnings, setDetectWarnings] = useState<string[]>([])
  const [dropState, setDropState] = useState<ContractDetection["dropState"]>(undefined)

  const [lastMint, setLastMint] = useState<LastMintSummary | null>(null)

  // Scatter allowlist resolver state.
  const [scatterOpen, setScatterOpen] = useState(false)
  const [scatterLink, setScatterLink] = useState("")
  const [scatterLists, setScatterLists] = useState<WalletEligibility[]>([])
  const [scatterListId, setScatterListId] = useState("")
  const [scatterLoading, setScatterLoading] = useState(false)
  const [scatterMinting, setScatterMinting] = useState(false)
  const [scatterErr, setScatterErr] = useState("")

  // MV3 closes the popup freely; a mint's outcome arrives after the popup that
  // launched it is gone. Rehydrate the persisted summary so the user still sees
  // how their last mint ended.
  React.useEffect(() => {
    sendMessage<LastMintSummary | null>({ type: "GET_LAST_MINT" }).then((res) => {
      if (res.ok && res.data && Date.now() - res.data.finishedAt < LAST_MINT_TTL_MS) {
        setLastMint(res.data)
      }
    })
  }, [])

  const enabledWallets = wallets.filter((w) => w.enabled)
  const selectedFn = mintFunctions[selectedIdx] ?? null

  const applyDetectionResult = (
    functions: RankedMintFunction[],
    bestIndex: number,
    mintPrice: string | null,
    isProbed: boolean,
    preset?: PlatformPreset
  ) => {
    setMintFunctions(functions)
    setSelectedIdx(bestIndex >= 0 ? bestIndex : 0)
    setProbed(isProbed)

    if (mintPrice) {
      setValue(mintPrice)
      setDetectedPrice(mintPrice)
    }

    if (preset) {
      setArgs(resolveDefaults(preset, contractAddress))
    } else {
      const best = functions[bestIndex >= 0 ? bestIndex : 0]
      if (best?.classifiedInputs) {
        const autoArgs: Record<string, string> = {}
        for (const ci of best.classifiedInputs) {
          autoArgs[ci.name] = ci.role === "quantity" ? quantity : ci.defaultValue
        }
        setArgs(autoArgs)
      }
    }

    setStep("params")
  }

  // Applies the full cascade result (DETECT_CONTRACT): launchpad route, verified
  // ABI, or probe — all already resolved to a concrete call target + args.
  const applyContractDetection = (d: ContractDetection) => {
    setMintFunctions(d.functions)
    setSelectedIdx(d.bestIndex >= 0 ? d.bestIndex : 0)
    setProbed(d.method === "probe")
    setPlatform(d.platform)
    setDetectWarnings(d.warnings)
    setDropState(d.dropState)
    setCallTarget(d.callTarget)
    setAbiJson(d.abiJson)
    setArgs(d.prefillArgs)
    setValue(d.value)
    if (d.mintPrice) setDetectedPrice(d.mintPrice)
    setStep("params")
  }

  const handleFetchABI = async () => {
    if (!contractAddress.match(/^0x[a-fA-F0-9]{40}$/)) {
      setError("Invalid contract address")
      return
    }
    setError("")
    setLoading(true)
    setStatus("")
    setDetectedPrice(null)
    setProbed(false)
    setPlatform(null)
    setDetectWarnings([])
    setDropState(undefined)

    const preset = getPreset(abiMode)

    if (preset) {
      setStatus("Loading preset ABI...")
      const abi = preset.abiJson
      setCallTarget(preset.callTarget?.[activeChain] ?? contractAddress)
      setAbiJson(abi)

      setStatus("Detecting mint functions...")
      const fnRes = await sendMessage<{ functions: RankedMintFunction[]; bestIndex: number; mintPrice: string | null }>({
        type: "DETECT_MINT_FUNCTIONS",
        payload: { abiJson: abi, chainId: activeChain, contractAddress },
      })

      if (fnRes.ok && fnRes.data && fnRes.data.functions.length > 0) {
        applyDetectionResult(fnRes.data.functions, fnRes.data.bestIndex, fnRes.data.mintPrice, false, preset)
      } else {
        setError("No mint functions found in preset ABI")
      }
      setLoading(false)
      setStatus("")
      return
    }

    if (abiMode === "manual") {
      if (!manualAbi.trim()) { setError("Paste ABI JSON"); setLoading(false); return }
      setCallTarget(contractAddress)
      setAbiJson(manualAbi.trim())

      setStatus("Detecting mint functions...")
      const fnRes = await sendMessage<{ functions: RankedMintFunction[]; bestIndex: number; mintPrice: string | null }>({
        type: "DETECT_MINT_FUNCTIONS",
        payload: { abiJson: manualAbi.trim(), chainId: activeChain, contractAddress },
      })

      if (fnRes.ok && fnRes.data && fnRes.data.functions.length > 0) {
        applyDetectionResult(fnRes.data.functions, fnRes.data.bestIndex, fnRes.data.mintPrice, false)
      } else {
        setError("No mint functions found in ABI")
      }
      setLoading(false)
      setStatus("")
      return
    }

    // Auto mode: full detection cascade — launchpad fingerprint (OpenSea
    // SeaDrop etc) → verified ABI → proxy/bytecode → selector probe.
    setStatus("Detecting contract (launchpad → verified ABI → probe)...")
    const detRes = await sendMessage<ContractDetection>({
      type: "DETECT_CONTRACT",
      payload: { chainId: activeChain, contractAddress, quantity: parseInt(quantity, 10) || 1 },
    })

    if (detRes.ok && detRes.data && detRes.data.functions.length > 0) {
      applyContractDetection(detRes.data)
    } else if (detRes.ok && detRes.data) {
      setError(detRes.data.warnings[0] ?? "Could not detect mint functions. Try pasting ABI manually.")
    } else {
      setError(detRes.ok ? "Could not detect mint functions. Try pasting ABI manually." : detRes.error)
    }

    setLoading(false)
    setStatus("")
  }

  const handleSelectFunction = (idx: number) => {
    setSelectedIdx(idx)
    const fn = mintFunctions[idx]
    if (fn?.classifiedInputs) {
      const autoArgs: Record<string, string> = {}
      for (const ci of fn.classifiedInputs) {
        if (ci.role === "quantity") {
          autoArgs[ci.name] = quantity
        } else {
          autoArgs[ci.name] = ci.defaultValue
        }
      }
      setArgs(autoArgs)
    }
  }

  const cap = walletAllowance ?? Infinity

  const handleSelectAll = () => {
    if (selectedWallets.size === Math.min(enabledWallets.length, cap)) {
      setSelectedWallets(new Set())
    } else {
      // Cap the select-all at the license allowance.
      setSelectedWallets(new Set(enabledWallets.slice(0, cap === Infinity ? undefined : cap).map((w) => w.address)))
    }
  }

  const handleToggleWallet = (addr: string) => {
    const next = new Set(selectedWallets)
    if (next.has(addr)) {
      next.delete(addr)
    } else {
      if (next.size >= cap) {
        onToast(`Wallet limit: your plan allows ${cap} mint wallet${cap !== 1 ? "s" : ""}. Hold more Savants to raise it.`, "warn")
        return
      }
      next.add(addr)
    }
    setSelectedWallets(next)
  }

  const handleExecute = async () => {
    if (!selectedFn) return
    if (selectedWallets.size === 0) { setError("Select at least one wallet"); return }
    if (selectedWallets.size > cap) {
      setError(`Your plan allows ${cap} mint wallet${cap !== 1 ? "s" : ""} — deselect ${selectedWallets.size - cap}.`)
      return
    }

    setError("")
    setResult("")
    setFailures([])
    setLoading(true)

    const fnArgs = selectedFn.inputs.map((input) => {
      const val = args[input.name] ?? ""
      if (input.type.startsWith("uint")) return val || "0"
      if (input.type === "address") return val
      if (input.type === "bool") return val === "true"
      // Tuples and arrays travel as JSON strings (e.g. Archetype's auth =
      // '["0x00...00",[]]'); ethers accepts positional arrays for tuples.
      if (input.type.startsWith("tuple") || input.type.endsWith("]")) {
        try { return JSON.parse(val || "[]") } catch { return [] }
      }
      return val
    })

    type MintResultRow = { address: string; hash: string; status: string; error?: string }
    const res = await sendMessage<{ succeeded: number; failed: number; total: number; results: MintResultRow[] }>({
      type: "EXECUTE_MINT",
      payload: {
        chainId: activeChain,
        contractAddress: callTarget || contractAddress,
        functionName: selectedFn.name,
        args: fnArgs,
        value: selectedFn.payable ? value : "0",
        speed,
        walletAddresses: Array.from(selectedWallets),
        gasLimit: gasLimit ? parseInt(gasLimit, 10) : undefined,
        abiJson,
      },
    })

    if (res.ok && res.data) {
      const { succeeded, failed, total, results } = res.data
      const confirmed = succeeded
      const notConfirmed = total - confirmed

      if (notConfirmed === 0) {
        setResultOk(true)
        setResult(`All ${confirmed} mint${confirmed !== 1 ? "s" : ""} confirmed`)
        setFailures([])
        onToast(`All ${confirmed} mints confirmed`, "success")
      } else {
        setResultOk(false)
        // Group every non-confirmed wallet by its reason so the user sees WHY.
        const reasons = results
          .filter((r) => r.status !== "confirmed")
          .map((r) => r.error || (r.status === "timeout" ? "Not confirmed in time (may still land)" : "Unknown failure"))
        const grouped = summarizeFailures(reasons)
        setFailures(grouped)
        setResult(`${confirmed}/${total} confirmed, ${notConfirmed} failed`)
        const topReason = grouped[0]?.reason ?? "see details"
        onToast(
          confirmed > 0 ? `${notConfirmed} failed: ${topReason}` : `Mint failed: ${topReason}`,
          confirmed > 0 ? "warn" : "error"
        )
      }
      onMintComplete?.()
    } else if (!res.ok) {
      setResultOk(false)
      setError(res.error)
      onToast(res.error, "error")
    }
    setLoading(false)
  }

  const handleClearStuck = async () => {
    if (selectedWallets.size === 0) return
    setClearing(true)
    const res = await sendMessage<{ cleared: number; total: number; results: Array<{ cleared: boolean; message: string }> }>({
      type: "CLEAR_STUCK_TX",
      payload: { chainId: activeChain, walletAddresses: Array.from(selectedWallets) },
    })
    setClearing(false)
    if (res.ok && res.data) {
      const { cleared } = res.data
      if (cleared > 0) {
        onToast(`Cleared ${cleared} stuck wallet${cleared !== 1 ? "s" : ""}. Wait ~15s, then retry mint.`, "success")
      } else {
        onToast("No stuck txs found — failures are from another cause.", "warn")
      }
    } else if (!res.ok) {
      onToast(res.error, "error")
    }
  }

  const isScatter = platform === "Scatter (Archetype)"

  const handleFindScatterLists = async () => {
    const slug = slugFromInput(scatterLink)
    if (!slug) { setScatterErr("Paste the scatter.art collection link (e.g. scatter.art/toxik-kidz)"); return }
    if (selectedWallets.size === 0) { setScatterErr("Select the wallets you want to check first"); return }
    setScatterErr("")
    setScatterLoading(true)
    setScatterLists([])
    setScatterListId("")
    const res = await sendMessage<{ lists: WalletEligibility[] }>({
      type: "SCATTER_ELIGIBLE",
      payload: { chainId: activeChain, contractAddress: callTarget || contractAddress, slug, walletAddresses: Array.from(selectedWallets) },
    })
    if (res.ok && res.data) {
      const lists = res.data.lists
      setScatterLists(lists)
      // Preselect the single active list, if there's exactly one.
      const nowS = Math.floor(Date.now() / 1000)
      const active = lists.filter((l) => l.list.startTime <= nowS && (l.list.endTime === 0 || l.list.endTime > nowS))
      if (active.length === 1) setScatterListId(active[0].list.id)
      if (lists.length === 0) setScatterErr("No lists found for these wallets on this drop.")
    } else if (!res.ok) {
      setScatterErr(res.error)
    }
    setScatterLoading(false)
  }

  const handleScatterMint = async () => {
    const chosen = scatterLists.find((l) => l.list.id === scatterListId)
    if (!chosen) { setScatterErr("Pick a list to mint"); return }
    const slug = slugFromInput(scatterLink)
    if (!slug) { setScatterErr("Paste the scatter.art link again"); return }
    setScatterErr("")
    setScatterMinting(true)
    setResult("")
    setFailures([])
    type MintResultRow = { address: string; hash: string; status: string; error?: string }
    const res = await sendMessage<{ succeeded: number; failed: number; total: number; results: MintResultRow[]; skipped: Array<{ address: string; reason: string }> }>({
      type: "SCATTER_MINT",
      payload: {
        chainId: activeChain,
        contractAddress: callTarget || contractAddress,
        slug,
        listId: scatterListId,
        quantity: parseInt(quantity, 10) || 1,
        speed,
        walletAddresses: chosen.eligibleWallets,
        gasLimit: gasLimit ? parseInt(gasLimit, 10) : undefined,
      },
    })
    if (res.ok && res.data) {
      const { succeeded, total, results, skipped } = res.data
      const notConfirmed = total - succeeded
      setResultOk(notConfirmed === 0)
      const skipNote = skipped.length ? ` · ${skipped.length} skipped` : ""
      setResult(notConfirmed === 0 ? `All ${succeeded} mint${succeeded !== 1 ? "s" : ""} confirmed${skipNote}` : `${succeeded}/${total} confirmed, ${notConfirmed} failed${skipNote}`)
      const reasons = results.filter((r) => r.status !== "confirmed").map((r) => r.error || "Unknown failure")
      setFailures(summarizeFailures(reasons))
      onToast(notConfirmed === 0 ? `All ${succeeded} mints confirmed` : `${notConfirmed} didn't confirm`, notConfirmed === 0 ? "success" : "warn")
      onMintComplete?.()
    } else if (!res.ok) {
      setScatterErr(res.error)
      onToast(res.error, "error")
    }
    setScatterMinting(false)
  }

  const hasNonceFailure = failures.some((f) => /mempool|nonce|pending tx/i.test(f.reason))

  const handleBack = () => {
    if (step === "execute") { setStep("params"); return }
    if (step === "params") { setStep("config"); setMintFunctions([]); setSelectedIdx(0); setAdvanced(false); setPlatform(null); setDetectWarnings([]); setDropState(undefined); return }
  }

  const hasProofParam = selectedFn?.classifiedInputs?.some((c) => c.role === "proof") ?? false
  const hasUnknownParam = selectedFn?.classifiedInputs?.some((c) => c.role === "unknown") ?? false
  const showAdvancedHint = hasProofParam || hasUnknownParam

  if (step === "config") {
    return (
      <div className="panel-body">
        {lastMint && (
          <div
            className="card"
            style={{
              marginBottom: 4,
              padding: "6px 8px",
              border: `1px solid ${lastMint.failed === 0 ? "rgba(64,200,120,0.3)" : "rgba(255,160,64,0.3)"}`,
              background: lastMint.failed === 0 ? "rgba(64,200,120,0.06)" : "rgba(255,160,64,0.05)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 6,
            }}
          >
            <span style={{ fontSize: 10, color: "var(--text2)" }}>
              Last mint: {lastMint.succeeded}/{lastMint.total} confirmed on {shortenAddress(lastMint.contractAddress, 4)}
              {lastMint.failed > 0 && <span style={{ color: "var(--warn)" }}> ({lastMint.failed} failed - see Activity)</span>}
            </span>
            <button className="btn-link" style={{ fontSize: 9, flexShrink: 0 }} onClick={() => setLastMint(null)}>
              DISMISS
            </button>
          </div>
        )}
        <div className="toggle-row" style={{ marginTop: 0, marginBottom: 4 }}>
          {Object.values(CHAINS).map((chain) => (
            <button
              key={chain.chainId}
              className={`chain-pill ${activeChain === chain.chainId ? "active" : ""}`}
              onClick={() => setActiveChain(chain.chainId)}
            >
              <div className="chain-dot" style={{ background: CHAIN_COLORS[chain.chainId] }} />
              {CHAIN_LABELS[chain.chainId]}
            </button>
          ))}
        </div>

        <div className="card">
          <div className="card-head">Target</div>
          <div className="input-group">
            <label className="input-label">Contract Address</label>
            <input
              className="key-input"
              value={contractAddress}
              onChange={(e) => { setContractAddress(e.target.value); setError("") }}
              placeholder="0x..."
            />
          </div>
          <div className="toggle-row">
            <button className={`toggle-btn ${abiMode === "auto" ? "active" : ""}`} onClick={() => setAbiMode("auto")}>Auto</button>
            {PLATFORM_PRESETS.map((p) => (
              <button key={p.id} className={`toggle-btn ${abiMode === p.id ? "active" : ""}`} onClick={() => setAbiMode(p.id)}>{p.label}</button>
            ))}
            <button className={`toggle-btn ${abiMode === "manual" ? "active" : ""}`} onClick={() => setAbiMode("manual")}>Manual</button>
          </div>
          {abiMode === "manual" && (
            <div className="input-group" style={{ marginTop: 4 }}>
              <label className="input-label">Contract ABI (JSON)</label>
              <textarea
                className="key-input seed-input"
                rows={3}
                value={manualAbi}
                onChange={(e) => setManualAbi(e.target.value)}
                placeholder='[{"type":"function","name":"mint",...}]'
              />
            </div>
          )}
        </div>

        <div className="card">
          <div className="card-head">Config</div>
          <div style={{ display: "flex", gap: 8, marginBottom: 6 }}>
            <div style={{ flex: 1 }}>
              <label className="input-label">Value (ETH)</label>
              <input className="key-input" type="number" step="0.001" value={value} onChange={(e) => setValue(e.target.value)} />
            </div>
            <div style={{ flex: 1 }}>
              <label className="input-label">Gas Limit</label>
              <input className="key-input" type="number" value={gasLimit} onChange={(e) => setGasLimit(e.target.value)} placeholder="Auto" />
            </div>
          </div>
          <div className="input-group">
            <label className="input-label">Speed</label>
            <div className="speed-selector">
              <button className={`speed-btn ${speed === "normal" ? "active normal" : ""}`} onClick={() => setSpeed("normal")}>Normal</button>
              <button className={`speed-btn ${speed === "fast" ? "active fast" : ""}`} onClick={() => setSpeed("fast")}>Fast</button>
              <button className={`speed-btn ${speed === "turbo" ? "active turbo" : ""}`} onClick={() => setSpeed("turbo")}>Turbo</button>
            </div>
          </div>
        </div>

        {error && <div className="error-msg">{error}</div>}
        {status && !error && (
          <div style={{ fontSize: 9, color: "var(--text3)", textAlign: "center", fontFamily: "var(--mono)", letterSpacing: 0.5 }}>
            {status}
          </div>
        )}

        <button className="btn-primary" onClick={handleFetchABI} disabled={loading || !contractAddress}>
          {loading ? <span className="spinner" /> : "DETECT MINT FUNCTIONS"}
        </button>
      </div>
    )
  }

  if (step === "params") {
    const classified = selectedFn?.classifiedInputs ?? []
    const quantityInput = classified.find((c) => c.role === "quantity")
    const advancedInputs = classified.filter((c) => c.role !== "quantity")
    const hasAdvancedInputs = advancedInputs.length > 0

    return (
      <div className="panel-body">
        <div className="panel-header-row" style={{ marginBottom: 6 }}>
          <button className="btn-back" onClick={handleBack}><ChevronLeftIcon size={12} /></button>
          <span className="panel-title">Configure Mint</span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4, flexWrap: "wrap" }}>
          <span style={{ fontSize: 10, color: "var(--text2)", fontFamily: "var(--mono)" }}>
            {shortenAddress(contractAddress, 6)}
          </span>
          {detectedPrice && (
            <span style={{ fontSize: 9, color: "var(--success)", fontFamily: "var(--mono)" }}>
              {detectedPrice} ETH/mint
            </span>
          )}
          {platform && (
            <span style={{ fontSize: 8, color: "var(--success)", fontFamily: "var(--mono)", letterSpacing: 0.5, padding: "1px 5px", background: "rgba(64,200,120,0.08)", borderRadius: 3, border: "1px solid rgba(64,200,120,0.25)" }}>
              {platform.toUpperCase()}
            </span>
          )}
          {probed && (
            <span style={{ fontSize: 8, color: "var(--warn)", fontFamily: "var(--mono)", letterSpacing: 0.5, padding: "1px 5px", background: "rgba(255,160,64,0.08)", borderRadius: 3, border: "1px solid rgba(255,160,64,0.2)" }}>
              UNVERIFIED - PROBED
            </span>
          )}
        </div>

        {dropState && (() => {
          // Live drop schedule read straight off-chain during detection. Dates
          // render in the user's local timezone via toLocaleString.
          const d = dropState
          const fmt = (unix: number) =>
            new Date(unix * 1000).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
          const statusLabel = d.soldOut ? "SOLD OUT"
            : d.active ? "LIVE"
            : d.startsAt > Math.floor(Date.now() / 1000) ? "UPCOMING"
            : d.endsAt > 0 ? "ENDED" : "NOT LIVE"
          const statusColor = d.active && !d.soldOut ? "var(--success)" : statusLabel === "UPCOMING" ? "var(--warn)" : "var(--danger)"
          const row: React.CSSProperties = { display: "flex", justifyContent: "space-between", fontSize: 10, lineHeight: 1.5 }
          const val: React.CSSProperties = { fontFamily: "var(--mono)", color: "var(--text)" }
          return (
            <div className="card" style={{ marginBottom: 6, padding: "6px 8px", gap: 2 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 2 }}>
                <div className="card-head" style={{ marginBottom: 0 }}>Drop Info</div>
                <span style={{ fontSize: 8, fontFamily: "var(--mono)", fontWeight: 700, letterSpacing: 0.5, color: statusColor }}>
                  {statusLabel}
                </span>
              </div>
              {d.startsAt > 0 && (
                <div style={row}><span style={{ color: "var(--text3)" }}>Starts</span><span style={val}>{fmt(d.startsAt)}</span></div>
              )}
              <div style={row}>
                <span style={{ color: "var(--text3)" }}>Ends</span>
                <span style={val}>{d.endsAt > 0 ? fmt(d.endsAt) : "Open-ended"}</span>
              </div>
              <div style={row}><span style={{ color: "var(--text3)" }}>Price</span><span style={val}>{parseFloat(d.priceEth) > 0 ? `${d.priceEth} ETH` : "Free"}</span></div>
              {d.maxSupply > 0 && (
                <div style={row}>
                  <span style={{ color: "var(--text3)" }}>Minted</span>
                  <span style={val}>{d.totalSupply.toLocaleString()} / {d.maxSupply >= Number.MAX_SAFE_INTEGER ? "Open" : d.maxSupply.toLocaleString()}</span>
                </div>
              )}
              {d.maxPerWallet > 0 && (
                <div style={row}><span style={{ color: "var(--text3)" }}>Max per wallet</span><span style={val}>{d.maxPerWallet}</span></div>
              )}
            </div>
          )
        })()}

        {detectWarnings.length > 0 && (
          <div
            className="card"
            style={{
              marginBottom: 6,
              padding: "6px 8px",
              gap: 3,
              border: `1px solid ${dropState && !dropState.active ? "rgba(255,90,90,0.3)" : "rgba(255,160,64,0.25)"}`,
              background: dropState && !dropState.active ? "rgba(255,90,90,0.06)" : "rgba(255,160,64,0.05)",
            }}
          >
            <div className="card-head" style={{ marginBottom: 2 }}>
              {dropState && (dropState.soldOut || (dropState.endsAt > 0 && !dropState.active)) ? "Heads up" : "Before you mint"}
            </div>
            {detectWarnings.map((w, i) => (
              <div key={i} style={{ fontSize: 10, lineHeight: 1.35, color: "var(--text2)" }}>
                {w}
              </div>
            ))}
          </div>
        )}

        {mintFunctions.length > 1 && (
          <div className="card">
            <div className="card-head">Detected Functions ({mintFunctions.length})</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
              {mintFunctions.map((fn, idx) => (
                <button
                  key={fn.signature}
                  className={`toggle-btn ${selectedIdx === idx ? "active" : ""}`}
                  onClick={() => handleSelectFunction(idx)}
                  style={{ textAlign: "left", fontSize: 10, padding: "5px 8px" }}
                >
                  <span>{fn.name}({fn.inputs.map((i) => i.type).join(", ")})</span>
                  {fn.payable && <span style={{ color: "var(--warn)", marginLeft: 4, fontSize: 8 }}>PAYABLE</span>}
                  {idx === 0 && <span style={{ color: "var(--success)", marginLeft: 4, fontSize: 8 }}>BEST</span>}
                </button>
              ))}
            </div>
          </div>
        )}

        {mintFunctions.length === 1 && (
          <div style={{ fontSize: 10, color: "var(--text3)", fontFamily: "var(--mono)", padding: "2px 0" }}>
            {selectedFn?.name}({selectedFn?.inputs.map((i) => i.type).join(", ")})
            {selectedFn?.payable && <span style={{ color: "var(--warn)", marginLeft: 4, fontSize: 8 }}>PAYABLE</span>}
          </div>
        )}

        <div className="card">
          <div className="card-head">Mint Settings</div>

          <div style={{ display: "flex", gap: 8, marginBottom: 4 }}>
            {selectedFn?.payable && (
              <div style={{ flex: 1 }}>
                <label className="input-label">Price (ETH)</label>
                <input
                  className="key-input"
                  type="number"
                  step="0.001"
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  placeholder={detectedPrice ?? "0"}
                />
              </div>
            )}
            <div style={{ flex: 1 }}>
              <label className="input-label">Quantity</label>
              <input
                className="key-input"
                type="number"
                min="1"
                value={quantity}
                onChange={(e) => {
                  const q = e.target.value
                  setQuantity(q)
                  if (quantityInput) {
                    setArgs((prev) => ({ ...prev, [quantityInput.name]: q }))
                  }
                  // Keep msg.value in sync with quantity for per-unit-priced
                  // mints (SeaDrop etc) — underpayment reverts otherwise.
                  if (detectedPrice && selectedFn?.payable) {
                    setValue(scaleEth(detectedPrice, parseInt(q, 10) || 1))
                  }
                }}
              />
            </div>
          </div>

          {!quantityInput && selectedFn && selectedFn.inputs.length === 0 && (
            <div style={{ fontSize: 9, color: "var(--text3)", fontStyle: "italic" }}>
              No quantity param - function mints fixed amount per call
            </div>
          )}
        </div>

        {hasAdvancedInputs && (
          <button
            className="btn-link"
            onClick={() => setAdvanced(!advanced)}
            style={{ fontSize: 9, letterSpacing: 1, alignSelf: "flex-start", padding: "2px 0" }}
          >
            {advanced ? "HIDE ADVANCED" : "SHOW ADVANCED"} ({advancedInputs.length} params)
            {showAdvancedHint && !advanced && (
              <span style={{ color: "var(--warn)", marginLeft: 4 }}>
                {hasProofParam ? "proof required" : "has custom params"}
              </span>
            )}
          </button>
        )}

        {advanced && hasAdvancedInputs && (
          <div className="card">
            <div className="card-head">Advanced Parameters</div>
            {advancedInputs.map((ci) => (
              <div className="input-group" key={ci.name} style={{ marginBottom: 4 }}>
                <label className="input-label" style={{ fontSize: 9 }}>
                  {ci.name}
                  <span style={{ color: "var(--text3)", marginLeft: 4, fontWeight: 400 }}>
                    {ci.type} - {ROLE_LABELS[ci.role]}
                  </span>
                </label>
                <input
                  className="key-input"
                  style={{ fontSize: 10, padding: "5px 8px" }}
                  value={args[ci.name] ?? ci.defaultValue}
                  onChange={(e) => setArgs({ ...args, [ci.name]: e.target.value })}
                  placeholder={ci.defaultValue || ci.type}
                />
              </div>
            ))}
          </div>
        )}

        {error && <div className="error-msg">{error}</div>}

        <button className="btn-primary" onClick={() => setStep("execute")}>
          SELECT WALLETS
        </button>
      </div>
    )
  }

  return (
    <div className="panel-body">
      <div className="panel-header-row" style={{ marginBottom: 6 }}>
        <button className="btn-back" onClick={handleBack}><ChevronLeftIcon size={12} /></button>
        <span className="panel-title">Execute Mint</span>
      </div>

      <div style={{ fontSize: 10, color: "var(--text2)", fontFamily: "var(--mono)", marginBottom: 2 }}>
        {selectedFn?.name}() on {shortenAddress(contractAddress, 6)}
        {selectedFn?.payable && <span> | {value} ETH each</span>}
        {quantity !== "1" && selectedFn?.classifiedInputs?.some((c) => c.role === "quantity") && <span> | qty: {quantity}</span>}
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
        <label className="input-label">
          Wallets ({selectedWallets.size}/{enabledWallets.length}{walletAllowance != null ? ` - limit ${walletAllowance}` : ""})
        </label>
        <button className="btn-link" onClick={handleSelectAll} style={{ fontSize: 9 }}>
          {selectedWallets.size === enabledWallets.length ? "DESELECT ALL" : "SELECT ALL"}
        </button>
      </div>

      <div className="wallet-list" style={{ flex: 1, minHeight: 120, marginBottom: 6 }}>
        {enabledWallets.map((w) => (
          <div
            key={w.address}
            className={`wallet-card ${selectedWallets.has(w.address) ? "enabled" : ""}`}
            onClick={() => handleToggleWallet(w.address)}
            style={{ cursor: "pointer", padding: "5px 8px" }}
          >
            <div className="wallet-card-top">
              <WalletAvatar address={w.address} size={16} />
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text2)" }}>{w.label}</span>
              <span className="wallet-addr" style={{ marginLeft: "auto" }}>{shortenAddress(w.address, 4)}</span>
            </div>
          </div>
        ))}
      </div>

      {error && <div className="error-msg" style={{ marginBottom: 4 }}>{error}</div>}
      {result && (
        <div className={`result-msg ${resultOk ? "success" : "error"}`} style={{ marginBottom: failures.length ? 4 : 8 }}>
          {result}
        </div>
      )}
      {failures.length > 0 && (
        <div className="card" style={{ marginBottom: 6, padding: "6px 8px", gap: 4 }}>
          <div className="card-head" style={{ marginBottom: 2 }}>Why it failed</div>
          {failures.map((f, i) => (
            <div key={i} style={{ display: "flex", gap: 6, alignItems: "flex-start", fontSize: 10, lineHeight: 1.35 }}>
              <span style={{ color: "var(--danger)", fontFamily: "var(--mono)", flexShrink: 0, fontWeight: 600 }}>
                {f.count}x
              </span>
              <span style={{ color: "var(--text2)" }}>{f.reason}</span>
            </div>
          ))}
          {hasNonceFailure && (
            <button
              className="btn-link"
              onClick={handleClearStuck}
              disabled={clearing}
              style={{ fontSize: 9, letterSpacing: 1, alignSelf: "flex-start", color: "var(--warn)", marginTop: 2 }}
            >
              {clearing ? "CLEARING..." : "CLEAR STUCK TXS"}
            </button>
          )}
        </div>
      )}

      {isScatter && (
        <div className="card" style={{ marginBottom: 6, padding: "6px 8px", gap: 5 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div className="card-head" style={{ marginBottom: 0 }}>Scatter lists (public + allowlist)</div>
            <button className="btn-link" style={{ fontSize: 9 }} onClick={() => setScatterOpen(!scatterOpen)}>
              {scatterOpen ? "HIDE" : "FIND MY LISTS"}
            </button>
          </div>
          {scatterOpen && (
            <>
              <div style={{ fontSize: 9, color: "var(--text3)", lineHeight: 1.4 }}>
                Paste the scatter.art link to check which lists your selected wallets qualify for. Allowlist proofs are fetched per wallet and verified before minting.
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                <input
                  className="key-input"
                  style={{ flex: 1, fontSize: 10 }}
                  value={scatterLink}
                  onChange={(e) => setScatterLink(e.target.value)}
                  placeholder="scatter.art/your-collection"
                />
                <button className="btn-add" onClick={handleFindScatterLists} disabled={scatterLoading}>
                  {scatterLoading ? <span className="spinner" /> : "FIND"}
                </button>
              </div>
              {scatterLists.map(({ list, eligibleWallets }) => {
                const nowS = Math.floor(Date.now() / 1000)
                const live = list.startTime <= nowS && (list.endTime === 0 || list.endTime > nowS)
                const upcoming = list.startTime > nowS
                return (
                  <label
                    key={list.id}
                    className={`wallet-card ${scatterListId === list.id ? "enabled" : ""}`}
                    style={{ cursor: "pointer", padding: "5px 8px", display: "flex", alignItems: "center", gap: 6 }}
                  >
                    <input type="radio" name="scatter-list" checked={scatterListId === list.id} onChange={() => setScatterListId(list.id)} style={{ accentColor: "var(--accent)" }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 10, color: "var(--text)", display: "flex", alignItems: "center", gap: 4 }}>
                        {list.name}
                        <span style={{ fontSize: 7, letterSpacing: 0.5, padding: "0 4px", borderRadius: 3, color: list.isPublic ? "var(--success)" : "var(--warn)", border: `1px solid ${list.isPublic ? "rgba(64,200,120,0.3)" : "rgba(255,160,64,0.3)"}` }}>
                          {list.isPublic ? "PUBLIC" : "ALLOWLIST"}
                        </span>
                        {live && <span style={{ fontSize: 7, color: "var(--success)" }}>LIVE</span>}
                        {upcoming && <span style={{ fontSize: 7, color: "var(--warn)" }}>SOON</span>}
                      </div>
                      <div style={{ fontSize: 8, color: "var(--text3)", fontFamily: "var(--mono)" }}>
                        {parseFloat(list.priceEth) > 0 ? `${list.priceEth} ${list.currencySymbol}` : "Free"}
                        {" · "}{eligibleWallets.length}/{selectedWallets.size} wallet{eligibleWallets.length !== 1 ? "s" : ""} eligible
                        {list.walletLimit > 0 && ` · max ${list.walletLimit}/wallet`}
                      </div>
                    </div>
                  </label>
                )
              })}
              {scatterErr && <div className="error-msg" style={{ marginTop: 2 }}>{scatterErr}</div>}
              {scatterListId && (() => {
                const chosen = scatterLists.find((l) => l.list.id === scatterListId)!
                return (
                  <button className="snipe-btn" onClick={handleScatterMint} disabled={scatterMinting || chosen.eligibleWallets.length === 0}>
                    {scatterMinting ? <span className="spinner" /> : `MINT ${chosen.list.name} · ${chosen.eligibleWallets.length} WALLET${chosen.eligibleWallets.length !== 1 ? "S" : ""}`}
                  </button>
                )
              })()}
            </>
          )}
        </div>
      )}

      <button
        className="snipe-btn"
        onClick={handleExecute}
        disabled={loading || selectedWallets.size === 0}
      >
        {loading ? <span className="spinner" /> : `MINT WITH ${selectedWallets.size} WALLET${selectedWallets.size !== 1 ? "S" : ""}`}
      </button>
    </div>
  )
}
