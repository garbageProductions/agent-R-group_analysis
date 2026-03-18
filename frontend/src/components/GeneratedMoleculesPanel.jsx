import { getSmilesSvgUrl } from '../api.js'

const SCORE_BAR_COLOR = 'var(--nanome-cyan)'

function ScoreBar({ value }) {
  const pct = Math.round((value || 0) * 100)
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <div style={{
        flex: 1, height: 5, background: 'var(--border-subtle)',
        borderRadius: 3, overflow: 'hidden',
      }}>
        <div style={{ width: `${pct}%`, height: '100%', background: SCORE_BAR_COLOR, borderRadius: 3 }} />
      </div>
      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', minWidth: 28, textAlign: 'right' }}>
        {(value || 0).toFixed(2)}
      </span>
    </div>
  )
}

function IterationBadge({ iteration }) {
  return (
    <span style={{
      display: 'inline-block', padding: '1px 7px', borderRadius: 999,
      fontSize: '0.7rem', fontWeight: 600, letterSpacing: '0.04em',
      background: 'rgba(0,188,212,0.1)', color: 'var(--nanome-cyan)',
      border: '1px solid rgba(0,188,212,0.3)',
    }}>
      iter {iteration}
    </span>
  )
}

export default function GeneratedMoleculesPanel({ generativeData }) {
  if (!generativeData) {
    return (
      <div style={{ color: 'var(--text-muted)', padding: 40, textAlign: 'center', fontSize: '0.85rem' }}>
        Enable <strong>Generative Design</strong> in the analysis configuration to generate novel R-group variants with REINVENT4.
      </div>
    )
  }

  const { top_molecules = [], iteration_history = [], converged_status, scoring_mode_used } = generativeData

  if (generativeData.error) {
    return (
      <div style={{
        padding: 20, background: 'var(--bg-card)', borderRadius: 'var(--radius)',
        border: '1px solid rgba(255,80,80,0.3)', color: 'var(--text-muted)',
      }}>
        <strong style={{ color: '#ff6b6b' }}>Generative design error:</strong> {generativeData.error}
      </div>
    )
  }

  const statusColor = {
    converged: '#4ade80',
    budget_exhausted: '#facc15',
    error: '#f87171',
  }[converged_status] || 'var(--text-muted)'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* Summary bar */}
      <div style={{
        display: 'flex', gap: 16, flexWrap: 'wrap',
        background: 'var(--bg-card)', border: '1px solid var(--border-subtle)',
        borderRadius: 'var(--radius)', padding: '12px 16px',
        fontSize: '0.82rem',
      }}>
        <div>
          <span style={{ color: 'var(--text-muted)' }}>Status: </span>
          <span style={{ color: statusColor, fontWeight: 600, textTransform: 'capitalize' }}>
            {converged_status?.replace('_', ' ') || '—'}
          </span>
        </div>
        <div>
          <span style={{ color: 'var(--text-muted)' }}>Molecules generated: </span>
          <span style={{ fontWeight: 600 }}>{top_molecules.length}</span>
        </div>
        <div>
          <span style={{ color: 'var(--text-muted)' }}>Iterations: </span>
          <span style={{ fontWeight: 600 }}>{iteration_history.length}</span>
        </div>
        <div>
          <span style={{ color: 'var(--text-muted)' }}>Scoring: </span>
          <span style={{ fontWeight: 600, textTransform: 'capitalize' }}>{scoring_mode_used || '—'}</span>
        </div>
      </div>

      {/* Iteration history */}
      {iteration_history.length > 0 && (
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
          <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--border-subtle)', fontSize: '0.82rem', fontWeight: 600 }}>
            Iteration History
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
              <thead>
                <tr style={{ background: 'var(--bg-elevated)' }}>
                  {['Iter', 'Mean Score', 'Top-10 Score', 'Diversity', 'Action'].map(h => (
                    <th key={h} style={{ padding: '7px 12px', textAlign: 'left', color: 'var(--text-muted)', fontWeight: 500 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {iteration_history.map((row, i) => (
                  <tr key={i} style={{ borderTop: '1px solid var(--border-subtle)' }}>
                    <td style={{ padding: '7px 12px' }}>{row.iteration}</td>
                    <td style={{ padding: '7px 12px' }}>{(row.mean_score || 0).toFixed(3)}</td>
                    <td style={{ padding: '7px 12px' }}>{(row.top10_score || 0).toFixed(3)}</td>
                    <td style={{ padding: '7px 12px' }}>{(row.internal_diversity || 0).toFixed(3)}</td>
                    <td style={{ padding: '7px 12px' }}>
                      <span style={{
                        padding: '2px 8px', borderRadius: 999, fontSize: '0.72rem', fontWeight: 600,
                        background: {
                          continue: 'rgba(74,222,128,0.1)', escape: 'rgba(250,204,21,0.1)',
                          reweight: 'rgba(96,165,250,0.1)', stop: 'rgba(0,188,212,0.1)',
                        }[row.action_taken] || 'var(--border-subtle)',
                        color: {
                          continue: '#4ade80', escape: '#facc15',
                          reweight: '#60a5fa', stop: 'var(--nanome-cyan)',
                        }[row.action_taken] || 'var(--text-muted)',
                      }}>
                        {row.action_taken || '—'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Top molecules grid */}
      {top_molecules.length > 0 && (
        <div>
          <div style={{ fontSize: '0.82rem', fontWeight: 600, marginBottom: 12 }}>
            Top Generated Molecules
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12 }}>
            {top_molecules.map((mol, i) => (
              <div key={i} style={{
                background: 'var(--bg-card)', border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius)', overflow: 'hidden',
              }}>
                {mol.canonical_smiles && (
                  <div style={{ background: 'var(--bg-elevated)', display: 'flex', justifyContent: 'center', padding: 8 }}>
                    <img
                      src={getSmilesSvgUrl(mol.canonical_smiles, 220, 160)}
                      alt={mol.canonical_smiles}
                      style={{ maxWidth: 220, maxHeight: 160 }}
                    />
                  </div>
                )}
                <div style={{ padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{
                      fontSize: '0.72rem', color: 'var(--text-muted)', fontFamily: 'monospace',
                      maxWidth: '70%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      {mol.canonical_smiles || mol.smiles}
                    </span>
                    {mol.iteration != null && <IterationBadge iteration={mol.iteration} />}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: 1 }}>Composite</div>
                    <ScoreBar value={mol.composite_score} />
                    {mol.qsar_score > 0 && (
                      <>
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 3 }}>QSAR</div>
                        <ScoreBar value={mol.qsar_score} />
                      </>
                    )}
                    {mol.qed > 0 && (
                      <>
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 3 }}>QED</div>
                        <ScoreBar value={mol.qed} />
                      </>
                    )}
                    {mol.sa_score > 0 && (
                      <>
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 3 }}>SA Score</div>
                        <ScoreBar value={mol.sa_score} />
                      </>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {top_molecules.length === 0 && (
        <div style={{ color: 'var(--text-muted)', padding: 20, textAlign: 'center', fontSize: '0.85rem' }}>
          No molecules were generated.
        </div>
      )}
    </div>
  )
}
