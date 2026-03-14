import { useState, useEffect } from 'react'
import { getHealth } from '../api.js'

const PIPELINE_STEPS = ['upload', 'config', 'analysis', 'results']

const NAV_ITEMS = [
  { id: 'pipeline', label: 'Pipeline',   icon: '⬡' },
  { id: 'chat',     label: 'Chat Agent', icon: '◈' },
  { id: 'docs',     label: 'Docs',       icon: '≡' },
]

export default function GlobalHeader({ page, onPageChange, step, sessionId, onReset }) {
  const [health, setHealth] = useState(null)

  useEffect(() => {
    getHealth().then(setHealth).catch(() => setHealth({ status: 'error' }))
  }, [])

  const ok = health?.status === 'ok'
  const stepIdx = PIPELINE_STEPS.indexOf(step)

  return (
    <header style={{
      height: 'var(--header-h)',
      background: 'var(--bg-surface)',
      borderBottom: '1px solid var(--border-subtle)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '0 24px',
      flexShrink: 0,
      position: 'relative',
      zIndex: 100,
    }}>

      {/* ── Brand ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        {/* Hexagon logo */}
        <svg width="28" height="28" viewBox="0 0 28 28">
          <polygon points="14,2 25,8 25,20 14,26 3,20 3,8"
            fill="none" stroke="var(--blue)" strokeWidth="1.5" />
          <polygon points="14,7 20,10.5 20,17.5 14,21 8,17.5 8,10.5"
            fill="rgba(59,130,246,0.15)" stroke="var(--teal)" strokeWidth="1" />
          <text x="14" y="16" textAnchor="middle" fill="var(--blue-l)"
            fontSize="8" fontFamily="var(--font-display)" fontWeight="700">RG</text>
        </svg>

        <div>
          <div style={{
            fontFamily: 'var(--font-display)',
            fontWeight: 700,
            fontSize: '0.95rem',
            letterSpacing: '0.04em',
            color: 'var(--text-bright)',
          }}>
            R-Group Analysis Suite
          </div>
          <div style={{
            fontFamily: 'var(--font-display)',
            fontSize: '0.6rem',
            letterSpacing: '0.12em',
            color: 'var(--text-muted)',
            textTransform: 'uppercase',
          }}>
            Computational Chemistry Agent Suite
          </div>
        </div>
      </div>

      {/* ── Centre: nav tabs ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        {NAV_ITEMS.map(({ id, label, icon }) => {
          const active = page === id
          return (
            <button
              key={id}
              onClick={() => onPageChange(id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '6px 14px',
                border: `1px solid ${active ? 'var(--blue)55' : 'transparent'}`,
                borderRadius: 'var(--radius-sm)',
                background: active ? 'rgba(59,130,246,0.1)' : 'transparent',
                cursor: 'pointer',
                fontFamily: 'var(--font-display)',
                fontWeight: active ? 700 : 400,
                fontSize: '0.68rem',
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
                color: active ? 'var(--blue-l)' : 'var(--text-muted)',
                transition: 'all 0.15s',
              }}
              onMouseEnter={e => {
                if (!active) {
                  e.currentTarget.style.color = 'var(--text-secondary)'
                  e.currentTarget.style.background = 'rgba(255,255,255,0.03)'
                }
              }}
              onMouseLeave={e => {
                if (!active) {
                  e.currentTarget.style.color = 'var(--text-muted)'
                  e.currentTarget.style.background = 'transparent'
                }
              }}
            >
              <span style={{ fontSize: '0.8rem', lineHeight: 1 }}>{icon}</span>
              {label}
            </button>
          )
        })}

        {/* Pipeline step breadcrumb — only shown when on pipeline page */}
        {page === 'pipeline' && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 0,
            marginLeft: 18,
            paddingLeft: 18,
            borderLeft: '1px solid var(--border-dim)',
          }}>
            {['Upload', 'Configure', 'Running', 'Results'].map((label, i) => {
              const active = i === stepIdx
              const done   = i < stepIdx
              return (
                <div key={label} style={{ display: 'flex', alignItems: 'center' }}>
                  {i > 0 && (
                    <div style={{
                      width: 20, height: 1,
                      background: done ? 'var(--blue)' : 'var(--border-dim)',
                    }} />
                  )}
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 4,
                    padding: '3px 7px',
                    borderRadius: 'var(--radius-sm)',
                    background: active ? 'rgba(59,130,246,0.12)' : 'transparent',
                  }}>
                    <div style={{
                      width: 16, height: 16,
                      borderRadius: '50%',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: '0.55rem',
                      fontFamily: 'var(--font-display)',
                      fontWeight: 700,
                      background: active ? 'var(--blue)' : done ? 'var(--teal)' : 'var(--border-subtle)',
                      color: (active || done) ? '#fff' : 'var(--text-muted)',
                    }}>
                      {done ? '✓' : i + 1}
                    </div>
                    <span style={{
                      fontFamily: 'var(--font-display)',
                      fontSize: '0.6rem',
                      fontWeight: 600,
                      letterSpacing: '0.06em',
                      textTransform: 'uppercase',
                      color: active ? 'var(--blue-l)' : done ? 'var(--teal)' : 'var(--text-muted)',
                    }}>
                      {label}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* ── Right: health + session + reset ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        {sessionId && page === 'pipeline' && (
          <div style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '0.65rem',
            color: 'var(--text-muted)',
            padding: '3px 8px',
            border: '1px solid var(--border-dim)',
            borderRadius: 'var(--radius-sm)',
          }}>
            {sessionId.slice(0, 8)}…
          </div>
        )}

        {/* Health dot */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{
            width: 7, height: 7,
            borderRadius: '50%',
            background: health === null ? 'var(--text-muted)' : ok ? 'var(--green)' : 'var(--red)',
            boxShadow: ok ? '0 0 6px var(--green)' : 'none',
            animation: ok ? 'pulse-dot 2s infinite' : 'none',
          }} />
          <span style={{
            fontFamily: 'var(--font-display)',
            fontSize: '0.62rem',
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            color: 'var(--text-muted)',
          }}>
            {health === null ? 'checking' : ok ? 'online' : 'offline'}
          </span>
        </div>

        {onReset && sessionId && page === 'pipeline' && (
          <button className="btn btn-ghost" style={{ padding: '5px 10px', fontSize: '0.65rem' }}
            onClick={onReset}>
            ✕ Reset
          </button>
        )}
      </div>
    </header>
  )
}
