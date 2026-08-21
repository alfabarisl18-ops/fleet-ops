import { createClient } from '@supabase/supabase-js'
import { adminTableRequest, setPasswordRedirectUrl } from '../_shared/mobile-auth.ts'

// Owner/Admin only: sends a password-recovery email to an already-
// provisioned Fleet Manager, mirroring admin-provision-desktop-account's
// shape almost exactly — same caller-verification pattern. The only real
// differences: the target must ALREADY be provisioned (auth_user_id not
// null) — the opposite precondition from provisioning a brand-new account
// — and this calls the self-service resetPasswordForEmail() (through the
// caller's own client, not the admin one — it needs no service-role
// privilege) rather than an admin.* method, since that's the exact method
// meant for "send this person a reset email." redirectTo points at the
// app's own password-setup gate — see that helper's comment for why
// that's mandatory, not cosmetic.
//
// (Originally used generateLink({type:'recovery'}), which never sends
// anything on its own — switched once SMTP was confirmed working.)
//
// Deliberately does not cover OWNER_ADMIN targets, for the same reason
// admin-provision-desktop-account doesn't create them: this only ever
// runs while signed in as an Owner/Admin, so an Owner/Admin locked out of
// their own account can't be helped by this function anyway (nobody else
// could trigger it for them) — that stays a Supabase Dashboard action.
// Mirrors the mobile side's own split: admin_reset_pin is a separate call
// from admin-provision-mobile-account, not folded into it.

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

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

interface TargetUser {
  id: string
  role: string
  status: string
  auth_user_id: string | null
  email: string | null
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS_HEADERS })
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return json({ error: 'unauthorized' }, 401)

  let body: { user_id?: unknown }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'invalid_request' }, 400)
  }

  const targetUserId = body.user_id
  if (typeof targetUserId !== 'string' || !UUID_RE.test(targetUserId)) {
    return json({ error: 'invalid_request' }, 400)
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    console.error('admin-reset-desktop-password: missing required env vars')
    return json({ error: 'server_misconfigured' }, 500)
  }

  const caller = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const { data: callerAuth, error: callerAuthError } = await caller.auth.getUser()
  if (callerAuthError || !callerAuth?.user) {
    return json({ error: 'unauthorized' }, 401)
  }

  const { data: callerProfile, error: callerProfileError } = await caller
    .from('users')
    .select('role')
    .eq('auth_user_id', callerAuth.user.id)
    .eq('status', 'ACTIVE')
    .maybeSingle()

  if (callerProfileError || callerProfile?.role !== 'OWNER_ADMIN') {
    return json({ error: 'forbidden' }, 403)
  }

  const targetResp = await adminTableRequest(
    supabaseUrl,
    serviceRoleKey,
    `users?id=eq.${encodeURIComponent(targetUserId)}&select=id,role,status,auth_user_id,email`,
  )
  if (!targetResp.ok) {
    console.error('admin-reset-desktop-password: target lookup failed', await targetResp.text())
    return json({ error: 'server_error' }, 500)
  }
  const targetRows = (await targetResp.json()) as TargetUser[]
  const target = targetRows[0]

  if (!target) {
    return json({ error: 'not_found' }, 404)
  }
  if (target.role !== 'FLEET_MANAGER') {
    return json({ error: 'not_a_fleet_manager_role' }, 400)
  }
  if (!target.auth_user_id) {
    return json({ error: 'not_provisioned' }, 409)
  }
  if (!target.email) {
    return json({ error: 'missing_email' }, 400)
  }

  const { error: resetError } = await caller.auth.resetPasswordForEmail(target.email, {
    redirectTo: setPasswordRedirectUrl(),
  })

  if (resetError) {
    console.error('admin-reset-desktop-password: resetPasswordForEmail failed', resetError)
    return json({ error: 'server_error' }, 500)
  }

  return json({ ok: true })
})
