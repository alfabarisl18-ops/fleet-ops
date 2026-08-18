import { useState } from 'react'
import { AuthShell } from '@/components/AuthShell'
import { signInWithPassword } from '@/data/auth'

interface DesktopSignInProps {
  onSignedIn: () => void
  onBack: () => void
}

export function DesktopSignIn({ onSignedIn, onBack }: DesktopSignInProps) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError(null)

    const result = await signInWithPassword(email, password)

    setSubmitting(false)
    if (!result.ok) {
      setError(
        result.error === 'invalid_credentials'
          ? 'Incorrect email or password.'
          : 'Something went wrong. Try again.',
      )
      return
    }
    onSignedIn()
  }

  return (
    <AuthShell>
      <button type="button" onClick={onBack} className="mb-3 text-sm font-medium text-slate-500">
        ← Back
      </button>

      <h1 className="font-heading mb-4 text-lg font-bold text-slate-900">Owner/Admin or Fleet Manager</h1>

      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium text-slate-700">Email</span>
          <input
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="rounded-2xl border border-slate-300 px-4 py-3 text-base"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium text-slate-700">Password</span>
          <input
            type="password"
            required
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
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
          {submitting ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </AuthShell>
  )
}
