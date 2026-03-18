import { useState } from 'react'
import MoleculeCard from './MoleculeCard.jsx'

const PAGE_SIZE = 20

export default function MoleculeGrid({ sessionId, smiles = [], labels = [] }) {
  const [page, setPage] = useState(0)
  const [selected, setSelected] = useState(null)

  const totalPages = Math.ceil(smiles.length / PAGE_SIZE)
  const pageSmiles = smiles.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)
  const pageLabels = labels.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

  if (smiles.length === 0) {
    return <div className="empty-state">No molecule structures available</div>
  }

  return (
    <div>
      {/* Pagination + count */}
      <div className="flex-between" style={{ marginBottom: 16 }}>
        <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
          Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, smiles.length)} of {smiles.length} molecules
        </div>
        {totalPages > 1 && (
          <div style={{ display: 'flex', gap: 6 }}>
            <button className="btn btn-ghost" style={{ padding: '5px 10px' }}
              disabled={page === 0} onClick={() => setPage(p => p - 1)}>‹ Prev</button>
            {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
              const idx = totalPages <= 7 ? i : Math.max(0, Math.min(page - 3 + i, totalPages - 7 + i))
              return (
                <button key={idx} className="btn" onClick={() => setPage(idx)}
                  style={{
                    padding: '5px 9px',
                    background: idx === page ? 'var(--nanome-cyan)' : 'transparent',
                    border: `1px solid ${idx === page ? 'var(--nanome-cyan)' : 'var(--border-dim)'}`,
                    color: idx === page ? '#000' : 'var(--text-muted)',
                    fontSize: '0.72rem',
                  }}>
                  {idx + 1}
                </button>
              )
            })}
            <button className="btn btn-ghost" style={{ padding: '5px 10px' }}
              disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>Next ›</button>
          </div>
        )}
      </div>

      {/* Grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
        gap: 12,
      }}>
        {pageSmiles.map((smi, i) => {
          const absIdx = page * PAGE_SIZE + i
          return (
            <MoleculeCard
              key={absIdx}
              sessionId={sessionId}
              index={absIdx}
              label={pageLabels[i]}
              smiles={smi}
              onClick={() => setSelected(selected === absIdx ? null : absIdx)}
            />
          )
        })}
      </div>

      {/* Selected detail */}
      {selected !== null && (
        <div className="panel" style={{ marginTop: 16 }}>
          <div className="panel-header">
            <span style={{ fontSize: '0.8rem', color: 'var(--nanome-cyan)' }}>⬡</span>
            <span className="panel-header-title">{labels[selected] || `Mol_${selected}`}</span>
            <span className="badge badge-cyan" style={{ fontSize: '0.6rem' }}>
              idx {selected}
            </span>
          </div>
        <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start', padding: 12 }}>
          <div style={{ width: 220, flexShrink: 0 }}>
            <MoleculeCard
              sessionId={sessionId}
              index={selected}
              label={labels[selected]}
              smiles={smiles[selected]}
            />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '0.64rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', marginBottom: 6 }}>SMILES</div>
            <code style={{
              fontFamily: 'var(--font-mono)', fontSize: '0.78rem',
              color: 'var(--text-code)', wordBreak: 'break-all',
              display: 'block',
              background: 'var(--bg-input)',
              padding: '10px 12px',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--border-dim)',
            }}>
              {smiles[selected]}
            </code>
          </div>
        </div>
        </div>
      )}
    </div>
  )
}
