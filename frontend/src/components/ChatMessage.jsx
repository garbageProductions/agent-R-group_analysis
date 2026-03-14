import ToolCallCard from './ToolCallCard.jsx'

/**
 * ChatMessage — renders a single message bubble in the chat interface.
 *
 * msg shape:
 *   { role: 'user'|'assistant'|'system', content: string, toolCalls: [...], timestamp }
 *
 * toolCall shape (within assistant messages):
 *   { tool, inputSummary, summary?, data?, error?, isRunning? }
 */
export default function ChatMessage({ msg }) {
  const isUser   = msg.role === 'user'
  const isSystem = msg.role === 'system'

  if (isSystem) {
    return (
      <div style={{
        display: 'flex', justifyContent: 'center',
        margin: '8px 0',
      }}>
        <div style={{
          fontFamily: 'var(--font-display)', fontSize: '0.65rem',
          letterSpacing: '0.08em', textTransform: 'uppercase',
          color: 'var(--text-muted)',
          background: 'var(--bg-surface)',
          border: '1px solid var(--border-dim)',
          borderRadius: 'var(--radius-sm)',
          padding: '4px 12px',
        }}>
          {msg.content}
        </div>
      </div>
    )
  }

  return (
    <div style={{
      display: 'flex',
      flexDirection: isUser ? 'row-reverse' : 'row',
      alignItems: 'flex-start',
      gap: 10,
      margin: '10px 0',
    }}>
      {/* Avatar */}
      <div style={{
        width: 30, height: 30, flexShrink: 0,
        borderRadius: '50%',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: '0.7rem', fontWeight: 700,
        fontFamily: 'var(--font-display)',
        background: isUser ? 'var(--bg-surface)' : 'rgba(59,130,246,0.15)',
        border: `1px solid ${isUser ? 'var(--border-subtle)' : 'var(--blue)33'}`,
        color: isUser ? 'var(--text-muted)' : 'var(--blue)',
      }}>
        {isUser ? 'You' : 'RG'}
      </div>

      {/* Bubble container */}
      <div style={{
        maxWidth: 'calc(100% - 50px)',
        display: 'flex', flexDirection: 'column',
        alignItems: isUser ? 'flex-end' : 'flex-start',
        gap: 4,
      }}>
        {/* Tool calls (agent messages only) */}
        {!isUser && msg.toolCalls?.length > 0 && (
          <div style={{ width: '100%' }}>
            {msg.toolCalls.map((tc, i) => (
              <ToolCallCard key={i} {...tc} />
            ))}
          </div>
        )}

        {/* Text bubble */}
        {msg.content && (
          <div style={{
            padding: '10px 14px',
            borderRadius: isUser ? '14px 4px 14px 14px' : '4px 14px 14px 14px',
            background: isUser ? 'rgba(59,130,246,0.12)' : 'var(--bg-card)',
            border: `1px solid ${isUser ? 'rgba(59,130,246,0.25)' : 'var(--border-subtle)'}`,
            fontFamily: 'var(--font-body, DM Sans)', fontSize: '0.85rem',
            lineHeight: 1.65,
            color: 'var(--text-primary)',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
          }}>
            {msg.content}
          </div>
        )}

        {/* Timestamp */}
        {msg.timestamp && (
          <div style={{
            fontFamily: 'var(--font-display)', fontSize: '0.58rem',
            letterSpacing: '0.06em',
            color: 'var(--text-muted)',
            marginTop: 2,
          }}>
            {msg.timestamp}
          </div>
        )}
      </div>
    </div>
  )
}
