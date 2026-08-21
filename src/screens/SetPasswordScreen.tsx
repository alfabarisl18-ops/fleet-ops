import { useState } from 'react'
import { AuthShell } from '@/components/AuthShell'
import { supabase } from '@/lib/supabase'

interface SetPasswordScreenProps {
  onDone: () => void
}

const MIN_LENGTH = 8

/**
 * Where an invite or password-reset link actually lands (App.tsx's
 * ?set-password flag). Supabase's own documented platform behaviour
 * (https://github.com/supabase/supabase/issues/45210): clicking either
 * kind of link signs the browser into a real, persistent session
 * *before* a password exists — there is no built-in "finish setting up"
 * step. Without this screen, a new Fleet Manager (or anyone who reset
 * their password) would be signed in for that one moment and then have
 * no way to ever sign in again. This is the mandatory gate: no password,
 * no entry to the app, regardless of what page they landed on.
 */
export function SetPasswordScreen({ onDone }: SetPasswordScreenProps) {
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (password.length < MIN_LENGTH) {
      setError(`Password must be at least ${MIN_LENGTH} characters.`)
      return
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }

    setSubmitting(true)
    const { error: updateError } = await supabase.auth.updateUser({ password })
    setSubmitting(false)

    if (updateError) {
      setError('Could not set your password. Try again.')
      return
    }
    onDone()
  }

  return (
    <AuthShell>
      <h1 className="font-heading mb-1 text-lg font-bold text-slate-900">Set your password</h1>
      <p className="mb-4 text-sm text-slate-500">Choose a password to finish signing in to Fleet Operations.</p>

      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium text-slate-700">New password</span>
          <input
            type="password"
            required
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="rounded-2xl border border-slate-300 px-4 py-3 text-base"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium text-slate-700">Confirm password</span>
          <input
            type="password"
            required
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className="rounded-2xl border border-slate-300 px-4 py-3 text-base"
          />
        </label>

        {error && (
          <p role="alert" className="text-sm text-red-600">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="mt-2 rounded-2xl bg-primary-600 px-6 py-3 text-base font-medium text-white disabled:opacity-50"
        >
          {submitting ? 'Saving…' : 'Set password'}
        </button>
      </form>
    </AuthShell>
  )
}
