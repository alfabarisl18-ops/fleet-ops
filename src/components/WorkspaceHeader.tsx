import { ROLE_LABELS } from '@/constants/labels'
import type { SignedInUser } from '@/data/auth'

interface WorkspaceHeaderProps {
  user: SignedInUser
  /** Omitted on the home screen itself. */
  onHome?: () => void
  onSignOut: () => void
}

/**
 * Persistent shell across every desktop screen: who's signed in, a way back
 * to Home, and sign out. Shared rather than repeated per screen, per
 * CLAUDE.md "shared pieces under src/components/".
 */
export function WorkspaceHeader({ user, onHome, onSignOut }: WorkspaceHeaderProps) {
  return (
    <header className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 sm:px-6">
      <div className="flex items-center gap-3">
        {onHome ? (
          <button type="button" onClick={onHome} className="text-base font-semibold text-slate-900">
            Fleet Operations
          </button>
        ) : (
          <span className="text-base font-semibold text-slate-900">Fleet Operations</span>
        )}
      </div>
      <div className="flex items-center gap-3 text-sm text-slate-500">
        <span className="hidden sm:inline">
          {user.displayName} · {ROLE_LABELS[user.role]}
        </span>
        <button type="button" onClick={onSignOut} className="font-medium text-slate-700">
          Sign out
        </button>
      </div>
    </header>
  )
}
