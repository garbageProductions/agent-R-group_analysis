import { useState, useRef, useCallback } from 'react'
import { uploadFile } from '../api.js'

export default function UploadPage({ onComplete }) {
  const [dragging, setDragging] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadResult, setUploadResult] = useState(null)
  const [error, setError] = useState(null)
  const inputRef = useRef()

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

  const onDrop = (e) => {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }

  return (
    <div style={{
      flex: 1,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: uploadResult ? 'flex-start' : 'center',
      padding: '40px 32px',
      gap: 32,
      overflow: 'auto',
    }}>

      {!uploadResult ? (
        <>
          {/* ── Hero ── */}
          <div style={{ textAlign: 'center', maxWidth: 560 }}>
            <div style={{
              fontFamily: 'var(--font-display)',
              fontSize: '0.7rem',
              letterSpacing: '0.2em',
              textTransform: 'uppercase',
              color: 'var(--teal)',
              marginBottom: 12,
            }}>
              ◈  STEP 1 OF 3
            </div>
            <h1 style={{ marginBottom: 10 }}>Upload Compound Dataset</h1>
            <p style={{ fontSize: '0.9rem' }}>
              Load your compound series as SDF, CSV (with SMILES column), or a plain SMILES file.
              The agent pipeline will auto-detect the best analysis strategy.
            </p>
          </div>

          {/* ── Drop zone ── */}
          <div
            onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            onClick={() => inputRef.current?.click()}
            style={{
              width: '100%',
              maxWidth: 560,
              minHeight: 220,
              border: `2px dashed ${dragging ? 'var(--blue)' : 'var(--border-default)'}`,
              borderRadius: 'var(--radius-lg)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 14,
              cursor: 'pointer',
              background: dragging ? 'rgba(59,130,246,0.06)' : 'var(--bg-card)',
              transition: 'all 0.2s',
              boxShadow: dragging ? '0 0 40px rgba(59,130,246,0.15) inset' : 'none',
            }}>
            <input ref={inputRef} type="file" accept=".sdf,.mol,.csv,.smi,.smiles,.txt"
              style={{ display: 'none' }}
              onChange={(e) => handleFile(e.target.files[0])} />

            {uploading ? (
              <>
                <div style={{
                  width: 36, height: 36,
                  border: '3px solid var(--border-subtle)',
                  borderTopColor: 'var(--blue)',
                  borderRadius: '50%',
                  animation: 'spin 0.8s linear infinite',
                }} />
                <div style={{ fontFamily: 'var(--font-display)', fontSize: '0.8rem',
                  color: 'var(--text-secondary)', letterSpacing: '0.06em' }}>
                  PARSING FILE…
                </div>
              </>
            ) : (
              <>
                {/* Upload icon */}
                <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
                  <circle cx="24" cy="24" r="23" stroke="var(--border-default)" strokeWidth="1.5" />
                  <path d="M24 30V18M18 23l6-6 6 6" stroke="var(--blue)" strokeWidth="2"
                    strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M16 34h16" stroke="var(--border-default)" strokeWidth="1.5"
                    strokeLinecap="round" />
                </svg>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontFamily: 'var(--font-display)', fontWeight: 600,
                    fontSize: '0.9rem', color: 'var(--text-primary)', marginBottom: 4 }}>
                    Drop your file here
                  </div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                    or click to browse · SDF · CSV · SMILES
                  </div>
                </div>
              </>
            )}
          </div>

          {error && (
            <div style={{
              maxWidth: 560, width: '100%',
              background: 'rgba(239,68,68,0.08)',
              border: '1px solid rgba(239,68,68,0.3)',
              borderRadius: 'var(--radius)',
              padding: '12px 16px',
              color: 'var(--red)',
              fontSize: '0.82rem',
              fontFamily: 'var(--font-mono)',
            }}>
              ⚠ {error}
            </div>
          )}

          {/* Format guide */}
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center', maxWidth: 560 }}>
            {[
              { ext: 'SDF',    desc: 'MDL SDF with property fields' },
              { ext: 'CSV',    desc: 'SMILES column + numeric properties' },
              { ext: 'SMILES', desc: 'One SMILES per line, optional ID' },
            ].map(f => (
              <div key={f.ext} className="card" style={{ padding: '12px 16px', flex: '1', minWidth: 140 }}>
                <span className="badge badge-blue" style={{ marginBottom: 8 }}>{f.ext}</span>
                <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>{f.desc}</div>
              </div>
            ))}
          </div>
        </>
      ) : (
        /* ── Post-upload: preview ── */
        <div style={{ width: '100%', maxWidth: 1100, animation: 'fadeIn 0.4s ease' }}>
          {/* Stats row */}
          <div style={{ display: 'flex', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>
            <div className="stat-card" style={{ flex: 1, minWidth: 140 }}>
              <div className="stat-label">Total</div>
              <div className="stat-value">{uploadResult.num_molecules}</div>
              <div className="stat-sub">molecules uploaded</div>
            </div>
            <div className="stat-card" style={{ flex: 1, minWidth: 140 }}>
              <div className="stat-label">Valid</div>
              <div className="stat-value" style={{ color: 'var(--green)' }}>{uploadResult.num_valid}</div>
              <div className="stat-sub">parseable structures</div>
            </div>
            <div className="stat-card" style={{ flex: 1, minWidth: 140 }}>
              <div className="stat-label">Format</div>
              <div className="stat-value" style={{ fontSize: '1.2rem' }}>
                {uploadResult.source_format?.toUpperCase()}
              </div>
              <div className="stat-sub">detected format</div>
            </div>
            <div className="stat-card" style={{ flex: 2, minWidth: 200 }}>
              <div className="stat-label">Properties detected</div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
                {uploadResult.property_columns?.length > 0
                  ? uploadResult.property_columns.map(col => (
                      <span key={col} className="badge badge-teal">{col}</span>
                    ))
                  : <span style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>None detected</span>
                }
              </div>
            </div>
          </div>

          {/* Molecule preview grid */}
          <div style={{ marginBottom: 8 }}>
            <div className="section-title">Molecule Preview</div>
          </div>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
            gap: 10,
            marginBottom: 24,
          }}>
            {uploadResult.sample_svgs?.map((svg, i) => (
              <div key={i} className="card" style={{ padding: 12 }}>
                <div
                  style={{ width: '100%', aspectRatio: '4/3', overflow: 'hidden', borderRadius: 4,
                    background: '#fff', marginBottom: 8 }}
                  dangerouslySetInnerHTML={{ __html: svg || '' }}
                />
                <div style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '0.65rem',
                  color: 'var(--text-muted)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}>
                  {uploadResult.sample_labels?.[i] || `Mol_${i}`}
                </div>
              </div>
            ))}
          </div>

          {uploadResult.errors?.length > 0 && (
            <div style={{
              background: 'rgba(245,158,11,0.08)',
              border: '1px solid rgba(245,158,11,0.3)',
              borderRadius: 'var(--radius)',
              padding: '10px 14px',
              marginBottom: 20,
              fontSize: '0.78rem',
              color: 'var(--amber)',
            }}>
              ⚠ {uploadResult.errors.length} parse warning(s):&nbsp;
              {uploadResult.errors[0]}
            </div>
          )}

          <div style={{ display: 'flex', gap: 12 }}>
            <button className="btn btn-ghost"
              onClick={() => { setUploadResult(null); setError(null) }}>
              ← Upload different file
            </button>
            <button className="btn btn-primary btn-lg"
              onClick={() => onComplete(uploadResult)}>
              Configure Analysis →
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
