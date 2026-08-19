import React, { useState, useCallback, useRef, useEffect } from "react"

interface Comment {
  id: string
  variant: string
  element: string
  selector: string
  text: string
  x: number
  y: number
}

interface FeedbackOverlayProps {
  targetName: string
}

export function FeedbackOverlay({ targetName }: FeedbackOverlayProps) {
  const [active, setActive] = useState(false)
  const [comments, setComments] = useState<Comment[]>([])
  const [showInput, setShowInput] = useState(false)
  const [inputPos, setInputPos] = useState({ x: 0, y: 0 })
  const [currentTarget, setCurrentTarget] = useState<{ variant: string; element: string; selector: string } | null>(null)
  const [inputText, setInputText] = useState("")
  const [direction, setDirection] = useState("")
  const [copied, setCopied] = useState(false)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (showInput && inputRef.current) inputRef.current.focus()
  }, [showInput])

  const findVariant = (el: HTMLElement): string | null => {
    let node: HTMLElement | null = el
    while (node) {
      const v = node.getAttribute("data-variant")
      if (v) return v
      node = node.parentElement
    }
    return null
  }

  const describeElement = (el: HTMLElement): string => {
    const tag = el.tagName.toLowerCase()
    const text = el.textContent?.slice(0, 30) || ""
    const cls = el.className ? `.${el.className.split(" ")[0]}` : ""
    return `${tag}${cls}${text ? ` "${text}"` : ""}`
  }

  const getSelector = (el: HTMLElement): string => {
    if (el.id) return `#${el.id}`
    if (el.getAttribute("data-testid")) return `[data-testid="${el.getAttribute("data-testid")}"]`
    const cls = el.className?.split(" ")[0]
    if (cls) return `.${cls}`
    return el.tagName.toLowerCase()
  }

  const handleClick = useCallback((e: React.MouseEvent) => {
    if (!active) return
    const target = e.target as HTMLElement
    if (target.closest("[data-feedback-overlay]")) return

    e.preventDefault()
    e.stopPropagation()

    const variant = findVariant(target)
    if (!variant) return

    const rect = target.getBoundingClientRect()
    setInputPos({ x: rect.left + rect.width / 2, y: rect.top })
    setCurrentTarget({
      variant,
      element: describeElement(target),
      selector: getSelector(target),
    })
    setShowInput(true)
    setInputText("")
  }, [active])

  const saveComment = () => {
    if (!inputText.trim() || !currentTarget) return
    setComments(prev => [...prev, {
      id: `c-${Date.now()}`,
      variant: currentTarget.variant,
      element: currentTarget.element,
      selector: currentTarget.selector,
      text: inputText.trim(),
      x: inputPos.x,
      y: inputPos.y,
    }])
    setShowInput(false)
    setCurrentTarget(null)
    setInputText("")
  }

  const formatFeedback = (): string => {
    const grouped: Record<string, Comment[]> = {}
    comments.forEach(c => {
      if (!grouped[c.variant]) grouped[c.variant] = []
      grouped[c.variant].push(c)
    })

    let output = `## Design Lab Feedback\n\n**Target:** ${targetName}\n**Comments:** ${comments.length}\n\n`
    Object.entries(grouped).forEach(([variant, coms]) => {
      output += `### Variant ${variant}\n`
      coms.forEach((c, i) => {
        output += `${i + 1}. **${c.element}** (\`${c.selector}\`)\n   "${c.text}"\n\n`
      })
    })
    output += `### Overall Direction\n${direction || "(not provided)"}\n`
    return output
  }

  const handleSubmit = () => {
    const text = formatFeedback()
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 3000)
  }

  const overlayStyle: React.CSSProperties = {
    position: "fixed",
    bottom: 20,
    right: 20,
    zIndex: 99999,
    fontFamily: "Inter, -apple-system, system-ui, sans-serif",
  }

  const btnStyle: React.CSSProperties = {
    padding: "10px 16px",
    borderRadius: 8,
    border: "none",
    background: active ? "#ff4444" : "#6c5ce7",
    color: "white",
    fontSize: 12,
    fontWeight: 700,
    cursor: "pointer",
    letterSpacing: 1,
    boxShadow: "0 4px 16px rgba(0,0,0,0.3)",
  }

  const panelStyle: React.CSSProperties = {
    position: "fixed",
    bottom: 60,
    right: 20,
    width: 320,
    maxHeight: 400,
    background: "#1a1a2e",
    border: "1px solid #333",
    borderRadius: 12,
    padding: 16,
    zIndex: 99999,
    overflowY: "auto",
    boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
    color: "#e0e0e0",
    fontSize: 12,
  }

  return (
    <div data-feedback-overlay onClick={active ? handleClick : undefined} style={active ? { position: "fixed", inset: 0, cursor: "crosshair", zIndex: 99990 } : undefined}>
      {showInput && (
        <div style={{
          position: "fixed",
          left: Math.min(inputPos.x, window.innerWidth - 260),
          top: Math.max(inputPos.y - 80, 10),
          zIndex: 99999,
          background: "#1a1a2e",
          border: "1px solid #6c5ce7",
          borderRadius: 10,
          padding: 12,
          width: 240,
          boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
        }}>
          <div style={{ fontSize: 10, color: "#888", marginBottom: 6 }}>
            Variant {currentTarget?.variant}: {currentTarget?.element}
          </div>
          <textarea
            ref={inputRef}
            value={inputText}
            onChange={e => setInputText(e.target.value)}
            placeholder="Your feedback..."
            style={{
              width: "100%", height: 60, background: "#111", border: "1px solid #333",
              borderRadius: 6, color: "#fff", fontSize: 11, padding: 8, outline: "none",
              resize: "none", fontFamily: "inherit",
            }}
          />
          <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
            <button onClick={saveComment} style={{ ...btnStyle, flex: 1, padding: "6px 10px", fontSize: 10 }}>Save</button>
            <button onClick={() => { setShowInput(false); setCurrentTarget(null) }} style={{ ...btnStyle, flex: 1, padding: "6px 10px", fontSize: 10, background: "#333" }}>Cancel</button>
          </div>
        </div>
      )}

      {comments.length > 0 && !showInput && (
        <div style={panelStyle}>
          <div style={{ fontWeight: 700, marginBottom: 10, fontSize: 13 }}>
            Feedback ({comments.length})
          </div>
          {comments.map(c => (
            <div key={c.id} style={{ padding: "6px 0", borderBottom: "1px solid #2a2a3e" }}>
              <div style={{ fontSize: 9, color: "#6c5ce7", letterSpacing: 1 }}>VARIANT {c.variant}</div>
              <div style={{ fontSize: 10, color: "#aaa", marginTop: 2 }}>{c.element}</div>
              <div style={{ fontSize: 11, color: "#fff", marginTop: 2 }}>{c.text}</div>
            </div>
          ))}
          <div style={{ marginTop: 10 }}>
            <div style={{ fontSize: 10, color: "#888", marginBottom: 4 }}>Overall Direction (required)</div>
            <textarea
              value={direction}
              onChange={e => setDirection(e.target.value)}
              placeholder="Which variant wins? What to combine?"
              style={{
                width: "100%", height: 50, background: "#111", border: "1px solid #333",
                borderRadius: 6, color: "#fff", fontSize: 11, padding: 8, outline: "none",
                resize: "none", fontFamily: "inherit",
              }}
            />
          </div>
          <button onClick={handleSubmit} style={{ ...btnStyle, width: "100%", marginTop: 8, background: "#6c5ce7" }}>
            {copied ? "COPIED! Paste in terminal" : "Submit All Feedback"}
          </button>
        </div>
      )}

      <div style={overlayStyle}>
        <button onClick={() => setActive(!active)} style={btnStyle}>
          {active ? "EXIT FEEDBACK" : `ADD FEEDBACK (${comments.length})`}
        </button>
      </div>

      {comments.map(c => (
        <div key={c.id} style={{
          position: "fixed", left: c.x - 8, top: c.y - 8,
          width: 16, height: 16, borderRadius: "50%",
          background: "#6c5ce7", border: "2px solid #fff",
          zIndex: 99995, pointerEvents: "none",
          fontSize: 8, color: "#fff", display: "flex",
          alignItems: "center", justifyContent: "center", fontWeight: 700,
        }}>
          {comments.indexOf(c) + 1}
        </div>
      ))}
    </div>
  )
}
