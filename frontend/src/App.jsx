import { useState, useEffect } from 'react'
import GlobalHeader from './components/GlobalHeader.jsx'
import UploadPage   from './pages/UploadPage.jsx'
import ConfigPage   from './pages/ConfigPage.jsx'
import ResultsPage  from './pages/ResultsPage.jsx'
import ChatPage     from './pages/ChatPage.jsx'
import DocsPage     from './pages/DocsPage.jsx'
import DataSidePanel from './components/DataSidePanel.jsx'

/**
 * App — top-level page router + pipeline flow state.
 *
 * Top-level pages: 'pipeline' | 'chat' | 'docs'
 * Pipeline sub-steps: 'upload' | 'config' | 'analysis' | 'results'
 */
export default function App() {
  // Top-level navigation
  const [page, setPage] = useState('pipeline') // 'pipeline' | 'chat' | 'docs'

  // Pipeline flow
  const [step, setStep] = useState('upload') // 'upload' | 'config' | 'analysis' | 'results'
  const [uploadData, setUploadData] = useState(null)
  const [config, setConfig] = useState({
    propertyOfInterest: '',
    coreSmarts: '',
    runEnumeration: false,
    similarityThreshold: 0.7,
    activityDiffThreshold: 1.0,
    // Generative design
    runGenerative: false,
    generativeScoringMode: 'both',
    generativeIterations: 5,
    generativeSteps: 500,
  })
  const [sidePanelOpen, setSidePanelOpen] = useState(false)

  // Persist pipeline session across page refreshes
  useEffect(() => {
    const saved = sessionStorage.getItem('rg_session')
    if (saved) {
      try {
        const { uploadData: ud, step: s } = JSON.parse(saved)
        if (ud && s === 'results') {
          setUploadData(ud)
          setStep('results')
        }
      } catch {}
    }
  }, [])

  useEffect(() => {
    if (uploadData) {
      sessionStorage.setItem('rg_session', JSON.stringify({ uploadData, step }))
    }
  }, [uploadData, step])

  function handleUploadComplete(data) {
    setUploadData(data)
    if (data.property_columns?.length > 0) {
      setConfig(c => ({ ...c, propertyOfInterest: data.property_columns[0] }))
    }
    setStep('config')
  }

  function handleAnalysisStarted() { setStep('analysis') }
  function handleAnalysisComplete() { setStep('results') }

  function handleReset() {
    setUploadData(null)
    setStep('upload')
    sessionStorage.removeItem('rg_session')
  }

  function handleBackToUpload() {
    // Return to upload step keeping the existing session intact so
    // the user can add activity data and re-proceed to config.
    setStep('upload')
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <GlobalHeader
        page={page}
        onPageChange={setPage}
        step={step}
        sessionId={uploadData?.session_id}
        onReset={handleReset}
      />

      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        {/* ── Pipeline page ── */}
        {page === 'pipeline' && step === 'upload' && (
          <UploadPage
            onComplete={handleUploadComplete}
            initialUploadResult={uploadData}
          />
        )}
        {page === 'pipeline' && step === 'config' && (
          <ConfigPage
            uploadData={uploadData}
            config={config}
            setConfig={setConfig}
            onStart={handleAnalysisStarted}
            onBack={() => setStep('upload')}
            onBackToUpload={handleBackToUpload}
          />
        )}
        {page === 'pipeline' && (step === 'analysis' || step === 'results') && (
          <ResultsPage
            sessionId={uploadData?.session_id}
            config={config}
            isAnalysing={step === 'analysis'}
            onComplete={handleAnalysisComplete}
            onReset={handleReset}
          />
        )}

        {/* ── Chat page ── */}
        {page === 'chat' && <ChatPage />}

        {/* ── Docs page ── */}
        {page === 'docs' && <DocsPage />}

      </main>

      {uploadData && (
        <DataSidePanel
          sessionId={uploadData.session_id}
          labels={uploadData.all_labels || uploadData.sample_labels || []}
          propertyColumns={uploadData.property_columns || []}
          properties={uploadData.properties || {}}
          sampleSvgs={uploadData.sample_svgs || []}
          isOpen={sidePanelOpen}
          onToggle={() => setSidePanelOpen(o => !o)}
        />
      )}
    </div>
  )
}
