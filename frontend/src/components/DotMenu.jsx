import { useState, useRef, useEffect } from 'react'

/**
 * DotMenu – Nanome-style three-dot contextual menu.
 *
 * Usage:
 *   <DotMenu items={[
 *     { label: 'Zoom To', icon: '⊕', action: () => ... },
 *     { label: 'Add Annotation', icon: '✎', action: () => ... },
 *     { divider: true },
 *     { label: 'Remove', icon: '✕', action: () => ..., destructive: true },
 *   ]} />
 *
 *   items can also include: { section: 'Section label' }
 */
export default function DotMenu({ items = [], align = 'right', direction = 'down', className = '' }) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef(null)

  // Close when clicking outside
  useEffect(() => {
    if (!open) return
    function handleClick(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  // Close on Escape
  useEffect(() => {
    if (!open) return
    function handleKey(e) { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [open])

  return (
    <div className={`dot-menu-wrap ${className}`} ref={wrapRef}>
      <button
        className={`btn-dot-menu ${open ? 'open' : ''}`}
        onClick={(e) => { e.stopPropagation(); setOpen(o => !o) }}
        title="More options"
      >
        ⋮
      </button>

      {open && (
        <div
          className={`dot-menu-popup ${direction === 'up' ? 'above' : ''}`}
          style={align === 'left' ? { right: 'auto', left: 0 } : {}}
          onClick={(e) => e.stopPropagation()}
        >
          {items.map((item, i) => {
            if (item.divider) {
              return <div key={i} className="dot-menu-divider" />
            }
            if (item.section) {
              return <div key={i} className="dot-menu-section-label">{item.section}</div>
            }
            return (
              <button
                key={i}
                className={`dot-menu-item ${item.destructive ? 'destructive' : ''}`}
                disabled={item.disabled}
                onClick={() => {
                  setOpen(false)
                  item.action?.()
                }}
              >
                {item.icon && <span className="dot-menu-icon">{item.icon}</span>}
                {item.label}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
