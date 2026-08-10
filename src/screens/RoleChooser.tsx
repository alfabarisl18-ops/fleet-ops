import type { MobileRole } from '@/data/auth'
import { ROLE_LABELS } from '@/constants/labels'

interface RoleChooserProps {
  onChooseDesktop: () => void
  onChooseMobile: (role: MobileRole) => void
}

/**
 * Phase 2's only entry point: pick how you're signing in. Not a permanent
 * screen — later phases will likely route straight to the right form based
 * on how the app was installed/opened, but Phase 2 is explicitly "enough to
 * sign in as each of the four roles and confirm it works," so this is
 * deliberately just that.
 */
export function RoleChooser({ onChooseDesktop, onChooseMobile }: RoleChooserProps) {
  return (
    <div className="mx-auto flex min-h-full max-w-sm flex-col justify-center gap-4 p-6">
      <h1 className="mb-2 text-center text-lg font-semibold text-slate-900">Sign in to Fleet Operations</h1>

      <button
        type="button"
        onClick={onChooseDesktop}
        className="rounded-xl border border-slate-300 bg-white px-6 py-5 text-left text-base font-medium text-slate-900 shadow-sm active:bg-slate-50"
      >
        Owner/Admin or Fleet Manager
        <span className="block text-sm font-normal text-slate-500">Email and password</span>
      </button>

      <button
        type="button"
        onClick={() => onChooseMobile('COLLECTIONS_FINANCE')}
        className="rounded-xl border border-slate-300 bg-white px-6 py-5 text-left text-base font-medium text-slate-900 shadow-sm active:bg-slate-50"
      >
        {ROLE_LABELS.COLLECTIONS_FINANCE}
        <span className="block text-sm font-normal text-slate-500">4-digit PIN</span>
      </button>

      <button
        type="button"
        onClick={() => onChooseMobile('MAINTENANCE_REPAIRS')}
        className="rounded-xl border border-slate-300 bg-white px-6 py-5 text-left text-base font-medium text-slate-900 shadow-sm active:bg-slate-50"
      >
        {ROLE_LABELS.MAINTENANCE_REPAIRS}
        <span className="block text-sm font-normal text-slate-500">4-digit PIN</span>
      </button>
    </div>
  )
}
