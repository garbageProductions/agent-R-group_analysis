import { useState, useRef, useCallback } from 'react'

/**
 * ChatInput — textarea with file drag-drop + attach button + send.
 * Props:
 *   onSend(content: string) — called when user sends a message
 *   onFileUpload(file: File) — called when user drops or attaches a file
 *   disabled: bool
 *   uploadedFile: {name, numMolecules} | null
 */
export default function ChatInput({ onSend, onFileUpload, disabled, uploadedFile }) {
  const [text, setText] = useState('')
  const [dragging, setDragging] = useState(false)
  const fileRef = useRef(null)
  const textRef = useRef(null)

  const handleSend = useCallback(() => {
    const trimmed = text.trim()
    if (!trimmed || disabled) return
    onSend(trimmed)
    setText('')
    textRef.current?.focus()
  }, [text, disabled, onSend])

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  function handleDrop(e) {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files?.[0]
    if (file) onFileUpload(file)
  }

  function handleFileChange(e) {
    const file = e.target.files?.[0]
    if (file) onFileUpload(file)
    e.target.value = ''
  }

  return (
    <div style={{ padding: '12px 20px 16px', borderTop: '1px solid var(--border-subtle)' }}>
      {/* Uploaded file chip */}
      {uploadedFile && (
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          marginBottom: 8,
          padding: '4px 10px',
          borderRadius: 20,
          background: 'rgba(20,184,166,0.1)',
          border: '1px solid rgba(20,184,166,0.3)',
          fontFamily: 'var(--font-mono)', fontSize: '0.68rem',
          color: 'var(--teal)',
        }}>
          <span>📄</span>
          <span>{uploadedFile.name}</span>
          {uploadedFile.numMolecules != null && (
            <span style={{ color: 'var(--text-muted)' }}>· {uploadedFile.numMolecules} molecules</span>
          )}
        </div>
      )}

      {/* Input row */}
      <div
        onDragOver={e => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        style={{
          display: 'flex', alignItems: 'flex-end', gap: 8,
          padding: '8px 10px 8px 14px',
          borderRadius: 'var(--radius)',
          background: dragging ? 'rgba(0,196,212,0.07)' : 'var(--bg-card)',
          border: `1px solid ${dragging ? 'var(--nanome-cyan)' : 'var(--border-subtle)'}`,
          transition: 'border-color 0.15s, background 0.15s',
        }}
      >
        {/* Attach button */}
        <button
          onClick={() => fileRef.current?.click()}
          disabled={disabled}
          title="Attach a molecule file (.sdf, .csv, .smi)"
          style={{
            background: 'none', border: 'none', cursor: disabled ? 'default' : 'pointer',
            color: 'var(--text-muted)', fontSize: '1rem',
            padding: '2px 4px', borderRadius: 4,
            transition: 'color 0.15s',
            opacity: disabled ? 0.4 : 1,
            flexShrink: 0,
            alignSelf: 'flex-end', marginBottom: 2,
          }}
          onMouseEnter={e => { if (!disabled) e.currentTarget.style.color = 'var(--nanome-cyan)' }}
          onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)' }}
        >
          📎
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".sdf,.csv,.smi,.smiles,.txt"
          style={{ display: 'none' }}
          onChange={handleFileChange}
        />

        {/* Textarea */}
        <textarea
          ref={textRef}
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          placeholder={
            uploadedFile
              ? `Ask about your ${uploadedFile.numMolecules ?? ''} molecules…`
              : 'Ask anything, or drop a molecule file here…'
          }
          rows={1}
          style={{
            flex: 1, resize: 'none', background: 'none', border: 'none', outline: 'none',
            fontFamily: 'var(--font-body, DM Sans)', fontSize: '0.875rem',
            lineHeight: 1.55, color: 'var(--text-primary)',
            padding: '4px 0',
            maxHeight: 140, overflowY: 'auto',
            opacity: disabled ? 0.5 : 1,
          }}
          onInput={e => {
            // Auto-grow
            e.target.style.height = 'auto'
            e.target.style.height = `${Math.min(e.target.scrollHeight, 140)}px`
          }}
        />

        {/* Send button */}
        <button
          onClick={handleSend}
          disabled={disabled || !text.trim()}
          style={{
            background: (disabled || !text.trim()) ? 'var(--border-subtle)' : 'var(--nanome-cyan)',
            border: 'none', borderRadius: 8,
            color: (disabled || !text.trim()) ? 'var(--text-muted)' : '#000',
            cursor: (disabled || !text.trim()) ? 'default' : 'pointer',
            padding: '6px 14px',
            fontFamily: 'var(--font-display)', fontSize: '0.7rem',
            fontWeight: 700, letterSpacing: '0.06em',
            transition: 'background 0.15s, color 0.15s',
            flexShrink: 0, alignSelf: 'flex-end',
          }}
        >
          ↑ SEND
        </button>
      </div>

      <div style={{
        marginTop: 6, textAlign: 'center',
        fontFamily: 'var(--font-display)', fontSize: '0.58rem',
        letterSpacing: '0.06em', color: 'var(--text-muted)',
      }}>
        Enter to send · Shift+Enter for newline · Drop .sdf / .csv / .smi files
      </div>
    </div>
  )
}
