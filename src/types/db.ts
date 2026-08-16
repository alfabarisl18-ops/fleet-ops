// Corrections and helpers on top of the generated database types.
//
// `database.ts` is produced by `supabase gen types` and is regenerated wholesale
// after every migration, so nothing may be hand-edited there. This file is the
// place for the things the generator gets wrong or cannot know.
//
// The generator has one gap that matters here: it does not recognise
// GENERATED ALWAYS columns, so it lists them as optional fields on Insert.
// Sending one is a runtime error from Postgres —
//
//     cannot insert a non-DEFAULT value into column "shortfall_treatment"
//
// — which is exactly the failure the generated column exists to cause, but the
// compiler should catch it first. `Insertable<T>` removes them.

import type { Database } from './database'

type PublicSchema = Database['public']

export type Tables<T extends keyof PublicSchema['Tables']> =
  PublicSchema['Tables'][T]['Row']

export type TablesInsertRaw<T extends keyof PublicSchema['Tables']> =
  PublicSchema['Tables'][T]['Insert']

export type TablesUpdate<T extends keyof PublicSchema['Tables']> =
  PublicSchema['Tables'][T]['Update']

export type Enums<T extends keyof PublicSchema['Enums']> = PublicSchema['Enums'][T]

/**
 * Columns computed by the database. Supplying one raises. They are readable on
 * the Row type and absent from Insertable.
 */
export const GENERATED_COLUMNS = {
  daily_payment_records: ['shortfall_amount_minor', 'shortfall_treatment'],
  bundled_payments: ['covers_to_date'],
  trips: ['duration_days'],
} as const satisfies Partial<Record<keyof PublicSchema['Tables'], readonly string[]>>

/**
 * Columns a trigger overwrites on insert. Supplying one is not an error, it is
 * simply discarded — which is worse than an error, because it looks like it
 * worked. Business dates and event times are server-side by rule, and the
 * `from_status` of a status event is read from the record being changed.
 */
export const SERVER_STAMPED_COLUMNS = {
  acquisition_payments: ['entered_at'],
  activity_records: ['entered_at'],
  alerts: ['created_at'],
  balance_settlements: ['entered_at'],
  bundled_payments: ['entered_at'],
  corrections: ['requested_at'],
  daily_payment_records: ['entered_at'],
  documents: ['uploaded_at'],
  ledger_entries: ['entered_at'],
  maintenance_notes: ['entered_at'],
  maintenance_orders: ['opened_at'],
  maintenance_parts: ['entered_at'],
  maintenance_status_events: ['changed_at', 'from_status'],
  vehicle_status_events: ['changed_at', 'from_status'],
} as const satisfies Partial<Record<keyof PublicSchema['Tables'], readonly string[]>>

type GeneratedFor<T> = T extends keyof typeof GENERATED_COLUMNS
  ? (typeof GENERATED_COLUMNS)[T][number]
  : never

type ServerStampedFor<T> = T extends keyof typeof SERVER_STAMPED_COLUMNS
  ? (typeof SERVER_STAMPED_COLUMNS)[T][number]
  : never

/**
 * What a client is actually allowed to insert into a table.
 *
 * `client_record_id` is required rather than optional: the column has a
 * server-side default so a row is never without one, but a device-generated
 * UUID is the whole basis of safe offline retry. If the server fills it in, a
 * retried write creates a second payment. Requiring it here means the offline
 * queue cannot forget.
 */
export type Insertable<T extends keyof PublicSchema['Tables']> = Omit<
  TablesInsertRaw<T>,
  GeneratedFor<T> | ServerStampedFor<T>
> &
  (TablesInsertRaw<T> extends { client_record_id?: string | undefined }
    ? { client_record_id: string }
    : object)

// --- RPC argument nullability ------------------------------------------

/**
 * A second generator gap: it has no way to see whether a Postgres function
 * parameter accepts NULL, only its base type, so every RPC arg comes out
 * non-nullable even when the SQL side is happy to receive one (e.g.
 * assign_driver_to_vehicle's p_route_id, for a vehicle with no assigned
 * route). List the genuinely-nullable ones here; RpcArgs<T> corrects them.
 */
export const NULLABLE_RPC_ARGS = {
  assign_driver_to_vehicle: ['p_route_id'],
  record_trip: [
    'p_driver_id',
    'p_helper_name',
    'p_pickup_location',
    'p_destination_location',
    'p_returned_on',
    'p_load_quantity',
    'p_load_weight',
    'p_load_weight_unit',
    'p_notes',
  ],
  record_acquisition_payment: [
    'p_method',
    'p_paid_to',
    'p_original_currency',
    'p_original_amount_minor',
    'p_exchange_rate',
    'p_next_due_on',
  ],
  onboard_vehicle: ['p_plate', 'p_current_driver_id', 'p_route_id', 'p_entered_service_on'],
} as const satisfies Partial<Record<keyof PublicSchema['Functions'], readonly string[]>>

type NullableArgKeysFor<T> = T extends keyof typeof NULLABLE_RPC_ARGS
  ? (typeof NULLABLE_RPC_ARGS)[T][number]
  : never

export type RpcArgs<T extends keyof PublicSchema['Functions']> = Omit<
  PublicSchema['Functions'][T]['Args'],
  NullableArgKeysFor<T>
> & {
  [K in NullableArgKeysFor<T> & keyof PublicSchema['Functions'][T]['Args']]:
    | PublicSchema['Functions'][T]['Args'][K]
    | null
}

/**
 * `supabase.rpc(name, args)` takes its args type straight from the generated
 * (always-non-nullable) Args, not from the corrected RpcArgs above — so the
 * cast back has to happen somewhere. Doing it here, once, documented, beats
 * an `as Database[...]` scattered into every data/*.ts call site.
 */
export function rpcArgs<T extends keyof PublicSchema['Functions']>(
  args: RpcArgs<T>,
): PublicSchema['Functions'][T]['Args'] {
  return args as PublicSchema['Functions'][T]['Args']
}

// --- Money -----------------------------------------------------------------

/**
 * An amount in minor units: SLE x 100, always an integer, never a float.
 * Branded so a raw number cannot be passed where an amount is expected, and a
 * major-unit figure cannot be mistaken for a minor-unit one.
 */
export type MinorUnits = number & { readonly __brand: 'MinorUnits' }

// --- Business dates --------------------------------------------------------

/**
 * A date in Africa/Freetown, as `YYYY-MM-DD`.
 *
 * Business dates are computed on the server. There is deliberately no helper
 * here that turns `new Date()` into one of these: the Owner's laptop in the
 * United States and the Fleet Manager's machine in China can be on a different
 * calendar day from Freetown at the same moment. Omit the column and let the
 * database default fill it, or read today's date back from the server.
 */
export type FreetownDate = string & { readonly __brand: 'FreetownDate' }
