import { useState } from 'react'
import type { SignedInUser } from '@/data/auth'
import { signOut } from '@/data/auth'
import { ROLE_LABELS } from '@/constants/labels'

interface SignedInProps {
  user: SignedInUser
  onSignedOut: () => void
}

/**
 * Phase 2's confirmation screen: proof that sign-in worked and resolved to
 * the correct role. Not a home screen — that's Phase 3 onward. There is
 * deliberately nothing else here.
 */
export function SignedIn({ user, onSignedOut }: SignedInProps) {
  const [signingOut, setSigningOut] = useState(false)

  async function handleSignOut() {
    setSigningOut(true)
    await signOut()
    setSigningOut(false)
    onSignedOut()
  }

  return (
    <div className="mx-auto flex min-h-full max-w-sm flex-col items-center justify-center gap-3 p-6 text-center">
      <p className="text-sm text-slate-500">Signed in</p>
      <h1 className="text-xl font-semibold text-slate-900">{user.displayName}</h1>
      <p className="text-base text-slate-600">{ROLE_LABELS[user.role]}</p>

      <button
        type="button"
        onClick={handleSignOut}
        disabled={signingOut}
        className="mt-6 rounded-lg border border-slate-300 px-6 py-3 text-base font-medium text-slate-700 disabled:opacity-50"
      >
        {signingOut ? 'Signing out…' : 'Sign out'}
      </button>
    </div>
  )
}
