import { useState, useEffect, useRef, useCallback } from 'react'
import { getSvgUrl } from '../api.js'

/**
 * DataSidePanel — collapsible right-side table of all session molecules.
 *
 * Props:
 *   sessionId       — used to build SVG fetch URLs
 *   labels          — all molecule labels (from uploadResult.all_labels)
 *   propertyColumns — list of numeric property column names
 *   properties      — column-keyed dict of value arrays: { colName: [val0, val1, ...] }
 *   sampleSvgs      — array of SVG strings for first 8 molecules (from uploadResult.sample_svgs)
 *   isOpen          — controlled open/closed state
 *   onToggle        — called when the cyan tab is clicked
 */
export default function DataSidePanel({
  sessionId,
  labels = [],
  propertyColumns = [],
  properties = {},
  sampleSvgs = [],
  isOpen,
  onToggle,
}) {
  const [sortCol, setSortCol] = useState(null)   // null = original index order
  const [sortDir, setSortDir] = useState('asc')  // 'asc' | 'desc'
  const [search, setSearch]   = useState('')
  const [svgCache, setSvgCache] = useState({})   // index → svg string

  // ── Build rows ────────────────────────────────────────────────────────────
  // Attach property values so sorting and display work correctly
  const rows = labels.map((label, i) => {
    const row = { index: i, label }
    propertyColumns.forEach(col => {
      // properties shape: { colName: [val0, val1, ...] }
      row[col] = (properties && properties[col]) ? properties[col][i] ?? null : null
    })
    return row
  })

  // ── Filter ────────────────────────────────────────────────────────────────
  const filtered = rows.filter(r =>
    r.label.toLowerCase().includes(search.toLowerCase())
  )

  // ── Sort ──────────────────────────────────────────────────────────────────
  const sorted = [...filtered].sort((a, b) => {
    if (sortCol === null || sortCol === '#') {
      return sortDir === 'asc' ? a.index - b.index : b.index - a.index
    }
    // Property columns: sort numerically when possible
    const av = a[sortCol]
    const bv = b[sortCol]
    if (av == null && bv == null) return 0
    if (av == null) return 1
    if (bv == null) return -1
    const an = Number(av), bn = Number(bv)
    if (!isNaN(an) && !isNaN(bn)) return sortDir === 'asc' ? an - bn : bn - an
    return sortDir === 'asc'
      ? String(av).localeCompare(String(bv))
      : String(bv).localeCompare(String(av))
  })

  function handleSortClick(col) {
    if (sortCol === col) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortCol(col)
      setSortDir('asc')
    }
  }

  // ── Lazy SVG loading via IntersectionObserver ────────────────────────────
  const rowRefs = useRef({})

  const fetchSvg = useCallback((index) => {
    if (svgCache[index] !== undefined) return
    if (index < sampleSvgs.length && sampleSvgs[index]) {
      setSvgCache(c => ({ ...c, [index]: sampleSvgs[index] }))
      return
    }
    setSvgCache(c => ({ ...c, [index]: 'loading' }))
    fetch(getSvgUrl(sessionId, index, 48, 36))
      .then(r => r.ok ? r.text() : null)
      .then(svg => setSvgCache(c => ({ ...c, [index]: svg || 'error' })))
      .catch(() => setSvgCache(c => ({ ...c, [index]: 'error' })))
  }, [sessionId, sampleSvgs, svgCache])

  useEffect(() => {
    if (!isOpen) return
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            const idx = Number(entry.target.dataset.index)
            fetchSvg(idx)
          }
        })
      },
      { threshold: 0.1 }
    )
    Object.values(rowRefs.current).forEach(el => { if (el) observer.observe(el) })
    return () => observer.disconnect()
  }, [isOpen, sorted, fetchSvg])

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{
      position: 'fixed',
      right: 0,
      top: 0,
      height: '100vh',
      display: 'flex',
      zIndex: 100,
      pointerEvents: 'none',
    }}>
      {/* Sliding panel */}
      <div style={{
        width: isOpen ? 340 : 0,
        overflow: 'hidden',
        transition: 'width 200ms ease',
        background: 'var(--bg-secondary, #161b22)',
        borderLeft: '1px solid var(--border, #30363d)',
        display: 'flex',
        flexDirection: 'column',
        pointerEvents: 'auto',
      }}>
        {/* Header */}
        <div style={{
          padding: '8px 12px',
          borderBottom: '1px solid var(--border, #30363d)',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          flexShrink: 0,
        }}>
          <span style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text, #e6edf3)', flex: 1 }}>
            Molecules ({labels.length})
          </span>
          <button
            onClick={onToggle}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'var(--text-muted, #8b949e)', fontSize: '1rem', lineHeight: 1,
            }}
            aria-label="Close side panel"
          >✕</button>
        </div>

        {/* Search */}
        <div style={{ padding: '6px 12px', borderBottom: '1px solid var(--border, #30363d)', flexShrink: 0 }}>
          <input
            type="text"
            placeholder="Search labels…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{
              width: '100%', boxSizing: 'border-box',
              background: 'var(--bg, #0d1117)',
              border: '1px solid var(--border, #30363d)',
              borderRadius: 4, padding: '4px 8px',
              color: 'var(--text, #e6edf3)', fontSize: '0.78rem',
            }}
          />
        </div>

        {/* Table */}
        <div style={{ overflowY: 'auto', flex: 1 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.75rem' }}>
            <thead>
              <tr style={{ background: 'var(--bg, #0d1117)', position: 'sticky', top: 0 }}>
                <th
                  style={{ padding: '4px 6px', textAlign: 'left', cursor: 'pointer', userSelect: 'none', color: 'var(--text-muted, #8b949e)', fontWeight: 500 }}
                  onClick={() => handleSortClick('#')}
                >
                  # {sortCol === '#' ? (sortDir === 'asc' ? '▲' : '▼') : ''}
                </th>
                <th style={{ padding: '4px 6px', width: 52, color: 'var(--text-muted, #8b949e)', fontWeight: 500 }}>
                  Struct
                </th>
                <th
                  style={{ padding: '4px 6px', textAlign: 'left', cursor: 'pointer', userSelect: 'none', color: 'var(--text-muted, #8b949e)', fontWeight: 500 }}
                  onClick={() => handleSortClick('label')}
                >
                  Label {sortCol === 'label' ? (sortDir === 'asc' ? '▲' : '▼') : ''}
                </th>
                {propertyColumns.map(col => (
                  <th
                    key={col}
                    style={{ padding: '4px 6px', textAlign: 'right', cursor: 'pointer', userSelect: 'none', color: 'var(--text-muted, #8b949e)', fontWeight: 500 }}
                    onClick={() => handleSortClick(col)}
                  >
                    {col} {sortCol === col ? (sortDir === 'asc' ? '▲' : '▼') : ''}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.map(row => {
                const svgStr = svgCache[row.index]
                return (
                  <tr
                    key={row.index}
                    ref={el => { rowRefs.current[row.index] = el }}
                    data-index={row.index}
                    style={{ borderBottom: '1px solid var(--border, #30363d)' }}
                  >
                    <td style={{ padding: '3px 6px', color: 'var(--text-muted, #8b949e)' }}>
                      {row.index + 1}
                    </td>
                    <td style={{ padding: '2px 4px', width: 52 }}>
                      {svgStr && svgStr !== 'loading' && svgStr !== 'error'
                        ? <span dangerouslySetInnerHTML={{ __html: svgStr }} style={{ display: 'block', width: 48, height: 36 }} />
                        : <span style={{ display: 'inline-block', width: 48, height: 36, background: 'var(--bg, #0d1117)' }} />}
                    </td>
                    <td style={{ padding: '3px 6px', color: 'var(--text, #e6edf3)', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {row.label}
                    </td>
                    {propertyColumns.map(col => (
                      <td key={col} style={{ padding: '3px 6px', textAlign: 'right', color: 'var(--text, #e6edf3)' }}>
                        {row[col] != null ? (typeof row[col] === 'number' ? row[col].toFixed(2) : row[col]) : '—'}
                      </td>
                    ))}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Cyan toggle tab */}
      <div
        onClick={onToggle}
        style={{
          width: 20,
          cursor: 'pointer',
          background: 'var(--nanome-cyan, #00d9ff)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          pointerEvents: 'auto',
          flexShrink: 0,
        }}
        title={isOpen ? 'Close molecule panel' : 'Open molecule panel'}
      >
        <span style={{
          writingMode: 'vertical-rl',
          textOrientation: 'mixed',
          transform: 'rotate(180deg)',
          fontSize: '0.65rem',
          fontWeight: 700,
          color: '#000',
          userSelect: 'none',
          letterSpacing: '0.05em',
        }}>
          MOLS
        </span>
      </div>
    </div>
  )
}
