import { Logo } from '@/components/Logo'
import type { SectionKey } from '@/components/IconChip'
import { SECTION_LABELS, SECTION_ORDER, SectionGlyph } from '@/components/IconChip'
import { ROLE_LABELS } from '@/constants/labels'
import type { SignedInUser } from '@/data/auth'

export type NavTarget = SectionKey | 'home'

interface SidebarProps {
  user: SignedInUser
  active: NavTarget
  onNavigate: (target: NavTarget) => void
  onSignOut: () => void
  /** Off-canvas drawer state, used only below the `lg` breakpoint. */
  open: boolean
  onClose: () => void
}

/**
 * The persistent desktop-only left nav — real destinations (DesktopHome's
 * own 8 sections, plus Home itself), the real signed-in user's name and
 * role (WorkspaceHeader's existing `{displayName} · {ROLE_LABELS[role]}`
 * line, not the reference's invented "Private family system" copy).
 *
 * DesktopWorkspace is gated by role, not viewport — a Fleet Manager can
 * open this at any window width — so below `lg` (1024px) this renders as
 * an off-canvas drawer instead of a fixed column, per "prevent horizontal
 * overflow, support tablet." Both renderings share the same nav content
 * so there's exactly one place that list is defined.
 */
export function Sidebar({ user, active, onNavigate, onSignOut, open, onClose }: SidebarProps) {
  const navRows = (
    <nav className="mt-8 flex flex-1 flex-col gap-1">
      <NavRow label="Home" active={active === 'home'} onClick={() => onNavigate('home')}>
        <HomeGlyph />
      </NavRow>
      {SECTION_ORDER.map((section) => (
        <NavRow key={section} label={SECTION_LABELS[section]} active={active === section} onClick={() => onNavigate(section)}>
          <SectionGlyph section={section} />
        </NavRow>
      ))}
    </nav>
  )

  const footer = (
    <div className="mt-auto border-t border-slate-100 pt-4">
      <p className="truncate text-sm font-medium text-slate-900">{user.displayName}</p>
      <p className="text-xs text-slate-500">{ROLE_LABELS[user.role]}</p>
      <button type="button" onClick={onSignOut} className="mt-2 text-sm font-medium text-slate-500 underline decoration-slate-300">
        Sign out
      </button>
    </div>
  )

  return (
    <>
      <aside className="hidden w-64 shrink-0 flex-col border-r border-slate-100 bg-white p-4 lg:flex">
        <Logo size={36} />
        {navRows}
        {footer}
      </aside>

      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button type="button" aria-label="Close menu" onClick={onClose} className="absolute inset-0 bg-slate-900/40" />
          <aside className="relative flex h-full w-72 max-w-[85vw] flex-col bg-white p-4 shadow-xl">
            <div className="flex items-center justify-between">
              <Logo size={32} />
              <button type="button" aria-label="Close menu" onClick={onClose} className="rounded-full p-1.5 text-slate-500 active:bg-slate-100">
                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            </div>
            {navRows}
            {footer}
          </aside>
        </div>
      )}
    </>
  )
}

function NavRow({ label, active, onClick, children }: { label: string; active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium transition-colors motion-reduce:transition-none ${
        active ? 'bg-primary-50 text-primary-700' : 'text-slate-600 active:bg-slate-50'
      }`}
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.7}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        className={`h-5 w-5 shrink-0 ${active ? 'text-primary-600' : 'text-slate-400'}`}
      >
        {children}
      </svg>
      {label}
    </button>
  )
}

function HomeGlyph() {
  return (
    <>
      <path d="M4 11.5 12 4l8 7.5" />
      <path d="M6 10v9.5a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V10" />
      <path d="M10 20.5v-6h4v6" />
    </>
  )
}
