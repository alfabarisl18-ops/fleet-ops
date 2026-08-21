import { useState } from 'react'
import { IconChip } from '@/components/IconChip'
import { ROLE_LABELS } from '@/constants/labels'
import type { AppRole } from '@/data/users'
import { createDesktopPerson, createMobilePerson, provisionDesktopPerson, provisionMobilePerson } from '@/data/users'

interface AddPersonFormProps {
  onCreated: () => void
  onCancel: () => void
}

// Owner/Admin only, matching decision 0016 exactly — a second Owner/Admin
// is still a manual Supabase Dashboard step (decision 0007), not offered
// here.
const ADDABLE_ROLES: AppRole[] = ['COLLECTIONS_FINANCE', 'MAINTENANCE_REPAIRS', 'FLEET_MANAGER']

function isMobileRole(role: AppRole): role is 'COLLECTIONS_FINANCE' | 'MAINTENANCE_REPAIRS' {
  return role === 'COLLECTIONS_FINANCE' || role === 'MAINTENANCE_REPAIRS'
}

/**
 * Mobile roles work the way they always have: the PIN is optional here —
 * leaving it blank creates the person with "Not yet able to sign in" shown
 * on PeopleList, settable later via Reset PIN.
 *
 * Fleet Manager (added later, see docs/decisions/0016's own "revisit this
 * when…" note) is a different shape: no PIN, a real email — an invite
 * email goes out directly (this project's SMTP is configured), and the
 * new Fleet Manager sets their own password when they open it, on a
 * screen this app gates entry on (SetPasswordScreen). Nothing in this app
 * ever sees or stores that password (CLAUDE.md: never print credentials
 * in the UI).
 */
export function AddPersonForm({ onCreated, onCancel }: AddPersonFormProps) {
  const [displayName, setDisplayName] = useState('')
  const [role, setRole] = useState<AppRole>('COLLECTIONS_FINANCE')
  const [pin, setPin] = useState('')
  const [confirmPin, setConfirmPin] = useState('')
  const [email, setEmail] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [inviteSent, setInviteSent] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (displayName.trim() === '') {
      setError('Name is required.')
      return
    }

    if (isMobileRole(role)) {
      if (pin !== '' || confirmPin !== '') {
        if (!/^[0-9]{4}$/.test(pin)) {
          setError('PIN must be exactly 4 digits.')
          return
        }
        if (pin !== confirmPin) {
          setError('PINs do not match.')
          return
        }
      }

      setSubmitting(true)
      try {
        const userId = await createMobilePerson(displayName.trim(), role)
        try {
          await provisionMobilePerson(userId, pin !== '' ? pin : undefined)
        } catch {
          // The profile row exists either way — PeopleList shows "Not yet
          // able to sign in" and offers "Finish setup" to retry. Nothing is
          // silently lost, but the person does need to know setup isn't
          // complete.
          setError('Person added, but setup did not finish. Find them in the list and use "Finish setup" to retry.')
          onCreated()
          return
        }
        onCreated()
      } catch {
        setError('Something went wrong. Try again.')
      } finally {
        setSubmitting(false)
      }
      return
    }

    // Fleet Manager
    if (email.trim() === '') {
      setError('Email is required for a Fleet Manager account.')
      return
    }

    setSubmitting(true)
    try {
      const userId = await createDesktopPerson(displayName.trim(), email.trim())
      await provisionDesktopPerson(userId)
      setInviteSent(true)
    } catch {
      setError('Something went wrong. Try again.')
    } finally {
      setSubmitting(false)
    }
  }

  if (inviteSent) {
    return (
      <div className="mx-auto max-w-xl p-4 sm:p-6">
        <div className="mb-4 flex items-center gap-3">
          <IconChip section="settings" />
          <h1 className="font-heading text-xl font-bold text-slate-900">Fleet Manager added</h1>
        </div>

        <p className="mb-4 text-sm text-slate-600">
          An email was sent to {email.trim()} with a link to set their own password — nobody else, including this
          app, ever sees it. Ask them to check their inbox (and spam folder).
        </p>

        <button type="button" onClick={onCreated} className="rounded-xl bg-primary-600 px-6 py-3 text-base font-medium text-white">
          Done
        </button>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-xl p-4 sm:p-6">
      <button type="button" onClick={onCancel} className="mb-4 text-sm text-slate-500">
        ← Back
      </button>

      <div className="mb-4 flex items-center gap-3">
        <IconChip section="settings" />
        <h1 className="font-heading text-xl font-bold text-slate-900">Add person</h1>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium text-slate-700">Name</span>
          <input
            type="text"
            required
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            className="rounded-xl border border-slate-300 px-4 py-3 text-base"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium text-slate-700">Role</span>
          <select value={role} onChange={(e) => setRole(e.target.value as AppRole)} className="rounded-xl border border-slate-300 bg-white px-4 py-3 text-base">
            {ADDABLE_ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABELS[r]}
              </option>
            ))}
          </select>
        </label>

        {isMobileRole(role) ? (
          <>
            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-1">
                <span className="text-sm font-medium text-slate-700">PIN (optional)</span>
                <input
                  type="password"
                  inputMode="numeric"
                  maxLength={4}
                  value={pin}
                  onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
                  className="rounded-xl border border-slate-300 px-4 py-3 text-base"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-sm font-medium text-slate-700">Confirm PIN</span>
                <input
                  type="password"
                  inputMode="numeric"
                  maxLength={4}
                  value={confirmPin}
                  onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, ''))}
                  className="rounded-xl border border-slate-300 px-4 py-3 text-base"
                />
              </label>
            </div>
            <p className="-mt-2 text-xs text-slate-500">Leave both blank to set the PIN later, in person, from the people list.</p>
          </>
        ) : (
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium text-slate-700">Email</span>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="rounded-xl border border-slate-300 px-4 py-3 text-base"
            />
            <span className="text-xs text-slate-500">They'll get an email with a one-time link to set their own password — never typed here.</span>
          </label>
        )}

        {error && (
          <p role="alert" className="text-sm text-red-600">
            {error}
          </p>
        )}

        <button type="submit" disabled={submitting} className="mt-2 rounded-xl bg-primary-600 px-6 py-3 text-base font-medium text-white disabled:opacity-50">
          {submitting ? 'Adding…' : 'Add person'}
        </button>
      </form>
    </div>
  )
}
