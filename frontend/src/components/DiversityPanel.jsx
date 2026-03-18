import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, BarChart, Bar, XAxis, YAxis } from 'recharts'
import MoleculeCard from './MoleculeCard.jsx'

const COLORS = ['var(--blue)', 'var(--teal)', 'var(--amber)', 'var(--purple)', 'var(--green)']

export default function DiversityPanel({ diversityData, sessionId, allSmiles = [], allLabels = [] }) {
  if (!diversityData) return <div className="empty-state">No diversity analysis data</div>

  const { diversity_score, mean_tanimoto, num_clusters, singleton_clusters,
    clusters, cluster_sizes, diverse_subset, diverse_subset_smiles,
    coverage_stats, num_molecules } = diversityData

  // Cluster size chart
  const sizeChartData = Object.entries(cluster_sizes || {})
    .sort((a, b) => (parseInt(a[0]) || 99) - (parseInt(b[0]) || 99))
    .map(([size, count]) => ({ size, count }))

  // Find indices of diverse subset molecules in allLabels
  const diverseIndices = diverse_subset?.map(lab => allLabels.indexOf(lab)).filter(i => i >= 0)

  return (
    <div>
      {/* Stats */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        <div className="stat-card" style={{ flex: 1, minWidth: 130 }}>
          <div className="stat-label">Diversity Score</div>
          <div className="stat-value" style={{
            color: diversity_score > 0.6 ? 'var(--green)' :
              diversity_score > 0.3 ? 'var(--amber)' : 'var(--red)',
          }}>
            {diversity_score?.toFixed(3) ?? '—'}
          </div>
          <div className="stat-sub">1 − mean Tanimoto</div>
        </div>
        <div className="stat-card" style={{ flex: 1, minWidth: 130 }}>
          <div className="stat-label">Mean Tanimoto</div>
          <div className="stat-value">{mean_tanimoto?.toFixed(3) ?? '—'}</div>
          <div className="stat-sub">avg pairwise similarity</div>
        </div>
        <div className="stat-card" style={{ flex: 1, minWidth: 130 }}>
          <div className="stat-label">Clusters</div>
          <div className="stat-value">{num_clusters ?? '—'}</div>
          <div className="stat-sub">
            {singleton_clusters != null
              ? `${singleton_clusters} singleton${singleton_clusters !== 1 ? 's' : ''}`
              : ''}
          </div>
        </div>
        <div className="stat-card" style={{ flex: 1, minWidth: 130 }}>
          <div className="stat-label">Molecules</div>
          <div className="stat-value">{num_molecules ?? '—'}</div>
        </div>
        {coverage_stats?.fraction_within_0_6 != null && (
          <div className="stat-card" style={{ flex: 1, minWidth: 130 }}>
            <div className="stat-label">Coverage (≥0.6)</div>
            <div className="stat-value">
              {(coverage_stats.fraction_within_0_6 * 100).toFixed(0)}%
            </div>
            <div className="stat-sub">covered by diverse subset</div>
          </div>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        {/* Cluster size distribution */}
        <div>
          <div className="section-title" style={{ marginBottom: 10 }}>Cluster Size Distribution</div>
          <div style={{
            background: 'var(--bg-card)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius)',
            padding: '14px 10px 8px',
          }}>
            {sizeChartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={160}>
                <BarChart data={sizeChartData} margin={{ left: -8, right: 8, top: 0, bottom: 0 }}>
                  <XAxis dataKey="size" tick={{ fill: 'var(--text-muted)', fontSize: 10 }}
                    label={{ value: 'Cluster size', fill: 'var(--text-muted)', fontSize: 10, position: 'insideBottom', offset: -2 }} />
                  <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 10 }} />
                  <Tooltip
                    contentStyle={{ background: 'var(--bg-card-hi)', border: '1px solid var(--border-default)',
                      borderRadius: 4, fontSize: 11 }}
                    formatter={(v) => [v, 'Clusters']}
                  />
                  <Bar dataKey="count" fill="var(--blue)" radius={[2,2,0,0]}>
                    {sizeChartData.map((_, i) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="empty-state" style={{ padding: 20 }}>No cluster data</div>
            )}
          </div>

          {/* Diversity meter */}
          <div className="panel" style={{ marginTop: 14 }}>
            <div className="panel-header">
              <span style={{ fontSize: '0.8rem', color: 'var(--nanome-cyan)' }}>⦿</span>
              <span className="panel-header-title">Diversity Meter</span>
            </div>
            <div className="panel-body">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ flex: 1, height: 6, background: 'var(--border-dim)', borderRadius: 4 }}>
                  <div style={{
                    width: `${(diversity_score || 0) * 100}%`,
                    height: '100%',
                    background: diversity_score > 0.6 ? 'var(--green)' :
                      diversity_score > 0.3 ? 'var(--amber)' : 'var(--red)',
                    borderRadius: 4,
                    transition: 'width 0.8s ease',
                  }} />
                </div>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.78rem',
                  color: 'var(--text-primary)', width: 40, textAlign: 'right' }}>
                  {diversity_score?.toFixed(2)}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between',
                fontSize: '0.62rem', color: 'var(--text-muted)', marginTop: 6 }}>
                <span>Homogeneous (0)</span>
                <span>Maximally diverse (1)</span>
              </div>
            </div>
          </div>
        </div>

        {/* Diverse subset */}
        <div>
          <div className="section-title" style={{ marginBottom: 10 }}>
            MaxMin Diverse Subset ({diverse_subset?.length ?? 0} molecules)
          </div>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))',
            gap: 8,
            maxHeight: 380,
            overflowY: 'auto',
          }}>
            {(diverse_subset || []).map((label, i) => {
              const molIdx = allLabels.indexOf(label)
              const smi = molIdx >= 0 ? allSmiles[molIdx] : (diverse_subset_smiles?.[i] || '')
              return (
                <MoleculeCard
                  key={i}
                  sessionId={molIdx >= 0 ? sessionId : null}
                  index={molIdx >= 0 ? molIdx : null}
                  label={label}
                  smiles={smi}
                />
              )
            })}
            {(!diverse_subset || diverse_subset.length === 0) && (
              <div className="empty-state" style={{ gridColumn: '1/-1' }}>
                No diverse subset data
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Top clusters */}
      {clusters && Object.keys(clusters).length > 0 && (
        <div style={{ marginTop: 20 }}>
          <div className="section-title">Largest Clusters</div>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
            gap: 10,
          }}>
            {Object.entries(clusters)
              .sort((a, b) => b[1].length - a[1].length)
              .slice(0, 6)
              .map(([leader, members], i) => (
                <div key={leader} className="panel">
                  <div className="panel-header">
                    <span style={{ fontSize: '0.62rem', color: COLORS[i % COLORS.length],
                      fontFamily: 'var(--font-display)', fontWeight: 700 }}>
                      C{i + 1}
                    </span>
                    <span className="panel-header-title" style={{ fontSize: '0.72rem', color: COLORS[i % COLORS.length] }}>
                      {leader}
                    </span>
                    <span className="badge badge-blue" style={{ fontSize: '0.58rem' }}>
                      {members.length}
                    </span>
                  </div>
                  <div className="panel-body" style={{ padding: '8px 10px' }}>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                      {members.slice(0, 5).map(m => (
                        <span key={m} style={{ fontSize: '0.65rem', color: 'var(--text-muted)',
                          background: 'var(--bg-surface)', border: '1px solid var(--border-dim)',
                          borderRadius: 3, padding: '1px 5px' }}>
                          {m}
                        </span>
                      ))}
                      {members.length > 5 && (
                        <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>
                          +{members.length - 5} more
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  )
}
