import { createClient } from '@supabase/supabase-js'
import { adminTableRequest, setPasswordRedirectUrl } from '../_shared/mobile-auth.ts'

// Owner/Admin only: creates the auth.users row a Fleet Manager account
// needs before it can ever sign in, and returns a one-time setup link for
// the app to show — no password is ever generated, shown, or stored by
// this app or this function (CLAUDE.md: never print credentials in the
// UI — a one-time setup link is not a credential). See
// docs/decisions/0016-settings-scope-and-export-format.md's "Revisit this
// when a real desktop-account self-service flow is explicitly requested"
// note — this is that flow.
//
// Deliberately scoped to FLEET_MANAGER only, not OWNER_ADMIN — creating a
// second full-owner account is a materially bigger decision than adding a
// Fleet Manager, and stays a manual Supabase Dashboard step (unchanged from
// decision 0007) rather than something this in-app flow grants.
//
// Mirrors admin-provision-mobile-account's shape closely: same caller-
// verification pattern (the caller's own forwarded session decides whether
// they're Owner/Admin, not the service-role key), same adminTableRequest
// helper for plain table reads/writes (this project's service-role key is
// the newer sb_secret_... format, which PostgREST rejects on the
// Authorization header for table requests specifically — see that helper's
// comment in _shared/mobile-auth.ts). Differs where it has to: a desktop
// account has a real email and no PIN, so this calls
// admin.auth.admin.generateLink({type: 'invite'}) instead of setting a
// synthetic email.
//
// generateLink() returns a link and sends nothing itself — the app shows it
// for the Owner/Admin to copy and send themselves. Briefly switched to
// inviteUserByEmail() (which both creates the account and sends the email,
// through whatever SMTP is configured) once this project's Resend SMTP was
// confirmed working — reverted after a live failure onboarding a real
// Fleet Manager: Resend's shared onboarding@resend.dev address can only
// ever reach the account owner's own inbox, and sending to anyone else
// needs a verified custom domain this project doesn't have (see decision
// 0021). redirectTo points at the app's own password-setup gate — see that
// helper's comment for why this is mandatory, not cosmetic: Supabase signs
// the browser in the instant the link is opened, before any password
// exists.

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
    console.error('admin-provision-desktop-account: missing required env vars')
    return json({ error: 'server_misconfigured' }, 500)
  }

  // Scoped to the caller's own session — RLS-respecting, not an admin
  // client. This is what actually decides whether the request comes from
  // an Owner.
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

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const targetResp = await adminTableRequest(
    supabaseUrl,
    serviceRoleKey,
    `users?id=eq.${encodeURIComponent(targetUserId)}&select=id,role,status,auth_user_id,email`,
  )
  if (!targetResp.ok) {
    console.error('admin-provision-desktop-account: target lookup failed', await targetResp.text())
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
  if (target.auth_user_id) {
    return json({ error: 'already_provisioned' }, 409)
  }
  if (!target.email) {
    return json({ error: 'missing_email' }, 400)
  }

  // Creates the auth.users row for a brand-new email and returns a one-time
  // setup link. Sends nothing itself — the app shows this for the
  // Owner/Admin to copy and deliver themselves (WhatsApp, SMS, in person).
  const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
    type: 'invite',
    email: target.email,
    options: { redirectTo: setPasswordRedirectUrl() },
  })

  if (linkError || !linkData?.user || !linkData.properties?.action_link) {
    console.error('admin-provision-desktop-account: generateLink failed', linkError)
    return json({ error: 'server_error' }, 500)
  }

  const patchResp = await adminTableRequest(
    supabaseUrl,
    serviceRoleKey,
    `users?id=eq.${encodeURIComponent(targetUserId)}`,
    { method: 'PATCH', body: JSON.stringify({ auth_user_id: linkData.user.id }) },
  )

  if (!patchResp.ok) {
    console.error('admin-provision-desktop-account: failed to link auth_user_id', await patchResp.text())
    return json({ error: 'server_error' }, 500)
  }

  return json({ ok: true, user_id: targetUserId, auth_user_id: linkData.user.id, action_link: linkData.properties.action_link })
})
