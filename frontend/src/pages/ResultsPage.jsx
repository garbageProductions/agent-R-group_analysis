import { useState, useEffect, useCallback } from 'react'
import { getResults, startAnalysis } from '../api.js'
import ProgressPanel       from '../components/ProgressPanel.jsx'
import MoleculeGrid        from '../components/MoleculeGrid.jsx'
import RGroupTable         from '../components/RGroupTable.jsx'
import SARChart            from '../components/SARChart.jsx'
import MMPTable            from '../components/MMPTable.jsx'
import ActivityCliffTable  from '../components/ActivityCliffTable.jsx'
import ScaffoldTree        from '../components/ScaffoldTree.jsx'
import DiversityPanel         from '../components/DiversityPanel.jsx'
import GeneratedMoleculesPanel from '../components/GeneratedMoleculesPanel.jsx'

const TABS = [
  { id: 'report',    label: 'Overview',       icon: '◈' },
  { id: 'molecules', label: 'Molecules',      icon: '⬡' },
  { id: 'rgroup',    label: 'R-Groups',       icon: '⊕' },
  { id: 'sar',       label: 'SAR Ranking',    icon: '◐' },
  { id: 'mmp',       label: 'MMP Transforms', icon: '⇄' },
  { id: 'cliffs',    label: 'Act. Cliffs',    icon: '⚡' },
  { id: 'scaffold',  label: 'Scaffold Tree',  icon: '⎇' },
  { id: 'diversity', label: 'Diversity',      icon: '⦿' },
  { id: 'generated', label: 'Generated',      icon: '✦' },
]

const STRATEGY_COLORS = { rgroup: 'badge-blue', scaffold_family: 'badge-teal', mmp: 'badge-purple' }
const STRATEGY_LABELS = { rgroup: 'R-Group', scaffold_family: 'Scaffold Family', mmp: 'MMP' }

export default function ResultsPage({ sessionId, config, isAnalysing, onComplete, onReset }) {
  const [activeTab,    setActiveTab]    = useState('report')
  const [results,      setResults]      = useState(null)
  const [loadErr,      setLoadErr]      = useState(null)
  const [analysisErr,  setAnalysisErr]  = useState(null)

  const fetchResults = useCallback(() => {
    if (!sessionId) return
    getResults(sessionId)
      .then(setResults)
      .catch(e => setLoadErr(e.message))
  }, [sessionId])

  const handleComplete = useCallback(() => {
    fetchResults()
    onComplete()
  }, [fetchResults, onComplete])

  useEffect(() => {
    if (!isAnalysing) fetchResults()
  }, [isAnalysing])

  const report       = results?.report || {}
  const decomp       = results?.rgroup_decomposition || {}
  const sarRanking   = results?.sar_ranking
  const mmpData      = results?.mmp_analysis
  const cliffData    = results?.activity_cliffs
  const scaffoldData = results?.scaffold_analysis
  const diversityData  = results?.diversity_analysis
  const generativeData = results?.generative

  const allSmiles = results?.standardization?.results
    ?.map(r => r.standardized_smiles || r.canonical_smiles || r.original_smiles)
    .filter(Boolean) || []
  const allLabels = results?.standardization?.results
    ?.map((r, i) => r.label || `Mol_${i}`)
    .filter(Boolean) || []

  const propertyName = config?.propertyOfInterest
  const propNames    = mmpData?.property_names || (propertyName ? [propertyName] : [])

  /* ── Analysis running view ── */
  if (isAnalysing) {
    return (
      <div style={{
        flex: 1, display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        padding: 40, gap: 24,
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{
            fontSize: '0.66rem', letterSpacing: '0.14em', textTransform: 'uppercase',
            color: 'var(--nanome-cyan)', marginBottom: 6, fontWeight: 600,
          }}>
            Step 3 of 3
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
            padding: '10px 16px', maxWidth: 600,
            background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)',
            borderRadius: 'var(--radius)', color: 'var(--red)', fontSize: '0.82rem',
          }}>
            Pipeline error: {analysisErr}
          </div>
        )}
      </div>
    )
  }

  /* ── Results view ── */
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

      {loadErr && (
        <div style={{ padding: 20 }}>
          <div style={{
            padding: '12px 16px', background: 'rgba(239,68,68,0.08)',
            border: '1px solid rgba(239,68,68,0.25)', borderRadius: 'var(--radius)', color: 'var(--red)',
          }}>
            Could not load results: {loadErr}
          </div>
        </div>
      )}

      {!results && !loadErr && (
        <div className="empty-state" style={{ flex: 1 }}>
          <div style={{ width: 26, height: 26, border: '3px solid var(--border-subtle)',
            borderTopColor: 'var(--nanome-cyan)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
          Loading results…
        </div>
      )}

      {results && (
        <>
          {/* Tab bar – Nanome style */}
          <div className="tab-bar">
            {TABS.map(tab => (
              <button key={tab.id}
                className={`tab-btn ${activeTab === tab.id ? 'active' : ''}`}
                onClick={() => setActiveTab(tab.id)}>
                <span className="tab-icon">{tab.icon}</span>
                {tab.label}
              </button>
            ))}
            <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8, paddingRight: 6 }}>
              {results.strategy && (
                <span className={`badge ${STRATEGY_COLORS[results.strategy] || 'badge-blue'}`}>
                  {STRATEGY_LABELS[results.strategy] || results.strategy}
                </span>
              )}
              <button className="btn btn-ghost btn-sm" onClick={onReset} style={{ gap: 5 }}>
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                  <path d="M1 5a4 4 0 1 0 1-2.8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
                  <path d="M1 2v3h3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                New Analysis
              </button>
            </div>
          </div>

          {/* Tab content */}
          <div style={{ flex: 1, overflow: 'auto', padding: '20px 24px' }}>

            {/* ── Overview ── */}
            {activeTab === 'report' && (
              <div style={{ maxWidth: 900, animation: 'fadeIn 0.3s ease' }}>
                <div style={{ marginBottom: 20 }}>
                  <h1 style={{ marginBottom: 6 }}>{report.report_title || 'Analysis Report'}</h1>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {results.agents_run?.map(a => (
                      <span key={a} className="badge badge-blue" style={{ fontSize: '0.61rem' }}>{a}</span>
                    ))}
                  </div>
                </div>

                {/* Stats */}
                <div style={{ display: 'flex', gap: 10, marginBottom: 18, flexWrap: 'wrap' }}>
                  {[
                    { label: 'Molecules',  value: report.num_molecules || results.standardization?.num_molecules, sub: 'uploaded' },
                    { label: 'Valid',      value: report.num_valid || results.standardization?.num_success, sub: 'parseable' },
                    { label: 'Strategy',   value: STRATEGY_LABELS[results.strategy] || results.strategy, sub: 'analysis mode' },
                    { label: 'Scaffolds',  value: scaffoldData?.scaffold_tree?.num_unique_scaffolds, sub: 'unique Murcko' },
                    { label: 'MMP Pairs',  value: mmpData?.num_pairs, sub: 'matched pairs' },
                    { label: 'Cliff Pairs', value: cliffData?.num_cliff_pairs, sub: 'activity cliffs' },
                  ].filter(s => s.value != null).map(s => (
                    <div key={s.label} className="stat-card" style={{ flex: 1, minWidth: 100 }}>
                      <div className="stat-label">{s.label}</div>
                      <div className="stat-value" style={{ fontSize: '1.4rem' }}>{s.value}</div>
                      <div className="stat-sub">{s.sub}</div>
                    </div>
                  ))}
                </div>

                {report.executive_summary && (
                  <div className="panel" style={{ marginBottom: 12 }}>
                    <div className="panel-header">
                      <span style={{ color: 'var(--nanome-cyan)', fontSize: '0.8rem' }}>◈</span>
                      <span className="panel-header-title">Executive Summary</span>
                    </div>
                    <div className="panel-body">
                      <p style={{ fontSize: '0.88rem', lineHeight: 1.7 }}>{report.executive_summary}</p>
                    </div>
                  </div>
                )}

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                  {report.key_findings?.length > 0 && (
                    <div className="panel">
                      <div className="panel-header">
                        <span style={{ color: 'var(--blue-l)', fontSize: '0.8rem' }}>▸</span>
                        <span className="panel-header-title">Key Findings</span>
                      </div>
                      <div className="panel-body">
                        <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 8 }}>
                          {report.key_findings.map((f, i) => (
                            <li key={i} style={{ display: 'flex', gap: 9, fontSize: '0.82rem',
                              color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                              <span style={{ color: 'var(--nanome-cyan)', flexShrink: 0, marginTop: 2 }}>▸</span>
                              {f}
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  )}

                  {report.next_steps?.length > 0 && (
                    <div className="panel">
                      <div className="panel-header">
                        <span style={{ color: 'var(--blue-l)', fontSize: '0.8rem' }}>→</span>
                        <span className="panel-header-title">Recommended Next Steps</span>
                      </div>
                      <div className="panel-body">
                        <ol style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 8 }}>
                          {report.next_steps.map((s, i) => (
                            <li key={i} style={{ display: 'flex', gap: 9, fontSize: '0.82rem',
                              color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                              <span style={{
                                flexShrink: 0, fontSize: '0.62rem', fontWeight: 700, color: '#000',
                                background: 'var(--nanome-cyan)', borderRadius: '50%',
                                width: 17, height: 17, display: 'flex', alignItems: 'center',
                                justifyContent: 'center', marginTop: 1,
                              }}>{i + 1}</span>
                              {s}
                            </li>
                          ))}
                        </ol>
                      </div>
                    </div>
                  )}
                </div>

                {report.sar_insights && (
                  <div className="panel" style={{ marginBottom: 10, borderLeft: '3px solid var(--nanome-cyan)' }}>
                    <div className="panel-header">
                      <span className="panel-header-title">SAR Insights</span>
                    </div>
                    <div className="panel-body">
                      <p style={{ fontSize: '0.85rem', lineHeight: 1.6 }}>{report.sar_insights}</p>
                    </div>
                  </div>
                )}

                {report.risks_and_limitations && (
                  <div className="panel" style={{ borderLeft: '3px solid var(--amber)' }}>
                    <div className="panel-header">
                      <span style={{ color: 'var(--amber)', fontSize: '0.8rem' }}>⚠</span>
                      <span className="panel-header-title" style={{ color: 'var(--amber)' }}>Risks & Limitations</span>
                    </div>
                    <div className="panel-body">
                      <p style={{ fontSize: '0.83rem', lineHeight: 1.5 }}>{report.risks_and_limitations}</p>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ── Molecules ── */}
            {activeTab === 'molecules' && (
              <div style={{ animation: 'fadeIn 0.3s ease' }}>
                <div style={{ marginBottom: 14 }}>
                  <h2>Compound Library</h2>
                </div>
                <MoleculeGrid sessionId={sessionId} smiles={allSmiles} labels={allLabels} />
              </div>
            )}

            {/* ── R-Group Table ── */}
            {activeTab === 'rgroup' && (
              <div style={{ animation: 'fadeIn 0.3s ease' }}>
                <div style={{ marginBottom: 14 }}>
                  <h2>R-Group Decomposition</h2>
                  {decomp.llm_commentary && (
                    <p style={{ marginTop: 5, maxWidth: 700 }}>{decomp.llm_commentary}</p>
                  )}
                </div>
                <RGroupTable sessionId={sessionId} />
              </div>
            )}

            {/* ── SAR ── */}
            {activeTab === 'sar' && (
              <div style={{ animation: 'fadeIn 0.3s ease' }}>
                <div style={{ marginBottom: 14 }}>
                  <h2>Structure-Activity Relationship Ranking</h2>
                  {propertyName && (
                    <p style={{ marginTop: 5 }}>
                      Ranking substituents by effect on{' '}
                      <span style={{ color: 'var(--nanome-cyan)', fontFamily: 'var(--font-mono)' }}>
                        {propertyName}
                      </span>
                    </p>
                  )}
                </div>
                <SARChart sarData={sarRanking} propertyName={propertyName} />
              </div>
            )}

            {/* ── MMP ── */}
            {activeTab === 'mmp' && (
              <div style={{ animation: 'fadeIn 0.3s ease' }}>
                <div style={{ marginBottom: 14 }}>
                  <h2>Matched Molecular Pair Transforms</h2>
                </div>
                <MMPTable sessionId={sessionId} mmpData={mmpData} propertyNames={propNames} />
              </div>
            )}

            {/* ── Activity Cliffs ── */}
            {activeTab === 'cliffs' && (
              <div style={{ animation: 'fadeIn 0.3s ease' }}>
                <div style={{ marginBottom: 14 }}>
                  <h2>Activity Cliff Detection</h2>
                  <p style={{ marginTop: 5, maxWidth: 600 }}>
                    Pairs of structurally similar molecules with unexpectedly large activity differences.
                    High SALI scores indicate steep SAR cliffs.
                  </p>
                </div>
                <ActivityCliffTable sessionId={sessionId} cliffData={cliffData} />
              </div>
            )}

            {/* ── Scaffold Tree ── */}
            {activeTab === 'scaffold' && (
              <div style={{ animation: 'fadeIn 0.3s ease' }}>
                <div style={{ marginBottom: 14 }}>
                  <h2>Scaffold Analysis</h2>
                </div>
                <ScaffoldTree scaffoldData={scaffoldData} />
              </div>
            )}

            {/* ── Diversity ── */}
            {activeTab === 'diversity' && (
              <div style={{ animation: 'fadeIn 0.3s ease' }}>
                <div style={{ marginBottom: 14 }}>
                  <h2>Chemical Diversity &amp; Space Coverage</h2>
                </div>
                <DiversityPanel
                  diversityData={diversityData}
                  sessionId={sessionId}
                  allSmiles={allSmiles}
                  allLabels={allLabels}
                />
              </div>
            )}

            {/* ── Generated Molecules ── */}
            {activeTab === 'generated' && (
              <div style={{ animation: 'fadeIn 0.3s ease' }}>
                <div style={{ marginBottom: 14 }}>
                  <h2>REINVENT4 Generative Design</h2>
                  <p style={{ marginTop: 5, maxWidth: 700 }}>
                    Novel R-group variants generated by REINVENT4 scaffold decoration,
                    iteratively optimized for the selected scoring objective.
                  </p>
                </div>
                <GeneratedMoleculesPanel generativeData={generativeData} />
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
