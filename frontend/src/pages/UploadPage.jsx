import { useState, useRef, useCallback } from 'react'
import { uploadFile, uploadActivityFile } from '../api.js'
import DotMenu from '../components/DotMenu.jsx'

export default function UploadPage({ onComplete, initialUploadResult = null }) {
  const [dragging, setDragging] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadResult, setUploadResult] = useState(initialUploadResult)
  const [error, setError] = useState(null)
  const inputRef = useRef()

  const [activityOpen, setActivityOpen] = useState(false)
  const [activityUploading, setActivityUploading] = useState(false)
  const [activityError, setActivityError] = useState(null)
  const [activitySuccess, setActivitySuccess] = useState(null)
  const activityInputRef = useRef()

  const handleFile = useCallback(async (file) => {
    if (!file) return
    setUploading(true)
    setError(null)
    try {
      const result = await uploadFile(file)
      setUploadResult(result)
    } catch (e) {
      setError(e.message)
    } finally {
      setUploading(false)
    }
  }, [])

  const handleActivityFile = useCallback(async (file) => {
    if (!file) return
    setActivityUploading(true)
    setActivityError(null)
    setActivitySuccess(null)
    try {
      const updated = await uploadActivityFile(uploadResult.session_id, file)
      setUploadResult(updated)
      setActivitySuccess(`Activity data loaded · ${updated.property_columns.length} properties`)
      setActivityOpen(false)
    } catch (e) {
      setActivityError(e.message)
    } finally {
      setActivityUploading(false)
    }
  }, [uploadResult])

  const onDrop = (e) => {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }

  if (uploadResult) {
    return (
      <div style={{
        flex: 1, display: 'flex', flexDirection: 'column',
        alignItems: 'center', padding: '28px 24px', overflow: 'auto',
      }}>
        <div style={{ width: '100%', maxWidth: 1100, animation: 'fadeIn 0.4s ease' }}>

          {/* File loaded panel header */}
          <div className="panel" style={{ marginBottom: 14 }}>
            <div className="panel-header">
              <span style={{ fontSize: '0.8rem', color: 'var(--green)' }}>✓</span>
              <span className="panel-header-title">File Loaded Successfully</span>
              <div className="panel-header-actions">
                <span className="badge badge-green">
                  {uploadResult.source_format?.toUpperCase()}
                </span>
                <DotMenu items={[
                  { icon: '↺', label: 'Upload different file',
                    action: () => { setUploadResult(null); setError(null) } },
                ]} />
              </div>
            </div>
          </div>

          {/* Stats row */}
          <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
            <div className="stat-card" style={{ flex: 1, minWidth: 110 }}>
              <div className="stat-label">Total</div>
              <div className="stat-value">{uploadResult.num_molecules}</div>
              <div className="stat-sub">uploaded</div>
            </div>
            <div className="stat-card" style={{ flex: 1, minWidth: 110 }}>
              <div className="stat-label">Valid</div>
              <div className="stat-value" style={{ color: 'var(--green)' }}>{uploadResult.num_valid}</div>
              <div className="stat-sub">structures</div>
            </div>
            <div className="stat-card" style={{ flex: 1, minWidth: 110 }}>
              <div className="stat-label">Format</div>
              <div className="stat-value" style={{ fontSize: '1.2rem' }}>
                {uploadResult.source_format?.toUpperCase()}
              </div>
              <div className="stat-sub">detected</div>
            </div>
            <div className="stat-card" style={{ flex: 2, minWidth: 200 }}>
              <div className="stat-label">Properties detected</div>
              <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginTop: 5 }}>
                {uploadResult.property_columns?.length > 0
                  ? uploadResult.property_columns.map(col => (
                      <span key={col} className="badge badge-teal">{col}</span>
                    ))
                  : <span style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>None detected</span>
                }
              </div>
            </div>
          </div>

          {/* ── Activity data section ── */}
          <div className="panel" style={{ marginBottom: 14 }}>
            <div
              className="panel-header"
              style={{ cursor: 'pointer' }}
              onClick={() => setActivityOpen(o => !o)}
            >
              <span style={{ fontSize: '0.8rem' }}>📊</span>
              <span className="panel-header-title">
                {activitySuccess
                  ? <span style={{ color: 'var(--green)' }}>✓ {activitySuccess}</span>
                  : '＋ Add Activity Data (optional)'}
              </span>
              <span style={{ marginLeft: 'auto', color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                {activityOpen ? '▲' : '▼'}
              </span>
            </div>
            {activityOpen && (
              <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border)' }}>
                <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: 10 }}>
                  Upload a CSV with a label column matching your molecules and one or more
                  numeric activity columns (pIC50, Ki, IC50, etc.).
                </p>
                <div
                  style={{
                    border: '2px dashed var(--border)', borderRadius: 'var(--radius)',
                    padding: '20px', textAlign: 'center', cursor: 'pointer',
                  }}
                  onClick={() => activityInputRef.current?.click()}
                  onDragOver={e => e.preventDefault()}
                  onDrop={e => {
                    e.preventDefault()
                    const f = e.dataTransfer.files[0]
                    if (f) handleActivityFile(f)
                  }}
                >
                  {activityUploading
                    ? <span style={{ color: 'var(--text-muted)' }}>Uploading…</span>
                    : <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                        Drop CSV here or <span style={{ color: 'var(--nanome-cyan)' }}>click to browse</span>
                      </span>}
                </div>
                <input
                  ref={activityInputRef}
                  type="file"
                  accept=".csv"
                  style={{ display: 'none' }}
                  onChange={e => { const f = e.target.files[0]; if (f) handleActivityFile(f) }}
                />
                {activityError && (
                  <p style={{ color: 'var(--red)', fontSize: '0.78rem', marginTop: 8 }}>
                    {activityError}
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Molecule preview */}
          <div className="panel" style={{ marginBottom: 14 }}>
            <div className="panel-header">
              <span style={{ fontSize: '0.8rem', color: 'var(--blue-l)' }}>⬡</span>
              <span className="panel-header-title">Molecule Preview</span>
              <span className="panel-header-actions">
                <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                  {uploadResult.sample_svgs?.length} shown
                </span>
              </span>
            </div>
            <div style={{
              display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
              gap: 8, padding: 12,
            }}>
              {uploadResult.sample_svgs?.map((svg, i) => (
                <div key={i} style={{
                  background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius)', overflow: 'hidden', transition: 'border-color 0.15s',
                }}
                  onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--border-default)'}
                  onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border-subtle)'}
                >
                  <div style={{ width: '100%', aspectRatio: '4/3', background: '#fff' }}
                    dangerouslySetInnerHTML={{ __html: svg || '' }} />
                  <div style={{
                    padding: '5px 7px', borderTop: '1px solid var(--border-dim)',
                    fontFamily: 'var(--font-mono)', fontSize: '0.64rem', color: 'var(--text-muted)',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {uploadResult.sample_labels?.[i] || `Mol_${i}`}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {uploadResult.errors?.length > 0 && (
            <div style={{
              padding: '8px 12px', marginBottom: 12,
              background: 'rgba(245,158,11,0.07)', border: '1px solid rgba(245,158,11,0.22)',
              borderRadius: 'var(--radius)', fontSize: '0.78rem', color: 'var(--amber)',
            }}>
              ⚠ {uploadResult.errors.length} parse warning(s): {uploadResult.errors[0]}
            </div>
          )}

          <div style={{ display: 'flex', gap: 10 }}>
            <button className="btn btn-ghost"
              onClick={() => { setUploadResult(null); setError(null) }}>
              ← Upload different file
            </button>
            <button className="btn btn-cyan btn-lg" onClick={() => onComplete(uploadResult)}>
              Configure Analysis →
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={{
      flex: 1, display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      padding: '36px 24px', gap: 24, overflow: 'auto',
    }}>
      {/* Hero */}
      <div style={{ textAlign: 'center', maxWidth: 500 }}>
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          padding: '4px 12px', borderRadius: 'var(--radius-pill)',
          background: 'rgba(0,196,212,0.07)', border: '1px solid rgba(0,196,212,0.2)',
          marginBottom: 14,
        }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--nanome-cyan)', display: 'inline-block' }} />
          <span style={{ fontSize: '0.68rem', color: 'var(--nanome-cyan)', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
            Step 1 of 3
          </span>
        </div>
        <h1 style={{ marginBottom: 10 }}>Upload Compound Dataset</h1>
        <p>
          Load your compound series as SDF, CSV (with SMILES column), or a plain SMILES file.
          The agent pipeline will auto-detect the best analysis strategy.
        </p>
      </div>

      {/* Dropzone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        className={`dropzone ${dragging ? 'dragging' : ''}`}
        style={{ width: '100%', maxWidth: 500, minHeight: 200, padding: 32 }}
      >
        <input ref={inputRef} type="file" accept=".sdf,.mol,.csv,.smi,.smiles,.txt"
          style={{ display: 'none' }}
          onChange={(e) => handleFile(e.target.files[0])} />

        {uploading ? (
          <>
            <div style={{
              width: 36, height: 36, border: '3px solid var(--border-subtle)',
              borderTopColor: 'var(--nanome-cyan)', borderRadius: '50%', animation: 'spin 0.8s linear infinite',
            }} />
            <div style={{ fontSize: '0.83rem', color: 'var(--text-secondary)' }}>Parsing file…</div>
          </>
        ) : (
          <>
            <div style={{
              width: 52, height: 52, borderRadius: 'var(--radius-lg)',
              background: 'var(--bg-surface)', border: '1px solid var(--border-default)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                <path d="M12 16V8M8 12l4-4 4 4" stroke="var(--nanome-cyan)" strokeWidth="1.8"
                  strokeLinecap="round" strokeLinejoin="round" />
                <path d="M4 18h16" stroke="var(--border-default)" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '0.92rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4 }}>
                Drop your file here
              </div>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>or click to browse</div>
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              {['SDF', 'CSV', 'SMILES'].map(f => (
                <span key={f} className="badge badge-teal">{f}</span>
              ))}
            </div>
          </>
        )}
      </div>

      {error && (
        <div style={{
          maxWidth: 500, width: '100%', padding: '10px 14px',
          background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)',
          borderRadius: 'var(--radius)', color: 'var(--red)', fontSize: '0.82rem',
        }}>
          ⚠ {error}
        </div>
      )}

      {/* Format guide */}
      <div style={{ display: 'flex', gap: 8, maxWidth: 500, width: '100%' }}>
        {[
          { ext: 'SDF', desc: 'MDL SDF with property fields' },
          { ext: 'CSV', desc: 'SMILES column + numeric props' },
          { ext: 'SMILES', desc: 'One SMILES per line, opt. ID' },
        ].map(f => (
          <div key={f.ext} className="panel" style={{ flex: 1, padding: '10px 12px' }}>
            <span className="badge badge-teal" style={{ marginBottom: 6, display: 'inline-flex' }}>{f.ext}</span>
            <div style={{ fontSize: '0.71rem', color: 'var(--text-muted)', lineHeight: 1.4 }}>{f.desc}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
