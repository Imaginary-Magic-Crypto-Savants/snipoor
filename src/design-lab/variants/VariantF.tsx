import React, { useState } from "react"
import { mockWallets, mockGasInfo, shortenAddr, mockActivity, timeAgo } from "../fixtures"

const styles = `
  .vf {
    --bg: #08090e;
    --surface: #0e1018;
    --surface2: #141722;
    --border: #1e2235;
    --accent: #6c5ce7;
    --accent-dim: rgba(108, 92, 231, 0.08);
    --accent-mid: rgba(108, 92, 231, 0.15);
    --cyan: #00cec9;
    --cyan-dim: rgba(0, 206, 201, 0.08);
    --danger: #ff5252;
    --danger-dim: rgba(255, 82, 82, 0.08);
    --warn: #ffa040;
    --success: #00e676;
    --success-dim: rgba(0, 230, 118, 0.08);
    --text: #e8ecf4;
    --text2: #8a92a8;
    --text3: #4a5068;
    --mono: "SF Mono", "Fira Code", "Cascadia Code", monospace;
    --sans: "Inter", -apple-system, system-ui, sans-serif;
    font-family: var(--sans);
    background: var(--bg);
    color: var(--text);
    overflow: hidden;
    display: flex;
    flex-direction: column;
    font-size: 13px;
    border-radius: 12px;
  }
  .vf.popup { width: 400px; height: 580px; }
  .vf.sidebar { width: 400px; height: 700px; }
  .vf * { box-sizing: border-box; margin: 0; padding: 0; }

  .vf-topbar {
    display: flex; align-items: center; justify-content: space-between;
    padding: 12px 14px; border-bottom: 1px solid var(--border);
  }
  .vf-logo { display: flex; align-items: center; gap: 8px; }
  .vf-logo-mark {
    width: 24px; height: 24px; border-radius: 6px;
    background: linear-gradient(135deg, var(--accent), var(--cyan));
    display: flex; align-items: center; justify-content: center;
    font-family: var(--mono); font-size: 9px; font-weight: 800; color: #fff;
  }
  .vf-logo-text { font-family: var(--mono); font-size: 12px; letter-spacing: 2px; font-weight: 700; }
  .vf-logo-text .p { color: var(--accent); }
  .vf-logo-text .c { color: var(--cyan); }
  .vf-topbar-right { display: flex; align-items: center; gap: 6px; }
  .vf-chain-select {
    font-family: var(--mono); font-size: 9px; padding: 3px 8px;
    background: var(--surface2); border: 1px solid var(--border); border-radius: 4px;
    color: var(--text2); cursor: pointer; outline: none;
    display: flex; align-items: center; gap: 4px;
  }
  .vf-chain-dot { width: 5px; height: 5px; border-radius: 50%; display: inline-block; }
  .vf-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--success); box-shadow: 0 0 6px var(--success); }
  .vf-addr-btn {
    font-family: var(--mono); font-size: 9px; padding: 3px 7px;
    background: var(--surface2); border: 1px solid var(--border); border-radius: 4px;
    color: var(--text3); cursor: pointer; transition: all 0.15s;
  }
  .vf-addr-btn:hover { border-color: var(--cyan); color: var(--cyan); }
  .vf-lock {
    width: 24px; height: 24px; border-radius: 5px; border: 1px solid var(--border);
    background: transparent; color: var(--text3); cursor: pointer; font-size: 10px;
    display: flex; align-items: center; justify-content: center; transition: all 0.15s;
  }
  .vf-lock:hover { border-color: var(--accent); color: var(--accent); }

  .vf-tabs {
    display: flex; gap: 0; border-bottom: 1px solid var(--border);
  }
  .vf-tab {
    flex: 1; padding: 9px 4px; background: none; border: none;
    border-bottom: 2px solid transparent; color: var(--text3); cursor: pointer;
    font-family: var(--sans); font-size: 10px; font-weight: 600; letter-spacing: 1.5px;
    text-transform: uppercase; transition: all 0.15s;
  }
  .vf-tab.active { color: var(--accent); border-bottom-color: var(--accent); }
  .vf-tab:hover:not(.active) { color: var(--text2); }

  .vf-body { flex: 1; overflow-y: auto; padding: 10px 14px; }
  .vf-body::-webkit-scrollbar { width: 3px; }
  .vf-body::-webkit-scrollbar-thumb { background: var(--border); border-radius: 2px; }

  .vf-card {
    background: var(--surface); border: 1px solid var(--border); border-radius: 10px;
    padding: 10px 12px; margin-bottom: 8px;
  }
  .vf-card-head {
    font-size: 9px; letter-spacing: 1.5px; color: var(--text3); text-transform: uppercase;
    margin-bottom: 8px; font-weight: 600;
    display: flex; align-items: center; gap: 8px;
  }
  .vf-card-head::after { content: ""; flex: 1; height: 1px; background: var(--border); }

  .vf-card-divider { height: 1px; background: var(--border); margin: 8px 0; }

  .vf-field { margin-bottom: 8px; }
  .vf-label { font-size: 9px; letter-spacing: 1px; color: var(--text3); text-transform: uppercase; margin-bottom: 3px; }
  .vf-input {
    width: 100%; background: var(--bg); border: 1px solid var(--border);
    color: var(--text); font-family: var(--mono); font-size: 11px;
    padding: 8px 10px; border-radius: 6px; outline: none;
    transition: border-color 0.2s, box-shadow 0.2s;
  }
  .vf-input:focus { border-color: var(--accent); box-shadow: 0 0 0 2px var(--accent-dim); }
  .vf-input::placeholder { color: var(--text3); }

  .vf-toggle-row { display: flex; gap: 4px; }
  .vf-toggle {
    flex: 1; padding: 6px; border-radius: 5px; border: 1px solid var(--border);
    background: transparent; color: var(--text3); font-size: 9px; font-weight: 600;
    letter-spacing: 0.5px; cursor: pointer; transition: all 0.15s;
    font-family: var(--sans); text-align: center;
  }
  .vf-toggle.active { border-color: var(--accent); color: var(--accent); background: var(--accent-dim); }
  .vf-toggle:hover:not(.active) { border-color: var(--text3); }

  .vf-gas-row {
    display: flex; gap: 6px;
  }
  .vf-gas-cell {
    flex: 1; padding: 6px 4px; background: var(--bg); border: 1px solid var(--border);
    border-radius: 6px; text-align: center;
  }
  .vf-gas-val { font-family: var(--mono); font-size: 12px; color: var(--cyan); font-weight: 600; }
  .vf-gas-lbl { font-size: 7px; letter-spacing: 1px; color: var(--text3); text-transform: uppercase; margin-top: 2px; }

  .vf-btn {
    width: 100%; padding: 11px; border-radius: 8px;
    background: linear-gradient(135deg, var(--accent), rgba(108, 92, 231, 0.7));
    border: none; color: #fff;
    font-family: var(--sans); font-weight: 700; font-size: 11px; letter-spacing: 2px;
    cursor: pointer; text-transform: uppercase; transition: all 0.2s;
    box-shadow: 0 2px 12px rgba(108, 92, 231, 0.2);
    text-align: center; display: flex; align-items: center; justify-content: center;
  }
  .vf-btn:hover { box-shadow: 0 4px 20px rgba(108, 92, 231, 0.35); }

  .vf-snipe-btn {
    width: 100%; padding: 13px; border-radius: 8px;
    background: linear-gradient(135deg, rgba(108, 92, 231, 0.15), rgba(0, 206, 201, 0.1));
    border: 1px solid var(--accent); color: #fff;
    font-family: var(--sans); font-weight: 700; font-size: 12px; letter-spacing: 3px;
    cursor: pointer; text-transform: uppercase; transition: all 0.2s;
  }
  .vf-snipe-btn:hover { box-shadow: 0 0 24px rgba(108, 92, 231, 0.25), 0 0 12px rgba(0, 206, 201, 0.15); }

  /* Wallet list - from A style */
  .vf-wallet-list { display: flex; flex-direction: column; gap: 3px; }
  .vf-wallet-row {
    display: flex; align-items: center; gap: 8px; padding: 7px 8px;
    background: var(--surface); border: 1px solid var(--border); border-radius: 6px;
    transition: border-color 0.15s;
  }
  .vf-wallet-row.enabled { border-color: rgba(0, 206, 201, 0.15); }
  .vf-wallet-badge {
    font-family: var(--mono); font-size: 8px; padding: 2px 5px; border-radius: 3px;
    letter-spacing: 0.5px; font-weight: 700;
  }
  .vf-wallet-badge.master { background: var(--accent-dim); border: 1px solid rgba(108, 92, 231, 0.25); color: var(--accent); }
  .vf-wallet-badge.sub { background: rgba(74, 80, 104, 0.12); border: 1px solid var(--border); color: var(--text3); }
  .vf-wallet-badge.imported { background: var(--cyan-dim); border: 1px solid rgba(0, 206, 201, 0.2); color: var(--cyan); }
  .vf-wallet-addr { font-family: var(--mono); font-size: 10px; color: var(--text2); flex: 1; cursor: pointer; }
  .vf-wallet-addr:hover { color: var(--cyan); }
  .vf-wallet-bal { font-family: var(--mono); font-size: 10px; color: var(--cyan); }
  .vf-wallet-toggle {
    width: 28px; height: 16px; border-radius: 8px; border: none;
    background: var(--surface2); cursor: pointer; position: relative; transition: background 0.2s;
  }
  .vf-wallet-toggle.on { background: rgba(0, 206, 201, 0.3); }
  .vf-wallet-toggle::after {
    content: ""; position: absolute; top: 2px; left: 2px;
    width: 12px; height: 12px; border-radius: 50%;
    background: var(--text3); transition: all 0.2s;
  }
  .vf-wallet-toggle.on::after { left: 14px; background: var(--cyan); }

  .vf-wallet-actions { display: flex; gap: 4px; flex-wrap: wrap; margin-top: 10px; }
  .vf-wallet-action {
    flex: 1 0 auto; padding: 7px 10px; border-radius: 5px; border: 1px solid var(--border);
    background: transparent; color: var(--text3); font-size: 9px; font-weight: 600;
    cursor: pointer; transition: all 0.15s; font-family: var(--sans); text-align: center;
    letter-spacing: 0.5px;
  }
  .vf-wallet-action:hover { border-color: var(--accent); color: var(--accent); }
  .vf-wallet-action.danger { border-color: rgba(255, 82, 82, 0.2); }
  .vf-wallet-action.danger:hover { border-color: var(--danger); color: var(--danger); }

  /* Activity */
  .vf-activity-item {
    display: flex; align-items: center; gap: 6px; padding: 6px 8px;
    background: var(--surface); border: 1px solid var(--border); border-radius: 6px;
    margin-bottom: 3px;
  }
  .vf-activity-type {
    font-family: var(--mono); font-size: 8px; padding: 2px 5px; border-radius: 3px;
    letter-spacing: 0.5px; color: var(--accent); background: var(--accent-dim); font-weight: 600;
  }
  .vf-activity-detail { flex: 1; min-width: 0; }
  .vf-activity-addr { font-family: var(--mono); font-size: 10px; color: var(--text2); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .vf-activity-meta { font-size: 9px; color: var(--text3); }
  .vf-activity-status { font-size: 8px; font-weight: 700; padding: 2px 5px; border-radius: 3px; letter-spacing: 0.5px; }
  .vf-activity-status.ok { color: var(--success); background: var(--success-dim); }
  .vf-activity-status.fail { color: var(--danger); background: var(--danger-dim); }

  /* Footer stats - bottom */
  .vf-footer {
    display: flex; border-top: 1px solid var(--border); background: var(--surface);
  }
  .vf-stat {
    flex: 1; padding: 7px 6px; text-align: center;
    border-right: 1px solid var(--border);
  }
  .vf-stat:last-child { border-right: none; }
  .vf-stat-val { font-family: var(--mono); font-size: 12px; font-weight: 600; }
  .vf-stat-val.cyan { color: var(--cyan); }
  .vf-stat-val.accent { color: var(--accent); }
  .vf-stat-val.warn { color: var(--warn); }
  .vf-stat-val.green { color: var(--success); }
  .vf-stat-lbl { font-size: 7px; color: var(--text3); letter-spacing: 1px; text-transform: uppercase; margin-top: 1px; }

  /* Sidebar toggle icon in header */
  .vf-sidebar-toggle {
    width: 24px; height: 24px; border-radius: 5px; border: 1px solid var(--border);
    background: transparent; color: var(--text3); cursor: pointer;
    display: flex; align-items: center; justify-content: center; transition: all 0.15s;
  }
  .vf-sidebar-toggle:hover { border-color: var(--accent); color: var(--accent); }
  .vf-sidebar-toggle.active { border-color: var(--accent); color: var(--accent); background: var(--accent-dim); }
`

type Tab = "snipe" | "wallets" | "activity"
type Mode = "popup" | "sidebar"

interface VariantFProps {
  initialMode?: Mode
}

export function VariantF({ initialMode = "popup" }: VariantFProps) {
  const [tab, setTab] = useState<Tab>("snipe")
  const [mode, setMode] = useState<Mode>(initialMode)
  const [speed, setSpeed] = useState("fast")
  const [abiMode, setAbiMode] = useState<"auto" | "manual">("auto")

  const enabledCount = mockWallets.filter(w => w.enabled).length
  const totalBal = mockWallets.reduce((s, w) => s + parseFloat(w.balance), 0)

  return (
    <>
      <style>{styles}</style>
      <div className={`vf ${mode}`}>
        <div className="vf-topbar">
          <div className="vf-logo">
            <div className="vf-logo-mark">SN</div>
            <div className="vf-logo-text"><span className="p">SAVANT</span><span className="c">SNIPOOR</span></div>
          </div>
          <div className="vf-topbar-right">
            <div className="vf-chain-select">
              <span className="vf-chain-dot" style={{ background: "#627eea" }} />
              <span>ETH</span>
            </div>
            <span className="vf-addr-btn">{shortenAddr(mockWallets[0].address, 3)}</span>
            <div className="vf-dot" />
            <button
              className={`vf-sidebar-toggle ${mode === "sidebar" ? "active" : ""}`}
              onClick={() => setMode(mode === "popup" ? "sidebar" : "popup")}
              title={mode === "popup" ? "Open sidebar" : "Back to popup"}
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <rect x="0.5" y="0.5" width="11" height="11" rx="1.5" stroke="currentColor" />
                <line x1="4" y1="0.5" x2="4" y2="11.5" stroke="currentColor" />
              </svg>
            </button>
            <button className="vf-lock">&#128274;</button>
          </div>
        </div>

        <div className="vf-tabs">
          <button className={`vf-tab ${tab === "snipe" ? "active" : ""}`} onClick={() => setTab("snipe")}>Snipe</button>
          <button className={`vf-tab ${tab === "wallets" ? "active" : ""}`} onClick={() => setTab("wallets")}>Wallets</button>
          <button className={`vf-tab ${tab === "activity" ? "active" : ""}`} onClick={() => setTab("activity")}>Activity</button>
        </div>

        <div className="vf-body">
          {tab === "snipe" && (
            <>
              <div className="vf-card">
                <div className="vf-card-head">Target</div>
                <div className="vf-field">
                  <div className="vf-label">Contract Address</div>
                  <input className="vf-input" placeholder="0x..." defaultValue="0xBC4CA0EdA7647A8aB7C2061c2E118A18a936f13D" />
                </div>
                <div className="vf-toggle-row">
                  <button className={`vf-toggle ${abiMode === "auto" ? "active" : ""}`} onClick={() => setAbiMode("auto")}>Auto ABI</button>
                  <button className={`vf-toggle ${abiMode === "manual" ? "active" : ""}`} onClick={() => setAbiMode("manual")}>Paste ABI</button>
                </div>
              </div>

              <div className="vf-card">
                <div className="vf-card-head">Config</div>
                <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                  <div style={{ flex: 1 }}>
                    <div className="vf-label">Value (ETH)</div>
                    <input className="vf-input" type="number" defaultValue="0.08" step="0.001" />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div className="vf-label">Gas Limit</div>
                    <input className="vf-input" placeholder="Auto" />
                  </div>
                </div>
                <div className="vf-field" style={{ marginBottom: 0 }}>
                  <div className="vf-label">Speed</div>
                  <div className="vf-toggle-row">
                    <button className={`vf-toggle ${speed === "normal" ? "active" : ""}`} style={speed === "normal" ? { borderColor: "var(--success)", color: "var(--success)", background: "var(--success-dim)" } : {}} onClick={() => setSpeed("normal")}>Normal</button>
                    <button className={`vf-toggle ${speed === "fast" ? "active" : ""}`} style={speed === "fast" ? { borderColor: "var(--warn)", color: "var(--warn)", background: "rgba(255,160,64,0.06)" } : {}} onClick={() => setSpeed("fast")}>Fast</button>
                    <button className={`vf-toggle ${speed === "turbo" ? "active" : ""}`} style={speed === "turbo" ? { borderColor: "var(--accent)", color: "var(--accent)", background: "var(--accent-dim)" } : {}} onClick={() => setSpeed("turbo")}>Turbo</button>
                  </div>
                </div>
                <div className="vf-card-divider" />
                <div className="vf-gas-row">
                  <div className="vf-gas-cell">
                    <div className="vf-gas-val">{mockGasInfo.baseFee}</div>
                    <div className="vf-gas-lbl">Base (gwei)</div>
                  </div>
                  <div className="vf-gas-cell">
                    <div className="vf-gas-val">{mockGasInfo.priorityFee}</div>
                    <div className="vf-gas-lbl">Priority</div>
                  </div>
                  <div className="vf-gas-cell">
                    <div className="vf-gas-val" style={{ color: "var(--warn)" }}>0.0019</div>
                    <div className="vf-gas-lbl">Est. Cost (ETH)</div>
                  </div>
                </div>
              </div>

              <div className="vf-btn">Detect Mint Functions</div>
            </>
          )}

          {tab === "wallets" && (
            <>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <div>
                  <span style={{ fontFamily: "var(--mono)", fontSize: 16, fontWeight: 700, color: "var(--accent)" }}>{enabledCount}</span>
                  <span style={{ fontSize: 10, color: "var(--text3)", marginLeft: 6, letterSpacing: 1 }}>active</span>
                </div>
                <div style={{ fontFamily: "var(--mono)", fontSize: 13, color: "var(--cyan)" }}>
                  {totalBal.toFixed(4)} <span style={{ fontSize: 9, color: "var(--text3)" }}>ETH</span>
                </div>
              </div>

              <div className="vf-wallet-list">
                {mockWallets.map(w => (
                  <div key={w.address} className={`vf-wallet-row ${w.enabled ? "enabled" : ""}`}>
                    <span className={`vf-wallet-badge ${w.type === "hd-master" ? "master" : w.type === "imported" ? "imported" : "sub"}`}>
                      {w.type === "hd-master" ? "M" : w.type === "imported" ? "IMP" : `S${w.index}`}
                    </span>
                    <span className="vf-wallet-addr">{shortenAddr(w.address, 6)}</span>
                    <span className="vf-wallet-bal">{Number(w.balance).toFixed(4)}</span>
                    <button className={`vf-wallet-toggle ${w.enabled ? "on" : ""}`} />
                  </div>
                ))}
              </div>

              <div className="vf-wallet-actions">
                <button className="vf-wallet-action">+ Seed</button>
                <button className="vf-wallet-action">+ Key</button>
                <button className="vf-wallet-action">Fund</button>
                <button className="vf-wallet-action danger">Sweep</button>
                <button className="vf-wallet-action">NFTs</button>
                <button className="vf-wallet-action">Export</button>
                <button className="vf-wallet-action">Settings</button>
              </div>
            </>
          )}

          {tab === "activity" && (
            <>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <span style={{ fontSize: 10, color: "var(--text3)", letterSpacing: 1 }}>{mockActivity.length} TRANSACTIONS</span>
                <span style={{ fontSize: 9, color: "var(--text3)", cursor: "pointer" }}>CLEAR</span>
              </div>
              {mockActivity.map(a => (
                <div key={a.id} className="vf-activity-item">
                  <span className="vf-activity-type">{a.type.toUpperCase()}</span>
                  <div className="vf-activity-detail">
                    <div className="vf-activity-addr">{a.walletAddress}</div>
                    <div className="vf-activity-meta">{a.value} ETH | {timeAgo(a.timestamp)}</div>
                  </div>
                  <span className={`vf-activity-status ${a.status === "confirmed" ? "ok" : "fail"}`}>
                    {a.status === "confirmed" ? "OK" : "FAIL"}
                  </span>
                </div>
              ))}
            </>
          )}
        </div>

        <div className="vf-footer">
          <div className="vf-stat">
            <div className="vf-stat-val green">60%</div>
            <div className="vf-stat-lbl">Hit Rate</div>
          </div>
          <div className="vf-stat">
            <div className="vf-stat-val accent">12</div>
            <div className="vf-stat-lbl">Minted</div>
          </div>
          <div className="vf-stat">
            <div className="vf-stat-val cyan">{totalBal.toFixed(2)}</div>
            <div className="vf-stat-lbl">ETH Bal</div>
          </div>
          <div className="vf-stat">
            <div className="vf-stat-val warn">0.87</div>
            <div className="vf-stat-lbl">Spent (ETH)</div>
          </div>
        </div>
      </div>
    </>
  )
}
