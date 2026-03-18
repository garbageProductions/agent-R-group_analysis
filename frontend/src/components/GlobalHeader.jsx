import { useState, useEffect } from 'react'
import { getHealth } from '../api.js'

const PIPELINE_STEPS = ['upload', 'config', 'analysis', 'results']

const NAV_ITEMS = [
  { id: 'pipeline', label: 'Pipeline',   icon: '⬡' },
  { id: 'chat',     label: 'Chat Agent', icon: '◈' },
  { id: 'docs',     label: 'Docs',       icon: '≡' },
]

const STEP_LABELS = ['Upload', 'Configure', 'Running', 'Results']

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
      borderBottom: '1px solid var(--border-dim)',
      display: 'flex',
      alignItems: 'center',
      padding: '0 16px',
      gap: 0,
      flexShrink: 0,
      position: 'relative',
      zIndex: 100,
    }}>

      {/* Brand */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        paddingRight: 20,
        borderRight: '1px solid var(--border-dim)',
        height: '100%',
        flexShrink: 0,
      }}>
        <div style={{
          width: 32,
          height: 32,
          borderRadius: 8,
          background: 'linear-gradient(135deg, var(--nanome-cyan) 0%, var(--blue) 100%)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          boxShadow: '0 2px 8px rgba(0,196,212,0.3)',
        }}>
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
            <circle cx="9" cy="4.5" r="2" fill="white" fillOpacity="0.95"/>
            <circle cx="14" cy="12" r="2" fill="white" fillOpacity="0.95"/>
            <circle cx="4" cy="12" r="2" fill="white" fillOpacity="0.95"/>
            <line x1="9" y1="6.5" x2="13.2" y2="10.3" stroke="white" strokeWidth="1.2" strokeOpacity="0.75"/>
            <line x1="9" y1="6.5" x2="4.8" y2="10.3" stroke="white" strokeWidth="1.2" strokeOpacity="0.75"/>
            <line x1="5.8" y1="12" x2="12.2" y2="12" stroke="white" strokeWidth="1.2" strokeOpacity="0.75"/>
          </svg>
        </div>
        <div>
          <div style={{
            fontFamily: 'var(--font-display)',
            fontWeight: 700,
            fontSize: '0.9rem',
            color: 'var(--text-bright)',
            letterSpacing: '-0.01em',
            lineHeight: 1.2,
          }}>
            R-Group Suite
          </div>
          <div style={{
            fontSize: '0.61rem',
            color: 'var(--text-muted)',
            letterSpacing: '0.04em',
            lineHeight: 1,
          }}>
            v2.5 · Chemistry Agent
          </div>
        </div>
      </div>

      {/* Nav tabs */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        height: '100%',
        paddingLeft: 8,
        flex: 1,
        gap: 2,
      }}>
        {NAV_ITEMS.map(({ id, label, icon }) => {
          const active = page === id
          return (
            <button
              key={id}
              onClick={() => onPageChange(id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '6px 14px',
                height: '100%',
                border: 'none',
                borderBottom: `2px solid ${active ? 'var(--nanome-cyan)' : 'transparent'}`,
                background: 'transparent',
                cursor: 'pointer',
                fontFamily: 'var(--font-body)',
                fontSize: '0.82rem',
                fontWeight: active ? 600 : 400,
                color: active ? 'var(--text-primary)' : 'var(--text-muted)',
                transition: 'all 0.15s',
                whiteSpace: 'nowrap',
              }}
              onMouseEnter={e => {
                if (!active) e.currentTarget.style.color = 'var(--text-secondary)'
              }}
              onMouseLeave={e => {
                if (!active) e.currentTarget.style.color = 'var(--text-muted)'
              }}
            >
              <span style={{
                fontSize: '0.72rem',
                opacity: active ? 1 : 0.6,
                color: active ? 'var(--nanome-cyan)' : 'inherit',
              }}>{icon}</span>
              {label}
            </button>
          )
        })}

        {/* Pipeline breadcrumb */}
        {page === 'pipeline' && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            marginLeft: 14,
            paddingLeft: 14,
            borderLeft: '1px solid var(--border-dim)',
            height: 28,
            gap: 0,
          }}>
            {STEP_LABELS.map((label, i) => {
              const active = i === stepIdx
              const done   = i < stepIdx
              return (
                <div key={label} style={{ display: 'flex', alignItems: 'center' }}>
                  {i > 0 && (
                    <div style={{
                      width: 18,
                      height: 1,
                      background: done ? 'var(--nanome-cyan)' : 'var(--border-dim)',
                      transition: 'background 0.3s',
                    }} />
                  )}
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 5,
                    padding: '3px 8px',
                    borderRadius: 4,
                    background: active ? 'rgba(0,196,212,0.1)' : 'transparent',
                    border: `1px solid ${active ? 'rgba(0,196,212,0.3)' : 'transparent'}`,
                    transition: 'all 0.2s',
                  }}>
                    <div style={{
                      width: 15,
                      height: 15,
                      borderRadius: '50%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '0.52rem',
                      fontWeight: 700,
                      background: active
                        ? 'var(--nanome-cyan)'
                        : done ? 'rgba(34,197,94,0.2)' : 'var(--border-dim)',
                      color: active ? '#000' : done ? 'var(--green)' : 'var(--text-muted)',
                      border: done ? '1px solid rgba(34,197,94,0.4)' : 'none',
                      flexShrink: 0,
                    }}>
                      {done ? '✓' : i + 1}
                    </div>
                    <span style={{
                      fontSize: '0.72rem',
                      fontWeight: active ? 600 : 400,
                      color: active ? 'var(--nanome-cyan)' : done ? 'var(--green)' : 'var(--text-muted)',
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

      {/* Right: session + health + reset */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        paddingLeft: 14,
        borderLeft: '1px solid var(--border-dim)',
        height: '100%',
        flexShrink: 0,
      }}>
        {sessionId && page === 'pipeline' && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 5,
            padding: '3px 8px',
            background: 'var(--bg-card)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 4,
          }}>
            <span style={{ fontSize: '0.59rem', color: 'var(--text-muted)', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
              Session
            </span>
            <span style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '0.68rem',
              color: 'var(--text-secondary)',
            }}>
              {sessionId.slice(0, 8)}
            </span>
          </div>
        )}

        {/* Health dot */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{
            width: 6,
            height: 6,
            borderRadius: '50%',
            background: health === null ? 'var(--text-muted)' : ok ? 'var(--green)' : 'var(--red)',
            boxShadow: ok ? '0 0 6px var(--green)' : 'none',
            animation: ok ? 'pulse-dot 2s infinite' : 'none',
            flexShrink: 0,
          }} />
          <span style={{ fontSize: '0.69rem', color: 'var(--text-muted)' }}>
            {health === null ? 'connecting' : ok ? 'online' : 'offline'}
          </span>
        </div>

        {onReset && sessionId && page === 'pipeline' && (
          <button className="btn btn-ghost btn-sm" onClick={onReset} style={{ gap: 5 }}>
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
              <path d="M1 5a4 4 0 1 0 1-2.8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
              <path d="M1 2v3h3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            Reset
          </button>
        )}
      </div>
    </header>
  )
}
