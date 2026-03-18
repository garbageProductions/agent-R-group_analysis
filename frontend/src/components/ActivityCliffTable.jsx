import { useState, useEffect } from 'react'
import { getActivityCliffs } from '../api.js'

function saliColor(sali) {
  if (sali == null) return 'var(--text-muted)'
  if (sali > 50) return 'var(--red)'
  if (sali > 20) return 'var(--amber)'
  return 'var(--blue-l)'
}

function saliSeverity(sali) {
  if (sali == null) return null
  if (sali > 50) return { label: 'HIGH', cls: 'badge-red' }
  if (sali > 20) return { label: 'MED',  cls: 'badge-amber' }
  return { label: 'LOW', cls: 'badge-blue' }
}

function truncate(s, n = 32) { return s && s.length > n ? s.slice(0, n) + '…' : s }

export default function ActivityCliffTable({ sessionId, cliffData }) {
  const [data, setData]   = useState(cliffData || null)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (cliffData) { setData(cliffData); return }
    if (!sessionId) return
    getActivityCliffs(sessionId, 100)
      .then(setData)
      .catch(e => setError(e.message))
  }, [sessionId, cliffData])

  if (error) return <div className="empty-state">⚠ {error}</div>
  if (!data)  return <div className="empty-state">
    <div style={{ width: 22, height: 22, border: '2px solid var(--border-subtle)',
      borderTopColor: 'var(--nanome-cyan)', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
    Loading activity cliffs…
  </div>

  const cliffs = data.cliff_pairs || []
  const stats  = data.landscape_stats || {}

  return (
    <div>
      {/* Stats */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <div className="stat-card" style={{ flex: 1, minWidth: 120 }}>
          <div className="stat-label">Cliff Pairs</div>
          <div className="stat-value" style={{ color: 'var(--red)' }}>{data.num_cliff_pairs ?? 0}</div>
        </div>
        <div className="stat-card" style={{ flex: 1, minWidth: 120 }}>
          <div className="stat-label">Similar Pairs</div>
          <div className="stat-value">{data.num_similar_pairs ?? '—'}</div>
        </div>
        {stats.cliff_fraction != null && (
          <div className="stat-card" style={{ flex: 1, minWidth: 120 }}>
            <div className="stat-label">Cliff Rate</div>
            <div className="stat-value">{(stats.cliff_fraction * 100).toFixed(0)}%</div>
            <div className="stat-sub">of similar pairs</div>
          </div>
        )}
        {stats.max_sali != null && (
          <div className="stat-card" style={{ flex: 1, minWidth: 120 }}>
            <div className="stat-label">Max SALI</div>
            <div className="stat-value" style={{ color: 'var(--amber)' }}>{stats.max_sali?.toFixed(1)}</div>
          </div>
        )}
      </div>

      {/* LLM interpretation */}
      {data.llm_interpretation && (
        <div className="panel" style={{ marginBottom: 16, borderLeft: '3px solid var(--red)' }}>
          <div className="panel-header">
            <span style={{ fontSize: '0.8rem', color: 'var(--red)' }}>⚡</span>
            <span className="panel-header-title">Activity Cliff Interpretation</span>
          </div>
          <div className="panel-body">
            <p style={{ fontSize: '0.83rem', color: 'var(--text-secondary)', marginBottom: 8, lineHeight: 1.6 }}>
              {data.llm_interpretation}
            </p>
            {data.optimization_guidance && (
              <div style={{ padding: '8px 12px', background: 'rgba(239,68,68,0.07)',
                borderRadius: 'var(--radius-sm)', fontSize: '0.78rem', color: 'var(--red)' }}>
                ⚡ {data.optimization_guidance}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Sensitivity badge */}
      {data.cliff_sensitivity && (
        <div style={{ marginBottom: 12, display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>SAR Sensitivity:</div>
          <span className={`badge ${data.cliff_sensitivity === 'high' ? 'badge-red' :
            data.cliff_sensitivity === 'medium' ? 'badge-amber' : 'badge-green'}`}
            style={{ fontSize: '0.72rem' }}>
            {data.cliff_sensitivity?.toUpperCase()}
          </span>
        </div>
      )}

      <div className="panel">
        <div className="panel-header">
          <span style={{ fontSize: '0.8rem', color: 'var(--red)' }}>⚡</span>
          <span className="panel-header-title">Cliff Pairs</span>
          {cliffs.length > 0 && (
            <span className="badge badge-red" style={{ marginLeft: 4 }}>{cliffs.length}</span>
          )}
        </div>
        {cliffs.length === 0 ? (
          <div className="empty-state" style={{ padding: 32 }}>No activity cliffs found at current thresholds</div>
        ) : (
          <div className="data-table-wrap" style={{ border: 'none', borderRadius: 0, maxHeight: 480 }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Molecule A</th>
                  <th style={{ textAlign: 'right' }}>Activity A</th>
                  <th>Molecule B</th>
                  <th style={{ textAlign: 'right' }}>Activity B</th>
                  <th style={{ textAlign: 'right' }}>Tanimoto</th>
                  <th style={{ textAlign: 'right' }}>Δ Activity</th>
                  <th style={{ textAlign: 'right' }}>SALI</th>
                  <th>Severity</th>
                </tr>
              </thead>
              <tbody>
                {cliffs.map((c, i) => {
                  const severity = saliSeverity(c.sali)
                  return (
                    <tr key={i}>
                      <td style={{ color: 'var(--text-muted)', fontSize: '0.72rem' }}>{i + 1}</td>
                      <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.73rem', color: 'var(--text-code)' }}>
                        {truncate(c.mol_a_label, 20)}
                      </td>
                      <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)',
                        fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                        {c.mol_a_activity?.toFixed(3)}
                      </td>
                      <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.73rem', color: 'var(--text-code)' }}>
                        {truncate(c.mol_b_label, 20)}
                      </td>
                      <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)',
                        fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                        {c.mol_b_activity?.toFixed(3)}
                      </td>
                      <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: '0.78rem',
                        color: c.tanimoto_similarity >= 0.8 ? 'var(--teal)' : 'var(--text-secondary)' }}>
                        {c.tanimoto_similarity?.toFixed(3)}
                      </td>
                      <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 700,
                        fontSize: '0.8rem', color: 'var(--amber)' }}>
                        {c.activity_diff?.toFixed(3)}
                      </td>
                      <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 700,
                        fontSize: '0.8rem', color: saliColor(c.sali) }}>
                        {c.sali?.toFixed(1)}
                      </td>
                      <td>
                        {severity && <span className={`badge ${severity.cls}`}>{severity.label}</span>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
