import { useState } from 'react'
import { startAnalysis } from '../api.js'
import Toggle from '../components/Toggle.jsx'

export default function ConfigPage({ uploadData, config, setConfig, onStart, onBack, onBackToUpload }) {
  const [launching, setLaunching] = useState(false)
  const [error, setError] = useState(null)

  const propCols = uploadData?.property_columns || []

  function set(key, val) { setConfig(c => ({ ...c, [key]: val })) }

  async function handleRun() {
    setLaunching(true)
    setError(null)
    try {
      await startAnalysis({
        sessionId: uploadData.session_id,
        propertyOfInterest: config.propertyOfInterest,
        coreSmarts: config.coreSmarts,
        runEnumeration: config.runEnumeration,
        similarityThreshold: config.similarityThreshold,
        activityDiffThreshold: config.activityDiffThreshold,
        runGenerative: config.runGenerative || false,
        generativeConfig: config.runGenerative ? {
          scoring_mode: config.generativeScoringMode || 'both',
          n_iterations: config.generativeIterations || 5,
          n_steps: config.generativeSteps || 500,
        } : null,
      })
      onStart()
    } catch (e) {
      setError(e.message)
      setLaunching(false)
    }
  }

  return (
    <div style={{
      flex: 1,
      display: 'flex',
      alignItems: 'flex-start',
      justifyContent: 'center',
      padding: '28px 24px',
      overflow: 'auto',
    }}>
      <div style={{ width: '100%', maxWidth: 960, animation: 'fadeIn 0.3s ease' }}>

        {/* Page header */}
        <div style={{ marginBottom: 22, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
          <div>
            <div style={{
              fontSize: '0.66rem', letterSpacing: '0.14em', textTransform: 'uppercase',
              color: 'var(--nanome-cyan)', marginBottom: 5, fontWeight: 600,
            }}>
              Step 2 of 3
            </div>
            <h1 style={{ marginBottom: 4 }}>Configure Analysis</h1>
            <p style={{ maxWidth: 460 }}>
              {uploadData?.num_valid} valid molecules loaded. Tune parameters and launch the agent pipeline.
            </p>
          </div>
          {propCols.length > 0 && (
            <div style={{
              padding: '10px 14px', background: 'var(--bg-card)',
              border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius)', flexShrink: 0,
            }}>
              <div className="stat-label" style={{ marginBottom: 5 }}>Detected properties</div>
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', maxWidth: 260 }}>
                {propCols.map(c => (
                  <span key={c} className={`badge ${c === config.propertyOfInterest ? 'badge-cyan' : 'badge-teal'}`}>{c}</span>
                ))}
              </div>
            </div>
          )}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>

          {/* Left column */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

            {/* SAR Configuration */}
            <div className="panel">
              <div className="panel-header">
                <span style={{ fontSize: '0.82rem', color: 'var(--nanome-cyan)' }}>⚗</span>
                <span className="panel-header-title">SAR Configuration</span>
              </div>
              <div className="panel-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {/* SAR warning: no activity data */}
              {propCols.length === 0 && (
                <div style={{
                  background: 'rgba(245,158,11,0.08)',
                  border: '1px solid rgba(245,158,11,0.3)',
                  borderRadius: 'var(--radius)',
                  padding: '10px 14px',
                  marginBottom: 12,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                    <span>⚠</span>
                    <span style={{ fontWeight: 600, color: '#f59e0b', fontSize: '0.82rem' }}>
                      No Activity Data
                    </span>
                  </div>
                  <p style={{ fontSize: '0.75rem', color: '#f59e0b', margin: '0 0 8px' }}>
                    SAR analysis requires numeric activity columns (pIC50, Ki, IC50, etc.).
                    Ensure your SDF contains property fields, or upload a separate activity CSV.
                  </p>
                  {onBackToUpload && (
                    <button
                      className="btn"
                      style={{
                        background: 'rgba(245,158,11,0.1)',
                        color: '#f59e0b',
                        border: '1px solid rgba(245,158,11,0.3)',
                        fontSize: '0.75rem',
                        padding: '4px 10px',
                      }}
                      onClick={onBackToUpload}
                    >
                      ← Add Activity Data
                    </button>
                  )}
                </div>
              )}
              <div className="field">
                  <label>Property of Interest</label>
                  {propCols.length > 0 ? (
                    <select className="select" value={config.propertyOfInterest}
                      disabled={propCols.length === 0}
                      style={{ opacity: propCols.length === 0 ? 0.4 : 1 }}
                      onChange={e => set('propertyOfInterest', e.target.value)}>
                      <option value="">— none —</option>
                      {propCols.map(col => <option key={col} value={col}>{col}</option>)}
                    </select>
                  ) : (
                    <input className="input" type="text" placeholder="e.g. pIC50, pKd, LogD"
                      value={config.propertyOfInterest}
                      onChange={e => set('propertyOfInterest', e.target.value)} />
                  )}
                </div>
                <div className="field">
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    Core SMARTS
                    <span style={{
                      fontSize: '0.61rem', color: 'var(--text-dim)',
                      background: 'var(--bg-surface)', border: '1px solid var(--border-dim)',
                      borderRadius: 3, padding: '1px 5px', textTransform: 'lowercase', letterSpacing: 0,
                    }}>optional</span>
                    <div className="tooltip-wrap" style={{ marginLeft: 'auto' }}>
                      <span style={{ cursor: 'help', color: 'var(--text-muted)', fontSize: '0.82rem' }}>ⓘ</span>
                      <div className="tooltip" style={{ width: 260, whiteSpace: 'normal' }}>
                        Override automatic core detection. Use RDKit SMARTS with [*:1], [*:2] attachment
                        points. Leave blank for MCS auto-detection.
                      </div>
                    </div>
                  </label>
                  <input className="input mono" type="text"
                    placeholder="e.g.  c1ccc([*:1])cc1C([*:2])=O"
                    value={config.coreSmarts}
                    onChange={e => set('coreSmarts', e.target.value)} />
                </div>
              </div>
            </div>

            {/* Similarity */}
            <div className="panel">
              <div className="panel-header">
                <span style={{ fontSize: '0.82rem', color: 'var(--blue-l)' }}>◎</span>
                <span className="panel-header-title">Similarity Parameters</span>
              </div>
              <div className="panel-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div className="field">
                  <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>Tanimoto Threshold</span>
                    <span style={{
                      fontFamily: 'var(--font-mono)', fontSize: '0.8rem', color: 'var(--nanome-cyan)',
                      background: 'rgba(0,196,212,0.08)', border: '1px solid rgba(0,196,212,0.22)',
                      borderRadius: 4, padding: '1px 7px',
                    }}>
                      {config.similarityThreshold.toFixed(2)}
                    </span>
                  </label>
                  <input type="range" min="0.3" max="1.0" step="0.05"
                    value={config.similarityThreshold}
                    onChange={e => set('similarityThreshold', parseFloat(e.target.value))}
                    style={{ width: '100%', accentColor: 'var(--nanome-cyan)', cursor: 'pointer', marginTop: 6 }} />
                  <div style={{ display: 'flex', justifyContent: 'space-between',
                    fontSize: '0.62rem', color: 'var(--text-muted)', marginTop: 3 }}>
                    <span>0.30 · loose</span><span>1.00 · exact</span>
                  </div>
                </div>
                <div className="field">
                  <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>Activity Cliff Threshold</span>
                    <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>log units</span>
                  </label>
                  <input className="input" type="number" min="0.1" max="5" step="0.1"
                    value={config.activityDiffThreshold}
                    onChange={e => set('activityDiffThreshold', parseFloat(e.target.value))} />
                </div>
              </div>
            </div>

            {/* Enumeration */}
            <div className="panel">
              <div className="panel-header">
                <span style={{ fontSize: '0.82rem', color: 'var(--purple)' }}>⊕</span>
                <span className="panel-header-title">Library Enumeration</span>
                <div className="panel-header-actions">
                  <Toggle checked={config.runEnumeration} onChange={v => set('runEnumeration', v)} size="sm" />
                </div>
              </div>
              <div className="panel-body">
                <p style={{ fontSize: '0.78rem', lineHeight: 1.6 }}>
                  Generate virtual analogues by systematically swapping R-group substituents.
                  Only available when R-group strategy is selected.
                </p>
                {config.runEnumeration && (
                  <div style={{
                    marginTop: 10, padding: '7px 10px',
                    background: 'rgba(0,196,212,0.06)', border: '1px solid rgba(0,196,212,0.2)',
                    borderRadius: 'var(--radius-sm)', fontSize: '0.74rem', color: 'var(--nanome-cyan)',
                  }}>
                    ✓ Enumeration enabled
                  </div>
                )}
              </div>
            </div>

            {/* Generative Design */}
            <div className="panel">
              <div className="panel-header">
                <span style={{ fontSize: '0.82rem', color: 'var(--nanome-cyan)' }}>✦</span>
                <span className="panel-header-title">Generative Design</span>
                <div className="panel-header-actions">
                  <Toggle checked={config.runGenerative || false} onChange={v => set('runGenerative', v)} size="sm" />
                </div>
              </div>
              <div className="panel-body">
                <p style={{ fontSize: '0.78rem', lineHeight: 1.6, marginBottom: config.runGenerative ? 14 : 0 }}>
                  Run REINVENT4 scaffold decoration to generate novel R-group variants.
                  Requires <code style={{ fontSize: '0.72rem' }}>REINVENT4_EXEC</code> to be configured server-side.
                </p>

                {config.runGenerative && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {/* Scoring mode */}
                    <div>
                      <label style={{ fontSize: '0.78rem', color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>
                        Scoring Mode
                      </label>
                      <div style={{ display: 'flex', gap: 6 }}>
                        {[
                          { value: 'physico', label: 'Physicochemical' },
                          { value: 'qsar',    label: 'QSAR' },
                          { value: 'both',    label: 'Both' },
                        ].map(opt => (
                          <button
                            key={opt.value}
                            onClick={() => set('generativeScoringMode', opt.value)}
                            style={{
                              padding: '5px 12px',
                              borderRadius: 'var(--radius)',
                              border: '1px solid',
                              borderColor: (config.generativeScoringMode || 'both') === opt.value
                                ? 'var(--nanome-cyan)' : 'var(--border-subtle)',
                              background: (config.generativeScoringMode || 'both') === opt.value
                                ? 'rgba(0,188,212,0.12)' : 'transparent',
                              color: (config.generativeScoringMode || 'both') === opt.value
                                ? 'var(--nanome-cyan)' : 'var(--text-muted)',
                              cursor: 'pointer',
                              fontSize: '0.78rem',
                              fontWeight: 500,
                              transition: 'all 0.15s',
                            }}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Advanced options */}
                    <details style={{ fontSize: '0.78rem' }}>
                      <summary style={{ cursor: 'pointer', color: 'var(--text-muted)', userSelect: 'none' }}>
                        Advanced options
                      </summary>
                      <div style={{ display: 'flex', gap: 14, marginTop: 10 }}>
                        <div style={{ flex: 1 }}>
                          <label style={{ color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>
                            Iterations (1–20)
                          </label>
                          <input
                            type="number" min={1} max={20}
                            value={config.generativeIterations || 5}
                            onChange={e => set('generativeIterations', Math.max(1, Math.min(20, parseInt(e.target.value) || 5)))}
                            className="input"
                            style={{ width: '100%', fontSize: '0.78rem' }}
                          />
                        </div>
                        <div style={{ flex: 1 }}>
                          <label style={{ color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>
                            Steps / iteration (100–5000)
                          </label>
                          <input
                            type="number" min={100} max={5000} step={100}
                            value={config.generativeSteps || 500}
                            onChange={e => set('generativeSteps', Math.max(100, Math.min(5000, parseInt(e.target.value) || 500)))}
                            className="input"
                            style={{ width: '100%', fontSize: '0.78rem' }}
                          />
                        </div>
                      </div>
                    </details>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Right column – pipeline overview */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div className="panel" style={{ flex: 1 }}>
              <div className="panel-header">
                <span style={{ fontSize: '0.82rem', color: 'var(--nanome-cyan)' }}>◈</span>
                <span className="panel-header-title">Agent Pipeline</span>
                <span className="badge badge-cyan" style={{ marginLeft: 'auto' }}>Auto-select</span>
              </div>
              <div className="panel-body">
                <p style={{ fontSize: '0.78rem', marginBottom: 14, lineHeight: 1.6 }}>
                  Strategy selected automatically based on structural convergence:
                </p>
                {[
                  { icon: '⬡', color: 'var(--blue-l)', label: 'R-Group Decomposition',
                    desc: 'MCS >60% → core + R1/R2/R3 table + SAR ranking' },
                  { icon: '⎇', color: 'var(--teal-l)', label: 'Scaffold Family',
                    desc: 'Multiple scaffolds → Murcko hierarchy + per-family SAR' },
                  { icon: '⇄', color: 'var(--purple)', label: 'MMP Transforms',
                    desc: 'Low convergence → matched molecular pair Δ-property' },
                ].map(s => (
                  <div key={s.label} className="list-item" style={{ paddingLeft: 0, paddingRight: 0 }}>
                    <div style={{ fontSize: '1rem', color: s.color, width: 22, textAlign: 'center', flexShrink: 0 }}>{s.icon}</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: 1 }}>{s.label}</div>
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>{s.desc}</div>
                    </div>
                  </div>
                ))}
                <div className="divider" />
                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: 7 }}>Always runs:</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {['Standardisation', 'Activity Cliffs', 'Scaffold Tree', 'Diversity', 'Report'].map(a => (
                    <span key={a} className="badge badge-blue">{a}</span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        {error && (
          <div style={{
            marginTop: 14, padding: '10px 14px',
            background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)',
            borderRadius: 'var(--radius)', color: 'var(--red)', fontSize: '0.82rem',
          }}>
            ⚠ {error}
          </div>
        )}

        <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
          <button className="btn btn-ghost" onClick={onBack}>← Back</button>
          <button className="btn btn-cyan btn-lg" onClick={handleRun} disabled={launching}>
            {launching ? (
              <>
                <span style={{
                  width: 13, height: 13, border: '2px solid rgba(0,0,0,0.3)',
                  borderTopColor: '#000', borderRadius: '50%', animation: 'spin 0.7s linear infinite', display: 'inline-block',
                }} />
                Launching…
              </>
            ) : (
              <>▶ Run Analysis Pipeline</>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
