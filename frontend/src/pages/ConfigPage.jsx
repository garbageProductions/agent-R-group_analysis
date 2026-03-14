import { useState } from 'react'
import { startAnalysis } from '../api.js'

export default function ConfigPage({ uploadData, config, setConfig, onStart, onBack }) {
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
      alignItems: 'center',
      justifyContent: 'center',
      padding: '40px 32px',
      overflow: 'auto',
    }}>
      <div style={{ width: '100%', maxWidth: 920, animation: 'fadeIn 0.3s ease' }}>

        <div style={{ marginBottom: 28 }}>
          <div style={{
            fontFamily: 'var(--font-display)',
            fontSize: '0.7rem',
            letterSpacing: '0.2em',
            textTransform: 'uppercase',
            color: 'var(--teal)',
            marginBottom: 8,
          }}>
            ◈  STEP 2 OF 3
          </div>
          <h1 style={{ marginBottom: 6 }}>Configure Analysis</h1>
          <p style={{ maxWidth: 520 }}>
            {uploadData?.num_valid} valid molecules loaded.
            Tune the agent pipeline parameters below, then launch.
          </p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>

          {/* ── Left: config form ── */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            <div className="card">
              <div className="card-title" style={{ marginBottom: 16 }}>SAR Configuration</div>

              {/* Property dropdown */}
              <div className="field">
                <label>Property of Interest</label>
                {propCols.length > 0 ? (
                  <select className="select"
                    value={config.propertyOfInterest}
                    onChange={e => set('propertyOfInterest', e.target.value)}>
                    <option value="">— none —</option>
                    {propCols.map(col => (
                      <option key={col} value={col}>{col}</option>
                    ))}
                  </select>
                ) : (
                  <input className="input" type="text"
                    placeholder="e.g. pIC50, pKd, LogD"
                    value={config.propertyOfInterest}
                    onChange={e => set('propertyOfInterest', e.target.value)} />
                )}
              </div>

              {/* Core SMARTS */}
              <div className="field" style={{ marginTop: 14 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  Core SMARTS
                  <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)',
                    background: 'var(--bg-surface)', border: '1px solid var(--border-dim)',
                    borderRadius: 3, padding: '1px 5px' }}>
                    optional
                  </span>
                  <div className="tooltip-wrap" style={{ marginLeft: 'auto' }}>
                    <svg width="13" height="13" viewBox="0 0 13 13" fill="none"
                      style={{ cursor: 'help', color: 'var(--text-muted)' }}>
                      <circle cx="6.5" cy="6.5" r="6" stroke="currentColor" strokeWidth="1.2"/>
                      <text x="6.5" y="9.5" textAnchor="middle" fill="currentColor"
                        fontSize="7" fontFamily="var(--font-display)">?</text>
                    </svg>
                    <div className="tooltip" style={{ width: 260, whiteSpace: 'normal' }}>
                      Override automatic core detection. Use RDKit SMARTS with [*:1], [*:2] attachment
                      points. If blank, the agent will auto-detect the MCS.
                    </div>
                  </div>
                </label>
                <input className="input mono" type="text"
                  placeholder="e.g.  c1ccc([*:1])cc1C([*:2])=O"
                  value={config.coreSmarts}
                  onChange={e => set('coreSmarts', e.target.value)} />
              </div>
            </div>

            <div className="card">
              <div className="card-title" style={{ marginBottom: 16 }}>Similarity Parameters</div>

              {/* Similarity threshold */}
              <div className="field">
                <label style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>Similarity Threshold (Tanimoto)</span>
                  <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--blue-l)' }}>
                    {config.similarityThreshold.toFixed(2)}
                  </span>
                </label>
                <input type="range" min="0.3" max="1.0" step="0.05"
                  value={config.similarityThreshold}
                  onChange={e => set('similarityThreshold', parseFloat(e.target.value))}
                  style={{
                    width: '100%', accentColor: 'var(--blue)',
                    cursor: 'pointer', marginTop: 4,
                  }} />
                <div style={{ display: 'flex', justifyContent: 'space-between',
                  fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: 2 }}>
                  <span>0.30 (loose)</span>
                  <span>1.00 (strict)</span>
                </div>
              </div>

              {/* Activity diff */}
              <div className="field" style={{ marginTop: 14 }}>
                <label>Activity Cliff Threshold (log units)</label>
                <input className="input" type="number" min="0.1" max="5" step="0.1"
                  value={config.activityDiffThreshold}
                  onChange={e => set('activityDiffThreshold', parseFloat(e.target.value))} />
              </div>
            </div>

            <div className="card">
              <div className="card-title" style={{ marginBottom: 16 }}>Library Enumeration</div>
              <label style={{
                display: 'flex', alignItems: 'center', gap: 12,
                cursor: 'pointer', textTransform: 'none', letterSpacing: 'normal',
                fontSize: '0.85rem', color: 'var(--text-primary)',
              }}>
                <div
                  onClick={() => set('runEnumeration', !config.runEnumeration)}
                  style={{
                    width: 40, height: 22,
                    borderRadius: 11,
                    background: config.runEnumeration ? 'var(--teal)' : 'var(--border-default)',
                    position: 'relative',
                    transition: 'background 0.2s',
                    cursor: 'pointer',
                    flexShrink: 0,
                  }}>
                  <div style={{
                    position: 'absolute',
                    top: 3, left: config.runEnumeration ? 21 : 3,
                    width: 16, height: 16,
                    borderRadius: '50%',
                    background: '#fff',
                    transition: 'left 0.2s',
                  }} />
                </div>
                <div>
                  <div>Enumerate Virtual Library</div>
                  <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginTop: 2 }}>
                    Generate analogues by systematic substituent swapping (R-group strategy only)
                  </div>
                </div>
              </label>
            </div>
          </div>

          {/* ── Right: agent overview ── */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className="card" style={{ flex: 1 }}>
              <div className="card-title" style={{ marginBottom: 16 }}>Pipeline Overview</div>
              <p style={{ fontSize: '0.8rem', marginBottom: 16, color: 'var(--text-secondary)' }}>
                The orchestrator will automatically select the best analysis strategy based
                on your compound set's structural characteristics:
              </p>

              {[
                { icon: '⬡', color: 'var(--blue-l)',  label: 'R-Group Decomposition',
                  desc: 'MCS coverage >60% → decompose into core + R1/R2/R3 table' },
                { icon: '⬡', color: 'var(--teal-l)', label: 'Scaffold Family Analysis',
                  desc: 'Multiple scaffolds → Murcko hierarchy + per-family SAR' },
                { icon: '⬡', color: 'var(--purple)',  label: 'MMP Transform Mining',
                  desc: 'Low convergence → matched molecular pair Δ-property analysis' },
              ].map(s => (
                <div key={s.label} style={{
                  display: 'flex', gap: 12, padding: '10px 0',
                  borderBottom: '1px solid var(--border-dim)',
                }}>
                  <span style={{ fontSize: '1.1rem', color: s.color, flexShrink: 0 }}>{s.icon}</span>
                  <div>
                    <div style={{ fontFamily: 'var(--font-display)', fontSize: '0.78rem',
                      fontWeight: 600, color: 'var(--text-primary)', marginBottom: 2 }}>
                      {s.label}
                    </div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{s.desc}</div>
                  </div>
                </div>
              ))}

              <div style={{ marginTop: 14 }}>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: 10 }}>
                  Always runs regardless of strategy:
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {['Activity Cliffs', 'Scaffold Tree', 'Diversity', 'Report'].map(a => (
                    <span key={a} className="badge badge-blue">{a}</span>
                  ))}
                </div>
              </div>
            </div>

            {/* Dataset summary */}
            <div className="card">
              <div className="card-title" style={{ marginBottom: 12 }}>Dataset</div>
              <div style={{ display: 'flex', gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <div className="stat-label">Molecules</div>
                  <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.4rem',
                    fontWeight: 700, color: 'var(--text-bright)' }}>
                    {uploadData?.num_valid}
                  </div>
                </div>
                {propCols.length > 0 && (
                  <div style={{ flex: 2 }}>
                    <div className="stat-label">Properties</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
                      {propCols.map(c => (
                        <span key={c} className="badge badge-teal" style={{
                          background: c === config.propertyOfInterest ? 'rgba(20,184,166,0.2)' : undefined,
                        }}>{c}</span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {error && (
          <div style={{
            marginTop: 16,
            background: 'rgba(239,68,68,0.08)',
            border: '1px solid rgba(239,68,68,0.3)',
            borderRadius: 'var(--radius)',
            padding: '12px 16px',
            color: 'var(--red)',
            fontSize: '0.82rem',
          }}>
            ⚠ {error}
          </div>
        )}

        <div style={{ display: 'flex', gap: 12, marginTop: 24 }}>
          <button className="btn btn-ghost" onClick={onBack}>← Back</button>
          <button className="btn btn-primary btn-lg" onClick={handleRun} disabled={launching}>
            {launching ? (
              <>
                <span style={{ width: 14, height: 14, border: '2px solid rgba(255,255,255,0.3)',
                  borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.7s linear infinite',
                  display: 'inline-block' }} />
                Launching…
              </>
            ) : '▶  Run Analysis Pipeline'}
          </button>
        </div>
      </div>
    </div>
  )
}
