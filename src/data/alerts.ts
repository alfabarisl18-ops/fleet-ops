import { supabase } from '@/lib/supabase'
import type { Enums } from '@/types/db'

// Screens never call Supabase directly — same convention as src/data/vehicles.ts.
// camelCase in and out; snake_case stays inside this file.
//
// Alerts are raised and resolved entirely server-side (two triggers plus a
// daily pg_cron job — see supabase/migrations/20260813020000_alerts_generation.sql).
// This file only reads them and records a review — nothing here ever
// inserts an alert or resolves one by hand, matching how the rest of this
// app treats state as something that reflects reality, not something a
// person can wave away.

export type AlertType = Enums<'alert_type'>
export type AlertSeverity = Enums<'alert_severity'>

export interface AlertListItem {
  id: string
  type: AlertType
  severity: AlertSeverity
  subjectType: Enums<'entity_type'>
  subjectId: string
  vehicleId: string | null
  driverId: string | null
  dueOn: string | null
  createdAt: string
  reviewedAt: string | null
}

const ALERT_COLUMNS =
  'id, type, severity, subject_type, subject_id, vehicle_id, driver_id, due_on, created_at, reviewed_at'

function toAlertListItem(row: {
  id: string
  type: AlertType
  severity: AlertSeverity
  subject_type: Enums<'entity_type'>
  subject_id: string
  vehicle_id: string | null
  driver_id: string | null
  due_on: string | null
  created_at: string
  reviewed_at: string | null
}): AlertListItem {
  return {
    id: row.id,
    type: row.type,
    severity: row.severity,
    subjectType: row.subject_type,
    subjectId: row.subject_id,
    vehicleId: row.vehicle_id,
    driverId: row.driver_id,
    dueOn: row.due_on,
    createdAt: row.created_at,
    reviewedAt: row.reviewed_at,
  }
}

/** For the bell badge — unreviewed and unresolved only, so the count
 *  drops the moment something is opened, not only once it's truly
 *  resolved. A head-only count avoids fetching rows just to size a badge. */
export async function fetchOpenAlertCount(): Promise<number> {
  const { count, error } = await supabase
    .from('alerts')
    .select('id', { count: 'exact', head: true })
    .is('resolved_at', null)
    .is('reviewed_at', null)

  if (error) throw error
  return count ?? 0
}

/** Every open, unreviewed alert — same filter as fetchOpenAlertCount(), so
 *  the panel's contents always match the badge number. Opening an alert
 *  (AlertsBell's handleOpenAlert) reviews it, which is what removes it from
 *  here — whether or not the underlying condition is resolved yet. This is
 *  also what makes SHIPPING_DEPARTURE-style alerts (no auto-resolve rule by
 *  design) actually clearable: reviewing was always meant to be enough for
 *  those, but nothing removed them from this list until now. Most urgent
 *  first. */
export async function fetchOpenAlerts(): Promise<AlertListItem[]> {
  const { data, error } = await supabase
    .from('alerts')
    .select(ALERT_COLUMNS)
    .is('resolved_at', null)
    .is('reviewed_at', null)
    .order('severity', { ascending: false })
    .order('due_on', { ascending: true, nullsFirst: false })
    .limit(50)

  if (error) throw error
  return (data ?? []).map(toAlertListItem)
}

/** Desktop-only via alerts_update_desktop — fine, the bell only renders
 *  on desktop (TopBar, not either mobile workspace). reviewed_at
 *  is server-stamped by a trigger the first time reviewed_by is set —
 *  never derived from the client's clock. */
export async function reviewAlert(alertId: string, currentUserId: string): Promise<void> {
  const { error } = await supabase.from('alerts').update({ reviewed_by: currentUserId }).eq('id', alertId)
  if (error) throw error
}
