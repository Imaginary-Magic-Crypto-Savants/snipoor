import React, { useState } from "react"
import { LockIcon } from "../icons/UIIcons"

interface UnlockScreenProps {
  onUnlock: (password: string) => void
  error: string
  loading: boolean
}

export function UnlockScreen({ onUnlock, error, loading }: UnlockScreenProps) {
  const [password, setPassword] = useState("")

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (password) onUnlock(password)
  }

  return (
    <form className="screen-overlay" onSubmit={handleSubmit}>
      <div className="auth-logo">
        <img src="icon128.png" alt="SAVANTSNIPOOR" style={{ width: 48, height: 48, borderRadius: 12 }} />
        <div className="auth-title">
          <span className="ctrl">SAVANT</span>SNIPOOR
        </div>
        <div className="auth-sub">ENTER PASSWORD TO UNLOCK</div>
      </div>

      <div className="input-group">
        <label className="input-label">Password</label>
        <div className="input-wrap">
          <input
            type="password"
            className={`key-input ${error ? "error" : ""}`}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Enter password..."
            autoFocus
          />
          <span className="input-icon"><LockIcon /></span>
        </div>
      </div>

      {error && <div className="error-msg">{error}</div>}

      <button type="submit" className="btn-primary" disabled={loading || !password}>
        {loading ? <span className="spinner" /> : "UNLOCK"}
      </button>
    </form>
  )
}
