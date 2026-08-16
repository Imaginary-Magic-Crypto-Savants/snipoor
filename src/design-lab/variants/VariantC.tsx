import React, { useState } from "react"
import { mockWallets, mockGasInfo, shortenAddr, mockActivity, timeAgo } from "../fixtures"

const styles = `
  .vc {
    --bg: #050505;
    --surface: #0a0a0a;
    --surface2: #111111;
    --border: #1a1a1a;
    --accent: #ffffff;
    --accent2: #888888;
    --green: #00ff88;
    --red: #ff3344;
    --yellow: #ffcc00;
    --text: #f0f0f0;
    --text2: #777777;
    --text3: #444444;
    --mono: "SF Mono", "Fira Code", monospace;
    --sans: -apple-system, "Inter", system-ui, sans-serif;
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
  }
  .vc * { box-sizing: border-box; margin: 0; padding: 0; }

  .vc-topbar {
    display: flex; align-items: center; justify-content: space-between;
    padding: 16px 20px 14px; border-bottom: 1px solid var(--border);
  }
  .vc-logo {
    font-family: var(--mono); font-size: 11px; letter-spacing: 4px;
    color: var(--text); font-weight: 700;
  }
  .vc-topbar-right { display: flex; align-items: center; gap: 10px; }
  .vc-chain-badge {
    font-family: var(--mono); font-size: 9px; padding: 3px 8px;
    border: 1px solid var(--border); border-radius: 4px; color: var(--text2);
  }
  .vc-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--green); }
  .vc-lock {
    width: 24px; height: 24px; border: 1px solid var(--border); border-radius: 4px;
    background: transparent; color: var(--text3); cursor: pointer; font-size: 10px;
    display: flex; align-items: center; justify-content: center;
  }

  .vc-breadcrumb {
    padding: 10px 20px; border-bottom: 1px solid var(--border);
    font-size: 10px; color: var(--text3); letter-spacing: 1px;
    display: flex; align-items: center; gap: 6px;
  }
  .vc-breadcrumb span { color: var(--text); }
  .vc-breadcrumb-sep { color: var(--text3); }

  .vc-body {
    flex: 1; overflow-y: auto; padding: 20px;
  }
  .vc-body::-webkit-scrollbar { width: 2px; }
  .vc-body::-webkit-scrollbar-thumb { background: var(--border); }

  .vc-title {
    font-size: 20px; font-weight: 700; letter-spacing: -0.5px;
    margin-bottom: 4px; color: var(--text);
  }
  .vc-subtitle {
    font-size: 11px; color: var(--text3); margin-bottom: 20px;
    letter-spacing: 0.3px;
  }

  .vc-field { margin-bottom: 16px; }
  .vc-label {
    font-size: 10px; letter-spacing: 1.5px; color: var(--text3);
    text-transform: uppercase; margin-bottom: 6px; font-weight: 500;
  }
  .vc-input {
    width: 100%; background: var(--surface); border: 1px solid var(--border);
    color: var(--text); font-family: var(--mono); font-size: 12px;
    padding: 12px 14px; border-radius: 8px; outline: none;
    transition: border-color 0.15s;
  }
  .vc-input:focus { border-color: var(--accent2); }
  .vc-input::placeholder { color: var(--text3); }

  .vc-pills { display: flex; gap: 6px; }
  .vc-pill {
    flex: 1; padding: 8px; border-radius: 6px;
    border: 1px solid var(--border); background: transparent;
    color: var(--text3); font-size: 10px; font-weight: 600;
    cursor: pointer; transition: all 0.15s; font-family: var(--sans);
    text-align: center;
  }
  .vc-pill.active { border-color: var(--text); color: var(--text); background: var(--surface2); }

  .vc-btn {
    width: 100%; padding: 14px; border-radius: 8px;
    background: var(--text); border: none; color: var(--bg);
    font-family: var(--sans); font-weight: 700; font-size: 12px; letter-spacing: 2px;
    cursor: pointer; text-transform: uppercase; transition: all 0.15s;
  }
  .vc-btn:hover { opacity: 0.9; }

  .vc-btn-outline {
    width: 100%; padding: 12px; border-radius: 8px;
    background: transparent; border: 1px solid var(--border); color: var(--text2);
    font-family: var(--sans); font-weight: 600; font-size: 11px; letter-spacing: 1px;
    cursor: pointer; text-transform: uppercase; transition: all 0.15s;
    margin-top: 8px;
  }
  .vc-btn-outline:hover { border-color: var(--text); color: var(--text); }

  .vc-divider { height: 1px; background: var(--border); margin: 16px 0; }

  .vc-stat-row {
    display: flex; gap: 12px; margin-bottom: 16px;
  }
  .vc-stat-box {
    flex: 1; padding: 10px; background: var(--surface); border: 1px solid var(--border);
    border-radius: 8px; text-align: center;
  }
  .vc-stat-val { font-family: var(--mono); font-size: 16px; color: var(--text); font-weight: 700; }
  .vc-stat-lbl { font-size: 8px; color: var(--text3); letter-spacing: 1.5px; text-transform: uppercase; margin-top: 3px; }

  .vc-list-item {
    display: flex; align-items: center; gap: 10px;
    padding: 10px 0; border-bottom: 1px solid rgba(26,26,26,0.6);
  }
  .vc-list-item:last-child { border-bottom: none; }
  .vc-li-badge {
    font-family: var(--mono); font-size: 8px; padding: 2px 6px; border-radius: 3px;
    font-weight: 700; letter-spacing: 0.5px;
  }
  .vc-li-badge.m { background: rgba(0,255,136,0.08); color: var(--green); border: 1px solid rgba(0,255,136,0.15); }
  .vc-li-badge.s { background: var(--surface2); color: var(--text3); border: 1px solid var(--border); }
  .vc-li-badge.i { background: rgba(255,204,0,0.06); color: var(--yellow); border: 1px solid rgba(255,204,0,0.15); }
  .vc-li-addr { font-family: var(--mono); font-size: 11px; color: var(--text2); flex: 1; }
  .vc-li-bal { font-family: var(--mono); font-size: 11px; color: var(--text); }
  .vc-li-toggle {
    width: 32px; height: 18px; border-radius: 9px;
    border: 1px solid var(--border); background: var(--surface); cursor: pointer;
    position: relative; transition: all 0.2s;
  }
  .vc-li-toggle.on { border-color: var(--green); background: rgba(0,255,136,0.1); }
  .vc-li-toggle::after {
    content: ""; position: absolute; top: 2px; left: 2px;
    width: 12px; height: 12px; border-radius: 50%;
    background: var(--text3); transition: all 0.2s;
  }
  .vc-li-toggle.on::after { left: 16px; background: var(--green); }

  .vc-nav-grid {
    display: grid; grid-template-columns: 1fr 1fr; gap: 8px;
  }
  .vc-nav-item {
    padding: 16px 12px; background: var(--surface); border: 1px solid var(--border);
    border-radius: 10px; cursor: pointer; transition: all 0.15s; text-align: left;
  }
  .vc-nav-item:hover { border-color: var(--text3); }
  .vc-nav-icon { font-size: 18px; margin-bottom: 6px; }
  .vc-nav-label { font-size: 11px; font-weight: 600; color: var(--text); letter-spacing: 0.5px; }
  .vc-nav-desc { font-size: 9px; color: var(--text3); margin-top: 2px; }
`

type Page = "home" | "snipe" | "wallets" | "activity"

export function VariantC() {
  const [page, setPage] = useState<Page>("home")
  const [speed, setSpeed] = useState("fast")

  const enabledCount = mockWallets.filter(w => w.enabled).length
  const totalBal = mockWallets.reduce((s, w) => s + parseFloat(w.balance), 0)

  const breadcrumb = page === "home" ? null : (
    <div className="vc-breadcrumb">
      <span style={{ cursor: "pointer" }} onClick={() => setPage("home")}>Home</span>
      <span className="vc-breadcrumb-sep">/</span>
      <span>{page === "snipe" ? "Snipe" : page === "wallets" ? "Wallets" : "Activity"}</span>
    </div>
  )

  return (
    <>
      <style>{styles}</style>
      <div className="vc">
        <div className="vc-topbar">
          <div className="vc-logo">SAVANTSNIPOOR</div>
          <div className="vc-topbar-right">
            <span className="vc-chain-badge">ETH</span>
            <div className="vc-dot" />
            <button className="vc-lock">&#128274;</button>
          </div>
        </div>

        {breadcrumb}

        <div className="vc-body">
          {page === "home" && (
            <>
              <div className="vc-title">Ready.</div>
              <div className="vc-subtitle">{enabledCount} wallets active | {totalBal.toFixed(4)} ETH total</div>

              <div className="vc-stat-row">
                <div className="vc-stat-box">
                  <div className="vc-stat-val">3</div>
                  <div className="vc-stat-lbl">Minted</div>
                </div>
                <div className="vc-stat-box">
                  <div className="vc-stat-val">1.2s</div>
                  <div className="vc-stat-lbl">Avg Latency</div>
                </div>
                <div className="vc-stat-box">
                  <div className="vc-stat-val">{mockGasInfo.baseFee}</div>
                  <div className="vc-stat-lbl">Gas (gwei)</div>
                </div>
              </div>

              <div className="vc-nav-grid">
                <div className="vc-nav-item" onClick={() => setPage("snipe")}>
                  <div className="vc-nav-icon">&#9889;</div>
                  <div className="vc-nav-label">Snipe</div>
                  <div className="vc-nav-desc">Configure & execute mint</div>
                </div>
                <div className="vc-nav-item" onClick={() => setPage("wallets")}>
                  <div className="vc-nav-icon">&#128179;</div>
                  <div className="vc-nav-label">Wallets</div>
                  <div className="vc-nav-desc">{enabledCount} active, {mockWallets.length} total</div>
                </div>
                <div className="vc-nav-item" onClick={() => setPage("activity")}>
                  <div className="vc-nav-icon">&#128200;</div>
                  <div className="vc-nav-label">Activity</div>
                  <div className="vc-nav-desc">{mockActivity.length} transactions</div>
                </div>
                <div className="vc-nav-item">
                  <div className="vc-nav-icon">&#9881;</div>
                  <div className="vc-nav-label">Settings</div>
                  <div className="vc-nav-desc">Keys, API, export</div>
                </div>
              </div>
            </>
          )}

          {page === "snipe" && (
            <>
              <div className="vc-title">Snipe</div>
              <div className="vc-subtitle">Set target, configure, execute</div>

              <div className="vc-field">
                <div className="vc-label">Contract Address</div>
                <input className="vc-input" placeholder="0x..." defaultValue="0xBC4CA0EdA7647A8aB7C2061c2E118A18a936f13D" />
              </div>

              <div className="vc-field">
                <div className="vc-label">ABI Source</div>
                <div className="vc-pills">
                  <button className="vc-pill active">Auto-detect</button>
                  <button className="vc-pill">Paste JSON</button>
                </div>
              </div>

              <div className="vc-divider" />

              <div className="vc-field">
                <div className="vc-label">Speed</div>
                <div className="vc-pills">
                  <button className={`vc-pill ${speed === "normal" ? "active" : ""}`} onClick={() => setSpeed("normal")}>Normal</button>
                  <button className={`vc-pill ${speed === "fast" ? "active" : ""}`} onClick={() => setSpeed("fast")}>Fast</button>
                  <button className={`vc-pill ${speed === "turbo" ? "active" : ""}`} onClick={() => setSpeed("turbo")}>Turbo</button>
                </div>
              </div>

              <div className="vc-btn">Detect Mint Functions</div>
              <button className="vc-btn-outline" onClick={() => setPage("home")}>Back</button>
            </>
          )}

          {page === "wallets" && (
            <>
              <div className="vc-title">Wallets</div>
              <div className="vc-subtitle">{enabledCount} active of {mockWallets.length}</div>

              {mockWallets.map(w => (
                <div key={w.address} className="vc-list-item">
                  <span className={`vc-li-badge ${w.type === "hd-master" ? "m" : w.type === "imported" ? "i" : "s"}`}>
                    {w.type === "hd-master" ? "MASTER" : w.type === "imported" ? "IMP" : `SUB ${w.index}`}
                  </span>
                  <span className="vc-li-addr">{shortenAddr(w.address, 6)}</span>
                  <span className="vc-li-bal">{Number(w.balance).toFixed(4)}</span>
                  <div className={`vc-li-toggle ${w.enabled ? "on" : ""}`} />
                </div>
              ))}

              <div className="vc-divider" />
              <div style={{ display: "flex", gap: 6 }}>
                <button className="vc-btn-outline" style={{ flex: 1, marginTop: 0 }}>Import</button>
                <button className="vc-btn-outline" style={{ flex: 1, marginTop: 0 }}>Fund</button>
                <button className="vc-btn-outline" style={{ flex: 1, marginTop: 0, borderColor: "rgba(255,51,68,0.2)", color: "var(--red)" }}>Sweep</button>
              </div>
              <button className="vc-btn-outline" onClick={() => setPage("home")}>Back</button>
            </>
          )}

          {page === "activity" && (
            <>
              <div className="vc-title">Activity</div>
              <div className="vc-subtitle">{mockActivity.length} transactions</div>

              {mockActivity.map(a => (
                <div key={a.id} className="vc-list-item">
                  <span className={`vc-li-badge ${a.status === "confirmed" ? "m" : "i"}`} style={a.status === "failed" ? { background: "rgba(255,51,68,0.06)", color: "var(--red)", borderColor: "rgba(255,51,68,0.15)" } : {}}>
                    {a.type.toUpperCase()}
                  </span>
                  <div style={{ flex: 1 }}>
                    <div className="vc-li-addr">{a.walletAddress}</div>
                    <div style={{ fontSize: 9, color: "var(--text3)" }}>{a.value} ETH | {timeAgo(a.timestamp)}</div>
                  </div>
                  <span style={{ fontSize: 9, fontWeight: 700, color: a.status === "confirmed" ? "var(--green)" : "var(--red)" }}>
                    {a.status.toUpperCase()}
                  </span>
                </div>
              ))}
              <button className="vc-btn-outline" onClick={() => setPage("home")}>Back</button>
            </>
          )}
        </div>
      </div>
    </>
  )
}
