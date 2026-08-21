import { createClient } from '@supabase/supabase-js'
import { adminTableRequest } from '../_shared/mobile-auth.ts'

// Owner/Admin only: creates the auth.users row a Fleet Manager account
// needs before it can ever sign in, and returns a one-time setup link for
// the Owner to hand the person themselves (text/WhatsApp/in person) — no
// password is ever generated, shown, or stored by this app or this
// function (CLAUDE.md: never print credentials in the UI). See
// docs/decisions/0016-settings-scope-and-export-format.md's "Revisit this
// when a real desktop-account self-service flow is explicitly requested"
// note — this is that flow, using admin.generateLink() as suggested there.
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
// admin.auth.admin.generateLink() instead of setting a synthetic email.

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

  // generateLink() creates the auth.users row for a brand-new email itself
  // (it doesn't require createUser() first) and returns a one-time link —
  // it does NOT send anything on its own; delivering the link is this
  // function's caller's job, by design, so nothing here depends on this
  // project's SMTP being configured.
  const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
    type: 'invite',
    email: target.email,
  })

  if (linkError || !linkData?.user || !linkData.properties?.action_link) {
    console.error('admin-provision-desktop-account: generateLink failed', linkError)
    return json({ error: 'server_error' }, 500)
  }

  const linkResp = await adminTableRequest(
    supabaseUrl,
    serviceRoleKey,
    `users?id=eq.${encodeURIComponent(targetUserId)}`,
    { method: 'PATCH', body: JSON.stringify({ auth_user_id: linkData.user.id }) },
  )

  if (!linkResp.ok) {
    console.error('admin-provision-desktop-account: failed to link auth_user_id', await linkResp.text())
    return json({ error: 'server_error' }, 500)
  }

  return json({ ok: true, user_id: targetUserId, auth_user_id: linkData.user.id, action_link: linkData.properties.action_link })
})
