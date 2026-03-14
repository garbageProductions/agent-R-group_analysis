import { useState } from 'react'

const TOOL_ICONS = {
  standardize:      '⚗',
  detect_core:      '◎',
  rgroup_decompose: '⊕',
  rank_sar:         '↑',
  mine_mmps:        '⇄',
  enumerate_library:'∑',
  detect_cliffs:    '⚡',
  scaffold_tree:    '⤵',
  analyze_diversity:'◈',
  synthesize:       '✦',   // Opus synthesis upgrade
}

const TOOL_COLORS = {
  standardize:      'var(--teal)',
  detect_core:      'var(--blue)',
  rgroup_decompose: 'var(--blue)',
  rank_sar:         'var(--green)',
  mine_mmps:        'var(--purple)',
  enumerate_library:'var(--amber)',
  detect_cliffs:    'var(--red)',
  scaffold_tree:    'var(--teal)',
  analyze_diversity:'var(--green)',
  synthesize:       '#a78bfa',   // violet — distinct from all tool colors
}

function formatData(data, depth = 0) {
  if (data == null) return <span style={{ color: 'var(--text-muted)' }}>null</span>
  if (typeof data === 'boolean') return (
    <span style={{ color: 'var(--amber)' }}>{String(data)}</span>
  )
  if (typeof data === 'number') return (
    <span style={{ color: 'var(--teal)' }}>{Number.isInteger(data) ? data : data.toFixed(4)}</span>
  )
  if (typeof data === 'string') {
    const truncated = data.length > 80 ? data.slice(0, 80) + '…' : data
    return <span style={{ color: 'var(--text-code)' }}>"{truncated}"</span>
  }
  if (Array.isArray(data)) {
    if (data.length === 0) return <span style={{ color: 'var(--text-muted)' }}>[]</span>
    const preview = data.slice(0, 3)
    return (
      <span>
        [{preview.map((item, i) => (
          <span key={i}>{i > 0 && ', '}{formatData(item, depth + 1)}</span>
        ))}
        {data.length > 3 && <span style={{ color: 'var(--text-muted)' }}>, …+{data.length - 3}</span>}]
      </span>
    )
  }
  if (typeof data === 'object' && depth < 3) {
    const keys = Object.keys(data).slice(0, 4)
    return (
      <span>
        {'{ '}
        {keys.map((k, i) => (
          <span key={k}>
            {i > 0 && ', '}
            <span style={{ color: 'var(--blue-l)' }}>{k}</span>
            {': '}
            {formatData(data[k], depth + 1)}
          </span>
        ))}
        {Object.keys(data).length > 4 && <span style={{ color: 'var(--text-muted)' }}>, …</span>}
        {' }'}
      </span>
    )
  }
  // Deep object: show compact JSON snippet
  try {
    const s = JSON.stringify(data)
    const preview = s && s.length > 48 ? s.slice(0, 48) + '…}' : (s || '{}')
    return <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>{preview}</span>
  } catch {
    return <span style={{ color: 'var(--text-muted)' }}>{String(data)}</span>
  }
}

export default function ToolCallCard({ tool, inputSummary, summary, data, error, isRunning }) {
  const [expanded, setExpanded] = useState(false)
  const color = TOOL_COLORS[tool] || 'var(--blue)'
  const icon  = TOOL_ICONS[tool]  || '⚙'

  return (
    <div style={{
      marginTop: 6,
      borderRadius: 'var(--radius)',
      border: `1px solid ${color}33`,
      background: `${color}08`,
      overflow: 'hidden',
    }}>
      {/* Header row */}
      <div
        onClick={() => data && setExpanded(e => !e)}
        style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '7px 12px',
          cursor: data ? 'pointer' : 'default',
        }}
      >
        {/* Icon + tool name */}
        <span style={{ fontSize: '0.85rem', lineHeight: 1 }}>{icon}</span>
        <span style={{
          fontFamily: 'var(--font-display)', fontSize: '0.7rem',
          fontWeight: 700, letterSpacing: '0.08em',
          textTransform: 'uppercase', color,
        }}>
          {tool}
        </span>

        {/* Input summary */}
        <span style={{
          fontFamily: 'var(--font-mono)', fontSize: '0.68rem',
          color: 'var(--text-muted)', flex: 1,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {inputSummary}
        </span>

        {/* Status */}
        {isRunning && (
          <div style={{
            width: 12, height: 12,
            border: '2px solid transparent',
            borderTopColor: color,
            borderRadius: '50%',
            animation: 'spin 0.7s linear infinite',
          }} />
        )}
        {error && <span style={{ fontSize: '0.7rem', color: 'var(--red)' }}>⚠ Error</span>}
        {summary && !error && !isRunning && (
          <span style={{
            fontFamily: 'var(--font-mono)', fontSize: '0.68rem',
            color: 'var(--text-secondary)',
          }}>
            {summary}
          </span>
        )}
        {data && (
          <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>
            {expanded ? '▾' : '▸'}
          </span>
        )}
      </div>

      {/* Expanded raw data */}
      {expanded && data && (
        <div style={{
          borderTop: `1px solid ${color}22`,
          padding: '8px 12px',
          fontFamily: 'var(--font-mono)', fontSize: '0.68rem',
          lineHeight: 1.8,
          color: 'var(--text-secondary)',
          maxHeight: 300, overflowY: 'auto',
        }}>
          {formatData(data)}
        </div>
      )}

      {/* Error */}
      {error && (
        <div style={{
          borderTop: '1px solid var(--red)33',
          padding: '6px 12px',
          fontFamily: 'var(--font-mono)', fontSize: '0.7rem',
          color: 'var(--red)',
        }}>
          {error}
        </div>
      )}
    </div>
  )
}
