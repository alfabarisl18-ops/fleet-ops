interface SelectableCardProps {
  selected: boolean
  onClick: () => void
  children: React.ReactNode
  /** Small checkmark badge in the corner when selected — matches the reference's picker style. */
  showCheck?: boolean
  disabled?: boolean
  className?: string
}

/**
 * The recurring "selected = blue border + light blue fill" pattern seen
 * throughout the reference across every kind of choice (day outcome,
 * vehicle picker, payment type, payment frequency) — this project had no
 * shared implementation before the redesign; several pickers (e.g.
 * VehiclePaymentScreen's day-outcome buttons) had no persistent
 * selected-state styling at all. This is a structural fix, not a logic
 * change: callers keep their own state and onClick handler, this only
 * renders the chosen look.
 */
export function SelectableCard({ selected, onClick, children, showCheck = false, disabled, className = '' }: SelectableCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={selected}
      className={`relative rounded-xl border px-4 py-3 text-left transition-colors motion-reduce:transition-none ${
        selected ? 'border-primary-600 bg-primary-50' : 'border-slate-300 bg-white active:bg-slate-50'
      } disabled:opacity-50 ${className}`}
    >
      {children}
      {showCheck && selected && (
        <span className="absolute top-2 right-2 flex h-5 w-5 items-center justify-center rounded-full bg-primary-600 text-white">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3" aria-hidden="true">
            <path d="M5 12.5 10 17l9-9.5" />
          </svg>
        </span>
      )}
    </button>
  )
}
