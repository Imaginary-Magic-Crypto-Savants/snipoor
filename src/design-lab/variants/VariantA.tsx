import React, { useState } from "react"
import { mockWallets, mockMintTarget, mockGasInfo, shortenAddr, mockActivity, timeAgo } from "../fixtures"

const styles = `
  .va {
    --bg: #06080c;
    --surface: #0c0e14;
    --surface2: #12151d;
    --border: #1c2030;
    --accent: #00e5b8;
    --accent-dim: rgba(0, 229, 184, 0.08);
    --accent-mid: rgba(0, 229, 184, 0.15);
    --danger: #ff4455;
    --warn: #f0a030;
    --success: #00d46a;
    --text: #e0e4ec;
    --text2: #8892a4;
    --text3: #505868;
    --mono: "SF Mono", "Fira Code", "Cascadia Code", monospace;
    --sans: "Inter", -apple-system, system-ui, sans-serif;
    font-family: var(--sans);
    background: var(--bg);
    color: var(--text);
    width: 400px;
    height: 580px;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    font-size: 13px;
    border-radius: 12px;
    position: relative;
  }

  .va * { box-sizing: border-box; margin: 0; padding: 0; }

  .va-header {
    display: flex; align-items: center; justify-content: space-between;
    padding: 14px 16px 12px;
    background: linear-gradient(180deg, rgba(0, 229, 184, 0.03) 0%, transparent 100%);
    border-bottom: 1px solid var(--border);
  }
  .va-logo { display: flex; align-items: center; gap: 10px; }
  .va-logo-mark {
    width: 28px; height: 28px; border-radius: 8px;
    background: linear-gradient(135deg, var(--accent-mid), var(--accent-dim));
    border: 1px solid rgba(0, 229, 184, 0.2);
    display: flex; align-items: center; justify-content: center;
    font-family: var(--mono); font-size: 11px; font-weight: 700; color: var(--accent);
  }
  .va-logo-text { font-family: var(--mono); font-size: 13px; color: var(--accent); letter-spacing: 2px; font-weight: 600; }
  .va-logo-sub { font-size: 9px; color: var(--text3); letter-spacing: 1.5px; margin-top: 1px; }
  .va-header-right { display: flex; align-items: center; gap: 8px; }
  .va-status { width: 7px; height: 7px; border-radius: 50%; background: var(--success); box-shadow: 0 0 6px var(--success); }
  .va-addr-badge {
    font-family: var(--mono); font-size: 10px; color: var(--text2);
    padding: 4px 8px; background: var(--surface); border: 1px solid var(--border);
    border-radius: 6px; cursor: pointer; transition: all 0.15s;
  }
  .va-addr-badge:hover { border-color: var(--accent); color: var(--accent); }
  .va-lock-btn {
    width: 28px; height: 28px; border-radius: 6px; border: 1px solid var(--border);
    background: transparent; color: var(--text3); cursor: pointer; font-size: 12px;
    display: flex; align-items: center; justify-content: center; transition: all 0.15s;
  }
  .va-lock-btn:hover { border-color: var(--accent); color: var(--accent); }

  .va-chain-row {
    display: flex; gap: 3px; padding: 8px 16px;
    border-bottom: 1px solid var(--border);
  }
  .va-chain {
    padding: 4px 10px; border-radius: 20px; border: 1px solid transparent;
    font-size: 10px; font-weight: 600; letter-spacing: 0.5px; cursor: pointer;
    transition: all 0.15s; color: var(--text3); background: transparent;
    display: flex; align-items: center; gap: 5px;
  }
  .va-chain.active { border-color: var(--accent); color: var(--accent); background: var(--accent-dim); }
  .va-chain:hover:not(.active) { color: var(--text2); }
  .va-chain-dot { width: 5px; height: 5px; border-radius: 50%; }

  .va-nav {
    display: flex; border-bottom: 1px solid var(--border);
  }
  .va-nav-btn {
    flex: 1; padding: 10px 4px; background: none; border: none;
    border-bottom: 2px solid transparent; color: var(--text3); cursor: pointer;
    font-family: var(--sans); font-size: 10px; font-weight: 600; letter-spacing: 1.5px;
    text-transform: uppercase; transition: all 0.15s;
  }
  .va-nav-btn.active { color: var(--accent); border-bottom-color: var(--accent); }
  .va-nav-btn:hover:not(.active) { color: var(--text2); }

  .va-body { flex: 1; overflow-y: auto; padding: 14px 16px; }
  .va-body::-webkit-scrollbar { width: 3px; }
  .va-body::-webkit-scrollbar-thumb { background: var(--border); border-radius: 2px; }

  .va-section { margin-bottom: 14px; }
  .va-section-head {
    font-size: 9px; letter-spacing: 2px; color: var(--text3); text-transform: uppercase;
    margin-bottom: 8px; display: flex; align-items: center; gap: 8px;
  }
  .va-section-head::after { content: ""; flex: 1; height: 1px; background: var(--border); }

  .va-input-wrap { margin-bottom: 10px; }
  .va-label { font-size: 10px; letter-spacing: 1px; color: var(--text3); text-transform: uppercase; margin-bottom: 5px; }
  .va-input {
    width: 100%; background: var(--surface); border: 1px solid var(--border);
    color: var(--text); font-family: var(--mono); font-size: 12px;
    padding: 10px 12px; border-radius: 8px; outline: none;
    transition: border-color 0.2s, box-shadow 0.2s;
  }
  .va-input:focus { border-color: var(--accent); box-shadow: 0 0 0 2px rgba(0, 229, 184, 0.08); }
  .va-input::placeholder { color: var(--text3); }

  .va-toggle-row {
    display: flex; gap: 4px; margin-bottom: 10px;
  }
  .va-toggle {
    flex: 1; padding: 7px; border-radius: 6px; border: 1px solid var(--border);
    background: transparent; color: var(--text3); font-size: 10px; font-weight: 600;
    letter-spacing: 0.5px; cursor: pointer; transition: all 0.15s;
    font-family: var(--sans);
  }
  .va-toggle.active { border-color: var(--accent); color: var(--accent); background: var(--accent-dim); }

  .va-btn-primary {
    width: 100%; padding: 11px; border-radius: 8px;
    background: linear-gradient(135deg, var(--accent-mid), var(--accent-dim));
    border: 1px solid var(--accent); color: var(--accent);
    font-family: var(--sans); font-weight: 700; font-size: 12px; letter-spacing: 2px;
    cursor: pointer; text-transform: uppercase; transition: all 0.2s;
  }
  .va-btn-primary:hover { box-shadow: 0 0 20px rgba(0, 229, 184, 0.2); }

  .va-gas-row {
    display: flex; gap: 8px; padding: 8px 10px; background: var(--surface);
    border: 1px solid var(--border); border-radius: 8px; margin-bottom: 10px;
  }
  .va-gas-item { flex: 1; text-align: center; }
  .va-gas-val { font-family: var(--mono); font-size: 12px; color: var(--accent); }
  .va-gas-lbl { font-size: 8px; color: var(--text3); letter-spacing: 1px; text-transform: uppercase; margin-top: 2px; }

  .va-wallet-list { display: flex; flex-direction: column; gap: 3px; }
  .va-wallet-row {
    display: flex; align-items: center; gap: 8px; padding: 6px 8px;
    background: var(--surface); border: 1px solid var(--border); border-radius: 6px;
    transition: border-color 0.15s;
  }
  .va-wallet-row.enabled { border-color: rgba(0, 229, 184, 0.15); }
  .va-wallet-badge {
    font-family: var(--mono); font-size: 8px; padding: 2px 5px; border-radius: 3px;
    letter-spacing: 0.5px; font-weight: 600;
  }
  .va-wallet-badge.master { background: var(--accent-dim); border: 1px solid rgba(0, 229, 184, 0.2); color: var(--accent); }
  .va-wallet-badge.sub { background: rgba(80, 88, 104, 0.15); border: 1px solid var(--border); color: var(--text3); }
  .va-wallet-badge.imported { background: rgba(255, 68, 85, 0.08); border: 1px solid rgba(255, 68, 85, 0.2); color: var(--danger); }
  .va-wallet-addr { font-family: var(--mono); font-size: 10px; color: var(--text2); flex: 1; }
  .va-wallet-bal { font-family: var(--mono); font-size: 10px; color: var(--accent); }

  .va-footer {
    display: flex; border-top: 1px solid var(--border);
  }
  .va-stat {
    flex: 1; padding: 8px 10px; text-align: center;
    border-right: 1px solid var(--border);
  }
  .va-stat:last-child { border-right: none; }
  .va-stat-val { font-family: var(--mono); font-size: 13px; color: var(--accent); }
  .va-stat-lbl { font-size: 8px; color: var(--text3); letter-spacing: 1px; text-transform: uppercase; margin-top: 2px; }

  .va-activity-item {
    display: flex; align-items: center; gap: 8px; padding: 6px 8px;
    background: var(--surface); border: 1px solid var(--border); border-radius: 6px;
    margin-bottom: 3px;
  }
  .va-activity-type {
    font-family: var(--mono); font-size: 8px; padding: 2px 6px; border-radius: 3px;
    letter-spacing: 0.5px; color: var(--accent); background: var(--accent-dim);
  }
  .va-activity-detail { flex: 1; }
  .va-activity-addr { font-family: var(--mono); font-size: 10px; color: var(--text2); }
  .va-activity-meta { font-size: 9px; color: var(--text3); }
  .va-activity-status {
    font-size: 8px; padding: 2px 5px; border-radius: 3px; letter-spacing: 0.5px; font-weight: 600;
  }
  .va-activity-status.confirmed { color: var(--success); background: rgba(0, 212, 106, 0.08); }
  .va-activity-status.failed { color: var(--danger); background: rgba(255, 68, 85, 0.08); }
`

type Tab = "mint" | "wallets" | "activity"

export function VariantA() {
  const [tab, setTab] = useState<Tab>("mint")
  const [abiMode, setAbiMode] = useState<"auto" | "manual">("auto")
  const [speed, setSpeed] = useState("fast")

  return (
    <>
      <style>{styles}</style>
      <div className="va">
        <div className="va-header">
          <div className="va-logo">
            <div className="va-logo-mark">SN</div>
            <div>
              <div className="va-logo-text">SAVANTSNIPOOR</div>
              <div className="va-logo-sub">MULTI-WALLET SNIPER</div>
            </div>
          </div>
          <div className="va-header-right">
            <div className="va-status" />
            <span className="va-addr-badge">{shortenAddr(mockWallets[0].address)}</span>
            <button className="va-lock-btn">&#128274;</button>
          </div>
        </div>

        <div className="va-chain-row">
          <button className="va-chain active">
            <span className="va-chain-dot" style={{ background: "#627eea" }} />ETH
          </button>
          <button className="va-chain">
            <span className="va-chain-dot" style={{ background: "#0052ff" }} />BASE
          </button>
          <button className="va-chain">
            <span className="va-chain-dot" style={{ background: "#28a0f0" }} />ARB
          </button>
        </div>

        <div className="va-nav">
          <button className={`va-nav-btn ${tab === "mint" ? "active" : ""}`} onClick={() => setTab("mint")}>Snipe</button>
          <button className={`va-nav-btn ${tab === "wallets" ? "active" : ""}`} onClick={() => setTab("wallets")}>Wallets</button>
          <button className={`va-nav-btn ${tab === "activity" ? "active" : ""}`} onClick={() => setTab("activity")}>Activity</button>
        </div>

        <div className="va-body">
          {tab === "mint" && (
            <>
              <div className="va-section">
                <div className="va-section-head">Target Contract</div>
                <div className="va-input-wrap">
                  <div className="va-label">Contract Address</div>
                  <input className="va-input" placeholder="0x..." defaultValue="0xBC4CA0EdA7647A8aB7C2061c2E118A18a936f13D" />
                </div>
                <div className="va-toggle-row">
                  <button className={`va-toggle ${abiMode === "auto" ? "active" : ""}`} onClick={() => setAbiMode("auto")}>Auto ABI</button>
                  <button className={`va-toggle ${abiMode === "manual" ? "active" : ""}`} onClick={() => setAbiMode("manual")}>Paste ABI</button>
                </div>
              </div>

              <div className="va-section">
                <div className="va-section-head">Gas</div>
                <div className="va-gas-row">
                  <div className="va-gas-item">
                    <div className="va-gas-val">{mockGasInfo.baseFee}</div>
                    <div className="va-gas-lbl">Base</div>
                  </div>
                  <div className="va-gas-item">
                    <div className="va-gas-val">{mockGasInfo.priorityFee}</div>
                    <div className="va-gas-lbl">Priority</div>
                  </div>
                  <div className="va-gas-item">
                    <div className="va-gas-val">{mockGasInfo.estimatedGas}</div>
                    <div className="va-gas-lbl">Est. Gas</div>
                  </div>
                </div>
                <div className="va-toggle-row">
                  <button className={`va-toggle ${speed === "normal" ? "active" : ""}`} onClick={() => setSpeed("normal")}>Normal</button>
                  <button className={`va-toggle ${speed === "fast" ? "active" : ""}`} onClick={() => setSpeed("fast")}>Fast</button>
                  <button className={`va-toggle ${speed === "turbo" ? "active" : ""}`} onClick={() => setSpeed("turbo")}>Turbo</button>
                </div>
              </div>

              <div className="va-btn-primary">Detect Mint Functions</div>
            </>
          )}
          {tab === "wallets" && (
            <>
              <div className="va-section">
                <div className="va-section-head">Fleet ({mockWallets.length} wallets)</div>
                <div className="va-wallet-list">
                  {mockWallets.map((w) => (
                    <div key={w.address} className={`va-wallet-row ${w.enabled ? "enabled" : ""}`}>
                      <span className={`va-wallet-badge ${w.type === "hd-master" ? "master" : w.type === "imported" ? "imported" : "sub"}`}>
                        {w.type === "hd-master" ? "M" : w.type === "imported" ? "IMP" : `S${w.index}`}
                      </span>
                      <span className="va-wallet-addr">{shortenAddr(w.address, 6)}</span>
                      <span className="va-wallet-bal">{Number(w.balance).toFixed(4)}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                <button className="va-toggle" style={{ flex: "0 0 auto", padding: "6px 10px" }}>+ Seed</button>
                <button className="va-toggle" style={{ flex: "0 0 auto", padding: "6px 10px" }}>+ Key</button>
                <button className="va-toggle" style={{ flex: "0 0 auto", padding: "6px 10px" }}>Fund</button>
                <button className="va-toggle" style={{ flex: "0 0 auto", padding: "6px 10px", borderColor: "rgba(255,68,85,0.2)", color: "var(--danger)" }}>Consolidate</button>
              </div>
            </>
          )}
          {tab === "activity" && (
            <>
              <div className="va-section">
                <div className="va-section-head">Recent</div>
                {mockActivity.map((a) => (
                  <div key={a.id} className="va-activity-item">
                    <span className="va-activity-type">{a.type.toUpperCase()}</span>
                    <div className="va-activity-detail">
                      <div className="va-activity-addr">{a.walletAddress}</div>
                      <div className="va-activity-meta">{a.value} ETH | {timeAgo(a.timestamp)}</div>
                    </div>
                    <span className={`va-activity-status ${a.status}`}>{a.status.toUpperCase()}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        <div className="va-footer">
          <div className="va-stat"><div className="va-stat-val">3</div><div className="va-stat-lbl">Minted</div></div>
          <div className="va-stat"><div className="va-stat-val">5</div><div className="va-stat-lbl">Attempts</div></div>
          <div className="va-stat"><div className="va-stat-val">1.2s</div><div className="va-stat-lbl">Latency</div></div>
          <div className="va-stat"><div className="va-stat-val">0.24</div><div className="va-stat-lbl">Spent</div></div>
        </div>
      </div>
    </>
  )
}
