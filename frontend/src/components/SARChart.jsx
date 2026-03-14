import { useState, useEffect } from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, ErrorBar, ReferenceLine } from 'recharts'

function truncate(s, n = 22) { return s && s.length > n ? s.slice(0, n) + '…' : s }

function valColor(val, min, max) {
  if (max === min) return 'var(--blue)'
  const norm = (val - min) / (max - min)
  if (norm >= 0.7) return 'var(--green)'
  if (norm <= 0.3) return 'var(--red)'
  return 'var(--amber)'
}

export default function SARChart({ sarData, propertyName }) {
  const [selPos, setSelPos] = useState(null)

  const analyses = sarData?.rgroup_analyses || {}
  const positions = Object.keys(analyses)

  useEffect(() => {
    if (positions.length > 0 && !selPos) setSelPos(positions[0])
  }, [positions])

  if (!sarData || positions.length === 0) {
    return <div className="empty-state">
      No SAR ranking data available.
      {!propertyName && ' (No property of interest was specified.)'}
    </div>
  }

  const posData = analyses[selPos] || {}
  const chartData = Object.entries(posData)
    .map(([smi, stats]) => ({
      name: truncate(smi, 20),
      smiles: smi,
      mean: parseFloat(stats.mean?.toFixed(3) || 0),
      std: parseFloat(stats.std?.toFixed(3) || 0),
      n: stats.n,
      delta: parseFloat(stats.delta_from_global_mean?.toFixed(3) || 0),
    }))
    .sort((a, b) => b.mean - a.mean)

  const means = chartData.map(d => d.mean)
  const minVal = Math.min(...means)
  const maxVal = Math.max(...means)
  const globalMean = sarData.global_property_stats?.mean

  const importance = sarData.position_importance || {}
  const ranked = sarData.ranked_substituents || {}
  const best = sarData.best_substituents || {}
  const worst = sarData.worst_substituents || {}

  return (
    <div>
      {/* Global stats */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        <div className="stat-card" style={{ flex: 1, minWidth: 130 }}>
          <div className="stat-label">Property</div>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700,
            fontSize: '1rem', color: 'var(--blue-l)' }}>{propertyName}</div>
        </div>
        {['mean','min','max','n'].map(k => (
          <div key={k} className="stat-card" style={{ flex: 1, minWidth: 100 }}>
            <div className="stat-label">{k === 'n' ? 'Obs.' : k.charAt(0).toUpperCase() + k.slice(1)}</div>
            <div className="stat-value" style={{ fontSize: '1.2rem' }}>
              {typeof sarData.global_property_stats?.[k] === 'number'
                ? sarData.global_property_stats[k].toFixed(3)
                : sarData.global_property_stats?.[k]}
            </div>
          </div>
        ))}
      </div>

      {/* LLM narrative */}
      {sarData.llm_sar_narrative && (
        <div className="card" style={{ marginBottom: 16, borderLeft: '3px solid var(--teal)' }}>
          <div className="card-title">SAR Interpretation</div>
          <p style={{ fontSize: '0.83rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
            {sarData.llm_sar_narrative}
          </p>
          {sarData.llm_design_hypothesis && (
            <div style={{ marginTop: 10, padding: '8px 12px',
              background: 'rgba(20,184,166,0.07)', borderRadius: 'var(--radius-sm)',
              fontSize: '0.78rem', color: 'var(--teal-l)' }}>
              💡 {sarData.llm_design_hypothesis}
            </div>
          )}
        </div>
      )}

      {/* Position tabs + importance */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
        {positions.map(pos => {
          const imp = importance[pos]
          return (
            <button key={pos}
              className={`btn ${selPos === pos ? 'btn-teal' : 'btn-ghost'}`}
              style={{ padding: '5px 12px', fontSize: '0.72rem' }}
              onClick={() => setSelPos(pos)}>
              {pos}
              {imp != null && (
                <span style={{ marginLeft: 4, fontFamily: 'var(--font-mono)',
                  color: selPos === pos ? 'inherit' : 'var(--text-muted)' }}>
                  {(imp * 100).toFixed(0)}%
                </span>
              )}
            </button>
          )
        })}
        {positions.length > 1 && (
          <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginLeft: 8 }}>
            (% = ANOVA importance)
          </span>
        )}
      </div>

      {/* Best / worst */}
      {selPos && (
        <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
          {best[selPos] && (
            <div className="card" style={{ padding: '8px 12px', borderLeft: '3px solid var(--green)', flex: 1 }}>
              <div className="card-title" style={{ color: 'var(--green)', marginBottom: 4 }}>Best Substituent</div>
              <code style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--text-code)',
                wordBreak: 'break-all' }}>
                {best[selPos]}
              </code>
            </div>
          )}
          {worst[selPos] && (
            <div className="card" style={{ padding: '8px 12px', borderLeft: '3px solid var(--red)', flex: 1 }}>
              <div className="card-title" style={{ color: 'var(--red)', marginBottom: 4 }}>Worst Substituent</div>
              <code style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--text-code)',
                wordBreak: 'break-all' }}>
                {worst[selPos]}
              </code>
            </div>
          )}
        </div>
      )}

      {/* Bar chart */}
      {chartData.length > 0 && (
        <div style={{
          background: 'var(--bg-card)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 'var(--radius)',
          padding: '16px 12px 8px',
        }}>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: 8, marginLeft: 8 }}>
            Mean {propertyName} by substituent at position {selPos}
          </div>
          <ResponsiveContainer width="100%" height={Math.max(200, chartData.length * 30)}>
            <BarChart data={chartData} layout="vertical"
              margin={{ left: 4, right: 40, top: 4, bottom: 4 }}>
              <XAxis type="number"
                tick={{ fill: 'var(--text-muted)', fontSize: 10 }}
                domain={['auto', 'auto']} />
              <YAxis type="category" dataKey="name" width={130}
                tick={{ fill: 'var(--text-code)', fontSize: 10, fontFamily: 'JetBrains Mono' }} />
              {globalMean != null && (
                <ReferenceLine x={globalMean} stroke="var(--text-muted)"
                  strokeDasharray="4 2" label={{ value: 'μ', fill: 'var(--text-muted)', fontSize: 10 }} />
              )}
              <Tooltip
                contentStyle={{ background: 'var(--bg-card-hi)', border: '1px solid var(--border-default)',
                  borderRadius: 4, fontSize: 11 }}
                cursor={{ fill: 'rgba(59,130,246,0.05)' }}
                formatter={(v, n, p) => {
                  const d = p.payload
                  return [`${v.toFixed(3)} (n=${d.n}, σ=${d.std})`, propertyName]
                }}
                labelFormatter={(l, p) => p?.[0]?.payload?.smiles || l}
              />
              <Bar dataKey="mean" radius={[0,3,3,0]}>
                {chartData.map((entry, i) => (
                  <Cell key={i} fill={valColor(entry.mean, minVal, maxVal)} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* ANOVA F-scores */}
      {Object.keys(sarData.anova_f_scores || {}).length > 0 && (
        <div style={{ marginTop: 16 }}>
          <div className="section-title">ANOVA F-scores by Position</div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {Object.entries(sarData.anova_f_scores).map(([pos, f]) => (
              <div key={pos} className="stat-card" style={{ minWidth: 100 }}>
                <div className="stat-label">{pos}</div>
                <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700,
                  fontSize: '1.2rem', color: f > 5 ? 'var(--green)' : f > 2 ? 'var(--amber)' : 'var(--text-secondary)' }}>
                  {f?.toFixed(2) ?? 'N/A'}
                </div>
                <div className="stat-sub">F-statistic</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
