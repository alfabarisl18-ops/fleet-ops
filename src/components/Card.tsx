import type { SectionKey } from '@/components/IconChip'
import { IconChip } from '@/components/IconChip'

interface CardProps {
  children: React.ReactNode
  /** A section-style heading, e.g. "Identity", "Status" (VehicleProfileScreen's old Section()). */
  title?: string
  /** The small icon-chip + all-caps label pattern seen on modals ("TODAY", "FUTURE PURCHASE"). */
  eyebrow?: { section: SectionKey; label: string }
  /** Present → renders as a clickable button (home/action cards). Absent → a plain content wrapper. */
  onClick?: () => void
  className?: string
}

/**
 * The base `rounded-2xl bg-white shadow-sm` surface every card in the
 * redesign builds on — replaces the identical local `Section()` helper
 * duplicated in VehicleProfileScreen.tsx and DriverProfileScreen.tsx, and
 * the home/action-card className string repeated 27 times across
 * DesktopHome.tsx, CollectionsWorkspace.tsx, MaintenanceWorkspace.tsx, and
 * AccountingHome.tsx before this redesign.
 */
export function Card({ children, title, eyebrow, onClick, className = '' }: CardProps) {
  const Tag = onClick ? 'button' : 'div'
  return (
    <Tag
      {...(onClick ? { type: 'button' as const, onClick } : {})}
      className={`rounded-2xl bg-white p-4 text-left shadow-sm ${onClick ? 'active:bg-slate-50' : ''} ${className}`}
    >
      {eyebrow && (
        <div className="mb-3 flex items-center gap-2">
          <IconChip section={eyebrow.section} size={24} />
          <span className="text-xs font-semibold tracking-wide text-slate-500 uppercase">{eyebrow.label}</span>
        </div>
      )}
      {title && <h2 className="mb-3 text-sm font-semibold tracking-wide text-slate-500 uppercase">{title}</h2>}
      {children}
    </Tag>
  )
}
