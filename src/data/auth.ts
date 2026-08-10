import { supabase } from '@/lib/supabase'
import type { Enums } from '@/types/db'

// Screens never call Supabase directly — this is the one file that does, for
// everything sign-in related. See docs/decisions/0007-pin-sign-in-becomes-a-real-session.md
// for the PIN flow this wraps.

export type AppRole = Enums<'user_role'>

export interface SignedInUser {
  id: string
  displayName: string
  role: AppRole
}

const PIN_SIGN_IN_FUNCTION = 'pin-sign-in'

/** The two roles that sign in with a PIN rather than email + password. */
export const MOBILE_ROLES = ['COLLECTIONS_FINANCE', 'MAINTENANCE_REPAIRS'] as const
export type MobileRole = (typeof MOBILE_ROLES)[number]

export type PinSignInError = 'invalid_pin' | 'locked' | 'server_error'

export interface PinSignInResult {
  ok: true
  user: SignedInUser
}

export interface PinSignInFailure {
  ok: false
  error: PinSignInError
  lockedUntil?: string
}

/**
 * Verifies a PIN against every active account of the given role — there is
 * no separate "pick your name" step, so the PIN alone has to identify the
 * person (public.admin_reset_pin enforces PINs are unique per role for
 * exactly this reason). On success, establishes a real Supabase session in
 * this browser. The plaintext PIN goes to the pin-sign-in Edge Function over
 * TLS and nowhere else — see that function's source for what happens to it.
 */
export async function signInWithPin(role: MobileRole, pin: string): Promise<PinSignInResult | PinSignInFailure> {
  const { data, error } = await supabase.functions.invoke<{
    error?: string
    locked_until?: string
    access_token?: string
    refresh_token?: string
    user?: { id: string; display_name: string; role: AppRole }
  }>(PIN_SIGN_IN_FUNCTION, { body: { role, pin } })

  // supabase-js resolves 4xx/5xx responses into `error` with the parsed body
  // unavailable directly; functions.invoke instead exposes the body via
  // `data` regardless of status when the body was valid JSON, so check the
  // shape rather than only `error`.
  if (error || !data) {
    return { ok: false, error: 'server_error' }
  }
  if (data.error === 'locked') {
    return data.locked_until
      ? { ok: false, error: 'locked', lockedUntil: data.locked_until }
      : { ok: false, error: 'locked' }
  }
  if (data.error || !data.access_token || !data.refresh_token || !data.user) {
    return { ok: false, error: data.error === 'invalid_pin' ? 'invalid_pin' : 'server_error' }
  }

  const { error: setSessionError } = await supabase.auth.setSession({
    access_token: data.access_token,
    refresh_token: data.refresh_token,
  })
  if (setSessionError) {
    return { ok: false, error: 'server_error' }
  }

  return {
    ok: true,
    user: { id: data.user.id, displayName: data.user.display_name, role: data.user.role },
  }
}

export type PasswordSignInError = 'invalid_credentials' | 'server_error'

/** Standard Supabase email + password sign-in for the two desktop roles. */
export async function signInWithPassword(
  email: string,
  password: string,
): Promise<{ ok: true } | { ok: false; error: PasswordSignInError }> {
  const { error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) {
    return { ok: false, error: error.status === 400 ? 'invalid_credentials' : 'server_error' }
  }
  return { ok: true }
}

/**
 * The signed-in user's profile, or null if nobody is signed in. For a mobile
 * role whose app-level session has gone idle, app.current_app_role() (and
 * therefore this query) resolves to nothing even though the underlying
 * Supabase session is technically still valid — see docs/decisions/0007.
 */
export async function fetchCurrentUser(): Promise<SignedInUser | null> {
  const {
    data: { session },
  } = await supabase.auth.getSession()
  if (!session) return null

  const { data, error } = await supabase
    .from('users')
    .select('id, display_name, role')
    .eq('auth_user_id', session.user.id)
    .maybeSingle()

  if (error || !data) return null
  return { id: data.id, displayName: data.display_name, role: data.role }
}

export async function signOut(): Promise<void> {
  // Revokes the underlying Supabase refresh token server-side, not just
  // local storage. The application-level public.sessions row for a mobile
  // account is not separately marked revoked here — it simply ages out via
  // the idle timeout or its 12-hour hard cap, which is a known, minor gap:
  // once signOut() has revoked the real session, nothing can act on it
  // regardless. See docs/decisions/0007.
  await supabase.auth.signOut()
}
