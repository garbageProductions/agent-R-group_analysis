import { useState } from 'react'

function truncate(s, n = 52) { return s && s.length > n ? s.slice(0, n) + '…' : s }

function ScaffoldNode({ node, depth = 0 }) {
  const [expanded, setExpanded] = useState(depth < 2)
  const hasChildren = node.children?.length > 0
  const indent = depth * 20

  return (
    <div style={{ borderLeft: depth > 0 ? '1px solid var(--border-dim)' : 'none', marginLeft: indent }}>
      <div
        onClick={() => hasChildren && setExpanded(e => !e)}
        style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '8px 12px',
          borderBottom: '1px solid var(--border-dim)',
          cursor: hasChildren ? 'pointer' : 'default',
          transition: 'background 0.15s',
          background: expanded && hasChildren ? 'rgba(59,130,246,0.03)' : 'transparent',
        }}
        onMouseEnter={e => e.currentTarget.style.background = 'rgba(59,130,246,0.05)'}
        onMouseLeave={e => e.currentTarget.style.background =
          expanded && hasChildren ? 'rgba(59,130,246,0.03)' : 'transparent'}
      >
        {/* Expand toggle */}
        <div style={{ width: 16, flexShrink: 0, textAlign: 'center',
          color: 'var(--text-muted)', fontSize: '0.7rem' }}>
          {hasChildren ? (expanded ? '▾' : '▸') : '·'}
        </div>

        {/* Scaffold SMILES */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="tooltip-wrap" style={{ width: '100%' }}>
            <code style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem',
              color: depth === 0 ? 'var(--blue-l)' : 'var(--text-code)',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }}>
              {truncate(node.scaffold_smiles, 55)}
            </code>
            {node.scaffold_smiles?.length > 55 && (
              <div className="tooltip" style={{ whiteSpace: 'normal', width: 320 }}>
                {node.scaffold_smiles}
              </div>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 3, alignItems: 'center', flexWrap: 'wrap' }}>
            {node.num_rings != null && (
              <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>
                {node.num_rings} ring{node.num_rings !== 1 ? 's' : ''}
              </span>
            )}
            {hasChildren && (
              <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>
                {node.children.length} sub-scaffold{node.children.length !== 1 ? 's' : ''}
              </span>
            )}
          </div>
        </div>

        {/* Count + fraction bar */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3, flexShrink: 0 }}>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: '0.8rem', fontWeight: 600,
            color: 'var(--text-primary)' }}>
            {node.count}
          </div>
          <div style={{ width: 64, height: 4, background: 'var(--border-dim)', borderRadius: 2 }}>
            <div style={{
              width: `${(node.fraction || 0) * 100}%`,
              height: '100%',
              background: `linear-gradient(90deg, var(--blue), var(--teal))`,
              borderRadius: 2,
            }} />
          </div>
          <div style={{ fontSize: '0.62rem', color: 'var(--text-muted)' }}>
            {((node.fraction || 0) * 100).toFixed(0)}%
          </div>
        </div>
      </div>

      {/* Children */}
      {expanded && hasChildren && (
        <div>
          {node.children.map((child, i) => (
            <ScaffoldNode key={i} node={child} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  )
}

export default function ScaffoldTree({ scaffoldData }) {
  const tree = scaffoldData?.scaffold_tree?.scaffold_tree || []
  const list = scaffoldData?.scaffold_tree?.scaffold_list || []
  const diversity = scaffoldData?.diversity
  const [view, setView] = useState('list') // 'tree' | 'list'

  const numUnique   = scaffoldData?.scaffold_tree?.num_unique_scaffolds
  const numMols     = scaffoldData?.scaffold_tree?.num_molecules
  const genericScaffolds = scaffoldData?.scaffold_tree?.generic_scaffolds || {}

  return (
    <div>
      {/* Stats */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <div className="stat-card" style={{ flex: 1, minWidth: 120 }}>
          <div className="stat-label">Unique Scaffolds</div>
          <div className="stat-value">{numUnique ?? '—'}</div>
        </div>
        <div className="stat-card" style={{ flex: 1, minWidth: 120 }}>
          <div className="stat-label">Molecules</div>
          <div className="stat-value">{numMols ?? '—'}</div>
        </div>
        {diversity?.diversity_score != null && (
          <div className="stat-card" style={{ flex: 1, minWidth: 120 }}>
            <div className="stat-label">Diversity Score</div>
            <div className="stat-value" style={{
              color: diversity.diversity_score > 0.6 ? 'var(--green)' :
                diversity.diversity_score > 0.3 ? 'var(--amber)' : 'var(--red)',
            }}>
              {diversity.diversity_score.toFixed(3)}
            </div>
            <div className="stat-sub">1 − mean Tanimoto</div>
          </div>
        )}
        {diversity?.num_clusters != null && (
          <div className="stat-card" style={{ flex: 1, minWidth: 120 }}>
            <div className="stat-label">Clusters</div>
            <div className="stat-value">{diversity.num_clusters}</div>
            <div className="stat-sub">{diversity.singleton_clusters} singletons</div>
          </div>
        )}
      </div>

      {/* LLM interpretation */}
      {scaffoldData?.llm_interpretation && (
        <div className="panel" style={{ marginBottom: 16, borderLeft: '3px solid var(--green)' }}>
          <div className="panel-header">
            <span style={{ fontSize: '0.8rem', color: 'var(--green)' }}>⎇</span>
            <span className="panel-header-title">Scaffold Interpretation</span>
            {scaffoldData.dataset_type && (
              <span className={`badge ${scaffoldData.dataset_type === 'diverse' ? 'badge-teal' :
                scaffoldData.dataset_type === 'focused' ? 'badge-blue' : 'badge-amber'}`}>
                {scaffoldData.dataset_type}
              </span>
            )}
          </div>
          <div className="panel-body">
            <p style={{ fontSize: '0.83rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
              {scaffoldData.llm_interpretation}
            </p>
          </div>
        </div>
      )}

      {/* View toggle */}
      <div className="pill-tabs" style={{ marginBottom: 12, display: 'inline-flex' }}>
        <button className={`pill-tab ${view === 'list' ? 'active' : ''}`} onClick={() => setView('list')}>
          ☰ Ranked List
        </button>
        <button className={`pill-tab ${view === 'tree' ? 'active' : ''}`} onClick={() => setView('tree')}>
          ⤵ Hierarchy
        </button>
      </div>

      {view === 'list' ? (
        <div style={{ border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px',
            background: 'var(--bg-surface)', borderBottom: '1px solid var(--border-subtle)' }}>
            <span style={{ width: 16 }} />
            <span style={{ flex: 1, fontFamily: 'var(--font-display)', fontSize: '0.65rem',
              textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)' }}>
              Scaffold SMILES
            </span>
            <span style={{ width: 100, textAlign: 'right', fontFamily: 'var(--font-display)',
              fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.08em',
              color: 'var(--text-muted)' }}>
              Count / %
            </span>
          </div>
          <div style={{ maxHeight: 460, overflow: 'auto' }}>
            {list.map((s, i) => (
              <ScaffoldNode key={i} node={{ ...s, children: [] }} depth={0} />
            ))}
          </div>
        </div>
      ) : (
        <div style={{ border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
          <div style={{ maxHeight: 500, overflow: 'auto' }}>
            {tree.length === 0
              ? <div className="empty-state">No scaffold hierarchy available</div>
              : tree.map((node, i) => <ScaffoldNode key={i} node={node} depth={0} />)
            }
          </div>
        </div>
      )}

      {/* Generic scaffolds */}
      {Object.keys(genericScaffolds).length > 0 && (
        <div style={{ marginTop: 20 }}>
          <div className="section-title">Generic Scaffolds (atom-agnostic)</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {Object.entries(genericScaffolds).slice(0, 15).map(([smi, cnt]) => (
              <div key={smi} style={{
                padding: '5px 10px',
                background: 'var(--bg-card)',
                border: '1px solid var(--border-dim)',
                borderRadius: 'var(--radius-sm)',
                display: 'flex', alignItems: 'center', gap: 8,
              }}>
                <code style={{ fontFamily: 'var(--font-mono)', fontSize: '0.66rem',
                  color: 'var(--text-muted)', maxWidth: 180, overflow: 'hidden',
                  textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {truncate(smi, 30)}
                </code>
                <span className="badge badge-blue">{cnt}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
