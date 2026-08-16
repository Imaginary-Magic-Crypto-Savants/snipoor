import React, { useState } from "react"
import { mockWallets, mockGasInfo, shortenAddr, mockActivity, timeAgo } from "../fixtures"

const styles = `
  .ve {
    --bg: #0c0c0c;
    --surface: #161616;
    --surface2: #1e1e1e;
    --border: #2a2a2a;
    --glass: rgba(255,255,255,0.03);
    --glass-border: rgba(255,255,255,0.06);
    --accent: #a78bfa;
    --accent-glow: rgba(167,139,250,0.15);
    --mint: #34d399;
    --mint-glow: rgba(52,211,153,0.1);
    --rose: #fb7185;
    --amber: #fbbf24;
    --text: #fafafa;
    --text2: #a1a1aa;
    --text3: #52525b;
    --mono: "JetBrains Mono", "SF Mono", monospace;
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
    border-radius: 16px;
    border: 1px solid var(--border);
  }
  .ve * { box-sizing: border-box; margin: 0; padding: 0; }

  .ve-header {
    display: flex; align-items: center; justify-content: space-between;
    padding: 14px 18px 12px;
    background: linear-gradient(180deg, rgba(167,139,250,0.04) 0%, transparent 100%);
  }
  .ve-logo { display: flex; align-items: center; gap: 10px; }
  .ve-logo-icon {
    width: 30px; height: 30px; border-radius: 10px;
    background: linear-gradient(135deg, var(--accent), var(--mint));
    display: flex; align-items: center; justify-content: center;
    font-family: var(--mono); font-size: 10px; font-weight: 800; color: var(--bg);
  }
  .ve-logo-text { font-family: var(--mono); font-size: 13px; letter-spacing: 2px; font-weight: 700; }
  .ve-logo-text .s1 { color: var(--accent); }
  .ve-logo-text .s2 { color: var(--mint); }
  .ve-hdr-right { display: flex; align-items: center; gap: 8px; }
  .ve-chain-tag {
    font-family: var(--mono); font-size: 9px; padding: 4px 10px;
    background: var(--glass); border: 1px solid var(--glass-border);
    border-radius: 20px; color: var(--text2);
    backdrop-filter: blur(8px);
  }
  .ve-status-ring {
    width: 8px; height: 8px; border-radius: 50%;
    background: var(--mint); box-shadow: 0 0 8px var(--mint-glow);
  }

  .ve-glass-bar {
    display: flex; gap: 0; margin: 0 18px 12px;
    background: var(--glass); border: 1px solid var(--glass-border);
    border-radius: 12px; overflow: hidden;
    backdrop-filter: blur(12px);
  }
  .ve-gb-cell {
    flex: 1; padding: 10px 8px; text-align: center;
    border-right: 1px solid var(--glass-border);
  }
  .ve-gb-cell:last-child { border-right: none; }
  .ve-gb-val { font-family: var(--mono); font-size: 14px; font-weight: 700; }
  .ve-gb-val.accent { color: var(--accent); }
  .ve-gb-val.mint { color: var(--mint); }
  .ve-gb-val.amber { color: var(--amber); }
  .ve-gb-lbl { font-size: 8px; color: var(--text3); letter-spacing: 1px; text-transform: uppercase; margin-top: 2px; }

  .ve-tabs {
    display: flex; gap: 2px; margin: 0 18px 12px;
    background: var(--surface); border-radius: 10px; padding: 3px;
  }
  .ve-tab {
    flex: 1; padding: 8px; border-radius: 8px; border: none;
    background: transparent; color: var(--text3); font-size: 10px; font-weight: 600;
    letter-spacing: 1px; cursor: pointer; transition: all 0.2s; font-family: var(--sans);
  }
  .ve-tab.active { background: var(--surface2); color: var(--text); box-shadow: 0 2px 8px rgba(0,0,0,0.3); }
  .ve-tab:hover:not(.active) { color: var(--text2); }

  .ve-body { flex: 1; overflow-y: auto; padding: 0 18px 18px; }
  .ve-body::-webkit-scrollbar { width: 3px; }
  .ve-body::-webkit-scrollbar-thumb { background: var(--border); border-radius: 2px; }

  .ve-card {
    background: var(--surface); border: 1px solid var(--border); border-radius: 14px;
    padding: 16px; margin-bottom: 10px;
    transition: border-color 0.2s;
  }
  .ve-card:hover { border-color: var(--glass-border); }
  .ve-card-title {
    font-size: 9px; letter-spacing: 2px; color: var(--text3); text-transform: uppercase;
    margin-bottom: 12px; font-weight: 600;
  }

  .ve-field { margin-bottom: 12px; }
  .ve-label { font-size: 10px; color: var(--text3); margin-bottom: 5px; font-weight: 500; }
  .ve-input {
    width: 100%; background: var(--bg); border: 1px solid var(--border);
    color: var(--text); font-family: var(--mono); font-size: 12px;
    padding: 11px 14px; border-radius: 10px; outline: none;
    transition: border-color 0.2s, box-shadow 0.2s;
  }
  .ve-input:focus { border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-glow); }
  .ve-input::placeholder { color: var(--text3); }

  .ve-pills { display: flex; gap: 4px; }
  .ve-pill {
    flex: 1; padding: 8px; border-radius: 8px;
    border: 1px solid var(--border); background: transparent;
    color: var(--text3); font-size: 10px; font-weight: 600;
    cursor: pointer; transition: all 0.2s; font-family: var(--sans); text-align: center;
  }
  .ve-pill.active { border-color: var(--accent); color: var(--accent); background: var(--accent-glow); }
  .ve-pill:hover:not(.active) { border-color: var(--text3); }

  .ve-btn {
    width: 100%; padding: 13px; border-radius: 12px;
    background: linear-gradient(135deg, var(--accent), #8b5cf6);
    border: none; color: white;
    font-family: var(--sans); font-weight: 700; font-size: 12px; letter-spacing: 2px;
    cursor: pointer; text-transform: uppercase;
    transition: all 0.2s; box-shadow: 0 4px 16px rgba(167,139,250,0.25);
  }
  .ve-btn:hover { box-shadow: 0 6px 24px rgba(167,139,250,0.35); transform: translateY(-1px); }

  .ve-wallet-item {
    display: flex; align-items: center; gap: 10px; padding: 8px 10px;
    background: var(--bg); border: 1px solid var(--border); border-radius: 10px;
    margin-bottom: 4px; transition: all 0.15s;
  }
  .ve-wallet-item.on { border-color: rgba(52,211,153,0.2); }
  .ve-wi-badge {
    font-family: var(--mono); font-size: 8px; padding: 3px 7px; border-radius: 5px;
    font-weight: 700; letter-spacing: 0.5px;
  }
  .ve-wi-badge.master { background: var(--accent-glow); color: var(--accent); }
  .ve-wi-badge.sub { background: rgba(82,82,91,0.2); color: var(--text3); }
  .ve-wi-badge.imported { background: var(--mint-glow); color: var(--mint); }
  .ve-wi-addr { font-family: var(--mono); font-size: 10px; color: var(--text2); flex: 1; }
  .ve-wi-bal { font-family: var(--mono); font-size: 10px; color: var(--mint); font-weight: 600; }
  .ve-wi-switch {
    width: 34px; height: 18px; border-radius: 9px; border: none;
    background: var(--surface2); cursor: pointer; position: relative;
    transition: background 0.2s;
  }
  .ve-wi-switch.on { background: var(--mint); }
  .ve-wi-switch::after {
    content: ""; position: absolute; top: 2px; left: 2px;
    width: 14px; height: 14px; border-radius: 50%;
    background: white; transition: transform 0.2s;
    box-shadow: 0 1px 3px rgba(0,0,0,0.3);
  }
  .ve-wi-switch.on::after { transform: translateX(16px); }

  .ve-actions { display: flex; gap: 6px; margin-top: 12px; }
  .ve-action {
    flex: 1; padding: 10px; border-radius: 10px;
    border: 1px solid var(--border); background: var(--glass);
    color: var(--text2); font-size: 10px; font-weight: 600;
    cursor: pointer; transition: all 0.2s; font-family: var(--sans); text-align: center;
  }
  .ve-action:hover { border-color: var(--accent); color: var(--accent); }
  .ve-action.danger { border-color: rgba(251,113,133,0.2); }
  .ve-action.danger:hover { border-color: var(--rose); color: var(--rose); }

  .ve-activity-row {
    display: flex; align-items: center; gap: 8px; padding: 8px 0;
    border-bottom: 1px solid rgba(42,42,42,0.5);
  }
  .ve-activity-row:last-child { border-bottom: none; }
  .ve-ar-type {
    font-family: var(--mono); font-size: 8px; padding: 3px 6px; border-radius: 5px;
    letter-spacing: 0.5px; font-weight: 600;
    background: var(--accent-glow); color: var(--accent);
  }
  .ve-ar-info { flex: 1; }
  .ve-ar-addr { font-family: var(--mono); font-size: 10px; color: var(--text2); }
  .ve-ar-meta { font-size: 9px; color: var(--text3); margin-top: 1px; }
  .ve-ar-status { font-size: 9px; font-weight: 700; }
  .ve-ar-status.ok { color: var(--mint); }
  .ve-ar-status.fail { color: var(--rose); }
`

type Tab = "snipe" | "wallets" | "activity"

export function VariantE() {
  const [tab, setTab] = useState<Tab>("snipe")
  const [speed, setSpeed] = useState("fast")

  const enabledCount = mockWallets.filter(w => w.enabled).length
  const totalBal = mockWallets.reduce((s, w) => s + parseFloat(w.balance), 0)

  return (
    <>
      <style>{styles}</style>
      <div className="ve">
        <div className="ve-header">
          <div className="ve-logo">
            <div className="ve-logo-icon">SN</div>
            <div className="ve-logo-text"><span className="s1">SAVANT</span><span className="s2">SNIPOOR</span></div>
          </div>
          <div className="ve-hdr-right">
            <span className="ve-chain-tag">ETHEREUM</span>
            <div className="ve-status-ring" />
          </div>
        </div>

        <div className="ve-glass-bar">
          <div className="ve-gb-cell">
            <div className="ve-gb-val accent">{enabledCount}</div>
            <div className="ve-gb-lbl">Wallets</div>
          </div>
          <div className="ve-gb-cell">
            <div className="ve-gb-val mint">{totalBal.toFixed(2)}</div>
            <div className="ve-gb-lbl">ETH</div>
          </div>
          <div className="ve-gb-cell">
            <div className="ve-gb-val accent">3/5</div>
            <div className="ve-gb-lbl">Minted</div>
          </div>
          <div className="ve-gb-cell">
            <div className="ve-gb-val amber">{mockGasInfo.baseFee}</div>
            <div className="ve-gb-lbl">Gas</div>
          </div>
        </div>

        <div className="ve-tabs">
          <button className={`ve-tab ${tab === "snipe" ? "active" : ""}`} onClick={() => setTab("snipe")}>SNIPE</button>
          <button className={`ve-tab ${tab === "wallets" ? "active" : ""}`} onClick={() => setTab("wallets")}>WALLETS</button>
          <button className={`ve-tab ${tab === "activity" ? "active" : ""}`} onClick={() => setTab("activity")}>LOG</button>
        </div>

        <div className="ve-body">
          {tab === "snipe" && (
            <>
              <div className="ve-card">
                <div className="ve-card-title">Target Contract</div>
                <div className="ve-field">
                  <div className="ve-label">Address</div>
                  <input className="ve-input" placeholder="0x..." defaultValue="0xBC4CA0EdA7647A8aB7C2061c2E118A18a936f13D" />
                </div>
                <div className="ve-field" style={{ marginBottom: 0 }}>
                  <div className="ve-label">ABI Source</div>
                  <div className="ve-pills">
                    <button className="ve-pill active">Auto-detect</button>
                    <button className="ve-pill">Paste JSON</button>
                  </div>
                </div>
              </div>

              <div className="ve-card">
                <div className="ve-card-title">Configuration</div>
                <div style={{ display: "flex", gap: 10 }}>
                  <div className="ve-field" style={{ flex: 1 }}>
                    <div className="ve-label">Value (ETH)</div>
                    <input className="ve-input" type="number" defaultValue="0.08" step="0.001" />
                  </div>
                  <div className="ve-field" style={{ flex: 1 }}>
                    <div className="ve-label">Gas Limit</div>
                    <input className="ve-input" placeholder="Auto" />
                  </div>
                </div>
                <div className="ve-field" style={{ marginBottom: 0 }}>
                  <div className="ve-label">Speed</div>
                  <div className="ve-pills">
                    <button className={`ve-pill ${speed === "normal" ? "active" : ""}`} onClick={() => setSpeed("normal")}>Normal</button>
                    <button className={`ve-pill ${speed === "fast" ? "active" : ""}`} onClick={() => setSpeed("fast")}>Fast</button>
                    <button className={`ve-pill ${speed === "turbo" ? "active" : ""}`} onClick={() => setSpeed("turbo")}>Turbo</button>
                  </div>
                </div>
              </div>

              <div className="ve-btn">Detect Mint Functions</div>
            </>
          )}

          {tab === "wallets" && (
            <>
              {mockWallets.map(w => (
                <div key={w.address} className={`ve-wallet-item ${w.enabled ? "on" : ""}`}>
                  <span className={`ve-wi-badge ${w.type === "hd-master" ? "master" : w.type === "imported" ? "imported" : "sub"}`}>
                    {w.type === "hd-master" ? "MASTER" : w.type === "imported" ? "IMP" : `S${w.index}`}
                  </span>
                  <span className="ve-wi-addr">{shortenAddr(w.address, 5)}</span>
                  <span className="ve-wi-bal">{Number(w.balance).toFixed(4)}</span>
                  <button className={`ve-wi-switch ${w.enabled ? "on" : ""}`} />
                </div>
              ))}
              <div className="ve-actions">
                <button className="ve-action">Import</button>
                <button className="ve-action">Fund</button>
                <button className="ve-action">Export</button>
                <button className="ve-action danger">Sweep</button>
              </div>
            </>
          )}

          {tab === "activity" && (
            <>
              {mockActivity.map(a => (
                <div key={a.id} className="ve-activity-row">
                  <span className="ve-ar-type">{a.type.toUpperCase()}</span>
                  <div className="ve-ar-info">
                    <div className="ve-ar-addr">{a.walletAddress}</div>
                    <div className="ve-ar-meta">{a.value} ETH | {timeAgo(a.timestamp)}</div>
                  </div>
                  <span className={`ve-ar-status ${a.status === "confirmed" ? "ok" : "fail"}`}>
                    {a.status === "confirmed" ? "CONFIRMED" : "FAILED"}
                  </span>
                </div>
              ))}
            </>
          )}
        </div>
      </div>
    </>
  )
}
