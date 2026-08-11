import { supabase } from '@/lib/supabase'
import type { EntityType } from '@/data/activityRecords'
import type { Enums } from '@/types/db'

export type CorrectionStatus = Enums<'correction_status'>

export interface Correction {
  id: string
  targetTable: EntityType
  targetId: string
  reason: string
  status: CorrectionStatus
  requestedBy: string
  approvedBy: string | null
  requestedAt: string
  appliedAt: string | null
  beforeJson: Record<string, string | number | null> | null
  afterJson: Record<string, string | number | null> | null
}

const CORRECTION_COLUMNS =
  'id, target_table, target_id, reason, status, requested_by, approved_by, requested_at, applied_at, before_json, after_json'

function toCorrection(row: {
  id: string
  target_table: EntityType
  target_id: string
  reason: string
  status: CorrectionStatus
  requested_by: string
  approved_by: string | null
  requested_at: string
  applied_at: string | null
  before_json: unknown
  after_json: unknown
}): Correction {
  return {
    id: row.id,
    targetTable: row.target_table,
    targetId: row.target_id,
    reason: row.reason,
    status: row.status,
    requestedBy: row.requested_by,
    approvedBy: row.approved_by,
    requestedAt: row.requested_at,
    appliedAt: row.applied_at,
    beforeJson: row.before_json as Correction['beforeJson'],
    afterJson: row.after_json as Correction['afterJson'],
  }
}

/**
 * The one open (REQUESTED) correction for an entity, or null — mirrors
 * fetchOpenAgreementForVehicle's pre-check pattern in
 * driverPurchaseAgreements.ts, so the profile screen knows whether to show
 * a pending-correction section before the person even asks.
 */
export async function fetchPendingCorrection(targetTable: EntityType, targetId: string): Promise<Correction | null> {
  const { data, error } = await supabase
    .from('corrections')
    .select(CORRECTION_COLUMNS)
    .eq('target_table', targetTable)
    .eq('target_id', targetId)
    .eq('status', 'REQUESTED')
    .maybeSingle()

  if (error) throw error
  return data ? toCorrection(data) : null
}

export interface RequestCorrectionInput {
  targetTable: EntityType
  targetId: string
  reason: string
  requestedBy: string
  /** snake_case keys matching the target table's own columns — only the
   *  fields being changed need to be present. before_json is captured
   *  server-side (app.corrections_capture_before_json), never sent here. */
  afterJson: Record<string, string | number | null>
}

export async function requestCorrection(input: RequestCorrectionInput): Promise<void> {
  const { error } = await supabase.from('corrections').insert({
    client_record_id: crypto.randomUUID(),
    target_table: input.targetTable,
    target_id: input.targetId,
    reason: input.reason,
    requested_by: input.requestedBy,
    after_json: input.afterJson,
  })
  if (error) throw error
}

/** Owner/Admin only — enforced inside public.apply_correction(); this just
 *  forwards the call and lets a rejection throw naturally. */
export async function applyCorrection(correctionId: string): Promise<void> {
  const { error } = await supabase.rpc('apply_correction', { p_correction_id: correctionId })
  if (error) throw error
}

/** Owner/Admin only — enforced inside public.reject_correction(). */
export async function rejectCorrection(correctionId: string): Promise<void> {
  const { error } = await supabase.rpc('reject_correction', { p_correction_id: correctionId })
  if (error) throw error
}
