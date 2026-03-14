import { useState, useEffect, useRef, useCallback } from 'react'
import { WS_BASE } from '../api.js'
import ChatMessage from '../components/ChatMessage.jsx'
import ChatInput from '../components/ChatInput.jsx'
import ChatHistorySidebar from '../components/ChatHistorySidebar.jsx'

const CHAT_SESSION_KEY = 'rg_chat_session'

const STARTER_PROMPTS = [
  'Standardize my molecules and give me a property summary',
  'Detect the common core and recommend the best analysis strategy',
  'Run a full R-group decomposition and SAR analysis',
  'Find activity cliffs in my dataset',
  'Mine matched molecular pairs and show the top transforms',
  'Analyze the chemical diversity of my compounds',
  'Build a scaffold tree and show me the most common scaffolds',
  'Enumerate a virtual library from the detected core',
]

function timestamp() {
  return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function isoToTime(iso) {
  if (!iso) return ''
  try { return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }
  catch { return '' }
}

function newSessionId() {
  return `chat-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
}

export default function ChatPage() {
  const [messages,      setMessages]      = useState([])
  const [isThinking,    setIsThinking]    = useState(false)
  const [uploadedFile,  setUploadedFile]  = useState(null)
  const [sidebarOpen,   setSidebarOpen]   = useState(true)
  const [histRefresh,   setHistRefresh]   = useState(0)  // increment to re-fetch sidebar

  // Session ID is mutable so we can load old chats or start fresh
  const [sessionId, setSessionId] = useState(() => {
    const saved = sessionStorage.getItem(CHAT_SESSION_KEY)
    if (saved) return saved
    const id = newSessionId()
    sessionStorage.setItem(CHAT_SESSION_KEY, id)
    return id
  })

  const wsRef          = useRef(null)
  const bottomRef      = useRef(null)
  const pendingMsgRef  = useRef(null)   // index of in-progress assistant message

  // ── WebSocket connection ─────────────────────────────────────────────────────
  const connectWS = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return
    const ws = new WebSocket(`${WS_BASE}/api/chat/ws/${sessionId}`)
    wsRef.current = ws

    ws.onopen  = () => console.log('[chat] WS connected:', sessionId)
    ws.onmessage = (e) => handleServerMessage(JSON.parse(e.data))
    ws.onerror = (e) => console.error('[chat] WS error', e)
    ws.onclose = () => {
      console.log('[chat] WS closed, reconnect in 2s')
      setTimeout(connectWS, 2000)
    }
  }, [sessionId])  // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    connectWS()
    return () => { wsRef.current?.close() }
  }, [connectWS])

  // ── Auto-scroll ──────────────────────────────────────────────────────────────
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // ── Server message handler ───────────────────────────────────────────────────
  function handleServerMessage(data) {
    const { type } = data

    // ── Heartbeat ── silent keep-alive ping from server, nothing to render
    if (type === 'heartbeat') return

    // ── Synthesis upgrade ── Opus is taking over to write the final analysis
    if (type === 'synthesis_start') {
      setMessages(prev => {
        const idx = pendingMsgRef.current
        if (idx == null || !prev[idx]) return prev
        const updated = [...prev]
        updated[idx] = {
          ...updated[idx],
          toolCalls: [
            ...(updated[idx].toolCalls || []),
            {
              tool:         'synthesize',
              inputSummary: `Generating comprehensive analysis with ${data.model || 'Opus'}`,
              isRunning:    true,
            },
          ],
        }
        return updated
      })
      return
    }

    // ── Streaming text chunk ── appended to the current assistant message
    // Claude streams text in real time; the final 'response' event will
    // overwrite with the canonical complete string once streaming is done.
    if (type === 'partial_response') {
      setMessages(prev => {
        const idx = pendingMsgRef.current
        if (idx != null && prev[idx]) {
          const updated = [...prev]
          updated[idx] = {
            ...updated[idx],
            content:   (updated[idx].content || '') + data.content,
            timestamp: timestamp(),
          }
          return updated
        }
        // No pending message yet — create one (Claude spoke before calling a tool)
        const newMsg = {
          role: 'assistant', content: data.content, toolCalls: [], timestamp: timestamp(),
        }
        pendingMsgRef.current = prev.length
        return [...prev, newMsg]
      })
      return
    }

    if (type === 'upload_ack') {
      setUploadedFile({ name: data.filename, numMolecules: data.num_molecules })
      setMessages(prev => [...prev, {
        role: 'system',
        content: `📄 Loaded ${data.num_molecules} molecules from "${data.filename}"${
          data.property_columns?.length
            ? ` · Properties: ${data.property_columns.join(', ')}`
            : ''
        }`,
        timestamp: timestamp(),
      }])
      // Sidebar shows new molecule file — refresh
      setHistRefresh(n => n + 1)
      return
    }

    if (type === 'tool_start') {
      setMessages(prev => {
        const idx = pendingMsgRef.current
        if (idx != null && prev[idx]) {
          const updated = [...prev]
          updated[idx] = {
            ...updated[idx],
            toolCalls: [
              ...(updated[idx].toolCalls || []),
              { tool: data.tool, inputSummary: data.input_summary, isRunning: true },
            ],
          }
          return updated
        }
        const newMsg = {
          role: 'assistant', content: '', timestamp: timestamp(),
          toolCalls: [{ tool: data.tool, inputSummary: data.input_summary, isRunning: true }],
        }
        pendingMsgRef.current = prev.length
        return [...prev, newMsg]
      })
      return
    }

    if (type === 'tool_result' || type === 'tool_error') {
      setMessages(prev => {
        const idx = pendingMsgRef.current
        if (idx == null || !prev[idx]) return prev
        const updated  = [...prev]
        const toolCalls = [...(updated[idx].toolCalls || [])]
        const tcIdx = [...toolCalls].reverse().findIndex(
          tc => tc.tool === data.tool && tc.isRunning
        )
        const realIdx = tcIdx >= 0 ? toolCalls.length - 1 - tcIdx : toolCalls.length - 1
        toolCalls[realIdx] = {
          ...toolCalls[realIdx],
          isRunning: false,
          summary:   data.summary || data.error,
          data:      data.data || null,
          error:     type === 'tool_error' ? data.error : null,
        }
        updated[idx] = { ...updated[idx], toolCalls }
        return updated
      })
      return
    }

    if (type === 'response') {
      setMessages(prev => {
        const idx = pendingMsgRef.current
        if (idx != null && prev[idx]) {
          const updated   = [...prev]
          // Mark synthesize card done (if present) and set final text
          const toolCalls = (updated[idx].toolCalls || []).map(tc =>
            tc.tool === 'synthesize' && tc.isRunning
              ? { ...tc, isRunning: false, summary: 'analysis complete' }
              : tc
          )
          updated[idx] = { ...updated[idx], content: data.content, timestamp: timestamp(), toolCalls }
          return updated
        }
        const newMsg = { role: 'assistant', content: data.content, toolCalls: [], timestamp: timestamp() }
        pendingMsgRef.current = prev.length
        return [...prev, newMsg]
      })
      return
    }

    if (type === 'done') {
      pendingMsgRef.current = null
      setIsThinking(false)
      // Trigger sidebar refresh so title / message count update
      setHistRefresh(n => n + 1)
      return
    }

    if (type === 'error') {
      setIsThinking(false)
      pendingMsgRef.current = null
      setMessages(prev => [...prev, {
        role: 'system', content: `⚠ ${data.content}`, timestamp: timestamp(),
      }])
    }
  }

  // ── Send a chat message ──────────────────────────────────────────────────────
  function sendMessage(content) {
    if (!content.trim() || isThinking) return
    const ws = wsRef.current
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      alert('WebSocket not connected. Trying to reconnect…')
      connectWS()
      return
    }
    setMessages(prev => [...prev, { role: 'user', content, timestamp: timestamp() }])
    setIsThinking(true)
    ws.send(JSON.stringify({ type: 'message', content }))
  }

  // ── Upload a file ────────────────────────────────────────────────────────────
  function handleFileUpload(file) {
    const ws = wsRef.current
    if (!ws || ws.readyState !== WebSocket.OPEN) { connectWS(); return }
    const reader = new FileReader()
    reader.onload = (e) => {
      const b64 = btoa(String.fromCharCode(...new Uint8Array(e.target.result)))
      ws.send(JSON.stringify({ type: 'file', filename: file.name, content: b64 }))
    }
    reader.readAsArrayBuffer(file)
  }

  // ── New chat (clear everything + fresh session ID) ───────────────────────────
  function startNewChat() {
    const ws = wsRef.current
    if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'clear' }))
    const id = newSessionId()
    sessionStorage.setItem(CHAT_SESSION_KEY, id)
    setSessionId(id)
    setMessages([])
    setUploadedFile(null)
    setIsThinking(false)
    pendingMsgRef.current = null
  }

  // ── Load a past chat from history ────────────────────────────────────────────
  async function loadChat(chatId) {
    if (chatId === sessionId && messages.length > 0) return  // already open
    try {
      const res = await fetch(`/api/chat/history/${chatId}`)
      if (!res.ok) { console.error('Load chat failed', await res.text()); return }
      const data = await res.json()

      // Restore display messages with normalised timestamps
      const restored = (data.display_messages || []).map(m => ({
        ...m,
        timestamp: isoToTime(m.timestamp) || m.timestamp || '',
      }))

      sessionStorage.setItem(CHAT_SESSION_KEY, chatId)
      setSessionId(chatId)
      setMessages(restored)
      setUploadedFile(
        data.molecule_file
          ? { name: data.molecule_file, numMolecules: data.num_molecules || 0 }
          : null
      )
      setIsThinking(false)
      pendingMsgRef.current = null
    } catch (e) {
      console.error('Load chat error', e)
    }
  }

  const isEmpty = messages.length === 0

  return (
    <div style={{
      display:    'flex',
      flexDirection: 'row',
      height:     'calc(100vh - var(--header-h))',
      width:      '100%',
      overflow:   'hidden',
    }}>

      {/* ── Sidebar toggle strip (when closed) ── */}
      {!sidebarOpen && (
        <div
          title="Open history"
          onClick={() => setSidebarOpen(true)}
          style={{
            width:      28,
            background: 'rgba(4, 7, 20, 0.85)',
            borderRight: '1px solid var(--border-subtle)',
            display:    'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor:     'pointer',
            color:       'var(--text-muted)',
            fontSize:   '0.65rem',
            writingMode: 'vertical-rl',
            letterSpacing: '0.08em',
            fontFamily: 'var(--font-display)',
            textTransform: 'uppercase',
            gap: 6,
            userSelect: 'none',
          }}
        >
          ▶ History
        </div>
      )}

      {/* ── History sidebar ── */}
      {sidebarOpen && (
        <div style={{ display: 'flex', flexDirection: 'column', position: 'relative' }}>
          <ChatHistorySidebar
            activeId={sessionId}
            onSelectChat={loadChat}
            onNewChat={startNewChat}
            refreshTrigger={histRefresh}
          />
          {/* Collapse button */}
          <button
            title="Hide history"
            onClick={() => setSidebarOpen(false)}
            style={{
              position: 'absolute', top: 12, right: -12,
              width: 22, height: 22, borderRadius: '50%',
              background: 'var(--bg-card)',
              border: '1px solid var(--border-subtle)',
              color: 'var(--text-muted)',
              cursor: 'pointer', fontSize: '0.55rem',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              zIndex: 10,
            }}
          >
            ◀
          </button>
        </div>
      )}

      {/* ── Main chat area ── */}
      <div style={{
        flex:        1,
        display:     'flex',
        flexDirection: 'column',
        overflow:    'hidden',
        minWidth:    0,
      }}>
        <div style={{
          flex:    1,
          display: 'flex',
          flexDirection: 'column',
          maxWidth: 860,
          width:   '100%',
          margin:  '0 auto',
          padding: '0 16px',
          overflow: 'hidden',
          minWidth: 0,
        }}>

          {/* ── Empty state ── */}
          {isEmpty && (
            <div style={{
              flex: 1, display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center',
              padding: '40px 20px', gap: 24,
            }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{
                  fontFamily: 'var(--font-display)', fontWeight: 700,
                  fontSize: '1.5rem', letterSpacing: '0.04em',
                  color: 'var(--text-bright)', marginBottom: 8,
                }}>
                  Chat with the Chemistry Agent
                </div>
                <div style={{
                  fontFamily: 'var(--font-body, DM Sans)', fontSize: '0.9rem',
                  color: 'var(--text-secondary)', maxWidth: 480,
                }}>
                  Drop a molecule file (.sdf, .csv, .smi) and ask anything —
                  the agent has access to all nine analysis tools and can run
                  the full pipeline through conversation.
                </div>
              </div>

              {/* Drop zone */}
              <div
                onDragOver={e => e.preventDefault()}
                onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) handleFileUpload(f) }}
                onClick={() => document.getElementById('chat-file-input')?.click()}
                style={{
                  border: '1.5px dashed var(--border-subtle)',
                  borderRadius: 'var(--radius)',
                  padding: '22px 36px',
                  textAlign: 'center',
                  color: 'var(--text-muted)',
                  fontFamily: 'var(--font-display)', fontSize: '0.7rem',
                  letterSpacing: '0.08em', textTransform: 'uppercase',
                  cursor: 'pointer', transition: 'border-color 0.15s, background 0.15s',
                }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--blue)'; e.currentTarget.style.background = 'rgba(59,130,246,0.04)' }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-subtle)'; e.currentTarget.style.background = 'transparent' }}
              >
                <div style={{ fontSize: '1.8rem', marginBottom: 6 }}>⬆</div>
                Drop or click to upload molecule file
                <div style={{ fontSize: '0.6rem', marginTop: 4 }}>.sdf · .csv · .smi · .smiles</div>
              </div>
              <input
                id="chat-file-input" type="file" style={{ display: 'none' }}
                accept=".sdf,.csv,.smi,.smiles,.txt"
                onChange={e => { const f = e.target.files?.[0]; if (f) handleFileUpload(f) }}
              />

              {/* Starter prompts */}
              <div style={{ width: '100%', maxWidth: 640 }}>
                <div style={{
                  fontFamily: 'var(--font-display)', fontSize: '0.6rem',
                  letterSpacing: '0.1em', textTransform: 'uppercase',
                  color: 'var(--text-muted)', marginBottom: 10, textAlign: 'center',
                }}>
                  Try asking
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  {STARTER_PROMPTS.map((p, i) => (
                    <button
                      key={i}
                      onClick={() => sendMessage(p)}
                      style={{
                        background: 'var(--bg-card)',
                        border: '1px solid var(--border-subtle)',
                        borderRadius: 'var(--radius-sm)',
                        padding: '9px 12px', textAlign: 'left', cursor: 'pointer',
                        fontFamily: 'var(--font-body, DM Sans)', fontSize: '0.78rem',
                        color: 'var(--text-secondary)', lineHeight: 1.4,
                        transition: 'border-color 0.15s, color 0.15s, background 0.15s',
                      }}
                      onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--blue)55'; e.currentTarget.style.color = 'var(--text-primary)'; e.currentTarget.style.background = 'rgba(59,130,246,0.05)' }}
                      onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-subtle)'; e.currentTarget.style.color = 'var(--text-secondary)'; e.currentTarget.style.background = 'var(--bg-card)' }}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ── Message list ── */}
          {!isEmpty && (
            <div style={{ flex: 1, overflowY: 'auto', padding: '16px 0', display: 'flex', flexDirection: 'column' }}>
              {/* Toolbar */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8, gap: 8 }}>
                <button className="btn btn-ghost" style={{ fontSize: '0.65rem', padding: '4px 10px' }}
                  onClick={startNewChat}>
                  + New Chat
                </button>
                <button className="btn btn-ghost" style={{ fontSize: '0.65rem', padding: '4px 10px' }}
                  onClick={() => {
                    const ws = wsRef.current
                    if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'clear' }))
                    setMessages([])
                    setUploadedFile(null)
                    setIsThinking(false)
                    pendingMsgRef.current = null
                  }}>
                  ✕ Clear
                </button>
              </div>

              {messages.map((msg, i) => <ChatMessage key={i} msg={msg} />)}

              {/* Thinking dots */}
              {isThinking && pendingMsgRef.current == null && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 40, marginTop: 8 }}>
                  {[0, 1, 2].map(i => (
                    <div key={i} style={{
                      width: 7, height: 7, borderRadius: '50%', background: 'var(--blue)',
                      animation: `bounce-dot 1.2s ${i * 0.2}s ease-in-out infinite`,
                    }} />
                  ))}
                </div>
              )}

              <div ref={bottomRef} />
            </div>
          )}

          {/* ── Input ── */}
          <ChatInput
            onSend={sendMessage}
            onFileUpload={handleFileUpload}
            disabled={isThinking}
            uploadedFile={uploadedFile}
          />
        </div>
      </div>
    </div>
  )
}
