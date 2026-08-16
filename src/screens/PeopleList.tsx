import { useEffect, useState } from 'react'
import { ROLE_LABELS, USER_STATUS_LABELS } from '@/constants/labels'
import type { AppRole } from '@/data/auth'
import type { MobileRole, PersonListItem, UserStatus } from '@/data/users'
import { MOBILE_ROLES, fetchPeople, provisionMobilePerson, resetMobilePin, rolesInSameCategory, updatePersonRole, updatePersonStatus } from '@/data/users'

interface PeopleListProps {
  currentUserId: string
  currentUserRole: AppRole
  onBack: () => void
  onAddPerson: () => void
}

const STATUS_DOT_CLASS: Record<UserStatus, string> = {
  ACTIVE: 'bg-emerald-500',
  SUSPENDED: 'bg-amber-500',
  DISABLED: 'bg-slate-400',
}

function isMobileRole(role: AppRole): role is MobileRole {
  return (MOBILE_ROLES as readonly string[]).includes(role)
}

/**
 * SPEC section 1: "Settings covers people, roles, PINs and permissions."
 * Owner/Admin manages; Fleet Manager "cannot... control system security"
 * so gets the same list read-only (matches users_update_owner's own RLS).
 * Nobody can edit their own row here — a safety default against an Owner
 * locking themselves out, not something SPEC states.
 */
export function PeopleList({ currentUserId, currentUserRole, onBack, onAddPerson }: PeopleListProps) {
  const [people, setPeople] = useState<PersonListItem[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)

  const isOwner = currentUserRole === 'OWNER_ADMIN'

  useEffect(() => {
    let cancelled = false
    fetchPeople()
      .then((p) => {
        if (!cancelled) setPeople(p)
      })
      .catch(() => {
        if (!cancelled) setError('Could not load people. Check your connection and try again.')
      })
    return () => {
      cancelled = true
    }
  }, [reloadKey])

  return (
    <div className="mx-auto max-w-3xl p-4 sm:p-6">
      <button type="button" onClick={onBack} className="mb-4 text-sm text-slate-500">
        ← Back
      </button>

      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-slate-900">People</h1>
        {isOwner && (
          <button type="button" onClick={onAddPerson} className="rounded-lg bg-slate-900 px-5 py-3 text-sm font-medium text-white active:bg-slate-800">
            + Add person
          </button>
        )}
      </div>

      {!isOwner && <p className="mb-4 text-sm text-slate-500">Read-only — only Owner/Admin manages people, roles, PINs and permissions.</p>}

      {error && (
        <p role="alert" className="mb-4 text-sm text-red-600">
          {error}
        </p>
      )}

      {people === null && !error && <p className="text-sm text-slate-500">Loading…</p>}

      <ul className="flex flex-col gap-2">
        {people?.map((person) => (
          <PersonRow
            key={person.id}
            person={person}
            editable={isOwner && person.id !== currentUserId}
            onChanged={() => setReloadKey((k) => k + 1)}
          />
        ))}
      </ul>

      <RoleCapabilities />
    </div>
  )
}

function PersonRow({ person, editable, onChanged }: { person: PersonListItem; editable: boolean; onChanged: () => void }) {
  const [busy, setBusy] = useState(false)
  const [resetting, setResetting] = useState(false)
  const [rowError, setRowError] = useState<string | null>(null)

  async function changeStatus(status: UserStatus) {
    setBusy(true)
    setRowError(null)
    try {
      await updatePersonStatus(person.id, status)
      onChanged()
    } catch {
      setRowError('Could not update status.')
    } finally {
      setBusy(false)
    }
  }

  async function changeRole(newRole: AppRole) {
    setBusy(true)
    setRowError(null)
    try {
      await updatePersonRole(person.id, person.role, newRole)
      onChanged()
    } catch {
      setRowError('Could not update role.')
    } finally {
      setBusy(false)
    }
  }

  async function finishSetup() {
    setBusy(true)
    setRowError(null)
    try {
      await provisionMobilePerson(person.id)
      onChanged()
    } catch {
      setRowError('Could not finish setup. Try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <li className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex items-center justify-between">
        <span>
          <span className="block font-medium text-slate-900">{person.displayName}</span>
          <span className="block text-sm text-slate-500">{ROLE_LABELS[person.role]}</span>
        </span>
        <span className="flex items-center gap-2 text-sm text-slate-600">
          <span aria-hidden="true" className={`h-2.5 w-2.5 rounded-full ${STATUS_DOT_CLASS[person.status]}`} />
          {USER_STATUS_LABELS[person.status]}
        </span>
      </div>

      {isMobileRole(person.role) && !person.provisioned && (
        <p className="mt-2 text-sm text-amber-700">Not yet able to sign in.</p>
      )}

      {editable && (
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
          <select
            value={person.status}
            disabled={busy}
            onChange={(e) => changeStatus(e.target.value as UserStatus)}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm disabled:opacity-50"
          >
            {(Object.keys(USER_STATUS_LABELS) as UserStatus[]).map((s) => (
              <option key={s} value={s}>
                {USER_STATUS_LABELS[s]}
              </option>
            ))}
          </select>

          <select
            value={person.role}
            disabled={busy}
            onChange={(e) => changeRole(e.target.value as AppRole)}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm disabled:opacity-50"
          >
            {rolesInSameCategory(person.role).map((r) => (
              <option key={r} value={r}>
                {ROLE_LABELS[r]}
              </option>
            ))}
          </select>

          {isMobileRole(person.role) &&
            (person.provisioned ? (
              <button
                type="button"
                onClick={() => setResetting(true)}
                disabled={busy}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 disabled:opacity-50"
              >
                Reset PIN
              </button>
            ) : (
              <button
                type="button"
                onClick={finishSetup}
                disabled={busy}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 disabled:opacity-50"
              >
                {busy ? 'Finishing…' : 'Finish setup'}
              </button>
            ))}
        </div>
      )}

      {rowError && (
        <p role="alert" className="mt-2 text-sm text-red-600">
          {rowError}
        </p>
      )}

      {resetting && (
        <ResetPinPanel
          userId={person.id}
          onDone={() => {
            setResetting(false)
            onChanged()
          }}
          onCancel={() => setResetting(false)}
        />
      )}
    </li>
  )
}

function ResetPinPanel({ userId, onDone, onCancel }: { userId: string; onDone: () => void; onCancel: () => void }) {
  const [pin, setPin] = useState('')
  const [confirmPin, setConfirmPin] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit() {
    if (!/^[0-9]{4}$/.test(pin)) {
      setError('PIN must be exactly 4 digits.')
      return
    }
    if (pin !== confirmPin) {
      setError('PINs do not match.')
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      await resetMobilePin(userId, pin)
      onDone()
    } catch {
      setError('Could not reset the PIN. It may already be in use by another mobile account.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="mt-3 flex flex-col gap-2 rounded-lg border border-slate-200 p-3">
      <div className="grid grid-cols-2 gap-2">
        <input
          type="password"
          inputMode="numeric"
          maxLength={4}
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
          placeholder="New PIN"
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
        <input
          type="password"
          inputMode="numeric"
          maxLength={4}
          value={confirmPin}
          onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, ''))}
          placeholder="Confirm PIN"
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
      </div>
      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <button type="button" onClick={submit} disabled={submitting} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
          {submitting ? 'Saving…' : 'Set PIN'}
        </button>
        <button type="button" onClick={onCancel} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700">
          Cancel
        </button>
      </div>
    </div>
  )
}

/** No separate permissions table exists — a role's capabilities are fixed
 *  in RLS, not configurable, so this is explanatory rather than another
 *  control. Wording matches SPEC section 1's own role descriptions. */
function RoleCapabilities() {
  return (
    <section className="mt-6 rounded-xl border border-slate-200 bg-white p-4">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">What each role can do</h2>
      <dl className="flex flex-col gap-3 text-sm">
        <div>
          <dt className="font-medium text-slate-900">{ROLE_LABELS.OWNER_ADMIN}</dt>
          <dd className="text-slate-500">Everything — people, roles, PINs, permissions, vehicles, targets, settings, and approving corrections.</dd>
        </div>
        <div>
          <dt className="font-medium text-slate-900">{ROLE_LABELS.FLEET_MANAGER}</dt>
          <dd className="text-slate-500">
            Full operational, financial, vehicle and maintenance view. Adds and edits records, approves unusual and disputed expenses. Cannot create
            administrators, change the Owner account, or control system security.
          </dd>
        </div>
        <div>
          <dt className="font-medium text-slate-900">{ROLE_LABELS.COLLECTIONS_FINANCE}</dt>
          <dd className="text-slate-500">Records payments, income and expenses. Nothing else.</dd>
        </div>
        <div>
          <dt className="font-medium text-slate-900">{ROLE_LABELS.MAINTENANCE_REPAIRS}</dt>
          <dd className="text-slate-500">Records problems, repairs, parts and vehicle status. Nothing else.</dd>
        </div>
      </dl>
    </section>
  )
}
