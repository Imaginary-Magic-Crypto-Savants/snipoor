import React from "react"

interface ToastProps {
  message: string
  type: "success" | "error" | "warn"
  visible: boolean
}

export function Toast({ message, type, visible }: ToastProps) {
  return (
    <div className={`toast ${type} ${visible ? "show" : ""}`} role="status" aria-live="polite">
      {message}
    </div>
  )
}
