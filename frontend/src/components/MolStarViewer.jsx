import { useEffect, useRef, useState } from 'react'

const MOLSTAR_JS  = 'https://cdn.jsdelivr.net/npm/molstar@3.45.0/build/viewer/molstar.js'
const MOLSTAR_CSS = 'https://cdn.jsdelivr.net/npm/molstar@3.45.0/build/viewer/molstar.css'

/**
 * MolStarViewer — embeds a Mol* 3D viewer loaded from CDN.
 *
 * Props:
 *   sdfUrl  — full URL to a SDF endpoint (or null to show empty state)
 *   height  — pixel height of the viewer container (default 320)
 */
export default function MolStarViewer({ sdfUrl, height = 320 }) {
  const containerRef = useRef(null)
  const viewerRef    = useRef(null)  // holds the Mol* Viewer instance
  const [status, setStatus] = useState('idle')  // 'idle' | 'loading-script' | 'script-ready' | 'viewer-ready' | 'loading-mol' | 'ready' | 'error'
  const [errorMsg, setErrorMsg] = useState('')

  // ── Load Mol* script + CSS once ──────────────────────────────────────────
  useEffect(() => {
    // Inject CSS if not already present
    if (!document.querySelector(`link[href="${MOLSTAR_CSS}"]`)) {
      const link = document.createElement('link')
      link.rel = 'stylesheet'
      link.href = MOLSTAR_CSS
      document.head.appendChild(link)
    }

    // Inject script if not already present
    if (window.molstar) {
      setStatus('script-ready')
      return
    }
    const existing = document.querySelector(`script[src="${MOLSTAR_JS}"]`)
    if (existing) return  // loading in progress

    setStatus('loading-script')
    const script = document.createElement('script')
    script.src = MOLSTAR_JS
    script.async = true
    script.onload = () => setStatus('script-ready')
    script.onerror = () => {
      setStatus('error')
      setErrorMsg('Failed to load Mol* viewer from CDN.')
    }
    document.body.appendChild(script)
  }, [])

  // ── Initialise Mol* viewer once script is ready ───────────────────────────
  useEffect(() => {
    if (status !== 'script-ready' || !containerRef.current) return
    if (!window.molstar?.Viewer) {
      setStatus('error')
      setErrorMsg('Mol* Viewer API not available.')
      return
    }

    window.molstar.Viewer.create(containerRef.current, {
      layoutIsExpanded: false,
      layoutShowControls: false,
      layoutShowSequence: false,
      layoutShowLog: false,
      layoutShowLeftPanel: false,
    }).then(viewer => {
      viewerRef.current = viewer
      setStatus('viewer-ready')
    }).catch(err => {
      setStatus('error')
      setErrorMsg(`Viewer init failed: ${err.message}`)
    })

    return () => {
      if (viewerRef.current) {
        try { viewerRef.current.plugin.dispose() } catch {}
        viewerRef.current = null
      }
    }
  }, [status])

  // ── Load SDF whenever sdfUrl changes ─────────────────────────────────────
  useEffect(() => {
    if (status !== 'viewer-ready' && status !== 'ready') return
    if (!sdfUrl || !viewerRef.current) return

    setStatus('loading-mol')
    fetch(sdfUrl)
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.text()
      })
      .then(sdfText => {
        if (!viewerRef.current) return
        // Clear previous structure and load new one
        viewerRef.current.plugin.clear()
        return viewerRef.current.loadStructureFromData(sdfText, 'sdf', {})
      })
      .then(() => setStatus('ready'))
      .catch(err => {
        setStatus('error')
        setErrorMsg(`Could not load 3D structure: ${err.message}`)
      })
  }, [sdfUrl, status])

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{ position: 'relative', height, background: '#0d1117', borderRadius: 6, overflow: 'hidden' }}>
      {/* Mol* container */}
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />

      {/* Loading overlay */}
      {(status === 'loading-script' || status === 'loading-mol') && (
        <div style={{
          position: 'absolute', inset: 0, display: 'flex',
          alignItems: 'center', justifyContent: 'center',
          background: 'rgba(13,17,23,0.8)',
        }}>
          <span style={{ fontSize: '0.78rem', color: 'var(--text-muted, #8b949e)' }}>
            {status === 'loading-script' ? 'Loading Mol* viewer\u2026' : 'Loading 3D structure\u2026'}
          </span>
        </div>
      )}

      {/* Idle (no URL yet) */}
      {status === 'idle' && (
        <div style={{
          position: 'absolute', inset: 0, display: 'flex',
          alignItems: 'center', justifyContent: 'center',
        }}>
          <span style={{ fontSize: '0.78rem', color: 'var(--text-muted, #8b949e)' }}>
            Select a molecule to view in 3D
          </span>
        </div>
      )}

      {/* Error overlay */}
      {status === 'error' && (
        <div style={{
          position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', gap: 6,
          background: 'rgba(13,17,23,0.9)',
        }}>
          <span style={{ fontSize: '0.8rem', color: 'var(--red, #f87171)' }}>&#9888; 3D structure unavailable</span>
          <span style={{ fontSize: '0.72rem', color: 'var(--text-muted, #8b949e)', maxWidth: 240, textAlign: 'center' }}>
            {errorMsg}
          </span>
        </div>
      )}

      {/* Mol* branding (small) */}
      <div style={{
        position: 'absolute', bottom: 6, right: 8,
        fontSize: '0.6rem', color: '#30363d', pointerEvents: 'none',
      }}>
        Mol* 3.45.0
      </div>
    </div>
  )
}
