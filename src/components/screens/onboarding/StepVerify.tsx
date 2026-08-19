import React, { useState, useMemo } from "react"

interface StepVerifyProps {
  mnemonic: string
  onVerified: () => void
}

function pickRandomIndices(total: number, count: number): number[] {
  const indices: number[] = []
  while (indices.length < count) {
    const idx = Math.floor(Math.random() * total)
    if (!indices.includes(idx)) indices.push(idx)
  }
  return indices.sort((a, b) => a - b)
}

export function StepVerify({ mnemonic, onVerified }: StepVerifyProps) {
  const words = mnemonic.split(" ")
  const verifyIndices = useMemo(() => pickRandomIndices(words.length, 3), [words.length])
  const [answers, setAnswers] = useState<Record<number, string>>({})
  const [error, setError] = useState("")

  const handleChange = (idx: number, value: string) => {
    setAnswers((prev) => ({ ...prev, [idx]: value.toLowerCase().trim() }))
    setError("")
  }

  const handleVerify = () => {
    for (const idx of verifyIndices) {
      if (answers[idx] !== words[idx]) {
        setError(`Word #${idx + 1} is incorrect`)
        return
      }
    }
    onVerified()
  }

  const allFilled = verifyIndices.every((idx) => answers[idx]?.length > 0)

  return (
    <div className="onboarding-step">
      <div className="step-title">Verify Your Seed Phrase</div>
      <div className="step-desc">Enter the requested words to confirm you saved your phrase.</div>

      <div className="verify-inputs">
        {verifyIndices.map((idx) => (
          <div className="verify-field" key={idx}>
            <label className="input-label">Word #{idx + 1}</label>
            <input
              type="text"
              className="key-input"
              value={answers[idx] ?? ""}
              onChange={(e) => handleChange(idx, e.target.value)}
              placeholder={`Enter word #${idx + 1}`}
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
            />
          </div>
        ))}
      </div>

      {error && <div className="error-msg">{error}</div>}

      <button className="btn-primary" onClick={handleVerify} disabled={!allFilled}>
        VERIFY
      </button>
    </div>
  )
}
