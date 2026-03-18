import { useState, useEffect } from 'react'
import { listReports } from '../api.js'

/**
 * ReportsHistoryModal — shows a list of all saved pipeline reports.
 * Dismiss: click overlay, ✕ button, or Escape key.
 */
export default function ReportsHistoryModal({ onClose }) {
  const [reports, setReports] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState(null)

  useEffect(() => {
    listReports()
      .then(setReports)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  // Close on Escape
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 200,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--bg-secondary, #161b22)',
          border: '1px solid var(--border, #30363d)',
          borderRadius: 10,
          width: 540,
          maxWidth: '90vw',
          maxHeight: '70vh',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border, #30363d)', display: 'flex', alignItems: 'center' }}>
          <span style={{ fontWeight: 600, fontSize: '0.9rem', flex: 1 }}>📋 Past Reports</span>
          <button
            onClick={onClose}
            style={{ background: 'transparent', border: 'none', color: 'var(--text-muted, #8b949e)', cursor: 'pointer', fontSize: '1rem' }}
          >✕</button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
          {loading && (
            <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted, #8b949e)', fontSize: '0.82rem' }}>
              Loading…
            </div>
          )}
          {error && (
            <div style={{ padding: 16, color: 'var(--red, #f87171)', fontSize: '0.8rem' }}>
              Failed to load reports: {error}
            </div>
          )}
          {!loading && !error && reports.length === 0 && (
            <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted, #8b949e)', fontSize: '0.82rem' }}>
              No saved reports yet. Run an analysis to generate one.
            </div>
          )}
          {reports.map(r => (
            <div
              key={r.session_id}
              style={{
                padding: '10px 16px',
                borderBottom: '1px solid var(--border-subtle, #21262d)',
                display: 'flex',
                alignItems: 'center',
                gap: 12,
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '0.8rem', color: 'var(--text, #e6edf3)', fontFamily: 'monospace' }}>
                  {r.session_id.slice(0, 8)}…
                </div>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted, #8b949e)', marginTop: 2 }}>
                  {new Date(r.modified_at).toLocaleString()}
                  &nbsp;·&nbsp;{(r.size_bytes / 1024).toFixed(1)} KB
                </div>
              </div>
              <a
                href={`/api/reports/${r.session_id}`}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  padding: '4px 10px',
                  background: 'rgba(0,196,212,0.1)',
                  color: 'var(--nanome-cyan, #00c4d4)',
                  border: '1px solid rgba(0,196,212,0.25)',
                  borderRadius: 4,
                  fontSize: '0.72rem',
                  textDecoration: 'none',
                  whiteSpace: 'nowrap',
                }}
              >
                Open ↗
              </a>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
