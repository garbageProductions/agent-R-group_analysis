import { useState, useEffect } from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import { getRGroupTable } from '../api.js'

function truncate(s, n = 30) { return s && s.length > n ? s.slice(0, n) + '…' : s }

export default function RGroupTable({ sessionId }) {
  const [data, setData]   = useState(null)
  const [error, setError] = useState(null)
  const [selPos, setSelPos] = useState(null) // selected R-group position for frequency chart

  useEffect(() => {
    if (!sessionId) return
    getRGroupTable(sessionId)
      .then(d => { setData(d); setSelPos(d.columns?.find(c => c !== 'Core') || null) })
      .catch(e => setError(e.message))
  }, [sessionId])

  if (error) return <div className="empty-state">⚠ {error}</div>
  if (!data) return <div className="empty-state">
    <div style={{ width: 24, height: 24, border: '2px solid var(--border-subtle)',
      borderTopColor: 'var(--blue)', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
    Loading R-group table…
  </div>

  if (!data.rows?.length) return <div className="empty-state">No R-group decomposition data available</div>

  const rCols = (data.columns || []).filter(c => c !== 'Core')

  // Frequency chart data for selected position
  const freqData = selPos && data.rgroup_frequency?.[selPos]
    ? Object.entries(data.rgroup_frequency[selPos])
        .sort((a, b) => b[1] - a[1])
        .slice(0, 12)
        .map(([smi, cnt]) => ({ name: truncate(smi, 20), smiles: smi, count: cnt }))
    : []

  return (
    <div>
      {/* Core display */}
      {data.core_smarts && (
        <div className="card" style={{ marginBottom: 16, padding: '12px 16px' }}>
          <div className="card-title">Common Core</div>
          <code style={{ fontFamily: 'var(--font-mono)', fontSize: '0.78rem', color: 'var(--text-code)' }}>
            {data.core_smarts}
          </code>
          {data.success_rate != null && (
            <div style={{ marginTop: 8, fontSize: '0.74rem', color: 'var(--text-muted)' }}>
              Coverage: <span style={{ color: 'var(--teal-l)' }}>{(data.success_rate * 100).toFixed(1)}%</span>
              &nbsp;of molecules matched
            </div>
          )}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 16, alignItems: 'start' }}>
        {/* Decomposition table */}
        <div>
          <div className="section-title" style={{ marginBottom: 8 }}>Decomposition Table</div>
          <div className="data-table-wrap" style={{ maxHeight: 460 }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Label</th>
                  {data.columns?.map(col => <th key={col}>{col}</th>)}
                </tr>
              </thead>
              <tbody>
                {data.rows.map((row, i) => (
                  <tr key={i}>
                    <td style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: '0.72rem' }}>
                      {row.label || row.index}
                    </td>
                    {data.columns?.map(col => {
                      const val = row[col] || ''
                      const freq = data.rgroup_frequency?.[col]?.[val] || 0
                      const maxFreq = data.rgroup_frequency?.[col]
                        ? Math.max(...Object.values(data.rgroup_frequency[col]))
                        : 1
                      const isCommon = freq > 0 && freq / maxFreq > 0.5
                      return (
                        <td key={col} className="mono"
                          style={{
                            background: isCommon && col !== 'Core' ? 'rgba(20,184,166,0.06)' : 'transparent',
                            color: col === 'Core' ? 'var(--text-secondary)' : 'var(--text-code)',
                          }}>
                          <div className="tooltip-wrap">
                            {truncate(val, 28)}
                            {val.length > 28 && <div className="tooltip" style={{ whiteSpace: 'normal', width: 280 }}>{val}</div>}
                          </div>
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Frequency chart */}
        <div>
          <div className="section-title" style={{ marginBottom: 8 }}>Substituent Frequency</div>
          <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
            {rCols.map(col => (
              <button key={col}
                className={`btn ${selPos === col ? 'btn-teal' : 'btn-ghost'}`}
                style={{ padding: '4px 10px', fontSize: '0.7rem' }}
                onClick={() => setSelPos(col)}>
                {col}
              </button>
            ))}
          </div>

          {freqData.length > 0 ? (
            <div style={{
              background: 'var(--bg-card)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius)',
              padding: '12px 8px 4px',
            }}>
              <ResponsiveContainer width="100%" height={Math.max(160, freqData.length * 28)}>
                <BarChart data={freqData} layout="vertical" margin={{ left: 8, right: 16, top: 0, bottom: 0 }}>
                  <XAxis type="number" tick={{ fill: 'var(--text-muted)', fontSize: 10 }} />
                  <YAxis type="category" dataKey="name" width={100}
                    tick={{ fill: 'var(--text-code)', fontSize: 10, fontFamily: 'JetBrains Mono' }} />
                  <Tooltip
                    contentStyle={{ background: 'var(--bg-card-hi)', border: '1px solid var(--border-default)',
                      borderRadius: 4, fontSize: 11 }}
                    cursor={{ fill: 'rgba(59,130,246,0.05)' }}
                    formatter={(v, n, p) => [v, 'Count']}
                    labelFormatter={(l, payload) => payload?.[0]?.payload?.smiles || l}
                  />
                  <Bar dataKey="count" radius={[0,2,2,0]}>
                    {freqData.map((_, i) => (
                      <Cell key={i} fill={i === 0 ? 'var(--teal)' : i === freqData.length - 1 ? 'var(--blue)' : 'var(--blue-l)'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="empty-state" style={{ padding: 24 }}>Select a position</div>
          )}
        </div>
      </div>
    </div>
  )
}
