import { useEffect, useRef, useState } from 'react'
import { openProgressWS } from '../api.js'

const AGENT_COLORS = {
  'StandardizationAgent': 'badge-blue',
  'CoreDetectionAgent':   'badge-teal',
  'DecompositionAgent':   'badge-teal',
  'SARAgent':             'badge-purple',
  'MMPAgent':             'badge-purple',
  'EnumerationAgent':     'badge-amber',
  'ActivityCliffAgent':   'badge-red',
  'ScaffoldAgent':        'badge-green',
  'DiversityAnalysis':    'badge-green',
  'ReportAgent':          'badge-amber',
  'OrchestratorAgent':    'badge-blue',
}

function extractAgent(msg) {
  for (const name of Object.keys(AGENT_COLORS)) {
    if (msg.includes(name)) return name
  }
  return null
}

export default function ProgressPanel({ sessionId, onComplete, onError }) {
  const [messages, setMessages] = useState([])
  const [status, setStatus] = useState('running')
  const logRef = useRef()
  const wsRef = useRef()

  useEffect(() => {
    if (!sessionId) return
    const ws = openProgressWS(sessionId)
    wsRef.current = ws

    ws.onmessage = (e) => {
      const data = JSON.parse(e.data)
      if (data.type === 'progress') {
        setMessages(prev => [...prev, { text: data.message, ts: Date.now() }])
      } else if (data.type === 'complete') {
        setMessages(prev => [...prev, { text: '✓ Pipeline complete', ts: Date.now(), done: true }])
        setStatus('complete')
        setTimeout(onComplete, 800)
      } else if (data.type === 'error') {
        setMessages(prev => [...prev, { text: `✕ Error: ${data.message}`, ts: Date.now(), err: true }])
        setStatus('error')
        onError?.(data.message)
      }
    }

    ws.onerror = () => {
      setMessages(prev => [...prev, { text: '⚠ WebSocket connection lost — polling…', ts: Date.now(), warn: true }])
    }

    return () => ws.close()
  }, [sessionId])

  // Auto-scroll
  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight
    }
  }, [messages])

  return (
    <div style={{
      background: 'var(--bg-surface)',
      border: '1px solid var(--border-subtle)',
      borderRadius: 'var(--radius-lg)',
      overflow: 'hidden',
      maxWidth: 800,
      width: '100%',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '12px 16px',
        borderBottom: '1px solid var(--border-dim)',
        background: 'var(--bg-card)',
      }}>
        {/* Traffic lights */}
        {['#ef4444', '#f59e0b', '#10b981'].map((c, i) => (
          <div key={i} style={{ width: 10, height: 10, borderRadius: '50%', background: c, opacity: 0.6 }} />
        ))}
        <div style={{
          fontFamily: 'var(--font-display)',
          fontSize: '0.68rem',
          letterSpacing: '0.1em',
          textTransform: 'uppercase',
          color: 'var(--text-muted)',
          marginLeft: 4,
        }}>
          agent pipeline — {sessionId?.slice(0, 8)}
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
          {status === 'running' && (
            <>
              <div style={{
                width: 6, height: 6, borderRadius: '50%',
                background: 'var(--green)',
                animation: 'pulse-dot 1s infinite',
              }} />
              <span style={{ fontFamily: 'var(--font-display)', fontSize: '0.62rem',
                color: 'var(--green)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                RUNNING
              </span>
            </>
          )}
          {status === 'complete' && (
            <span className="badge badge-green">COMPLETE</span>
          )}
          {status === 'error' && (
            <span className="badge badge-red">ERROR</span>
          )}
        </div>
      </div>

      {/* Terminal log */}
      <div ref={logRef} style={{
        fontFamily: 'var(--font-mono)',
        fontSize: '0.75rem',
        lineHeight: 1.7,
        padding: '14px 16px',
        height: 320,
        overflowY: 'auto',
        color: 'var(--text-secondary)',
        background: 'var(--bg-base)',
      }}>
        {messages.length === 0 && (
          <span style={{ color: 'var(--text-muted)' }}>
            Waiting for pipeline to start…<span style={{ animation: 'pulse-dot 1s infinite',
              display: 'inline-block', marginLeft: 4 }}>_</span>
          </span>
        )}
        {messages.map((msg, i) => {
          const agent = extractAgent(msg.text)
          const color = msg.done ? 'var(--green)' : msg.err ? 'var(--red)' :
            msg.warn ? 'var(--amber)' : 'var(--text-secondary)'

          return (
            <div key={i} style={{ animation: 'slideIn 0.2s ease', marginBottom: 2 }}>
              <span style={{ color: 'var(--text-muted)', marginRight: 8 }}>
                {new Date(msg.ts).toLocaleTimeString('en', { hour12: false })}
              </span>
              {agent && (
                <span className={`badge ${AGENT_COLORS[agent]}`} style={{ marginRight: 8, verticalAlign: 'middle' }}>
                  {agent.replace('Agent', '').replace('Analysis', '')}
                </span>
              )}
              <span style={{ color }}>{msg.text}</span>
            </div>
          )
        })}
        {status === 'running' && messages.length > 0 && (
          <span style={{ color: 'var(--blue-l)', animation: 'pulse-dot 0.8s infinite' }}>▋</span>
        )}
      </div>

      {/* Progress bar */}
      <div style={{ height: 2, background: 'var(--border-dim)' }}>
        <div style={{
          height: '100%',
          background: 'linear-gradient(90deg, var(--blue), var(--teal))',
          width: status === 'complete' ? '100%' : `${Math.min(100, (messages.length / 12) * 100)}%`,
          transition: 'width 0.5s ease',
        }} />
      </div>
    </div>
  )
}
