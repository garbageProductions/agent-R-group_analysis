import { useState } from 'react'
import { getMolSvgUrl } from '../api.js'
import DotMenu from './DotMenu.jsx'

function truncate(s, n = 40) {
  return s && s.length > n ? s.slice(0, n) + '…' : s
}

export default function MoleculeCard({ sessionId, index, label, smiles, svgContent, onClick }) {
  const [loaded, setLoaded] = useState(false)
  const [errored, setErrored] = useState(false)
  const [hovered, setHovered] = useState(false)

  const svgUrl = sessionId != null && index != null
    ? getMolSvgUrl(sessionId, index, 220, 170)
    : null

  function copySmiles() {
    if (smiles) navigator.clipboard?.writeText(smiles).catch(() => {})
  }

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: 'var(--bg-card)',
        border: `1px solid ${hovered ? 'var(--border-default)' : 'var(--border-subtle)'}`,
        borderRadius: 'var(--radius)',
        overflow: 'hidden',
        cursor: onClick ? 'pointer' : 'default',
        transform: hovered ? 'translateY(-2px)' : 'translateY(0)',
        boxShadow: hovered ? '0 6px 20px rgba(0,0,0,0.35)' : 'none',
        transition: 'all 0.18s',
        position: 'relative',
      }}
    >
      {/* Structure area */}
      <div style={{
        width: '100%', aspectRatio: '4/3', position: 'relative',
        background: errored ? 'var(--bg-surface)' : '#ffffff',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        {!loaded && !errored && svgUrl && (
          <div className="skeleton" style={{ position: 'absolute', inset: 0 }} />
        )}

        {svgContent ? (
          <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            dangerouslySetInnerHTML={{ __html: svgContent }} />
        ) : svgUrl && !errored ? (
          <img src={svgUrl} alt={label}
            onLoad={() => setLoaded(true)}
            onError={() => { setLoaded(true); setErrored(true) }}
            style={{ width: '100%', height: '100%', objectFit: 'contain',
              opacity: loaded ? 1 : 0, transition: 'opacity 0.2s' }} />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, color: 'var(--text-muted)' }}>
            <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
              <rect x="4" y="7" width="20" height="14" rx="2" stroke="currentColor" strokeWidth="1.4"/>
              <circle cx="12" cy="14" r="3" stroke="currentColor" strokeWidth="1.4"/>
              <path d="M15 14h7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
            </svg>
            <span style={{ fontSize: '0.64rem' }}>No structure</span>
          </div>
        )}

        {/* Hover dot menu */}
        {hovered && (
          <div style={{ position: 'absolute', top: 6, right: 6 }}
            onClick={e => e.stopPropagation()}>
            <DotMenu direction="down" items={[
              ...(smiles ? [{ icon: '⧉', label: 'Copy SMILES', action: copySmiles }] : []),
              ...(onClick ? [{ icon: '⊕', label: 'Zoom to', action: onClick }] : []),
              { divider: true },
              { icon: '🏷', label: 'Add annotation', action: () => {} },
            ]} />
          </div>
        )}
      </div>

      {/* Label row */}
      <div style={{
        padding: '7px 10px', borderTop: '1px solid var(--border-dim)',
        display: 'flex', alignItems: 'center', gap: 6,
      }}>
        <div style={{ flex: 1, overflow: 'hidden' }}>
          <div style={{
            fontSize: '0.73rem', fontWeight: 600, color: 'var(--text-primary)',
            marginBottom: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {label || `Mol ${index}`}
          </div>
          {smiles && (
            <div className="tooltip-wrap" style={{ width: '100%' }}>
              <div style={{
                fontFamily: 'var(--font-mono)', fontSize: '0.62rem', color: 'var(--text-muted)',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {truncate(smiles, 34)}
              </div>
              {smiles.length > 34 && (
                <div className="tooltip" style={{ whiteSpace: 'normal', width: 260 }}>{smiles}</div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
