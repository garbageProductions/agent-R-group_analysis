/**
 * Central API client for the R-Group Analysis Suite backend.
 * All URLs are relative — Vite proxy routes /api → http://localhost:8000
 */

const BASE = '/api'

// WebSocket base: use current host (Vite proxy forwards ws too)
export const WS_BASE = `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}`

async function request(path, opts = {}) {
  const res = await fetch(`${BASE}${path}`, opts)
  if (!res.ok) {
    let detail = res.statusText
    try { const body = await res.json(); detail = body.detail || detail } catch {}
    throw new Error(detail)
  }
  return res.json()
}

// ── Health ────────────────────────────────────────────────────
export const getHealth = () => request('/health')
export const getTools  = () => request('/tools')

// ── Upload ────────────────────────────────────────────────────
export async function uploadFile(file) {
  const form = new FormData()
  form.append('file', file)
  const res = await fetch(`${BASE}/upload/`, { method: 'POST', body: form })
  if (!res.ok) {
    let detail = res.statusText
    try { const body = await res.json(); detail = body.detail || detail } catch {}
    throw new Error(detail)
  }
  return res.json()
}

export const getSession = (sessionId) => request(`/upload/session/${sessionId}`)

export async function uploadActivityFile(sessionId, file) {
  const form = new FormData()
  form.append('session_id', sessionId)
  form.append('file', file)
  const res = await fetch(`${BASE}/upload/activity`, { method: 'POST', body: form })
  if (!res.ok) {
    let detail = res.statusText
    try { const body = await res.json(); detail = body.detail || detail } catch {}
    throw new Error(detail)
  }
  return res.json()
}

// ── Analysis ──────────────────────────────────────────────────
export function startAnalysis({ sessionId, propertyOfInterest, coreSmarts, runEnumeration, similarityThreshold, activityDiffThreshold, runGenerative, generativeConfig }) {
  return request('/analyze/start', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      session_id: sessionId,
      property_of_interest: propertyOfInterest || null,
      core_smarts: coreSmarts || null,
      run_enumeration: runEnumeration,
      similarity_threshold: similarityThreshold,
      activity_diff_threshold: activityDiffThreshold,
      run_generative: runGenerative || false,
      generative_config: generativeConfig || null,
    }),
  })
}

export const getAnalysisStatus = (sessionId) => request(`/analyze/status/${sessionId}`)

export function openProgressWS(sessionId) {
  return new WebSocket(`${WS_BASE}/api/analyze/ws/${sessionId}`)
}

// ── Results ───────────────────────────────────────────────────
export const getResults       = (sessionId) => request(`/results/${sessionId}`)
export const getReport        = (sessionId) => request(`/results/${sessionId}/report`)
export const getRGroupTable   = (sessionId) => request(`/results/${sessionId}/rgroup_table`)
export const getActivityCliffs = (sessionId, limit = 100) =>
  request(`/results/${sessionId}/activity_cliffs?limit=${limit}`)
export const getMMPTransforms  = (sessionId, propName, limit = 50) => {
  const q = propName ? `?property_name=${encodeURIComponent(propName)}&limit=${limit}` : `?limit=${limit}`
  return request(`/results/${sessionId}/mmp_transforms${q}`)
}

// SVG URLs (used directly as <img src="">)
export const getMolSvgUrl  = (sessionId, idx, w = 250, h = 200) =>
  `${BASE}/results/${sessionId}/svg/${idx}?width=${w}&height=${h}`
export const getSmilesSvgUrl = (smiles, w = 250, h = 200) =>
  `${BASE}/results/svg/smiles?smiles=${encodeURIComponent(smiles)}&width=${w}&height=${h}`

// ── Chat history (REST) ────────────────────────────────────────────────────────
export const getChatHistory    = ()         => request('/chat/history')
export const getChatSession    = (id)       => request(`/chat/history/${id}`)
export const patchChatSession  = (id, body) => request(`/chat/history/${id}`, {
  method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
})
export const deleteChatSession = (id) => request(`/chat/history/${id}`, { method: 'DELETE' })
