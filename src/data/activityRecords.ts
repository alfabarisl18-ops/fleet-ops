import { supabase } from '@/lib/supabase'
import type { Enums } from '@/types/db'

// Phase 4: the Records page projection. Every row here is written by a
// database trigger, not application code — see the migration's own
// comment for why (same principle as vehicle/maintenance status columns).
// This file is read-only; nothing in src/ ever inserts into
// activity_records directly.

export type EntityType = Enums<'entity_type'>
export type LedgerDirection = Enums<'ledger_direction'>

/**
 * Not a database enum — activity_records.record_type is plain text, by
 * Phase 1's own design (so future phases can add new kinds without a
 * migration). This union lists exactly the values the triggers this phase
 * writes actually produce; RECORD_TYPE_LABELS in constants/labels.ts falls
 * back gracefully for anything not in this list.
 */
export type RecordType =
  | 'VEHICLE_ADDED'
  | 'DRIVER_ADDED'
  | 'VEHICLE_STATUS_CHANGED'
  | 'DRIVER_ASSIGNED'
  | 'DRIVER_PURCHASE_AGREEMENT_CREATED'
  | 'DRIVER_DELETED'
  | 'CORRECTION_REQUESTED'
  | 'CORRECTION_APPLIED'
  | 'CORRECTION_REJECTED'

export interface ActivityRecord {
  id: string
  recordType: RecordType
  targetType: EntityType
  targetId: string
  vehicleId: string | null
  driverId: string | null
  amountMinor: number | null
  direction: LedgerDirection | null
  appliesToDate: string | null
  enteredAt: string
  enteredBy: string
  summaryText: string
}

const ACTIVITY_RECORD_COLUMNS =
  'id, record_type, target_type, target_id, vehicle_id, driver_id, amount_minor, direction, applies_to_date, entered_at, entered_by, summary_text'

function toActivityRecord(row: {
  id: string
  record_type: string
  target_type: EntityType
  target_id: string
  vehicle_id: string | null
  driver_id: string | null
  amount_minor: number | null
  direction: LedgerDirection | null
  applies_to_date: string | null
  entered_at: string
  entered_by: string
  summary_text: string
}): ActivityRecord {
  return {
    id: row.id,
    recordType: row.record_type as RecordType,
    targetType: row.target_type,
    targetId: row.target_id,
    vehicleId: row.vehicle_id,
    driverId: row.driver_id,
    amountMinor: row.amount_minor,
    direction: row.direction,
    appliesToDate: row.applies_to_date,
    enteredAt: row.entered_at,
    enteredBy: row.entered_by,
    summaryText: row.summary_text,
  }
}

/**
 * Most recent first, capped at 200 — this page has no pagination yet and
 * every kilobyte here is someone's mobile data (CLAUDE.md), so an
 * unbounded query isn't the right default even before the dataset is
 * large enough for it to matter.
 */
export async function fetchActivityRecords(): Promise<ActivityRecord[]> {
  const { data, error } = await supabase
    .from('activity_records')
    .select(ACTIVITY_RECORD_COLUMNS)
    .order('entered_at', { ascending: false })
    .limit(200)

  if (error) throw error
  return (data ?? []).map(toActivityRecord)
}

export async function fetchActivityRecord(id: string): Promise<ActivityRecord | null> {
  const { data, error } = await supabase.from('activity_records').select(ACTIVITY_RECORD_COLUMNS).eq('id', id).maybeSingle()
  if (error) throw error
  return data ? toActivityRecord(data) : null
}
