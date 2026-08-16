import React, { useState } from "react"
import { copyToClipboard } from "~/utils/address"

interface StepCreateProps {
  mnemonic: string
  onConfirm: () => void
}

export function StepCreate({ mnemonic, onConfirm }: StepCreateProps) {
  const words = mnemonic.split(" ")
  const [copied, setCopied] = useState(false)

  const handleCopy = () => {
    copyToClipboard(mnemonic)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="onboarding-step">
      <div className="step-title">Save Your Seed Phrase</div>
      <div className="step-desc">Write these words down in order. Store them somewhere safe. Never share them.</div>

      <div className="mnemonic-display">
        {words.map((word, i) => (
          <span className="mnemonic-word" key={i}>
            <span className="mnemonic-num">{i + 1}</span>
            {word}
          </span>
        ))}
      </div>

      <button className="btn-secondary" onClick={handleCopy} style={{ marginTop: 4 }}>
        {copied ? "COPIED" : "COPY SEED PHRASE"}
      </button>

      <div className="step-warning">
        If you lose this phrase, you lose access to your wallets. There is no recovery.
      </div>

      <button className="btn-primary" onClick={onConfirm}>I SAVED MY SEED PHRASE</button>
    </div>
  )
}
