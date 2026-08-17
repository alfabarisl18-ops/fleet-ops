import { AlertsBell } from '@/components/AlertsBell'
import type { AlertListItem } from '@/data/alerts'
import type { SignedInUser } from '@/data/auth'

interface TopBarProps {
  user: SignedInUser
  /** Hamburger button, only rendered/relevant below `lg` where the sidebar is a drawer. */
  onOpenMenu: () => void
  onOpenAlert: (alert: AlertListItem) => void
}

/**
 * The persistent desktop top bar beside the sidebar. Deliberately has no
 * search field — nothing in this app's data layer has a search/filter
 * capability today, and a decorative input that does nothing violates
 * this project's own "no generic placeholder content" rule. Real future
 * scope, not invented here.
 */
export function TopBar({ user, onOpenMenu, onOpenAlert }: TopBarProps) {
  return (
    <header className="flex h-16 shrink-0 items-center justify-between border-b border-slate-100 bg-white px-4 sm:px-6">
      <button
        type="button"
        onClick={onOpenMenu}
        aria-label="Open menu"
        className="rounded-lg p-2 text-slate-500 active:bg-slate-100 lg:hidden"
      >
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <path d="M4 7h16M4 12h16M4 17h16" />
        </svg>
      </button>
      <div className="flex-1" />
      <div className="flex items-center gap-3">
        <AlertsBell currentUserId={user.id} onOpenAlert={onOpenAlert} />
        <div
          className="flex h-9 w-9 items-center justify-center rounded-full bg-primary-100 text-sm font-semibold text-primary-700"
          aria-hidden="true"
        >
          {initials(user.displayName)}
        </div>
      </div>
    </header>
  )
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return ''
  const first = parts[0]?.[0] ?? ''
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : ''
  return (first + last).toUpperCase()
}
