import React, { useState } from "react"

interface StepPasswordProps {
  onConfirm: (password: string) => void
}

export function StepPassword({ onConfirm }: StepPasswordProps) {
  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [error, setError] = useState("")

  const handleContinue = () => {
    if (password.length < 8) {
      setError("Password must be at least 8 characters")
      return
    }
    if (password !== confirm) {
      setError("Passwords do not match")
      return
    }
    onConfirm(password)
  }

  return (
    <div className="onboarding-step">
      <div className="step-title">Set Password</div>
      <div className="step-desc">This password encrypts your wallets locally. Choose something strong.</div>

      <div className="input-group">
        <label className="input-label">Password</label>
        <input
          type="password"
          className="key-input"
          value={password}
          onChange={(e) => { setPassword(e.target.value); setError("") }}
          placeholder="Min 8 characters..."
        />
      </div>

      <div className="input-group">
        <label className="input-label">Confirm Password</label>
        <input
          type="password"
          className="key-input"
          value={confirm}
          onChange={(e) => { setConfirm(e.target.value); setError("") }}
          placeholder="Confirm password..."
        />
      </div>

      {error && <div className="error-msg">{error}</div>}

      <button className="btn-primary" onClick={handleContinue} disabled={!password || !confirm}>
        CONTINUE
      </button>
    </div>
  )
}
