import React, { useState } from "react"
import { sendMessage, type MnemonicData } from "~/lib/messaging"

import { ChevronLeftIcon } from "~/components/icons/UIIcons"
import { StepCreate } from "./StepCreate"
import { StepVerify } from "./StepVerify"
import { StepImport } from "./StepImport"
import { StepPassword } from "./StepPassword"
import { StepSubWallets } from "./StepSubWallets"

type Flow = "create" | "import"
type Step = "choice" | "seed" | "verify" | "password" | "subwallets"

interface OnboardingWizardProps {
  onCreate: (mnemonic: string, password: string, count: number) => void
  error: string
  loading: boolean
}

export function OnboardingWizard({ onCreate, error, loading }: OnboardingWizardProps) {
  const [flow, setFlow] = useState<Flow | null>(null)
  const [step, setStep] = useState<Step>("choice")
  const [mnemonic, setMnemonic] = useState("")
  const [password, setPassword] = useState("")
  const [localError, setLocalError] = useState("")
  const [generating, setGenerating] = useState(false)

  const handleGenerate = async () => {
    setGenerating(true)
    const res = await sendMessage<MnemonicData>({ type: "GENERATE_MNEMONIC" })
    if (res.ok && res.data) {
      setMnemonic(res.data.mnemonic)
      setFlow("create")
      setStep("seed")
    } else if (!res.ok) {
      setLocalError(res.error)
    }
    setGenerating(false)
  }

  const handleImportStart = () => {
    setFlow("import")
    setStep("seed")
  }

  const handleSeedConfirm = (phrase: string) => {
    setMnemonic(phrase)
    if (flow === "create") {
      setStep("verify")
    } else {
      setStep("password")
    }
  }

  const handleVerified = () => setStep("password")

  const handlePasswordSet = (pw: string) => {
    setPassword(pw)
    setStep("subwallets")
  }

  const handleComplete = (count: number) => onCreate(mnemonic, password, count)

  const handleBack = () => {
    setLocalError("")
    if (step === "subwallets") { setStep("password"); return }
    if (step === "password") { setStep(flow === "create" ? "verify" : "seed"); return }
    if (step === "verify") { setStep("seed"); return }
    setStep("choice")
    setFlow(null)
    setMnemonic("")
    setPassword("")
  }

  const stepNumber = step === "choice" ? 0 : step === "seed" ? 1 : step === "verify" ? 2 : step === "password" ? (flow === "create" ? 3 : 2) : (flow === "create" ? 4 : 3)
  const totalSteps = flow === "create" ? 4 : 3

  if (step === "choice") {
    return (
      <div className="screen-overlay">
        <div className="auth-logo">
          <img src="icon128.png" alt="SAVANTSNIPOOR" style={{ width: 48, height: 48, borderRadius: 12 }} />
          <div className="auth-title">
            <span className="ctrl">SAVANT</span>SNIPOOR
          </div>
          <div className="auth-sub">SETUP YOUR WALLET</div>
        </div>
        {localError && <div className="error-msg">{localError}</div>}
        <button className="btn-primary" onClick={handleGenerate} disabled={generating}>
          {generating ? <span className="spinner" /> : "CREATE NEW WALLET"}
        </button>
        <button className="btn-secondary" onClick={handleImportStart} disabled={generating}>IMPORT SEED PHRASE</button>
      </div>
    )
  }

  return (
    <div className="screen-overlay">
      <div className="onboarding-header">
        <button className="btn-back" onClick={handleBack}><ChevronLeftIcon /></button>
        <div className="step-indicator">
          {Array.from({ length: totalSteps }, (_, i) => (
            <div key={i} className={`step-dot ${i + 1 <= stepNumber ? "active" : ""} ${i + 1 === stepNumber ? "current" : ""}`} />
          ))}
        </div>
        <div className="step-label">Step {stepNumber} of {totalSteps}</div>
      </div>

      {step === "seed" && flow === "create" && (
        <StepCreate mnemonic={mnemonic} onConfirm={() => handleSeedConfirm(mnemonic)} />
      )}
      {step === "seed" && flow === "import" && (
        <StepImport onConfirm={handleSeedConfirm} />
      )}
      {step === "verify" && (
        <StepVerify mnemonic={mnemonic} onVerified={handleVerified} />
      )}
      {step === "password" && (
        <StepPassword onConfirm={handlePasswordSet} />
      )}
      {step === "subwallets" && (
        <StepSubWallets onConfirm={handleComplete} loading={loading} error={error || localError} />
      )}
    </div>
  )
}
