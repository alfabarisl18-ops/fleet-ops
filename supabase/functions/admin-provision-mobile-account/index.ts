import { createClient } from '@supabase/supabase-js'
import { adminTableRequest, syntheticMobileEmail } from '../_shared/mobile-auth.ts'

// Owner/Admin only: creates the auth.users row a mobile-role account needs
// before it can ever be PIN-signed-in, and optionally sets its first PIN in
// the same call. See docs/decisions/0007-pin-sign-in-becomes-a-real-session.md
// for why this has to go through admin.createUser() rather than a plain SQL
// insert into auth.users.
//
// verify_jwt stays on: the caller must already hold a real, signed-in
// session. This function re-derives who that is itself rather than trusting
// anything in the request body, and — for the one downstream call that has
// its own internal Owner check (admin_reset_pin) — uses the caller's own
// forwarded session rather than the service-role key, so there is exactly
// one place "is this really an Owner" gets decided, not two answers that
// could disagree with each other.
//
// The two admin-side reads/writes against public.users use adminTableRequest
// rather than admin.from() — see that helper's comment in _shared/mobile-auth.ts
// for why: this project's service-role key is the newer sb_secret_... format,
// and supabase-js's .from() sends it on a header PostgREST rejects for table
// requests specifically.

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
const PIN_RE = /^[0-9]{4}$/

interface TargetUser {
  id: string
  role: string
  status: string
  auth_user_id: string | null
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS_HEADERS })
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return json({ error: 'unauthorized' }, 401)

  let body: { user_id?: unknown; pin?: unknown }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'invalid_request' }, 400)
  }

  const targetUserId = body.user_id
  const pin = body.pin

  if (typeof targetUserId !== 'string' || !UUID_RE.test(targetUserId)) {
    return json({ error: 'invalid_request' }, 400)
  }
  if (pin !== undefined && (typeof pin !== 'string' || !PIN_RE.test(pin))) {
    return json({ error: 'invalid_request' }, 400)
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    console.error('admin-provision-mobile-account: missing required env vars')
    return json({ error: 'server_misconfigured' }, 500)
  }

  // Scoped to the caller's own session — RLS-respecting, not an admin client.
  // This is what actually decides whether the request comes from an Owner.
  // anonKey here is a legacy JWT-shaped key, and authHeader carries the
  // caller's own real session JWT — neither hits the sb_secret_... header
  // problem, so this client can safely use the normal SDK methods.
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
    `users?id=eq.${encodeURIComponent(targetUserId)}&select=id,role,status,auth_user_id`,
  )
  if (!targetResp.ok) {
    console.error('admin-provision-mobile-account: target lookup failed', await targetResp.text())
    return json({ error: 'server_error' }, 500)
  }
  const targetRows = (await targetResp.json()) as TargetUser[]
  const target = targetRows[0]

  if (!target) {
    return json({ error: 'not_found' }, 404)
  }
  if (target.role !== 'COLLECTIONS_FINANCE' && target.role !== 'MAINTENANCE_REPAIRS') {
    return json({ error: 'not_a_mobile_role' }, 400)
  }
  if (target.auth_user_id) {
    return json({ error: 'already_provisioned' }, 409)
  }

  const email = syntheticMobileEmail(targetUserId)

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: { fleet_ops_public_user_id: targetUserId },
  })

  if (createError || !created?.user) {
    console.error('admin-provision-mobile-account: createUser failed', createError)
    return json({ error: 'server_error' }, 500)
  }

  const linkResp = await adminTableRequest(
    supabaseUrl,
    serviceRoleKey,
    `users?id=eq.${encodeURIComponent(targetUserId)}`,
    { method: 'PATCH', body: JSON.stringify({ auth_user_id: created.user.id }) },
  )

  if (!linkResp.ok) {
    console.error('admin-provision-mobile-account: failed to link auth_user_id', await linkResp.text())
    return json({ error: 'server_error' }, 500)
  }

  if (pin) {
    // Through the caller's own session, not the service role — so
    // admin_reset_pin's internal Owner check is what actually authorizes
    // this, not an assumption baked into this function. admin_reset_pin is
    // an RPC, not a table call, so the sb_secret_... header issue does not
    // apply here even if this were called through the admin client.
    const { error: pinError } = await caller.rpc('admin_reset_pin', {
      p_user_id: targetUserId,
      p_new_pin: pin,
    })
    if (pinError) {
      console.error('admin-provision-mobile-account: admin_reset_pin failed', pinError)
      return json({ error: 'server_error', detail: 'account created but PIN not set' }, 500)
    }
  }

  return json({ ok: true, user_id: targetUserId, auth_user_id: created.user.id })
})
