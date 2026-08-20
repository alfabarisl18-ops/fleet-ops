import { useEffect, useState } from 'react'
import { fetchCurrentUser } from '@/data/auth'
import type { MobileRole, SignedInUser } from '@/data/auth'
import { initOfflineQueueAutoFlush } from '@/lib/offlineQueueReplay'
import { RoleChooser } from '@/screens/RoleChooser'
import { CollectionsWorkspace } from '@/screens/CollectionsWorkspace'
import { DesktopSignIn } from '@/screens/DesktopSignIn'
import { DesktopWorkspace } from '@/screens/DesktopWorkspace'
import { MaintenanceWorkspace } from '@/screens/MaintenanceWorkspace'
import { MobilePinSignIn } from '@/screens/MobilePinSignIn'

/** Owner/Admin and Fleet Manager get the Vehicles/Drivers workspace (Phase
 *  3). Matches app.is_desktop() server-side. */
function isDesktopRole(role: SignedInUser['role']): boolean {
  return role === 'OWNER_ADMIN' || role === 'FLEET_MANAGER'
}

type View = { name: 'loading' } | { name: 'chooser' } | { name: 'desktop' } | { name: 'mobile'; role: MobileRole }

/**
 * Bookmarkable shortcuts past the role picker — ?desktop, ?collections,
 * ?maintenance — so e.g. a collector's phone can open straight to the PIN
 * screen for their own role instead of the chooser every time. Only
 * consulted when no signed-in session is found (see the fetchCurrentUser
 * effect below); a returning signed-in user always goes straight to their
 * workspace regardless of what's in the URL.
 */
function initialUnauthedView(): View {
  const params = new URLSearchParams(location.search)
  if (params.has('desktop')) return { name: 'desktop' }
  if (params.has('collections')) return { name: 'mobile', role: 'COLLECTIONS_FINANCE' }
  if (params.has('maintenance')) return { name: 'mobile', role: 'MAINTENANCE_REPAIRS' }
  return { name: 'chooser' }
}

/**
 * Phase 2 has exactly one job: sign in as each of the four roles and
 * confirm it landed with the right identity and role. There is no routing,
 * no navigation beyond back buttons, and no screen this doesn't need —
 * those come with the screens that use them.
 */
export function App() {
  const [user, setUser] = useState<SignedInUser | null>(null)
  const [view, setView] = useState<View>({ name: 'loading' })

  // Phase 9: flushes on the `online` event and once at startup, in case
  // the device was signed in already offline. Safe to call once per app
  // load regardless of role — desktop just never has anything queued.
  useEffect(() => {
    initOfflineQueueAutoFlush()
  }, [])

  useEffect(() => {
    // Guards against a stale response landing after the user has already
    // navigated away from the loading screen — found by testing: React 19
    // StrictMode double-invokes this effect in dev, and the redundant
    // fetchCurrentUser() call can resolve after a real (fast) tap or click,
    // silently bouncing the app back to the chooser mid-navigation. The same
    // shape of bug could occur outside StrictMode too on a slow, intermittent
    // connection if this effect ever ran more than once, so it's guarded
    // properly rather than dismissed as a dev-only artifact.
    let cancelled = false
    fetchCurrentUser()
      .then((u) => {
        if (cancelled) return
        setUser(u)
        if (u) {
          setView({ name: 'chooser' }) // irrelevant once a user is set — the render below ignores `view` entirely
          return
        }
        // No signed-in session — fetchCurrentUser() resolves null here
        // rather than rejecting, so this (not .catch) is the real
        // "signed out" branch a shortcut link needs to land in.
        const shortcut = initialUnauthedView()
        if (shortcut.name !== 'chooser' && location.search !== '') {
          // Picked up the flag — drop it from the URL bar so it doesn't
          // linger once someone's signed in or hits back.
          history.replaceState(null, '', location.pathname)
        }
        setView(shortcut)
      })
      .catch(() => {
        // A genuine failure (e.g. getSession() itself throwing) — same
        // shortcut handling as the null case above.
        if (cancelled) return
        setView(initialUnauthedView())
      })
    return () => {
      cancelled = true
    }
  }, [])

  if (view.name === 'loading') {
    return (
      <main className="grid min-h-full place-items-center p-6">
        <p className="text-sm text-slate-500">Loading…</p>
      </main>
    )
  }

  if (user) {
    return (
      <main className="min-h-full">
        {isDesktopRole(user.role) ? (
          <DesktopWorkspace user={user} onSignedOut={() => setUser(null)} />
        ) : user.role === 'COLLECTIONS_FINANCE' ? (
          <CollectionsWorkspace user={user} onSignedOut={() => setUser(null)} />
        ) : (
          <MaintenanceWorkspace user={user} onSignedOut={() => setUser(null)} />
        )}
      </main>
    )
  }

  return (
    <main className="min-h-full">
      {view.name === 'chooser' && (
        <RoleChooser
          onChooseDesktop={() => setView({ name: 'desktop' })}
          onChooseMobile={(role) => setView({ name: 'mobile', role })}
        />
      )}
      {view.name === 'desktop' && (
        <DesktopSignIn
          onSignedIn={() => fetchCurrentUser().then(setUser)}
          onBack={() => setView({ name: 'chooser' })}
        />
      )}
      {view.name === 'mobile' && (
        <MobilePinSignIn
          role={view.role}
          onSignedIn={() => fetchCurrentUser().then(setUser)}
          onBack={() => setView({ name: 'chooser' })}
        />
      )}
    </main>
  )
}
