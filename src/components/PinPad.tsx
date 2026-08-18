import { useCallback, useEffect } from 'react'

interface PinPadProps {
  value: string
  onChange: (value: string) => void
  onSubmit: (pin: string) => void
  disabled?: boolean
}

const DIGITS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'back'] as const

/**
 * Large-target numeric PIN entry. Auto-submits at 4 digits — one obvious
 * action, no separate submit button to tap, matching SPEC section 5's "large
 * touch controls, simple" for the mobile workspaces.
 */
export function PinPad({ value, onChange, onSubmit, disabled }: PinPadProps) {
  const press = useCallback(
    (key: string) => {
      if (disabled) return
      if (key === 'back') {
        onChange(value.slice(0, -1))
        return
      }
      if (value.length >= 4) return
      const next = value + key
      onChange(next)
      if (next.length === 4) onSubmit(next)
    },
    [disabled, onChange, onSubmit, value],
  )

  // Physical keyboard support, useful when testing in a desktop browser.
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key >= '0' && e.key <= '9') press(e.key)
      if (e.key === 'Backspace') press('back')
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [press])

  return (
    <div className="flex flex-col items-center gap-8">
      <div className="flex gap-4" aria-label={`PIN entry, ${value.length} of 4 digits entered`}>
        {[0, 1, 2, 3].map((i) => (
          <span
            key={i}
            className={`h-4 w-4 rounded-full border-2 border-primary-300 ${
              i < value.length ? 'bg-primary-600' : 'bg-transparent'
            }`}
          />
        ))}
      </div>

      <div className="grid grid-cols-3 gap-3">
        {DIGITS.map((key, i) =>
          key === '' ? (
            <div key={i} />
          ) : (
            <button
              key={i}
              type="button"
              disabled={disabled}
              onClick={() => press(key)}
              aria-label={key === 'back' ? 'Backspace' : `Digit ${key}`}
              className="flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-100 text-2xl font-medium text-slate-800 active:bg-slate-200 disabled:opacity-50"
            >
              {key === 'back' ? '⌫' : key}
            </button>
          ),
        )}
      </div>
    </div>
  )
}
