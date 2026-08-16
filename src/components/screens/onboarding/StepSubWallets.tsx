import React, { useState } from "react"
import { SUB_WALLET_PRESETS } from "~/lib/constants"

interface StepSubWalletsProps {
  onConfirm: (count: number) => void
  loading: boolean
  error: string
}

export function StepSubWallets({ onConfirm, loading, error }: StepSubWalletsProps) {
  const [count, setCount] = useState(1)
  const [custom, setCustom] = useState(false)

  const handlePreset = (n: number) => {
    setCount(n)
    setCustom(false)
  }

  const handleCustomInput = (val: string) => {
    const num = parseInt(val, 10)
    if (!isNaN(num) && num >= 1 && num <= 100) setCount(num)
  }

  return (
    <div className="onboarding-step">
      <div className="step-title">Sub-Wallets</div>
      <div className="step-desc">How many sub-wallets to derive from your master? You can add more later.</div>

      <div className="wallet-preset-row">
        {SUB_WALLET_PRESETS.map((n) => (
          <button
            type="button"
            key={n}
            className={`preset-btn ${count === n && !custom ? "active" : ""}`}
            onClick={() => handlePreset(n)}
          >
            {n}
          </button>
        ))}
        <button
          type="button"
          className={`preset-btn ${custom ? "active" : ""}`}
          onClick={() => setCustom(true)}
        >
          #
        </button>
      </div>

      {custom && (
        <div className="input-group">
          <label className="input-label">Custom Count (1-100)</label>
          <input
            type="number"
            className="key-input"
            value={count}
            onChange={(e) => handleCustomInput(e.target.value)}
            min={1}
            max={100}
            autoFocus
          />
        </div>
      )}

      {error && <div className="error-msg">{error}</div>}

      <button className="btn-primary" onClick={() => onConfirm(count)} disabled={loading}>
        {loading ? <span className="spinner" /> : "CREATE WALLET"}
      </button>
    </div>
  )
}
