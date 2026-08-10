import { createClient } from '@supabase/supabase-js'
import { adminTableRequest, syntheticMobileEmail } from '../_shared/mobile-auth.ts'

// Mints a real Supabase session from a role + a 4-digit PIN — no separate
// identity step. See docs/decisions/0007-pin-sign-in-becomes-a-real-session.md
// for the session-minting design, and the migration comment on
// public.verify_role_pin for why PINs must be unique per role and why the
// throttle here is scoped to the role rather than to one account.
//
// Request: { role: 'COLLECTIONS_FINANCE' | 'MAINTENANCE_REPAIRS', pin: string }.
//
// This function is called with the anon/publishable key: nobody is signed in
// yet, that's the whole point of a PIN flow. Supabase's platform-level
// verify_jwt check only requires *some* validly-signed key, which the anon
// key satisfies; the actual authorization decision — is this really a valid
// PIN for this role — happens entirely inside public.verify_role_pin.

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  })
}

const PIN_RE = /^[0-9]{4}$/
const MOBILE_ROLES = ['COLLECTIONS_FINANCE', 'MAINTENANCE_REPAIRS'] as const
type MobileRole = (typeof MOBILE_ROLES)[number]

interface RolePinCheckResult {
  ok: boolean
  user_id: string | null
  auth_user_id: string | null
  locked_until: string | null
  reason: string
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS_HEADERS })
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

  let body: { role?: unknown; pin?: unknown }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'invalid_request' }, 400)
  }

  const role = body.role
  const pin = body.pin

  if (typeof role !== 'string' || !MOBILE_ROLES.includes(role as MobileRole)) {
    return json({ error: 'invalid_request' }, 400)
  }
  if (typeof pin !== 'string' || !PIN_RE.test(pin)) {
    return json({ error: 'invalid_request' }, 400)
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !serviceRoleKey) {
    console.error('pin-sign-in: missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
    return json({ error: 'server_misconfigured' }, 500)
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  // Step 1: find the account this PIN belongs to within the role, and
  // enforce the (role-scoped) throttle. This is the only place the
  // plaintext PIN goes — into this one RPC call, over TLS, to the one
  // Postgres function that compares it and discards it immediately after.
  const { data: rawResult, error: verifyError } = await admin.rpc('verify_role_pin', {
    p_role: role,
    p_pin: pin,
  })

  if (verifyError) {
    console.error('pin-sign-in: verify_role_pin RPC failed', verifyError)
    return json({ error: 'server_error' }, 500)
  }

  // PostgREST returns a single composite RPC result as an object, not an
  // array — this branch is defensive in case that ever changes.
  const result: RolePinCheckResult | undefined = Array.isArray(rawResult) ? rawResult[0] : rawResult

  if (!result || !result.ok || !result.user_id) {
    if (result?.reason === 'locked') {
      return json({ error: 'locked', locked_until: result.locked_until }, 429)
    }
    // invalid_pin, not_provisioned, or anything else: the same generic
    // response — this function is the layer that would otherwise leak which
    // one happened, and it deliberately doesn't.
    return json({ error: 'invalid_pin' }, 401)
  }

  const userId = result.user_id

  // Step 2: mint a real session. admin.generateLink does not send anything —
  // it only returns a token, consumed in the very next call and never
  // surfaced anywhere else.
  const email = syntheticMobileEmail(userId)

  const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email,
  })

  if (linkError || !linkData?.properties?.hashed_token) {
    console.error('pin-sign-in: generateLink failed', linkError)
    return json({ error: 'server_error' }, 500)
  }

  const { data: otpData, error: otpError } = await admin.auth.verifyOtp({
    type: 'magiclink',
    token_hash: linkData.properties.hashed_token,
  })

  if (otpError || !otpData?.session) {
    console.error('pin-sign-in: verifyOtp failed', otpError)
    return json({ error: 'server_error' }, 500)
  }

  // Defence in depth: generateLink's magiclink type auto-creates an
  // auth.users row when nothing matches the given email instead of erroring
  // — found by testing, when a mismatched synthetic email silently minted a
  // session for a brand-new, unlinked identity instead of the intended
  // account. If the email this function computed ever drifts from what a
  // public.users row is actually linked to, this is the one place that
  // catches it before a session ships — refuse rather than hand back a
  // session for the wrong identity.
  if (otpData.session.user.id !== result.auth_user_id) {
    console.error(
      'pin-sign-in: minted session identity does not match the linked account',
      { expected: result.auth_user_id, got: otpData.session.user.id, userId },
    )
    return json({ error: 'server_error' }, 500)
  }

  // Step 3: the application-level session row. Hard cap 12 hours from now;
  // last_seen_at defaults to now() and is advanced by public.touch_session()
  // as the client is used. See docs/decisions/0007 for why this exists
  // alongside Supabase's own session instead of relying on it alone.
  //
  // Uses adminTableRequest, not admin.from() — see that helper's comment.
  const expiresAt = new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString()

  const sessionResp = await adminTableRequest(supabaseUrl, serviceRoleKey, 'sessions', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({ user_id: userId, expires_at: expiresAt }),
  })

  if (!sessionResp.ok) {
    console.error('pin-sign-in: failed to record session row', await sessionResp.text())
    return json({ error: 'server_error' }, 500)
  }

  const sessionRows = (await sessionResp.json()) as Array<{ id: string }>
  const sessionRow = sessionRows[0]
  if (!sessionRow) {
    console.error('pin-sign-in: session insert returned no row')
    return json({ error: 'server_error' }, 500)
  }

  const userResp = await adminTableRequest(
    supabaseUrl,
    serviceRoleKey,
    `users?id=eq.${encodeURIComponent(userId)}&select=display_name,role`,
  )

  if (!userResp.ok) {
    console.error('pin-sign-in: failed to load user row', await userResp.text())
    return json({ error: 'server_error' }, 500)
  }

  const userRows = (await userResp.json()) as Array<{ display_name: string; role: string }>
  const userRow = userRows[0]
  if (!userRow) {
    console.error('pin-sign-in: user lookup returned no row')
    return json({ error: 'server_error' }, 500)
  }

  return json({
    access_token: otpData.session.access_token,
    refresh_token: otpData.session.refresh_token,
    session_id: sessionRow.id,
    user: {
      id: userId,
      display_name: userRow.display_name,
      role: userRow.role,
    },
  })
})
