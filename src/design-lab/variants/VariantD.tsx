import React, { useState } from "react"
import { mockWallets, mockGasInfo, shortenAddr, mockActivity, timeAgo } from "../fixtures"

const styles = `
  .vd {
    --bg: #070a10;
    --surface: #0c1018;
    --surface2: #121822;
    --border: #1a2030;
    --glass: rgba(16, 22, 34, 0.8);
    --accent: #00d4aa;
    --accent2: #e040fb;
    --blue: #448aff;
    --danger: #ff4444;
    --warn: #ffab40;
    --success: #69f0ae;
    --text: #e4e8f0;
    --text2: #7c8498;
    --text3: #4a5264;
    --mono: "SF Mono", "Fira Code", monospace;
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
  }
  .vd * { box-sizing: border-box; margin: 0; padding: 0; }

  .vd-header {
    display: flex; align-items: center; justify-content: space-between;
    padding: 10px 14px; border-bottom: 1px solid var(--border);
  }
  .vd-logo {
    font-family: var(--mono); font-size: 11px; letter-spacing: 2px; font-weight: 700;
  }
  .vd-logo .s { color: var(--accent2); }
  .vd-logo .n { color: var(--accent); }
  .vd-hdr-right { display: flex; align-items: center; gap: 6px; }
  .vd-chain-pill {
    font-family: var(--mono); font-size: 9px; padding: 3px 7px;
    border: 1px solid var(--border); border-radius: 12px; color: var(--text2);
    display: flex; align-items: center; gap: 4px;
  }
  .vd-chain-pill .dot { width: 5px; height: 5px; border-radius: 50%; }
  .vd-live {
    font-family: var(--mono); font-size: 8px; color: var(--success);
    letter-spacing: 1px; display: flex; align-items: center; gap: 4px;
  }
  .vd-live-dot { width: 5px; height: 5px; border-radius: 50%; background: var(--success); animation: vd-pulse 2s infinite; }
  @keyframes vd-pulse { 0%,100%{opacity:1} 50%{opacity:0.3} }

  .vd-dash {
    display: grid; grid-template-columns: 1fr 1fr 1fr 1fr; gap: 0;
    border-bottom: 1px solid var(--border);
  }
  .vd-dash-cell {
    padding: 8px 6px; text-align: center;
    border-right: 1px solid var(--border);
    background: linear-gradient(180deg, rgba(0,212,170,0.02) 0%, transparent 100%);
  }
  .vd-dash-cell:last-child { border-right: none; }
  .vd-dash-val { font-family: var(--mono); font-size: 14px; font-weight: 700; }
  .vd-dash-val.green { color: var(--accent); }
  .vd-dash-val.purple { color: var(--accent2); }
  .vd-dash-val.blue { color: var(--blue); }
  .vd-dash-val.warn { color: var(--warn); }
  .vd-dash-lbl { font-size: 7px; letter-spacing: 1.5px; color: var(--text3); text-transform: uppercase; margin-top: 2px; }

  .vd-scroll { flex: 1; overflow-y: auto; padding: 10px 12px; }
  .vd-scroll::-webkit-scrollbar { width: 3px; }
  .vd-scroll::-webkit-scrollbar-thumb { background: var(--border); }

  .vd-grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 10px; }

  .vd-widget {
    background: var(--surface); border: 1px solid var(--border); border-radius: 8px;
    padding: 10px; position: relative; overflow: hidden;
  }
  .vd-widget::before {
    content: ""; position: absolute; top: 0; left: 0; right: 0; height: 1px;
    background: linear-gradient(90deg, transparent, var(--accent), transparent);
    opacity: 0.3;
  }
  .vd-widget-title {
    font-size: 8px; letter-spacing: 1.5px; color: var(--text3); text-transform: uppercase;
    margin-bottom: 8px; font-weight: 600;
  }

  .vd-wallet-mini {
    display: flex; align-items: center; gap: 5px; padding: 3px 0;
    font-size: 9px;
  }
  .vd-wm-dot { width: 4px; height: 4px; border-radius: 50%; }
  .vd-wm-dot.on { background: var(--success); }
  .vd-wm-dot.off { background: var(--text3); }
  .vd-wm-addr { font-family: var(--mono); font-size: 9px; color: var(--text2); flex: 1; }
  .vd-wm-bal { font-family: var(--mono); font-size: 9px; color: var(--accent); }

  .vd-gas-meter {
    display: flex; align-items: center; gap: 8px; margin-bottom: 4px;
  }
  .vd-gas-bar {
    flex: 1; height: 4px; background: var(--border); border-radius: 2px; overflow: hidden;
  }
  .vd-gas-fill { height: 100%; border-radius: 2px; transition: width 0.3s; }
  .vd-gas-val { font-family: var(--mono); font-size: 11px; color: var(--accent); min-width: 36px; text-align: right; }
  .vd-gas-lbl { font-size: 8px; color: var(--text3); letter-spacing: 1px; }

  .vd-snipe-section { margin-bottom: 10px; }
  .vd-label { font-size: 8px; letter-spacing: 1.5px; color: var(--text3); text-transform: uppercase; margin-bottom: 4px; }
  .vd-input {
    width: 100%; background: var(--bg); border: 1px solid var(--border);
    color: var(--text); font-family: var(--mono); font-size: 11px;
    padding: 8px 10px; border-radius: 6px; outline: none;
    transition: border-color 0.2s;
  }
  .vd-input:focus { border-color: var(--accent); }
  .vd-input::placeholder { color: var(--text3); }

  .vd-speed-row { display: flex; gap: 3px; }
  .vd-speed {
    flex: 1; padding: 5px; border-radius: 4px; border: 1px solid var(--border);
    background: transparent; color: var(--text3); font-size: 9px; font-weight: 700;
    cursor: pointer; transition: all 0.15s; font-family: var(--sans); text-align: center;
  }
  .vd-speed.active.n { border-color: var(--success); color: var(--success); background: rgba(105,240,174,0.06); }
  .vd-speed.active.f { border-color: var(--warn); color: var(--warn); background: rgba(255,171,64,0.06); }
  .vd-speed.active.t { border-color: var(--accent2); color: var(--accent2); background: rgba(224,64,251,0.06); }

  .vd-btn {
    width: 100%; padding: 10px; border-radius: 6px;
    background: linear-gradient(135deg, rgba(0,212,170,0.12), rgba(224,64,251,0.08));
    border: 1px solid var(--accent); color: var(--accent);
    font-family: var(--sans); font-weight: 700; font-size: 11px; letter-spacing: 2px;
    cursor: pointer; text-transform: uppercase; transition: all 0.2s;
  }
  .vd-btn:hover { box-shadow: 0 0 20px rgba(0,212,170,0.15); }

  .vd-activity-compact {
    display: flex; align-items: center; gap: 4px; padding: 3px 0;
    border-bottom: 1px solid rgba(26,32,48,0.4); font-size: 9px;
  }
  .vd-activity-compact:last-child { border-bottom: none; }
  .vd-ac-type { color: var(--accent); font-family: var(--mono); font-size: 7px; letter-spacing: 0.5px; width: 30px; }
  .vd-ac-addr { font-family: var(--mono); font-size: 8px; color: var(--text3); flex: 1; }
  .vd-ac-val { font-family: var(--mono); font-size: 8px; color: var(--text2); }
  .vd-ac-status { width: 4px; height: 4px; border-radius: 50%; }
  .vd-ac-status.ok { background: var(--success); }
  .vd-ac-status.fail { background: var(--danger); }

  .vd-action-strip {
    display: flex; gap: 3px; padding: 8px 12px; border-top: 1px solid var(--border);
  }
  .vd-action-btn {
    flex: 1; padding: 7px 4px; border-radius: 5px; border: 1px solid var(--border);
    background: transparent; color: var(--text3); font-size: 9px; font-weight: 600;
    cursor: pointer; transition: all 0.15s; font-family: var(--sans); text-align: center;
  }
  .vd-action-btn:hover { border-color: var(--accent); color: var(--accent); }
  .vd-action-btn.danger { border-color: rgba(255,68,68,0.2); color: "var(--danger)"; }
  .vd-action-btn.danger:hover { border-color: var(--danger); color: var(--danger); }
`

export function VariantD() {
  const [speed, setSpeed] = useState("fast")
  const enabledCount = mockWallets.filter(w => w.enabled).length
  const totalBal = mockWallets.reduce((s, w) => s + parseFloat(w.balance), 0)
  const gasPercent = Math.min((parseFloat(mockGasInfo.baseFee) / 50) * 100, 100)

  return (
    <>
      <style>{styles}</style>
      <div className="vd">
        <div className="vd-header">
          <div className="vd-logo"><span className="s">SAVANT</span><span className="n">SNIPOOR</span></div>
          <div className="vd-hdr-right">
            <div className="vd-chain-pill">
              <span className="dot" style={{ background: "#627eea" }} />ETH
            </div>
            <div className="vd-live"><span className="vd-live-dot" />LIVE</div>
          </div>
        </div>

        <div className="vd-dash">
          <div className="vd-dash-cell">
            <div className="vd-dash-val green">{enabledCount}</div>
            <div className="vd-dash-lbl">Wallets</div>
          </div>
          <div className="vd-dash-cell">
            <div className="vd-dash-val purple">{totalBal.toFixed(2)}</div>
            <div className="vd-dash-lbl">ETH Total</div>
          </div>
          <div className="vd-dash-cell">
            <div className="vd-dash-val blue">3/5</div>
            <div className="vd-dash-lbl">Minted</div>
          </div>
          <div className="vd-dash-cell">
            <div className="vd-dash-val warn">1.2s</div>
            <div className="vd-dash-lbl">Latency</div>
          </div>
        </div>

        <div className="vd-scroll">
          <div className="vd-grid2">
            <div className="vd-widget">
              <div className="vd-widget-title">Gas Monitor</div>
              <div className="vd-gas-meter">
                <div className="vd-gas-bar">
                  <div className="vd-gas-fill" style={{ width: `${gasPercent}%`, background: gasPercent > 60 ? "var(--warn)" : "var(--accent)" }} />
                </div>
                <span className="vd-gas-val">{mockGasInfo.baseFee}</span>
              </div>
              <div className="vd-gas-lbl">GWEI | Base Fee</div>
              <div className="vd-gas-meter" style={{ marginTop: 4 }}>
                <div className="vd-gas-bar">
                  <div className="vd-gas-fill" style={{ width: "10%", background: "var(--accent)" }} />
                </div>
                <span className="vd-gas-val">{mockGasInfo.priorityFee}</span>
              </div>
              <div className="vd-gas-lbl">GWEI | Priority</div>
            </div>

            <div className="vd-widget">
              <div className="vd-widget-title">Fleet Status</div>
              {mockWallets.slice(0, 4).map(w => (
                <div key={w.address} className="vd-wallet-mini">
                  <span className={`vd-wm-dot ${w.enabled ? "on" : "off"}`} />
                  <span className="vd-wm-addr">{shortenAddr(w.address, 3)}</span>
                  <span className="vd-wm-bal">{Number(w.balance).toFixed(3)}</span>
                </div>
              ))}
              <div style={{ fontSize: 8, color: "var(--text3)", marginTop: 4, cursor: "pointer" }}>
                +{mockWallets.length - 4} more...
              </div>
            </div>
          </div>

          <div className="vd-widget" style={{ marginBottom: 10 }}>
            <div className="vd-widget-title">Snipe Target</div>
            <div className="vd-snipe-section">
              <div className="vd-label">Contract</div>
              <input className="vd-input" defaultValue="0xBC4CA0EdA7647A8aB7C2061c2E118A18a936f13D" />
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <div style={{ flex: 1 }}>
                <div className="vd-label">Value (ETH)</div>
                <input className="vd-input" type="number" defaultValue="0.08" />
              </div>
              <div style={{ flex: 1 }}>
                <div className="vd-label">Speed</div>
                <div className="vd-speed-row">
                  <button className={`vd-speed ${speed === "normal" ? "active n" : ""}`} onClick={() => setSpeed("normal")}>N</button>
                  <button className={`vd-speed ${speed === "fast" ? "active f" : ""}`} onClick={() => setSpeed("fast")}>F</button>
                  <button className={`vd-speed ${speed === "turbo" ? "active t" : ""}`} onClick={() => setSpeed("turbo")}>T</button>
                </div>
              </div>
            </div>
          </div>

          <div className="vd-btn">Detect & Arm</div>

          <div className="vd-widget" style={{ marginTop: 10 }}>
            <div className="vd-widget-title">Recent Activity</div>
            {mockActivity.slice(0, 4).map(a => (
              <div key={a.id} className="vd-activity-compact">
                <span className="vd-ac-type">{a.type.toUpperCase()}</span>
                <span className="vd-ac-addr">{a.walletAddress}</span>
                <span className="vd-ac-val">{a.value}E</span>
                <span className={`vd-ac-status ${a.status === "confirmed" ? "ok" : "fail"}`} />
              </div>
            ))}
          </div>
        </div>

        <div className="vd-action-strip">
          <button className="vd-action-btn">Fund</button>
          <button className="vd-action-btn">Import</button>
          <button className="vd-action-btn">NFTs</button>
          <button className="vd-action-btn danger">Sweep</button>
        </div>
      </div>
    </>
  )
}
