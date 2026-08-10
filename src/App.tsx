import { useEffect, useState } from 'react'
import { fetchCurrentUser } from '@/data/auth'
import type { MobileRole, SignedInUser } from '@/data/auth'
import { RoleChooser } from '@/screens/RoleChooser'
import { DesktopSignIn } from '@/screens/DesktopSignIn'
import { MobilePinSignIn } from '@/screens/MobilePinSignIn'
import { SignedIn } from '@/screens/SignedIn'

type View = { name: 'loading' } | { name: 'chooser' } | { name: 'desktop' } | { name: 'mobile'; role: MobileRole }

/**
 * Phase 2 has exactly one job: sign in as each of the four roles and
 * confirm it landed with the right identity and role. There is no routing,
 * no navigation beyond back buttons, and no screen this doesn't need —
 * those come with the screens that use them.
 */
export function App() {
  const [user, setUser] = useState<SignedInUser | null>(null)
  const [view, setView] = useState<View>({ name: 'loading' })

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
        setView({ name: 'chooser' })
      })
      .catch(() => {
        if (!cancelled) setView({ name: 'chooser' })
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
        <SignedIn user={user} onSignedOut={() => setUser(null)} />
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
