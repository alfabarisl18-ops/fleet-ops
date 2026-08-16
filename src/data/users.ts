import { supabase } from '@/lib/supabase'
import type { Enums } from '@/types/db'

// Screens never call Supabase directly — same convention as src/data/auth.ts,
// which this file complements: auth.ts is the signed-in user's own sign-in
// flow, this file is Owner/Admin managing everyone else. camelCase in and
// out; snake_case stays inside this file.
//
// The provisioning mechanism (admin_reset_pin, the admin-provision-mobile-
// account Edge Function) was built in Phase 2 specifically so a later phase
// could "build the mechanism, not necessarily a UI for it yet" (that RPC's
// own comment) — this file is the first thing to call either.

export type AppRole = Enums<'user_role'>
export type UserStatus = Enums<'user_status'>

export const MOBILE_ROLES = ['COLLECTIONS_FINANCE', 'MAINTENANCE_REPAIRS'] as const
export type MobileRole = (typeof MOBILE_ROLES)[number]

const DESKTOP_ROLES = ['OWNER_ADMIN', 'FLEET_MANAGER'] as const

function sameCategory(a: AppRole, b: AppRole): boolean {
  const mobile = (r: AppRole) => (MOBILE_ROLES as readonly string[]).includes(r)
  return mobile(a) === mobile(b)
}

export interface PersonListItem {
  id: string
  displayName: string
  role: AppRole
  status: UserStatus
  provisioned: boolean
}

/** users_select_signed_in grants every signed-in role read access — the
 *  screen itself decides who sees write actions. auth_user_id is read only
 *  to know whether a mobile person still needs provisioning (see
 *  AddPersonForm); it is never displayed. */
export async function fetchPeople(): Promise<PersonListItem[]> {
  const { data, error } = await supabase
    .from('users')
    .select('id, display_name, role, status, auth_user_id')
    .order('role')
    .order('display_name')
  if (error) throw error
  return (data ?? []).map((u) => ({
    id: u.id,
    displayName: u.display_name,
    role: u.role,
    status: u.status,
    provisioned: u.auth_user_id !== null,
  }))
}

/** Owner/Admin only via users_insert_owner. Creates the profile row only —
 *  not yet sign-in-capable until provisionMobilePerson runs. Desktop
 *  accounts are deliberately not created here — see decision 0016: the
 *  first Owner/Admin, and every one since, is created once via the
 *  Supabase Dashboard, documented in README.md, not a form this app
 *  builds. */
export async function createMobilePerson(displayName: string, role: MobileRole): Promise<string> {
  const { data, error } = await supabase
    .from('users')
    .insert({ client_record_id: crypto.randomUUID(), display_name: displayName, role, status: 'ACTIVE' })
    .select('id')
    .single()
  if (error) throw error
  return data.id
}

interface ProvisionResponse {
  ok?: boolean
  error?: string
}

/** Calls the existing admin-provision-mobile-account Edge Function (Phase
 *  2) — creates the auth.users row a mobile account needs before it can
 *  ever be PIN-signed-in, optionally setting the first PIN in the same
 *  call. Same supabase.functions.invoke pattern as signInWithPin in
 *  src/data/auth.ts. */
export async function provisionMobilePerson(userId: string, pin?: string): Promise<void> {
  const { data, error } = await supabase.functions.invoke<ProvisionResponse>('admin-provision-mobile-account', {
    body: pin ? { user_id: userId, pin } : { user_id: userId },
  })
  if (error || !data || data.error) {
    throw new Error(data?.error ?? 'server_error')
  }
}

/** Calls the existing public.admin_reset_pin RPC (Phase 2) directly — sets
 *  or replaces a mobile role's PIN and revokes their current sessions.
 *  Owner/Admin only, enforced inside the function itself. The PIN is never
 *  echoed back — CLAUDE.md: never print credentials in the UI. */
export async function resetMobilePin(userId: string, pin: string): Promise<void> {
  const { error } = await supabase.rpc('admin_reset_pin', { p_user_id: userId, p_new_pin: pin })
  if (error) throw error
}

/** Owner/Admin only via users_update_owner. */
export async function updatePersonStatus(userId: string, status: UserStatus): Promise<void> {
  const { error } = await supabase.from('users').update({ status }).eq('id', userId)
  if (error) throw error
}

/**
 * Owner/Admin only via users_update_owner. Restricted here to a role
 * change within the same device category (desktop<->desktop or
 * mobile<->mobile) — a client-side guard, not a new server constraint.
 * Converting a PIN account to a desktop role would leave it with no
 * password; converting a password account to a mobile role would leave it
 * with a synthetic .invalid email and no PIN. Neither has a recovery path
 * in this app, so the cross-category case is refused before the request
 * rather than left to fail confusingly server-side. See decision 0016.
 */
export async function updatePersonRole(userId: string, currentRole: AppRole, newRole: AppRole): Promise<void> {
  if (!sameCategory(currentRole, newRole)) {
    throw new Error('Cannot change a role across desktop and mobile — that account would lose its ability to sign in.')
  }
  const { error } = await supabase.from('users').update({ role: newRole }).eq('id', userId)
  if (error) throw error
}

export function rolesInSameCategory(role: AppRole): AppRole[] {
  return (MOBILE_ROLES as readonly string[]).includes(role) ? [...MOBILE_ROLES] : [...DESKTOP_ROLES]
}
