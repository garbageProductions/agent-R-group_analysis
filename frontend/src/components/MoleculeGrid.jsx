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
                    background: idx === page ? 'var(--blue)' : 'transparent',
                    border: `1px solid ${idx === page ? 'var(--blue)' : 'var(--border-dim)'}`,
                    color: idx === page ? '#fff' : 'var(--text-muted)',
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
        <div className="card" style={{ marginTop: 16, display: 'flex', gap: 20, alignItems: 'flex-start' }}>
          <div style={{ width: 220, flexShrink: 0 }}>
            <MoleculeCard
              sessionId={sessionId}
              index={selected}
              label={labels[selected]}
              smiles={smiles[selected]}
            />
          </div>
          <div style={{ flex: 1 }}>
            <h3 style={{ marginBottom: 10 }}>{labels[selected] || `Mol_${selected}`}</h3>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: 8 }}>SMILES</div>
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
            <div style={{ marginTop: 10 }}>
              <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                Index: {selected}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
