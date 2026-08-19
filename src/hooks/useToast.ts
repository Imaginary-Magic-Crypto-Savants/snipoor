import { useState, useCallback, useRef } from "react"

type ToastType = "success" | "error" | "warn"

export function useToast() {
  const [message, setMessage] = useState("")
  const [type, setType] = useState<ToastType>("success")
  const [visible, setVisible] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined)

  const show = useCallback((msg: string, t: ToastType = "success") => {
    if (timerRef.current) clearTimeout(timerRef.current)
    setMessage(msg)
    setType(t)
    setVisible(true)
    timerRef.current = setTimeout(() => setVisible(false), 2500)
  }, [])

  return { message, type, visible, show }
}
