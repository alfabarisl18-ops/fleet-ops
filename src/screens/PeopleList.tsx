import { useEffect, useState } from 'react'
import { Card } from '@/components/Card'
import { IconChip } from '@/components/IconChip'
import { ROLE_LABELS, USER_STATUS_LABELS } from '@/constants/labels'
import type { AppRole } from '@/data/auth'
import type { MobileRole, PersonListItem, UserStatus } from '@/data/users'
import {
  MOBILE_ROLES,
  fetchPeople,
  provisionDesktopPerson,
  provisionMobilePerson,
  resetDesktopPassword,
  resetMobilePin,
  rolesInSameCategory,
  updatePersonRole,
  updatePersonStatus,
} from '@/data/users'

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
      <button type="button" onClick={onBack} className="mb-4 text-sm font-medium text-slate-500">
        ← Back
      </button>

      <div className="mb-6 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <IconChip section="settings" />
          <h1 className="font-heading text-xl font-bold text-slate-900">People</h1>
        </div>
        {isOwner && (
          <button
            type="button"
            onClick={onAddPerson}
            className="rounded-full bg-primary-600 px-5 py-2.5 text-sm font-medium text-white active:bg-primary-700"
          >
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
  // A one-time setup/reset link for a Fleet Manager row — shown for the
  // Owner/Admin to copy and deliver themselves. See decision 0021: Resend's
  // shared sending address can't reach anyone but this project's own
  // account owner without a verified domain, so this app never sends the
  // link itself.
  const [rowLink, setRowLink] = useState<string | null>(null)
  const [rowLinkCopied, setRowLinkCopied] = useState(false)
  // Only promotion to Owner/Admin gets a confirm step — the same-category
  // swaps (Fleet Manager, or either mobile role) stay a single click, same
  // as before. Owner/Admin is the one role with no ceiling on what it can
  // do, and the plain <select> below fires on change with nothing to
  // catch a stray click — exactly how this happened live during this
  // session's own verification.
  const [pendingRole, setPendingRole] = useState<AppRole | null>(null)

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

  function selectRole(newRole: AppRole) {
    setRowError(null)
    if (newRole === 'OWNER_ADMIN') {
      setPendingRole(newRole)
      return
    }
    changeRole(newRole)
  }

  function confirmPendingRole() {
    if (!pendingRole) return
    const newRole = pendingRole
    setPendingRole(null)
    changeRole(newRole)
  }

  async function finishSetup() {
    setBusy(true)
    setRowError(null)
    setRowLink(null)
    setRowLinkCopied(false)
    try {
      if (isMobileRole(person.role)) {
        await provisionMobilePerson(person.id)
        onChanged()
      } else {
        const link = await provisionDesktopPerson(person.id)
        setRowLink(link)
        onChanged()
      }
    } catch {
      setRowError('Could not finish setup. Try again.')
    } finally {
      setBusy(false)
    }
  }

  async function resetPassword() {
    setBusy(true)
    setRowError(null)
    setRowLink(null)
    setRowLinkCopied(false)
    try {
      const link = await resetDesktopPassword(person.id)
      setRowLink(link)
    } catch {
      setRowError('Could not reset the password. Try again.')
    } finally {
      setBusy(false)
    }
  }

  async function copyRowLink() {
    if (!rowLink) return
    try {
      await navigator.clipboard.writeText(rowLink)
      setRowLinkCopied(true)
    } catch {
      // Clipboard access can fail — the link is still selectable text below.
    }
  }

  return (
    <li>
      <Card>
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

        {!person.provisioned && (isMobileRole(person.role) || person.role === 'FLEET_MANAGER') && (
          <p className="mt-2 text-sm text-amber-700">Not yet able to sign in.</p>
        )}

        {editable && !pendingRole && (
          <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
            <select
              value={person.status}
              disabled={busy}
              onChange={(e) => changeStatus(e.target.value as UserStatus)}
              className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm disabled:opacity-50"
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
              onChange={(e) => selectRole(e.target.value as AppRole)}
              className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm disabled:opacity-50"
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
                  className="rounded-xl border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 disabled:opacity-50"
                >
                  Reset PIN
                </button>
              ) : (
                <button
                  type="button"
                  onClick={finishSetup}
                  disabled={busy}
                  className="rounded-xl border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 disabled:opacity-50"
                >
                  {busy ? 'Finishing…' : 'Finish setup'}
                </button>
              ))}

            {/* Fleet Manager has no PIN — "Reset PIN" doesn't apply — but does
             *  have a real password now, same as any provisioned account.
             *  Owner/Admin's own row is never editable here regardless (see
             *  `editable` above), so this never covers a locked-out Owner;
             *  that stays a Supabase Dashboard action, per the Edge
             *  Function's own comment. */}
            {person.role === 'FLEET_MANAGER' &&
              (person.provisioned ? (
                <button
                  type="button"
                  onClick={resetPassword}
                  disabled={busy}
                  className="rounded-xl border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 disabled:opacity-50"
                >
                  {busy ? 'Resetting…' : 'Reset password'}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={finishSetup}
                  disabled={busy}
                  className="rounded-xl border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 disabled:opacity-50"
                >
                  {busy ? 'Finishing…' : 'Finish setup'}
                </button>
              ))}
          </div>
        )}

        {pendingRole && (
          <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3">
            <p className="text-sm text-red-800">
              Make {person.displayName} an Owner/Admin? That's full access — people, roles, PINs, permissions,
              vehicles, targets, settings, and approving corrections. This can be undone the same way, but only by
              another Owner/Admin.
            </p>
            <div className="mt-2 flex gap-2">
              <button
                type="button"
                onClick={confirmPendingRole}
                disabled={busy}
                className="rounded-lg bg-red-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                {busy ? 'Working…' : 'Confirm'}
              </button>
              <button
                type="button"
                onClick={() => setPendingRole(null)}
                disabled={busy}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {rowLink && (
          <div className="mt-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
            <p className="mb-2 text-sm text-slate-700">
              Send this one-time link to {person.displayName} yourself — WhatsApp, SMS, in person. It only works
              once.
            </p>
            <p className="mb-2 break-all rounded-lg border border-slate-300 bg-white p-2 text-xs text-slate-700">{rowLink}</p>
            <button
              type="button"
              onClick={copyRowLink}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700"
            >
              {rowLinkCopied ? 'Copied' : 'Copy link'}
            </button>
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
      </Card>
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
    <div className="mt-3 flex flex-col gap-2 rounded-xl border border-slate-200 p-3">
      <div className="grid grid-cols-2 gap-2">
        <input
          type="password"
          inputMode="numeric"
          maxLength={4}
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
          placeholder="New PIN"
          className="rounded-xl border border-slate-300 px-3 py-2 text-sm"
        />
        <input
          type="password"
          inputMode="numeric"
          maxLength={4}
          value={confirmPin}
          onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, ''))}
          placeholder="Confirm PIN"
          className="rounded-xl border border-slate-300 px-3 py-2 text-sm"
        />
      </div>
      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <button type="button" onClick={submit} disabled={submitting} className="rounded-xl bg-primary-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
          {submitting ? 'Saving…' : 'Set PIN'}
        </button>
        <button type="button" onClick={onCancel} className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700">
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
    <Card title="What each role can do" className="mt-6">
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
    </Card>
  )
}
