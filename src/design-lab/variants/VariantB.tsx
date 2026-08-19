import React, { useState } from "react"
import { mockWallets, mockMintTarget, mockGasInfo, shortenAddr, mockActivity, timeAgo } from "../fixtures"

const styles = `
  .vb {
    --bg: #08090e;
    --surface: #0e1018;
    --surface2: #141722;
    --border: #1e2235;
    --accent: #6c5ce7;
    --accent-dim: rgba(108, 92, 231, 0.08);
    --accent-mid: rgba(108, 92, 231, 0.15);
    --cyan: #00cec9;
    --danger: #ff5252;
    --warn: #ffa040;
    --success: #00e676;
    --text: #e8ecf4;
    --text2: #8a92a8;
    --text3: #4a5068;
    --mono: "SF Mono", "Fira Code", monospace;
    --sans: "Inter", -apple-system, system-ui, sans-serif;
    font-family: var(--sans);
    background: var(--bg);
    color: var(--text);
    width: 360px;
    height: 700px;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    font-size: 13px;
    border-radius: 12px;
  }
  .vb * { box-sizing: border-box; margin: 0; padding: 0; }

  .vb-topbar {
    display: flex; align-items: center; justify-content: space-between;
    padding: 12px 14px; border-bottom: 1px solid var(--border);
    background: var(--surface);
  }
  .vb-logo { font-family: var(--mono); font-size: 12px; color: var(--accent); letter-spacing: 2px; font-weight: 700; }
  .vb-logo span { color: var(--cyan); }
  .vb-topbar-right { display: flex; align-items: center; gap: 6px; }
  .vb-chain-select {
    font-family: var(--mono); font-size: 10px; padding: 3px 8px;
    background: var(--surface2); border: 1px solid var(--border); border-radius: 4px;
    color: var(--text2); cursor: pointer;
  }
  .vb-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--success); }

  .vb-status-bar {
    display: flex; gap: 0; border-bottom: 1px solid var(--border);
  }
  .vb-sbar-item {
    flex: 1; padding: 8px 6px; text-align: center;
    border-right: 1px solid var(--border);
    background: var(--surface);
  }
  .vb-sbar-item:last-child { border-right: none; }
  .vb-sbar-val { font-family: var(--mono); font-size: 11px; color: var(--cyan); }
  .vb-sbar-lbl { font-size: 8px; color: var(--text3); letter-spacing: 1px; text-transform: uppercase; margin-top: 1px; }

  .vb-wallet-strip {
    padding: 8px 14px; border-bottom: 1px solid var(--border);
    display: flex; align-items: center; justify-content: space-between;
    background: var(--surface);
  }
  .vb-wallet-info { display: flex; align-items: center; gap: 8px; }
  .vb-wallet-count {
    font-family: var(--mono); font-size: 18px; font-weight: 700; color: var(--accent);
  }
  .vb-wallet-label { font-size: 10px; color: var(--text3); letter-spacing: 1px; }
  .vb-wallet-bal-total { font-family: var(--mono); font-size: 14px; color: var(--cyan); }
  .vb-wallet-expand {
    font-size: 10px; color: var(--text3); cursor: pointer; padding: 4px 8px;
    border: 1px solid var(--border); border-radius: 4px; background: transparent;
    transition: all 0.15s;
  }
  .vb-wallet-expand:hover { border-color: var(--accent); color: var(--accent); }

  .vb-content { flex: 1; overflow-y: auto; padding: 12px 14px; }
  .vb-content::-webkit-scrollbar { width: 3px; }
  .vb-content::-webkit-scrollbar-thumb { background: var(--border); border-radius: 2px; }

  .vb-card {
    background: var(--surface); border: 1px solid var(--border); border-radius: 10px;
    padding: 14px; margin-bottom: 10px;
  }
  .vb-card-head {
    font-size: 10px; letter-spacing: 1.5px; color: var(--text3); text-transform: uppercase;
    margin-bottom: 10px; font-weight: 600;
  }

  .vb-input {
    width: 100%; background: var(--bg); border: 1px solid var(--border);
    color: var(--text); font-family: var(--mono); font-size: 11px;
    padding: 9px 10px; border-radius: 6px; outline: none;
    transition: border-color 0.2s;
  }
  .vb-input:focus { border-color: var(--accent); }
  .vb-input::placeholder { color: var(--text3); }

  .vb-label { font-size: 9px; letter-spacing: 1px; color: var(--text3); text-transform: uppercase; margin-bottom: 4px; }

  .vb-speed-row { display: flex; gap: 4px; }
  .vb-speed {
    flex: 1; padding: 6px; border-radius: 5px; border: 1px solid var(--border);
    background: transparent; color: var(--text3); font-size: 9px; font-weight: 700;
    letter-spacing: 0.5px; cursor: pointer; transition: all 0.15s; font-family: var(--sans);
    text-align: center;
  }
  .vb-speed.active { border-color: var(--accent); color: var(--accent); background: var(--accent-dim); }

  .vb-btn {
    width: 100%; padding: 12px; border-radius: 8px;
    background: linear-gradient(135deg, var(--accent), rgba(108, 92, 231, 0.7));
    border: none; color: #fff;
    font-family: var(--sans); font-weight: 700; font-size: 12px; letter-spacing: 2px;
    cursor: pointer; text-transform: uppercase; transition: all 0.2s;
  }
  .vb-btn:hover { box-shadow: 0 4px 20px rgba(108, 92, 231, 0.3); }

  .vb-tabs {
    display: flex; gap: 2px; margin-bottom: 10px;
  }
  .vb-tab {
    flex: 1; padding: 7px; border-radius: 6px; border: none;
    background: transparent; color: var(--text3); font-size: 10px; font-weight: 600;
    letter-spacing: 1px; cursor: pointer; transition: all 0.15s; font-family: var(--sans);
  }
  .vb-tab.active { background: var(--accent-dim); color: var(--accent); }

  .vb-wallet-mini {
    display: flex; align-items: center; gap: 6px; padding: 5px 8px;
    border-radius: 5px; margin-bottom: 3px;
    background: var(--bg); border: 1px solid var(--border);
  }
  .vb-wm-badge {
    font-family: var(--mono); font-size: 7px; padding: 2px 4px; border-radius: 3px;
    font-weight: 700;
  }
  .vb-wm-badge.m { background: var(--accent-dim); color: var(--accent); }
  .vb-wm-badge.s { background: rgba(80,88,104,0.1); color: var(--text3); }
  .vb-wm-badge.i { background: rgba(0,206,201,0.08); color: var(--cyan); }
  .vb-wm-addr { font-family: var(--mono); font-size: 9px; color: var(--text2); flex: 1; }
  .vb-wm-bal { font-family: var(--mono); font-size: 9px; color: var(--cyan); }

  .vb-activity-row {
    display: flex; align-items: center; gap: 6px; padding: 5px 0;
    border-bottom: 1px solid rgba(30,34,53,0.5); font-size: 10px;
  }
  .vb-activity-row:last-child { border-bottom: none; }
  .vb-act-type { font-family: var(--mono); font-size: 8px; color: var(--accent); letter-spacing: 0.5px; width: 36px; }
  .vb-act-detail { flex: 1; color: var(--text2); font-family: var(--mono); font-size: 9px; }
  .vb-act-time { color: var(--text3); font-size: 8px; }
  .vb-act-status { font-size: 8px; font-weight: 700; }
  .vb-act-status.ok { color: var(--success); }
  .vb-act-status.fail { color: var(--danger); }
`

type Section = "snipe" | "wallets" | "activity"

export function VariantB() {
  const [section, setSection] = useState<Section>("snipe")
  const [speed, setSpeed] = useState("fast")
  const [walletsExpanded, setWalletsExpanded] = useState(false)

  const enabledCount = mockWallets.filter(w => w.enabled).length
  const totalBal = mockWallets.reduce((s, w) => s + parseFloat(w.balance), 0)

  return (
    <>
      <style>{styles}</style>
      <div className="vb">
        <div className="vb-topbar">
          <div className="vb-logo"><span>SAVANT</span>SNIPOOR</div>
          <div className="vb-topbar-right">
            <select className="vb-chain-select" defaultValue="eth">
              <option value="eth">ETH</option>
              <option value="base">BASE</option>
              <option value="arb">ARB</option>
            </select>
            <div className="vb-dot" />
          </div>
        </div>

        <div className="vb-status-bar">
          <div className="vb-sbar-item"><div className="vb-sbar-val">{mockGasInfo.baseFee}</div><div className="vb-sbar-lbl">Gas</div></div>
          <div className="vb-sbar-item"><div className="vb-sbar-val">3/5</div><div className="vb-sbar-lbl">Minted</div></div>
          <div className="vb-sbar-item"><div className="vb-sbar-val">1.2s</div><div className="vb-sbar-lbl">Latency</div></div>
          <div className="vb-sbar-item"><div className="vb-sbar-val">0.24</div><div className="vb-sbar-lbl">Spent</div></div>
        </div>

        <div className="vb-wallet-strip">
          <div className="vb-wallet-info">
            <div className="vb-wallet-count">{enabledCount}</div>
            <div>
              <div className="vb-wallet-label">WALLETS ACTIVE</div>
              <div className="vb-wallet-bal-total">{totalBal.toFixed(4)} ETH</div>
            </div>
          </div>
          <button className="vb-wallet-expand" onClick={() => setWalletsExpanded(!walletsExpanded)}>
            {walletsExpanded ? "HIDE" : "MANAGE"}
          </button>
        </div>

        {walletsExpanded && (
          <div style={{ padding: "8px 14px", borderBottom: "1px solid var(--border)", background: "var(--surface)", maxHeight: 160, overflowY: "auto" }}>
            {mockWallets.map(w => (
              <div key={w.address} className="vb-wallet-mini">
                <span className={`vb-wm-badge ${w.type === "hd-master" ? "m" : w.type === "imported" ? "i" : "s"}`}>
                  {w.type === "hd-master" ? "M" : w.type === "imported" ? "IMP" : `S${w.index}`}
                </span>
                <span className="vb-wm-addr">{shortenAddr(w.address, 4)}</span>
                <span className="vb-wm-bal">{Number(w.balance).toFixed(4)}</span>
              </div>
            ))}
          </div>
        )}

        <div className="vb-content">
          <div className="vb-tabs">
            <button className={`vb-tab ${section === "snipe" ? "active" : ""}`} onClick={() => setSection("snipe")}>SNIPE</button>
            <button className={`vb-tab ${section === "wallets" ? "active" : ""}`} onClick={() => setSection("wallets")}>TOOLS</button>
            <button className={`vb-tab ${section === "activity" ? "active" : ""}`} onClick={() => setSection("activity")}>LOG</button>
          </div>

          {section === "snipe" && (
            <>
              <div className="vb-card">
                <div className="vb-card-head">Target</div>
                <div style={{ marginBottom: 8 }}>
                  <div className="vb-label">Contract</div>
                  <input className="vb-input" placeholder="0x..." defaultValue="0xBC4CA0...f13D" />
                </div>
                <div style={{ display: "flex", gap: 4, marginBottom: 8 }}>
                  <button className="vb-speed active" style={{ borderColor: "var(--accent)" }}>Auto ABI</button>
                  <button className="vb-speed">Manual</button>
                </div>
              </div>

              <div className="vb-card">
                <div className="vb-card-head">Configuration</div>
                <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                  <div style={{ flex: 1 }}>
                    <div className="vb-label">Value (ETH)</div>
                    <input className="vb-input" type="number" defaultValue="0.08" />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div className="vb-label">Gas Limit</div>
                    <input className="vb-input" placeholder="Auto" />
                  </div>
                </div>
                <div className="vb-label">Speed</div>
                <div className="vb-speed-row">
                  <button className={`vb-speed ${speed === "normal" ? "active" : ""}`} onClick={() => setSpeed("normal")}>Normal</button>
                  <button className={`vb-speed ${speed === "fast" ? "active" : ""}`} onClick={() => setSpeed("fast")}>Fast</button>
                  <button className={`vb-speed ${speed === "turbo" ? "active" : ""}`} onClick={() => setSpeed("turbo")}>Turbo</button>
                </div>
              </div>

              <div className="vb-btn">Detect Mint Functions</div>
            </>
          )}

          {section === "wallets" && (
            <>
              <div className="vb-card">
                <div className="vb-card-head">Quick Actions</div>
                <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                  <button className="vb-speed" style={{ flex: "1 0 45%", padding: 10 }}>Import Seed</button>
                  <button className="vb-speed" style={{ flex: "1 0 45%", padding: 10 }}>Import Key</button>
                  <button className="vb-speed" style={{ flex: "1 0 45%", padding: 10 }}>Fund Subs</button>
                  <button className="vb-speed" style={{ flex: "1 0 45%", padding: 10, borderColor: "rgba(255,82,82,0.2)", color: "var(--danger)" }}>Consolidate</button>
                  <button className="vb-speed" style={{ flex: "1 0 45%", padding: 10 }}>Export All</button>
                  <button className="vb-speed" style={{ flex: "1 0 45%", padding: 10 }}>Settings</button>
                </div>
              </div>
            </>
          )}

          {section === "activity" && (
            <div className="vb-card">
              <div className="vb-card-head">Transaction Log</div>
              {mockActivity.map(a => (
                <div key={a.id} className="vb-activity-row">
                  <span className="vb-act-type">{a.type.toUpperCase()}</span>
                  <span className="vb-act-detail">{a.walletAddress}</span>
                  <span className="vb-act-time">{timeAgo(a.timestamp)}</span>
                  <span className={`vb-act-status ${a.status === "confirmed" ? "ok" : "fail"}`}>
                    {a.status === "confirmed" ? "OK" : "FAIL"}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  )
}
