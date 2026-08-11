// Money is integer minor units (SLE × 100) everywhere — database, API,
// application code. This is the one place a user-typed amount crosses from
// "text a person typed" into that integer, and the one place an integer
// minor-unit amount is formatted back into what a person reads. Every screen
// that captures or displays an amount goes through these two functions
// rather than rolling its own — see CLAUDE.md's money rules.

/**
 * Parses a user-typed leone amount (e.g. "35,000", "35000.5") into integer
 * minor units. Returns null for anything that isn't a valid amount.
 *
 * Built entirely from string operations — never `parseFloat(input) * 100`.
 * Floating-point multiplication is exactly the failure mode CLAUDE.md's
 * "never a float" rule exists to prevent (0.1 + 0.2 style errors), and doing
 * this by string manipulation instead removes the possibility rather than
 * relying on rounding to paper over it.
 */
export function parseMinorUnits(input: string): number | null {
  const cleaned = input.trim().replace(/,/g, '')
  if (cleaned === '') return null

  const match = /^(-?)(\d+)(?:\.(\d{1,2}))?$/.exec(cleaned)
  if (!match) return null

  const [, sign, wholePart, fractionalPart] = match
  const cents = (fractionalPart ?? '').padEnd(2, '0')

  // wholePart and cents are both plain digit strings at this point, so this
  // concatenation is exact — no float ever enters the calculation.
  const minorUnitsString = `${sign}${wholePart}${cents}`.replace(/^(-?)0+(?=\d)/, '$1')
  const value = Number(minorUnitsString)

  return Number.isSafeInteger(value) ? value : null
}

/**
 * Formats integer minor units as a leone amount for display —
 * `formatMinorUnits(3_500_000)` → `"SLE 35,000"`. Negative amounts render
 * with a real minus sign (`"−SLE 1,000"`), matching CLAUDE.md's convention
 * for how expenses are shown.
 */
export function formatMinorUnits(minor: number): string {
  const negative = minor < 0
  const absolute = Math.abs(minor)
  const whole = Math.trunc(absolute / 100)
  const cents = absolute % 100

  const wholeFormatted = whole.toLocaleString('en-US')
  const amount = cents === 0 ? wholeFormatted : `${wholeFormatted}.${String(cents).padStart(2, '0')}`

  return `${negative ? '−' : ''}SLE ${amount}`
}
