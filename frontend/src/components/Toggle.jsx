/**
 * Toggle – Nanome-style pill toggle switch.
 *
 * Usage:
 *   <Toggle checked={value} onChange={setValue} label="Enable enumeration" />
 */
export default function Toggle({ checked, onChange, label, disabled = false, size = 'md' }) {
  const small = size === 'sm'
  return (
    <label
      className="toggle-switch"
      style={{ opacity: disabled ? 0.45 : 1, cursor: disabled ? 'not-allowed' : 'pointer' }}
      onClick={disabled ? undefined : () => onChange(!checked)}
    >
      <div
        className={`toggle-track ${checked ? 'on' : ''}`}
        style={small ? { width: 28, height: 16 } : {}}
      >
        <div
          className="toggle-thumb"
          style={small
            ? { width: 10, height: 10, top: 2, left: checked ? 14 : 2 }
            : {}
          }
        />
      </div>
      {label && <span className="toggle-label">{label}</span>}
    </label>
  )
}
