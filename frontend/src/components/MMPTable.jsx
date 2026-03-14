import { useState, useEffect } from 'react'
import { getMMPTransforms } from '../api.js'

function truncate(s, n = 28) { return s && s.length > n ? s.slice(0, n) + '…' : s }

function DeltaCell({ value }) {
  if (value == null) return <td>—</td>
  const cls = value > 0.05 ? 'delta-pos' : value < -0.05 ? 'delta-neg' : 'delta-neu'
  const sign = value > 0 ? '+' : ''
  return (
    <td className={cls} style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', fontWeight: 600 }}>
      {sign}{value.toFixed(3)}
    </td>
  )
}

export default function MMPTable({ sessionId, mmpData, propertyNames = [] }) {
  const [selectedProp, setSelectedProp] = useState(propertyNames[0] || '')
  const [transforms, setTransforms]     = useState([])
  const [loading, setLoading]           = useState(false)
  const [error, setError]               = useState(null)

  // Use pre-loaded mmpData if available, else fetch
  useEffect(() => {
    if (mmpData?.top_transforms_by_property && selectedProp) {
      setTransforms(mmpData.top_transforms_by_property[selectedProp] || [])
      return
    }
    if (!sessionId) return
    setLoading(true)
    setError(null)
    getMMPTransforms(sessionId, selectedProp, 80)
      .then(d => setTransforms(d.transforms || []))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [sessionId, selectedProp, mmpData])

  useEffect(() => {
    if (propertyNames.length > 0 && !selectedProp) setSelectedProp(propertyNames[0])
  }, [propertyNames])

  const numPairs   = mmpData?.num_pairs
  const allProps   = propertyNames.length > 0 ? propertyNames
    : mmpData?.property_names || []

  if (error) return <div className="empty-state">⚠ {error}</div>

  return (
    <div>
      {/* Stats + LLM insights */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <div className="stat-card" style={{ flex: 1, minWidth: 120 }}>
          <div className="stat-label">MMP Pairs</div>
          <div className="stat-value">{numPairs ?? transforms.length}</div>
        </div>
        <div className="stat-card" style={{ flex: 1, minWidth: 120 }}>
          <div className="stat-label">Unique Transforms</div>
          <div className="stat-value">
            {mmpData?.transforms ? Object.keys(mmpData.transforms).length : transforms.length}
          </div>
        </div>
        {allProps.length > 0 && (
          <div className="stat-card" style={{ flex: 2, minWidth: 200 }}>
            <div className="stat-label">Properties Analysed</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
              {allProps.map(p => <span key={p} className="badge badge-teal">{p}</span>)}
            </div>
          </div>
        )}
      </div>

      {mmpData?.llm_insights && typeof mmpData.llm_insights === 'object' && (
        <div className="card" style={{ marginBottom: 16, borderLeft: '3px solid var(--purple)' }}>
          <div className="card-title">MMP Insights</div>
          {mmpData.llm_insights.sar_trends && (
            <p style={{ fontSize: '0.83rem', color: 'var(--text-secondary)', marginBottom: 8 }}>
              {mmpData.llm_insights.sar_trends}
            </p>
          )}
          {mmpData.llm_insights.actionable_recommendation && (
            <div style={{ padding: '8px 12px', background: 'rgba(167,139,250,0.07)',
              borderRadius: 'var(--radius-sm)', fontSize: '0.78rem', color: 'var(--purple)' }}>
              💡 {mmpData.llm_insights.actionable_recommendation}
            </div>
          )}
        </div>
      )}

      {/* Property selector */}
      {allProps.length > 0 && (
        <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
          {allProps.map(p => (
            <button key={p}
              className={`btn ${selectedProp === p ? 'btn-teal' : 'btn-ghost'}`}
              style={{ padding: '5px 12px', fontSize: '0.72rem' }}
              onClick={() => setSelectedProp(p)}>
              {p}
            </button>
          ))}
        </div>
      )}

      {/* Transform table */}
      {loading ? (
        <div className="empty-state">
          <div style={{ width: 22, height: 22, border: '2px solid var(--border-subtle)',
            borderTopColor: 'var(--blue)', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
        </div>
      ) : transforms.length === 0 ? (
        <div className="empty-state">No transforms found for this property</div>
      ) : (
        <div className="data-table-wrap" style={{ maxHeight: 480 }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>#</th>
                <th>From Fragment</th>
                <th>→</th>
                <th>To Fragment</th>
                <th style={{ textAlign: 'right' }}>Δ {selectedProp || 'Property'}</th>
                <th style={{ textAlign: 'right' }}>Count</th>
              </tr>
            </thead>
            <tbody>
              {transforms.map((t, i) => {
                const delta = t.mean_delta ?? t.mean_deltas?.[selectedProp]
                return (
                  <tr key={i}>
                    <td style={{ color: 'var(--text-muted)', fontSize: '0.72rem' }}>{i + 1}</td>
                    <td>
                      <div className="tooltip-wrap">
                        <code style={{ fontFamily: 'var(--font-mono)', fontSize: '0.73rem',
                          color: 'var(--text-code)' }}>{truncate(t.from || t.from_frag, 28)}</code>
                        {(t.from || t.from_frag)?.length > 28 && (
                          <div className="tooltip" style={{ whiteSpace: 'normal', width: 260 }}>
                            {t.from || t.from_frag}
                          </div>
                        )}
                      </div>
                    </td>
                    <td style={{ color: 'var(--text-muted)', fontSize: '1rem' }}>→</td>
                    <td>
                      <div className="tooltip-wrap">
                        <code style={{ fontFamily: 'var(--font-mono)', fontSize: '0.73rem',
                          color: 'var(--text-code)' }}>{truncate(t.to || t.to_frag, 28)}</code>
                        {(t.to || t.to_frag)?.length > 28 && (
                          <div className="tooltip" style={{ whiteSpace: 'normal', width: 260 }}>
                            {t.to || t.to_frag}
                          </div>
                        )}
                      </div>
                    </td>
                    <DeltaCell value={delta} />
                    <td style={{ textAlign: 'right', color: 'var(--text-muted)' }}>
                      <span className="badge badge-blue">{t.count}</span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
