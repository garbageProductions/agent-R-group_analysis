import { useState, useEffect } from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import { getRGroupTable } from '../api.js'
import DotMenu from './DotMenu.jsx'

function truncate(s, n = 30) { return s && s.length > n ? s.slice(0, n) + '…' : s }

export default function RGroupTable({ sessionId }) {
  const [data, setData]     = useState(null)
  const [error, setError]   = useState(null)
  const [selPos, setSelPos] = useState(null)
  const [search, setSearch] = useState('')

  useEffect(() => {
    if (!sessionId) return
    getRGroupTable(sessionId)
      .then(d => { setData(d); setSelPos(d.columns?.find(c => c !== 'Core') || null) })
      .catch(e => setError(e.message))
  }, [sessionId])

  if (error) return <div className="empty-state">⚠ {error}</div>
  if (!data) return (
    <div className="empty-state">
      <div style={{ width: 24, height: 24, border: '2px solid var(--border-subtle)',
        borderTopColor: 'var(--nanome-cyan)', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
      Loading R-group table…
    </div>
  )
  if (!data.rows?.length) return <div className="empty-state">No R-group decomposition data available</div>

  const rCols = (data.columns || []).filter(c => c !== 'Core')

  const filteredRows = search
    ? data.rows.filter(row =>
        Object.values(row).some(v => String(v).toLowerCase().includes(search.toLowerCase()))
      )
    : data.rows

  const freqData = selPos && data.rgroup_frequency?.[selPos]
    ? Object.entries(data.rgroup_frequency[selPos])
        .sort((a, b) => b[1] - a[1])
        .slice(0, 12)
        .map(([smi, cnt]) => ({ name: truncate(smi, 20), smiles: smi, count: cnt }))
    : []

  return (
    <div>
      {/* Core SMARTS panel */}
      {data.core_smarts && (
        <div className="panel" style={{ marginBottom: 14 }}>
          <div className="panel-header">
            <span style={{ fontSize: '0.8rem', color: 'var(--nanome-cyan)' }}>◎</span>
            <span className="panel-header-title">Common Core</span>
            {data.success_rate != null && (
              <span className="panel-header-actions">
                <span className="badge badge-cyan">
                  {(data.success_rate * 100).toFixed(1)}% coverage
                </span>
              </span>
            )}
          </div>
          <div className="panel-body">
            <code style={{ fontFamily: 'var(--font-mono)', fontSize: '0.82rem', color: 'var(--text-code)' }}>
              {data.core_smarts}
            </code>
          </div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 14, alignItems: 'start' }}>

        {/* Decomposition table */}
        <div className="panel">
          <div className="panel-header">
            <span style={{ fontSize: '0.8rem', color: 'var(--blue-l)' }}>⊕</span>
            <span className="panel-header-title">Decomposition Table</span>
            <span style={{ fontSize: '0.71rem', color: 'var(--text-muted)', marginLeft: 6 }}>
              {filteredRows.length} / {data.rows.length} rows
            </span>
            <div className="panel-header-actions">
              {/* Search */}
              <div className="search-input-wrap" style={{ width: 160 }}>
                <span className="search-icon">🔍</span>
                <input className="input" type="text" placeholder="Filter rows…"
                  value={search} onChange={e => setSearch(e.target.value)}
                  style={{ fontSize: '0.76rem', padding: '4px 6px 4px 26px', height: 26 }} />
              </div>
              <DotMenu items={[
                { icon: '⬇', label: 'Export CSV',        action: () => {} },
                { icon: '⧉', label: 'Copy to clipboard', action: () => {} },
                { divider: true },
                { icon: '↺', label: 'Reload data',       action: () => {} },
              ]} />
            </div>
          </div>
          <div className="data-table-wrap" style={{ border: 'none', borderRadius: 0, maxHeight: 420 }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Label</th>
                  {data.columns?.map(col => (
                    <th key={col} className="sortable">{col}</th>
                  ))}
                  <th className="th-actions" style={{ width: 36 }} />
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((row, i) => (
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
                            background: isCommon && col !== 'Core' ? 'rgba(0,196,212,0.06)' : 'transparent',
                            color: col === 'Core' ? 'var(--text-secondary)' : 'var(--text-code)',
                          }}>
                          <div className="tooltip-wrap">
                            {truncate(val, 28)}
                            {val.length > 28 && (
                              <div className="tooltip" style={{ whiteSpace: 'normal', width: 280 }}>{val}</div>
                            )}
                          </div>
                        </td>
                      )
                    })}
                    <td className="actions">
                      <div className="row-actions">
                        <DotMenu direction="down" align="right" items={[
                          { icon: '⊕', label: 'Zoom to',        action: () => {} },
                          { icon: '⧉', label: 'Copy SMILES',    action: () => {} },
                          { icon: '🏷', label: 'Add annotation', action: () => {} },
                          { divider: true },
                          { icon: '⚡', label: 'Find cliffs',    action: () => {} },
                        ]} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Frequency chart panel */}
        <div className="panel">
          <div className="panel-header">
            <span style={{ fontSize: '0.8rem', color: 'var(--teal-l)' }}>◐</span>
            <span className="panel-header-title">Substituent Frequency</span>
          </div>
          <div className="panel-body">
            {/* Position pills */}
            <div className="pill-tabs" style={{ marginBottom: 12 }}>
              {rCols.map(col => (
                <button key={col}
                  className={`pill-tab ${selPos === col ? 'active' : ''}`}
                  onClick={() => setSelPos(col)}>
                  {col}
                </button>
              ))}
            </div>

            {freqData.length > 0 ? (
              <ResponsiveContainer width="100%" height={Math.max(140, freqData.length * 28)}>
                <BarChart data={freqData} layout="vertical" margin={{ left: 0, right: 16, top: 0, bottom: 0 }}>
                  <XAxis type="number" tick={{ fill: 'var(--text-muted)', fontSize: 10 }} />
                  <YAxis type="category" dataKey="name" width={100}
                    tick={{ fill: 'var(--text-code)', fontSize: 10, fontFamily: 'JetBrains Mono' }} />
                  <Tooltip
                    contentStyle={{ background: 'var(--bg-popup)', border: '1px solid var(--border-default)',
                      borderRadius: 6, fontSize: 11 }}
                    cursor={{ fill: 'rgba(0,196,212,0.05)' }}
                    formatter={(v) => [v, 'Count']}
                    labelFormatter={(l, payload) => payload?.[0]?.payload?.smiles || l}
                  />
                  <Bar dataKey="count" radius={[0, 3, 3, 0]}>
                    {freqData.map((_, i) => (
                      <Cell key={i}
                        fill={i === 0 ? 'var(--nanome-cyan)' : `rgba(0,196,212,${0.7 - i * 0.04})`} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="empty-state" style={{ padding: 24 }}>Select a position</div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
