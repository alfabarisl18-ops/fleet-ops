import { useState } from 'react'
import { PinPad } from '@/components/PinPad'
import { signInWithPin } from '@/data/auth'
import type { MobileRole } from '@/data/auth'
import { ROLE_LABELS } from '@/constants/labels'

interface MobilePinSignInProps {
  role: MobileRole
  onSignedIn: () => void
  onBack: () => void
}

/**
 * Role, then PIN — nothing else. The PIN alone identifies the person: it's
 * checked against every active account of this role
 * (public.verify_role_pin), which is why public.admin_reset_pin enforces
 * that PINs are unique per role. See
 * docs/decisions/0007-pin-sign-in-becomes-a-real-session.md.
 */
export function MobilePinSignIn({ role, onSignedIn, onBack }: MobilePinSignInProps) {
  const [pin, setPin] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  async function handlePinComplete(enteredPin: string) {
    setSubmitting(true)
    setMessage(null)

    const result = await signInWithPin(role, enteredPin)

    setSubmitting(false)
    setPin('')

    if (!result.ok) {
      if (result.error === 'locked') {
        const until = result.lockedUntil ? new Date(result.lockedUntil) : null
        setMessage(
          until
            ? `Too many attempts. Try again after ${until.toLocaleTimeString()}.`
            : 'Too many attempts. Try again shortly.',
        )
      } else {
        setMessage('Incorrect PIN.')
      }
      return
    }

    onSignedIn()
  }

  return (
    <div className="mx-auto flex min-h-full max-w-sm flex-col items-center justify-center gap-6 p-6">
      <button type="button" onClick={onBack} className="self-start text-sm text-slate-500">
        ← Back
      </button>

      <h1 className="text-lg font-semibold text-slate-900">{ROLE_LABELS[role]}</h1>
      <p className="text-sm text-slate-600">Enter your PIN</p>

      <PinPad value={pin} onChange={setPin} onSubmit={handlePinComplete} disabled={submitting} />

      {message && (
        <p role="alert" className="text-center text-sm text-red-600">
          {message}
        </p>
      )}
    </div>
  )
}
