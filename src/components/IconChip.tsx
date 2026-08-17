/**
 * The 8 real desktop sections (DesktopHome's own SPEC-mandated card list —
 * see decision 0013 for why Payment targets/Approvals aren't their own
 * entries). This is the one place the section-to-color-and-icon mapping
 * lives; Sidebar, DesktopHome, and every restyled screen's header import
 * SectionKey and IconChip from here rather than repeating the mapping.
 */
export type SectionKey =
  | 'vehicles'
  | 'drivers'
  | 'records'
  | 'maintenance'
  | 'accounting'
  | 'future-purchases'
  | 'export'
  | 'settings'

/** Real DesktopHome card copy, verbatim — the single source other
 *  components (Sidebar, a future page header) read the display name
 *  from, instead of re-typing "Future Purchases" etc. by hand. */
export const SECTION_LABELS: Record<SectionKey, string> = {
  vehicles: 'Vehicles',
  drivers: 'Drivers',
  records: 'Records',
  maintenance: 'Maintenance',
  accounting: 'Accounting',
  'future-purchases': 'Future Purchases',
  export: 'Export report',
  settings: 'Settings',
}

export const SECTION_ORDER: readonly SectionKey[] = [
  'vehicles',
  'drivers',
  'records',
  'maintenance',
  'accounting',
  'future-purchases',
  'export',
  'settings',
]

const CHIP_STYLES: Record<SectionKey, { bg: string; fg: string }> = {
  vehicles: { bg: 'bg-primary-50', fg: 'text-primary-600' },
  drivers: { bg: 'bg-violet-50', fg: 'text-violet-600' },
  records: { bg: 'bg-slate-100', fg: 'text-slate-600' },
  maintenance: { bg: 'bg-amber-50', fg: 'text-amber-600' },
  accounting: { bg: 'bg-emerald-50', fg: 'text-emerald-600' },
  'future-purchases': { bg: 'bg-indigo-50', fg: 'text-indigo-600' },
  export: { bg: 'bg-cyan-50', fg: 'text-cyan-600' },
  // Deliberately zinc, not slate/gray -- so Settings' chip is visually
  // distinguishable from Records' neutral one rather than reading as the
  // same "no color" choice twice.
  settings: { bg: 'bg-zinc-100', fg: 'text-zinc-600' },
}

/** One simple line-art icon per section, same stroke style as the app's
 *  own logo mark (rounded caps/joins, 1.6-1.8 stroke-width, 24x24 grid) --
 *  hand-drawn to match rather than pulling in an icon-library dependency
 *  for 8 static glyphs. Exported so Sidebar can render the bare glyph
 *  (no pastel chip background) for nav rows -- the chip treatment is
 *  reserved for card/header identity, not a persistently-visible nav
 *  list, per the approved redesign scope. */
export function SectionGlyph({ section }: { section: SectionKey }) {
  switch (section) {
    case 'vehicles':
      return (
        <>
          <path d="M2 8.5A1 1 0 0 1 3 7.5h8.5a1 1 0 0 1 .95.68L13.5 12H19a2 2 0 0 1 2 2v2.5H2V8.5Z" />
          <path d="M13.5 12v4.5" />
          <path d="M2 16.5h1.6" />
          <circle cx="6.5" cy="17.5" r="1.7" />
          <circle cx="16.5" cy="17.5" r="1.7" />
        </>
      )
    case 'drivers':
      return (
        <>
          <circle cx="12" cy="8" r="3.2" />
          <path d="M5 20c0-3.6 3.1-6.5 7-6.5s7 2.9 7 6.5" />
        </>
      )
    case 'records':
      return (
        <>
          <path d="M7 3.5h7l4 4V19a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 6 19V5A1.5 1.5 0 0 1 7 3.5Z" />
          <path d="M14 3.5V8h4" />
          <path d="M9 12h6" />
          <path d="M9 15.5h6" />
        </>
      )
    case 'maintenance':
      return (
        <path d="M14.7 6.3a4 4 0 0 0-5.4 4.9L4 16.5V20h3.5l5.3-5.3a4 4 0 0 0 4.9-5.4l-2.6 2.6-2-2 2.6-2.6Z" />
      )
    case 'accounting':
      return (
        <>
          <path d="M4 20V10" />
          <path d="M10 20V4" />
          <path d="M16 20v-7" />
          <path d="M4 20h16" />
        </>
      )
    case 'future-purchases':
      return (
        <>
          <path d="M6 21V4" />
          <path d="M6 4h11l-3 3.5L17 11H6" />
        </>
      )
    case 'export':
      return (
        <>
          <path d="M12 4v10" />
          <path d="M8 10.5 12 14.5 16 10.5" />
          <path d="M4 18h16" />
        </>
      )
    case 'settings':
      return (
        <>
          <path d="M4 6h11" />
          <circle cx="17.2" cy="6" r="1.8" />
          <path d="M4 12h5.8" />
          <circle cx="12" cy="12" r="1.8" />
          <path d="M4 18h11" />
          <circle cx="17.2" cy="18" r="1.8" />
        </>
      )
  }
}

interface IconChipProps {
  section: SectionKey
  /** Chip side length in pixels. */
  size?: number
  className?: string
}

/** A pastel rounded-square chip with a section's glyph -- the section-
 *  identity treatment applied to every major desktop destination and
 *  every home-screen stat/action card (deliberately not extended to
 *  individual list rows or small buttons, per the approved scope). */
export function IconChip({ section, size = 40, className = '' }: IconChipProps) {
  const style = CHIP_STYLES[section]
  return (
    <div
      className={`flex shrink-0 items-center justify-center rounded-xl ${style.bg} ${className}`}
      style={{ width: size, height: size }}
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.7}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        className={style.fg}
        style={{ width: size * 0.52, height: size * 0.52 }}
      >
        <SectionGlyph section={section} />
      </svg>
    </div>
  )
}
