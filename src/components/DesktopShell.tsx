import { useState } from 'react'
import type { NavTarget } from '@/components/Sidebar'
import { Sidebar } from '@/components/Sidebar'
import { TopBar } from '@/components/TopBar'
import type { AlertListItem } from '@/data/alerts'
import type { SignedInUser } from '@/data/auth'

interface DesktopShellProps {
  user: SignedInUser
  active: NavTarget
  onNavigate: (target: NavTarget) => void
  onSignOut: () => void
  onOpenAlert: (alert: AlertListItem) => void
  children: React.ReactNode
}

/**
 * Composes Sidebar + TopBar around a content slot and owns the drawer
 * open/closed state for the <lg responsive collapse. Replaces
 * Replaces the old WorkspaceHeader as DesktopWorkspace's shell — the 30-variant view
 * switch it wraps is untouched by this change.
 */
export function DesktopShell({ user, active, onNavigate, onSignOut, onOpenAlert, children }: DesktopShellProps) {
  const [drawerOpen, setDrawerOpen] = useState(false)

  return (
    <div className="flex min-h-full bg-slate-50">
      <Sidebar
        user={user}
        active={active}
        onNavigate={(target) => {
          onNavigate(target)
          setDrawerOpen(false)
        }}
        onSignOut={onSignOut}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar user={user} onOpenMenu={() => setDrawerOpen(true)} onOpenAlert={onOpenAlert} />
        <main className="flex-1">{children}</main>
      </div>
    </div>
  )
}
