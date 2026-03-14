import { useState, useEffect } from 'react'

function formatDate(iso) {
  if (!iso) return ''
  const d   = new Date(iso)
  const now = new Date()
  const ms  = now - d
  if (ms < 60_000)        return 'just now'
  if (ms < 3_600_000)     return `${Math.floor(ms / 60_000)}m ago`
  if (ms < 86_400_000)    return `${Math.floor(ms / 3_600_000)}h ago`
  if (ms < 7 * 86_400_000) return d.toLocaleDateString([], { weekday: 'short' })
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' })
}

// ── Single chat item ──────────────────────────────────────────────────────────
function ChatItem({ chat, isActive, onSelect, onTogglePin, onDelete, onRename }) {
  const [hovered, setHovered]   = useState(false)
  const [editing, setEditing]   = useState(false)
  const [draftTitle, setDraft]  = useState(chat.title)

  function commitRename() {
    setEditing(false)
    const t = draftTitle.trim()
    if (t && t !== chat.title) onRename(t)
    else setDraft(chat.title)
  }

  return (
    <div
      onClick={() => !editing && onSelect()}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        padding: '8px 10px 8px 14px',
        cursor: editing ? 'default' : 'pointer',
        borderLeft: isActive ? '2px solid var(--blue)' : '2px solid transparent',
        background: isActive
          ? 'rgba(59,130,246,0.09)'
          : hovered ? 'rgba(255,255,255,0.03)' : 'transparent',
        transition: 'background 0.1s',
        userSelect: 'none',
      }}
    >
      {/* Title row */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 4 }}>
        {editing ? (
          <input
            autoFocus
            value={draftTitle}
            onChange={e => setDraft(e.target.value)}
            onBlur={commitRename}
            onKeyDown={e => {
              if (e.key === 'Enter') commitRename()
              if (e.key === 'Escape') { setEditing(false); setDraft(chat.title) }
              e.stopPropagation()
            }}
            onClick={e => e.stopPropagation()}
            style={{
              flex: 1,
              background: 'var(--bg-card)',
              border: '1px solid var(--blue)66',
              borderRadius: 3,
              padding: '2px 6px',
              color: 'var(--text-primary)',
              fontFamily: 'var(--font-body, DM Sans)',
              fontSize: '0.75rem',
              outline: 'none',
            }}
          />
        ) : (
          <div
            onDoubleClick={e => { e.stopPropagation(); setEditing(true) }}
            style={{
              flex: 1,
              fontFamily: 'var(--font-body, DM Sans)',
              fontSize: '0.75rem',
              color: isActive ? 'var(--text-bright)' : 'var(--text-primary)',
              fontWeight: isActive ? 600 : 400,
              lineHeight: 1.35,
              overflow: 'hidden',
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
            }}
          >
            {chat.title}
          </div>
        )}

        {/* Action buttons — appear on hover */}
        {!editing && (
          <div style={{
            display:    'flex',
            flexDirection: 'column',
            gap:        2,
            opacity:    hovered ? 1 : 0,
            transition: 'opacity 0.12s',
            flexShrink: 0,
          }}>
            <button
              title={chat.pinned ? 'Unpin' : 'Pin'}
              onClick={e => { e.stopPropagation(); onTogglePin() }}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                padding: '1px 3px', fontSize: '0.72rem', lineHeight: 1,
                color: chat.pinned ? '#f59e0b' : 'var(--text-muted)',
              }}
            >
              {chat.pinned ? '★' : '☆'}
            </button>
            <button
              title="Rename (or double-click title)"
              onClick={e => { e.stopPropagation(); setEditing(true) }}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                padding: '1px 3px', fontSize: '0.65rem', lineHeight: 1,
                color: 'var(--text-muted)',
              }}
            >
              ✎
            </button>
            <button
              title="Delete chat"
              onClick={e => { e.stopPropagation(); onDelete() }}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                padding: '1px 3px', fontSize: '0.65rem', lineHeight: 1,
                color: 'var(--text-muted)',
              }}
            >
              ✕
            </button>
          </div>
        )}
      </div>

      {/* Meta row */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 5, marginTop: 4, flexWrap: 'wrap',
      }}>
        {chat.molecule_file && (
          <span style={{
            fontFamily: 'var(--font-mono)', fontSize: '0.6rem',
            color: 'var(--teal)',
            background: 'rgba(20,184,166,0.1)',
            border: '1px solid rgba(20,184,166,0.2)',
            borderRadius: 3, padding: '1px 5px',
          }}>
            {chat.num_molecules || '?'} mol
          </span>
        )}
        {chat.num_messages > 0 && (
          <span style={{
            fontFamily: 'var(--font-mono)', fontSize: '0.6rem',
            color: 'var(--text-muted)',
          }}>
            {chat.num_messages} msg{chat.num_messages !== 1 ? 's' : ''}
          </span>
        )}
        {chat.pinned && (
          <span style={{ fontSize: '0.6rem', color: '#f59e0b' }}>★</span>
        )}
        <span style={{
          fontFamily: 'var(--font-mono)', fontSize: '0.6rem',
          color: 'var(--text-muted)', marginLeft: 'auto',
        }}>
          {formatDate(chat.updated_at)}
        </span>
      </div>
    </div>
  )
}

// ── Sidebar ───────────────────────────────────────────────────────────────────
export default function ChatHistorySidebar({
  activeId,
  onSelectChat,
  onNewChat,
  refreshTrigger,
}) {
  const [chats,   setChats]   = useState([])
  const [search,  setSearch]  = useState('')
  const [sort,    setSort]    = useState('newest')  // newest | oldest | pinned
  const [loading, setLoading] = useState(false)

  async function loadHistory() {
    setLoading(true)
    try {
      const res = await fetch('/api/chat/history')
      if (res.ok) setChats((await res.json()).chats || [])
    } catch (e) {
      console.error('Failed to load chat history', e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadHistory() }, [refreshTrigger])

  async function togglePin(chatId, currentPinned) {
    try {
      await fetch(`/api/chat/history/${chatId}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ pinned: !currentPinned }),
      })
      setChats(prev =>
        prev.map(c => c.id === chatId ? { ...c, pinned: !currentPinned } : c)
      )
    } catch (e) { console.error('Pin failed', e) }
  }

  async function renameChat(chatId, newTitle) {
    try {
      await fetch(`/api/chat/history/${chatId}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ title: newTitle }),
      })
      setChats(prev =>
        prev.map(c => c.id === chatId ? { ...c, title: newTitle } : c)
      )
    } catch (e) { console.error('Rename failed', e) }
  }

  async function deleteChat(chatId) {
    if (!window.confirm('Delete this chat? This cannot be undone.')) return
    try {
      await fetch(`/api/chat/history/${chatId}`, { method: 'DELETE' })
      setChats(prev => prev.filter(c => c.id !== chatId))
      if (activeId === chatId) onNewChat()
    } catch (e) { console.error('Delete failed', e) }
  }

  // Filter + sort
  const term     = search.toLowerCase()
  let filtered   = chats.filter(c => !term || c.title.toLowerCase().includes(term))

  if (sort === 'newest') {
    filtered = [...filtered].sort((a, b) =>
      (b.updated_at || '') > (a.updated_at || '') ? 1 : -1
    )
  } else if (sort === 'oldest') {
    filtered = [...filtered].sort((a, b) =>
      (a.updated_at || '') > (b.updated_at || '') ? 1 : -1
    )
  } else {
    // pinned first, then newest
    filtered = [...filtered].sort((a, b) => {
      if (a.pinned && !b.pinned) return -1
      if (!a.pinned && b.pinned) return  1
      return (b.updated_at || '') > (a.updated_at || '') ? 1 : -1
    })
  }

  const SORT_OPTIONS = ['newest', 'oldest', 'pinned']

  return (
    <div style={{
      width:    260,
      minWidth: 260,
      display:  'flex',
      flexDirection: 'column',
      height:   '100%',
      overflow: 'hidden',
      borderRight: '1px solid var(--border-subtle)',
      background:  'rgba(4, 7, 20, 0.85)',
    }}>

      {/* New Chat ─────────────────────────────────── */}
      <div style={{ padding: '12px 10px 8px' }}>
        <button
          onClick={onNewChat}
          style={{
            width:       '100%',
            background:  'transparent',
            border:      '1px solid var(--blue)',
            borderRadius: 'var(--radius-sm, 6px)',
            padding:     '8px 12px',
            color:        'var(--blue)',
            fontFamily:  'var(--font-display)',
            fontSize:    '0.7rem',
            fontWeight:  700,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            cursor:      'pointer',
            transition:  'background 0.15s',
            display:     'flex',
            alignItems:  'center',
            justifyContent: 'center',
            gap: 6,
          }}
          onMouseEnter={e => e.currentTarget.style.background = 'rgba(59,130,246,0.12)'}
          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
        >
          + New Chat
        </button>
      </div>

      {/* Search ────────────────────────────────────── */}
      <div style={{ padding: '2px 10px 6px' }}>
        <input
          type="text"
          placeholder="Search chats…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{
            width:       '100%',
            boxSizing:   'border-box',
            background:  'var(--bg-card)',
            border:      '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-sm, 6px)',
            padding:     '6px 10px',
            color:        'var(--text-secondary)',
            fontFamily:  'var(--font-mono)',
            fontSize:    '0.68rem',
            outline:     'none',
          }}
          onFocus={e => e.currentTarget.style.borderColor = 'rgba(59,130,246,0.5)'}
          onBlur={e => e.currentTarget.style.borderColor = 'var(--border-subtle)'}
        />
      </div>

      {/* Sort pills ─────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 4, padding: '2px 10px 8px' }}>
        {SORT_OPTIONS.map(s => (
          <button
            key={s}
            onClick={() => setSort(s)}
            style={{
              flex:          1,
              background:    sort === s ? 'rgba(59,130,246,0.15)' : 'transparent',
              border:        sort === s ? '1px solid rgba(59,130,246,0.35)' : '1px solid var(--border-subtle)',
              borderRadius:  'var(--radius-sm, 6px)',
              padding:       '4px 4px',
              color:         sort === s ? 'var(--blue)' : 'var(--text-muted)',
              fontFamily:    'var(--font-display)',
              fontSize:      '0.56rem',
              fontWeight:    600,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              cursor:        'pointer',
              transition:    'all 0.15s',
            }}
          >
            {s}
          </button>
        ))}
      </div>

      {/* Divider */}
      <div style={{ height: 1, background: 'var(--border-subtle)', margin: '0 10px 4px' }} />

      {/* Chat list ──────────────────────────────────── */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {loading && (
          <div style={{
            padding:    '24px 16px',
            color:       'var(--text-muted)',
            fontFamily: 'var(--font-mono)',
            fontSize:   '0.65rem',
            textAlign:  'center',
          }}>
            Loading…
          </div>
        )}

        {!loading && filtered.length === 0 && (
          <div style={{
            padding:    '24px 16px',
            color:       'var(--text-muted)',
            fontFamily: 'var(--font-mono)',
            fontSize:   '0.65rem',
            textAlign:  'center',
            lineHeight: 1.7,
          }}>
            {search ? 'No matching chats' : (
              <>
                No saved chats yet.
                <br />
                Start a conversation to<br />begin your history.
              </>
            )}
          </div>
        )}

        {filtered.map(chat => (
          <ChatItem
            key={chat.id}
            chat={chat}
            isActive={chat.id === activeId}
            onSelect={() => onSelectChat(chat.id)}
            onTogglePin={() => togglePin(chat.id, chat.pinned)}
            onRename={title => renameChat(chat.id, title)}
            onDelete={() => deleteChat(chat.id)}
          />
        ))}
      </div>

      {/* Footer: chat count */}
      {chats.length > 0 && (
        <div style={{
          padding:    '6px 14px',
          borderTop:  '1px solid var(--border-subtle)',
          fontFamily: 'var(--font-mono)',
          fontSize:   '0.58rem',
          color:       'var(--text-muted)',
        }}>
          {chats.length} chat{chats.length !== 1 ? 's' : ''} saved locally
        </div>
      )}
    </div>
  )
}
