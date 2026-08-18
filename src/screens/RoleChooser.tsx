import { AuthShell } from '@/components/AuthShell'
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
    <AuthShell>
      <h1 className="font-heading mb-4 text-center text-lg font-bold text-slate-900">Sign in to Fleet Operations</h1>

      <div className="flex flex-col gap-3">
        <button
          type="button"
          onClick={onChooseDesktop}
          className="rounded-2xl bg-white px-6 py-5 text-left text-base font-medium text-slate-900 shadow-sm ring-1 ring-slate-200 active:bg-slate-50"
        >
          Owner/Admin or Fleet Manager
          <span className="block text-sm font-normal text-slate-500">Email and password</span>
        </button>

        <button
          type="button"
          onClick={() => onChooseMobile('COLLECTIONS_FINANCE')}
          className="rounded-2xl bg-white px-6 py-5 text-left text-base font-medium text-slate-900 shadow-sm ring-1 ring-slate-200 active:bg-slate-50"
        >
          {ROLE_LABELS.COLLECTIONS_FINANCE}
          <span className="block text-sm font-normal text-slate-500">4-digit PIN</span>
        </button>

        <button
          type="button"
          onClick={() => onChooseMobile('MAINTENANCE_REPAIRS')}
          className="rounded-2xl bg-white px-6 py-5 text-left text-base font-medium text-slate-900 shadow-sm ring-1 ring-slate-200 active:bg-slate-50"
        >
          {ROLE_LABELS.MAINTENANCE_REPAIRS}
          <span className="block text-sm font-normal text-slate-500">4-digit PIN</span>
        </button>
      </div>
    </AuthShell>
  )
}
