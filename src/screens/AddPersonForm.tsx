import { useState } from 'react'
import { IconChip } from '@/components/IconChip'
import { ROLE_LABELS } from '@/constants/labels'
import type { MobileRole } from '@/data/users'
import { createMobilePerson, provisionMobilePerson } from '@/data/users'

interface AddPersonFormProps {
  onCreated: () => void
  onCancel: () => void
}

const MOBILE_ROLE_OPTIONS: MobileRole[] = ['COLLECTIONS_FINANCE', 'MAINTENANCE_REPAIRS']

/**
 * Mobile roles only — decision 0016: desktop account creation stays a
 * manual, one-time step via the Supabase Dashboard (decision 0007), not a
 * form this app builds. The PIN is optional here: leaving it blank creates
 * the person with "Not yet able to sign in" shown on PeopleList, settable
 * later via Reset PIN — useful when the PIN itself should be handed over
 * in person rather than typed by whoever's adding the record.
 */
export function AddPersonForm({ onCreated, onCancel }: AddPersonFormProps) {
  const [displayName, setDisplayName] = useState('')
  const [role, setRole] = useState<MobileRole>('COLLECTIONS_FINANCE')
  const [pin, setPin] = useState('')
  const [confirmPin, setConfirmPin] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (displayName.trim() === '') {
      setError('Name is required.')
      return
    }
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
          <select value={role} onChange={(e) => setRole(e.target.value as MobileRole)} className="rounded-xl border border-slate-300 bg-white px-4 py-3 text-base">
            {MOBILE_ROLE_OPTIONS.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABELS[r]}
              </option>
            ))}
          </select>
        </label>

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
