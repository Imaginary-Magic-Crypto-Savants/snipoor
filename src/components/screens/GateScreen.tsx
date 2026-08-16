import React, { useState } from "react"
import { LockIcon } from "../icons/UIIcons"
import type { LicenseStatus } from "~/lib/license/types"

interface GateScreenProps {
  onRedeem: (code: string) => void
  error: string
  loading: boolean
  reason: LicenseStatus["reason"]
}

// Sub-copy explaining why the gate is showing.
const REASON_COPY: Record<NonNullable<LicenseStatus["reason"]>, string> = {
  none: "ENTER YOUR ACCESS CODE",
  unactivated: "ENTER YOUR ACCESS CODE",
  expired: "SESSION EXPIRED — RE-ENTER YOUR CODE",
  revoked: "ACCESS REVOKED — A VALID CODE IS REQUIRED",
  network: "CAN'T REACH SERVER — CHECK CONNECTION",
}

export function GateScreen({ onRedeem, error, loading, reason }: GateScreenProps) {
  const [code, setCode] = useState("")

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (code.trim()) onRedeem(code.trim())
  }

  return (
    <form className="screen-overlay" onSubmit={handleSubmit}>
      <div className="auth-logo">
        <img src="icon128.png" alt="SAVANTSNIPOOR" style={{ width: 48, height: 48, borderRadius: 12 }} />
        <div className="auth-title">
          <span className="ctrl">SAVANT</span>SNIPOOR
        </div>
        <div className="auth-sub">{REASON_COPY[reason ?? "unactivated"]}</div>
      </div>

      <div className="input-group">
        <label className="input-label">Access Code</label>
        <div className="input-wrap">
          <input
            type="text"
            className={`key-input ${error ? "error" : ""}`}
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="Paste access code..."
            autoComplete="off"
            spellCheck={false}
            autoFocus
          />
          <span className="input-icon"><LockIcon /></span>
        </div>
      </div>

      {error && <div className="error-msg">{error}</div>}

      <button type="submit" className="btn-primary" disabled={loading || !code.trim()}>
        {loading ? <span className="spinner" /> : "UNLOCK ACCESS"}
      </button>

      <div className="auth-sub" style={{ marginTop: 14, fontSize: 11, opacity: 0.6, textAlign: "center", lineHeight: 1.5 }}>
        Get a code by verifying your Savant NFT at imcs.world
      </div>
    </form>
  )
}
