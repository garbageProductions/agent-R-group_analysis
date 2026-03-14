import { useState, useEffect, useCallback } from 'react'
import { getResults, startAnalysis } from '../api.js'
import ProgressPanel       from '../components/ProgressPanel.jsx'
import MoleculeGrid        from '../components/MoleculeGrid.jsx'
import RGroupTable         from '../components/RGroupTable.jsx'
import SARChart            from '../components/SARChart.jsx'
import MMPTable            from '../components/MMPTable.jsx'
import ActivityCliffTable  from '../components/ActivityCliffTable.jsx'
import ScaffoldTree        from '../components/ScaffoldTree.jsx'
import DiversityPanel      from '../components/DiversityPanel.jsx'

const TABS = [
  { id: 'report',    label: 'Overview',       icon: '◈' },
  { id: 'molecules', label: 'Molecules',      icon: '⬡' },
  { id: 'rgroup',    label: 'R-Groups',       icon: '⊕' },
  { id: 'sar',       label: 'SAR Ranking',    icon: '◐' },
  { id: 'mmp',       label: 'MMP Transforms', icon: '⇄' },
  { id: 'cliffs',    label: 'Act. Cliffs',    icon: '⚡' },
  { id: 'scaffold',  label: 'Scaffold Tree',  icon: '⎇' },
  { id: 'diversity', label: 'Diversity',      icon: '⦿' },
]

const STRATEGY_COLORS = { rgroup: 'badge-blue', scaffold_family: 'badge-teal', mmp: 'badge-purple' }
const STRATEGY_LABELS = { rgroup: 'R-Group', scaffold_family: 'Scaffold Family', mmp: 'MMP' }

export default function ResultsPage({ sessionId, config, isAnalysing, onComplete, onReset }) {
  const [activeTab,  setActiveTab]  = useState('report')
  const [results,    setResults]    = useState(null)
  const [loadErr,    setLoadErr]    = useState(null)
  const [analysisErr, setAnalysisErr] = useState(null)

  const fetchResults = useCallback(() => {
    if (!sessionId) return
    getResults(sessionId)
      .then(setResults)
      .catch(e => setLoadErr(e.message))
  }, [sessionId])

  // When analysis completes, load results
  const handleComplete = useCallback(() => {
    fetchResults()
    onComplete()
  }, [fetchResults, onComplete])

  // If arriving on results page already complete, load immediately
  useEffect(() => {
    if (!isAnalysing) fetchResults()
  }, [isAnalysing])

  // Derived data
  const report      = results?.report || {}
  const decomp      = results?.rgroup_decomposition || {}
  const sarRanking  = results?.sar_ranking
  const mmpData     = results?.mmp_analysis
  const cliffData   = results?.activity_cliffs
  const scaffoldData = results?.scaffold_analysis
  const diversityData = results?.diversity_analysis

  // All SMILES from standardization results for molecule grid
  const allSmiles = results?.standardization?.results
    ?.map(r => r.standardized_smiles || r.canonical_smiles || r.original_smiles)
    .filter(Boolean) || []
  const allLabels = results?.standardization?.results
    ?.map((r, i) => r.label || `Mol_${i}`)
    .filter(Boolean) || []

  const propertyName = config?.propertyOfInterest
  const propNames    = mmpData?.property_names || (propertyName ? [propertyName] : [])

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

      {/* Analysis in progress view */}
      {isAnalysing && (
        <div style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 40,
          gap: 28,
        }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{
              fontFamily: 'var(--font-display)',
              fontSize: '0.7rem',
              letterSpacing: '0.2em',
              textTransform: 'uppercase',
              color: 'var(--blue-l)',
              marginBottom: 10,
            }}>
              ◈  STEP 3 OF 3
            </div>
            <h1 style={{ marginBottom: 8 }}>Pipeline Running</h1>
            <p>The agent suite is analysing your compound set.
              Results will appear automatically when complete.</p>
          </div>

          <ProgressPanel
            sessionId={sessionId}
            onComplete={handleComplete}
            onError={(msg) => setAnalysisErr(msg)}
          />

          {analysisErr && (
            <div style={{
              background: 'rgba(239,68,68,0.08)',
              border: '1px solid rgba(239,68,68,0.3)',
              borderRadius: 'var(--radius)',
              padding: '12px 20px',
              color: 'var(--red)',
              fontSize: '0.82rem',
              maxWidth: 600,
            }}>
              Pipeline error: {analysisErr}
            </div>
          )}
        </div>
      )}

      {/* Results view */}
      {!isAnalysing && (
        <>
          {loadErr && (
            <div style={{ padding: 24 }}>
              <div style={{
                background: 'rgba(239,68,68,0.08)',
                border: '1px solid rgba(239,68,68,0.3)',
                borderRadius: 'var(--radius)',
                padding: '16px 20px',
                color: 'var(--red)',
              }}>
                Could not load results: {loadErr}
              </div>
            </div>
          )}

          {!results && !loadErr && (
            <div className="empty-state" style={{ flex: 1 }}>
              <div style={{ width: 28, height: 28, border: '3px solid var(--border-subtle)',
                borderTopColor: 'var(--blue)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
              Loading results…
            </div>
          )}

          {results && (
            <>
              {/* Tab bar */}
              <div className="tab-bar">
                {TABS.map(tab => (
                  <button key={tab.id} className={`tab-btn ${activeTab === tab.id ? 'active' : ''}`}
                    onClick={() => setActiveTab(tab.id)}>
                    <span>{tab.icon}</span>
                    {tab.label}
                  </button>
                ))}
                <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10, paddingRight: 8 }}>
                  {results.strategy && (
                    <span className={`badge ${STRATEGY_COLORS[results.strategy] || 'badge-blue'}`}>
                      {STRATEGY_LABELS[results.strategy] || results.strategy}
                    </span>
                  )}
                  <button className="btn btn-ghost"
                    style={{ padding: '4px 10px', fontSize: '0.65rem' }}
                    onClick={onReset}>
                    ✕ New Analysis
                  </button>
                </div>
              </div>

              {/* Tab content */}
              <div style={{ flex: 1, overflow: 'auto', padding: 24 }}>

                {/* ─── Overview ──────────────────────────────── */}
                {activeTab === 'report' && (
                  <div style={{ maxWidth: 900, animation: 'fadeIn 0.3s ease' }}>
                    {/* Title + strategy */}
                    <div style={{ marginBottom: 24 }}>
                      <h1 style={{ marginBottom: 6 }}>
                        {report.report_title || 'Analysis Report'}
                      </h1>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        {results.agents_run?.map(a => (
                          <span key={a} className="badge badge-blue" style={{ fontSize: '0.62rem' }}>{a}</span>
                        ))}
                      </div>
                    </div>

                    {/* Key stats */}
                    <div style={{ display: 'flex', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>
                      {[
                        { label: 'Molecules',   value: report.num_molecules || results.standardization?.num_molecules, sub: 'uploaded' },
                        { label: 'Valid',        value: report.num_valid || results.standardization?.num_success, sub: 'parseable' },
                        { label: 'Strategy',     value: STRATEGY_LABELS[results.strategy] || results.strategy, sub: 'analysis mode' },
                        { label: 'Scaffolds',    value: scaffoldData?.scaffold_tree?.num_unique_scaffolds, sub: 'unique Murcko' },
                        { label: 'MMP Pairs',    value: mmpData?.num_pairs, sub: 'matched pairs' },
                        { label: 'Cliff Pairs',  value: cliffData?.num_cliff_pairs, sub: 'activity cliffs' },
                      ].filter(s => s.value != null).map(s => (
                        <div key={s.label} className="stat-card" style={{ flex: 1, minWidth: 100 }}>
                          <div className="stat-label">{s.label}</div>
                          <div className="stat-value" style={{ fontSize: '1.4rem' }}>{s.value}</div>
                          <div className="stat-sub">{s.sub}</div>
                        </div>
                      ))}
                    </div>

                    {/* Executive summary */}
                    {report.executive_summary && (
                      <div className="card" style={{ marginBottom: 16, borderLeft: '3px solid var(--blue)' }}>
                        <div className="card-title" style={{ marginBottom: 10 }}>Executive Summary</div>
                        <p style={{ fontSize: '0.88rem', lineHeight: 1.7 }}>{report.executive_summary}</p>
                      </div>
                    )}

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
                      {/* Key findings */}
                      {report.key_findings?.length > 0 && (
                        <div className="card">
                          <div className="card-title" style={{ marginBottom: 12 }}>Key Findings</div>
                          <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 8 }}>
                            {report.key_findings.map((f, i) => (
                              <li key={i} style={{ display: 'flex', gap: 10, fontSize: '0.82rem',
                                color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                                <span style={{ color: 'var(--teal)', flexShrink: 0, marginTop: 1 }}>▸</span>
                                {f}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {/* Next steps */}
                      {report.next_steps?.length > 0 && (
                        <div className="card">
                          <div className="card-title" style={{ marginBottom: 12 }}>Recommended Next Steps</div>
                          <ol style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 8,
                            counterReset: 'step' }}>
                            {report.next_steps.map((s, i) => (
                              <li key={i} style={{ display: 'flex', gap: 10, fontSize: '0.82rem',
                                color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                                <span style={{
                                  flexShrink: 0, fontFamily: 'var(--font-display)',
                                  fontSize: '0.65rem', fontWeight: 700, color: '#fff',
                                  background: 'var(--blue)', borderRadius: '50%',
                                  width: 18, height: 18, display: 'flex', alignItems: 'center',
                                  justifyContent: 'center', marginTop: 1,
                                }}>{i + 1}</span>
                                {s}
                              </li>
                            ))}
                          </ol>
                        </div>
                      )}
                    </div>

                    {/* SAR insights */}
                    {report.sar_insights && (
                      <div className="card" style={{ borderLeft: '3px solid var(--teal)' }}>
                        <div className="card-title" style={{ marginBottom: 8 }}>SAR Insights</div>
                        <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                          {report.sar_insights}
                        </p>
                      </div>
                    )}

                    {/* Risks */}
                    {report.risks_and_limitations && (
                      <div className="card" style={{ marginTop: 16, borderLeft: '3px solid var(--amber)' }}>
                        <div className="card-title" style={{ marginBottom: 8, color: 'var(--amber)' }}>
                          Risks & Limitations
                        </div>
                        <p style={{ fontSize: '0.83rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                          {report.risks_and_limitations}
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {/* ─── Molecules ─────────────────────────────── */}
                {activeTab === 'molecules' && (
                  <div style={{ animation: 'fadeIn 0.3s ease' }}>
                    <div style={{ marginBottom: 16 }}>
                      <h2>Compound Library</h2>
                    </div>
                    <MoleculeGrid sessionId={sessionId} smiles={allSmiles} labels={allLabels} />
                  </div>
                )}

                {/* ─── R-Group Table ─────────────────────────── */}
                {activeTab === 'rgroup' && (
                  <div style={{ animation: 'fadeIn 0.3s ease' }}>
                    <div style={{ marginBottom: 16 }}>
                      <h2>R-Group Decomposition</h2>
                      {decomp.llm_commentary && (
                        <p style={{ marginTop: 6, fontSize: '0.83rem', color: 'var(--text-secondary)', maxWidth: 700 }}>
                          {decomp.llm_commentary}
                        </p>
                      )}
                    </div>
                    <RGroupTable sessionId={sessionId} />
                  </div>
                )}

                {/* ─── SAR ───────────────────────────────────── */}
                {activeTab === 'sar' && (
                  <div style={{ animation: 'fadeIn 0.3s ease' }}>
                    <div style={{ marginBottom: 16 }}>
                      <h2>Structure-Activity Relationship Ranking</h2>
                      {propertyName && (
                        <p style={{ marginTop: 6, fontSize: '0.83rem', color: 'var(--text-secondary)' }}>
                          Ranking substituents at each R-group position by their effect on{' '}
                          <span style={{ color: 'var(--blue-l)', fontFamily: 'var(--font-mono)' }}>
                            {propertyName}
                          </span>
                        </p>
                      )}
                    </div>
                    <SARChart sarData={sarRanking} propertyName={propertyName} />
                  </div>
                )}

                {/* ─── MMP ───────────────────────────────────── */}
                {activeTab === 'mmp' && (
                  <div style={{ animation: 'fadeIn 0.3s ease' }}>
                    <div style={{ marginBottom: 16 }}>
                      <h2>Matched Molecular Pair Transforms</h2>
                    </div>
                    <MMPTable sessionId={sessionId} mmpData={mmpData} propertyNames={propNames} />
                  </div>
                )}

                {/* ─── Activity Cliffs ────────────────────────── */}
                {activeTab === 'cliffs' && (
                  <div style={{ animation: 'fadeIn 0.3s ease' }}>
                    <div style={{ marginBottom: 16 }}>
                      <h2>Activity Cliff Detection</h2>
                      <p style={{ marginTop: 6, fontSize: '0.83rem', color: 'var(--text-secondary)', maxWidth: 600 }}>
                        Pairs of structurally similar molecules with unexpectedly large activity differences.
                        High SALI scores indicate steep SAR cliffs.
                      </p>
                    </div>
                    <ActivityCliffTable sessionId={sessionId} cliffData={cliffData} />
                  </div>
                )}

                {/* ─── Scaffold Tree ──────────────────────────── */}
                {activeTab === 'scaffold' && (
                  <div style={{ animation: 'fadeIn 0.3s ease' }}>
                    <div style={{ marginBottom: 16 }}>
                      <h2>Scaffold Analysis</h2>
                    </div>
                    <ScaffoldTree scaffoldData={scaffoldData} />
                  </div>
                )}

                {/* ─── Diversity ─────────────────────────────── */}
                {activeTab === 'diversity' && (
                  <div style={{ animation: 'fadeIn 0.3s ease' }}>
                    <div style={{ marginBottom: 16 }}>
                      <h2>Chemical Diversity & Space Coverage</h2>
                    </div>
                    <DiversityPanel
                      diversityData={diversityData}
                      sessionId={sessionId}
                      allSmiles={allSmiles}
                      allLabels={allLabels}
                    />
                  </div>
                )}
              </div>
            </>
          )}
        </>
      )}
    </div>
  )
}
