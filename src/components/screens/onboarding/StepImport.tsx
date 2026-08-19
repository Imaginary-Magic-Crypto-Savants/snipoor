import React, { useState } from "react"

interface StepImportProps {
  onConfirm: (phrase: string) => void
}

export function StepImport({ onConfirm }: StepImportProps) {
  const [phrase, setPhrase] = useState("")
  const [error, setError] = useState("")

  const handleContinue = () => {
    const trimmed = phrase.trim()
    const wordCount = trimmed.split(/\s+/).filter(Boolean).length
    if (wordCount !== 12 && wordCount !== 24) {
      setError("Seed phrase must be 12 or 24 words")
      return
    }
    onConfirm(trimmed)
  }

  return (
    <div className="onboarding-step">
      <div className="step-title">Import Seed Phrase</div>
      <div className="step-desc">Enter your 12 or 24 word recovery phrase.</div>

      <div className="input-group">
        <textarea
          className="key-input seed-input"
          rows={3}
          value={phrase}
          onChange={(e) => { setPhrase(e.target.value); setError("") }}
          placeholder="Enter your seed phrase..."
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
        />
      </div>

      {error && <div className="error-msg">{error}</div>}

      <button className="btn-primary" onClick={handleContinue} disabled={!phrase.trim()}>
        CONTINUE
      </button>
    </div>
  )
}
