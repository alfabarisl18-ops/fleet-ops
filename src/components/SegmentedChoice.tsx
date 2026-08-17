import { SelectableCard } from '@/components/SelectableCard'

interface SegmentedChoiceProps<T extends string> {
  options: readonly T[]
  value: T
  onChange: (value: T) => void
  /** Defaults to the value itself; pass a label map for display text that differs from the value. */
  labels?: Record<T, string>
  className?: string
}

/**
 * A thin convenience wrapper over SelectableCard for the common case of a
 * single-row set of mutually-exclusive choices (payment frequency,
 * shortfall cause, etc.) — adopted screen by screen as each form is
 * restyled, not forced everywhere in one pass.
 */
export function SegmentedChoice<T extends string>({ options, value, onChange, labels, className = '' }: SegmentedChoiceProps<T>) {
  return (
    <div className={`flex flex-wrap gap-2 ${className}`}>
      {options.map((option) => (
        <SelectableCard key={option} selected={value === option} onClick={() => onChange(option)} className="px-4 py-2 text-sm font-medium">
          {labels ? labels[option] : option}
        </SelectableCard>
      ))}
    </div>
  )
}
