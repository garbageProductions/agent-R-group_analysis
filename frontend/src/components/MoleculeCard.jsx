import { useState } from 'react'
import { getMolSvgUrl } from '../api.js'

function truncate(s, n = 40) {
  return s && s.length > n ? s.slice(0, n) + '…' : s
}

export default function MoleculeCard({ sessionId, index, label, smiles, svgContent, onClick }) {
  const [loaded, setLoaded] = useState(false)
  const [errored, setErrored] = useState(false)

  const svgUrl = sessionId != null && index != null
    ? getMolSvgUrl(sessionId, index, 220, 170)
    : null

  return (
    <div
      onClick={onClick}
      style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border-subtle)',
        borderRadius: 'var(--radius)',
        overflow: 'hidden',
        cursor: onClick ? 'pointer' : 'default',
        transition: 'all 0.2s',
      }}
      onMouseEnter={e => {
        e.currentTarget.style.borderColor = 'var(--border-active)'
        e.currentTarget.style.transform = 'translateY(-2px)'
        e.currentTarget.style.boxShadow = '0 8px 24px rgba(59,130,246,0.15)'
      }}
      onMouseLeave={e => {
        e.currentTarget.style.borderColor = 'var(--border-subtle)'
        e.currentTarget.style.transform = 'translateY(0)'
        e.currentTarget.style.boxShadow = 'none'
      }}
    >
      {/* Structure area */}
      <div style={{
        width: '100%',
        aspectRatio: '4/3',
        position: 'relative',
        background: errored ? 'var(--bg-surface)' : '#fff',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        {/* Skeleton while loading */}
        {!loaded && !errored && svgUrl && (
          <div className="skeleton" style={{ position: 'absolute', inset: 0 }} />
        )}

        {svgContent ? (
          <div
            style={{ width: '100%', height: '100%', display: 'flex',
              alignItems: 'center', justifyContent: 'center' }}
            dangerouslySetInnerHTML={{ __html: svgContent }}
          />
        ) : svgUrl && !errored ? (
          <img
            src={svgUrl}
            alt={label}
            onLoad={() => setLoaded(true)}
            onError={() => { setLoaded(true); setErrored(true) }}
            style={{
              width: '100%', height: '100%',
              objectFit: 'contain',
              opacity: loaded ? 1 : 0,
              transition: 'opacity 0.2s',
            }}
          />
        ) : (
          /* Fallback placeholder */
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center',
            gap: 6, color: 'var(--text-muted)' }}>
            <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
              <rect x="4" y="8" width="24" height="16" rx="2" stroke="currentColor" strokeWidth="1.5" />
              <circle cx="13" cy="16" r="3" stroke="currentColor" strokeWidth="1.5" />
              <path d="M16 16h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            <span style={{ fontSize: '0.65rem' }}>No structure</span>
          </div>
        )}
      </div>

      {/* Label row */}
      <div style={{
        padding: '8px 10px',
        borderTop: '1px solid var(--border-dim)',
      }}>
        <div style={{
          fontFamily: 'var(--font-display)',
          fontSize: '0.72rem',
          fontWeight: 600,
          color: 'var(--text-primary)',
          marginBottom: 2,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}>
          {label || `Mol ${index}`}
        </div>
        {smiles && (
          <div className="tooltip-wrap" style={{ width: '100%' }}>
            <div style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '0.62rem',
              color: 'var(--text-muted)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}>
              {truncate(smiles, 36)}
            </div>
            {smiles.length > 36 && (
              <div className="tooltip" style={{ whiteSpace: 'normal', width: 260 }}>
                {smiles}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
