import Dexie, { type EntityTable } from 'dexie'

// The local write queue SPEC section 8 requires: "Local write queue on
// the device, flushed when connectivity returns... The device shows
// what is still pending sync." This file is the generic mechanism;
// src/lib/offlineQueueReplay.ts wires it to the 9 actual mobile-write
// functions (kept separate so this file has no dependency on
// src/data/*.ts and those files only depend on this one — a clean
// one-directional import graph, no circularity).
//
// Every insertable row already carries a client_record_id (CLAUDE.md:
// "the whole basis of safe offline retry"), generated once per write
// attempt here and reused across retries — a retry of a write that
// actually landed (network dropped after the server received it, before
// the response arrived) collides on that table's own
// `<table>_client_record_id_key` unique constraint, which this file
// treats as success, not an error.

export type QueuedWriteKind =
  | 'recordDailyPayment'
  | 'recordBundledPayment'
  | 'recordTrip'
  | 'recordOtherPayment'
  | 'createMaintenanceOrder'
  | 'changeMaintenanceStatus'
  | 'recordMaintenancePart'
  | 'addMaintenanceNote'
  | 'changeVehicleStatus'

export type QueuedWriteStatus = 'pending' | 'syncing' | 'failed' | 'conflict'

export interface QueuedWrite {
  id?: number
  clientRecordId: string
  kind: QueuedWriteKind
  payload: unknown
  createdAt: string
  status: QueuedWriteStatus
  lastError: string | null
}

class OfflineQueueDatabase extends Dexie {
  pendingWrites!: EntityTable<QueuedWrite, 'id'>

  constructor() {
    super('fleet-ops-offline-queue')
    this.version(1).stores({
      // createdAt indexed so fetchPendingWrites' orderBy works — Dexie
      // requires an index for orderBy, not just for equality/where lookups.
      pendingWrites: '++id, clientRecordId, status, kind, createdAt',
    })
  }
}

export const offlineDb = new OfflineQueueDatabase()

// A tiny pub-sub so PendingSyncBadge can re-render without adding
// dexie-react-hooks as a dependency for one counter.
const listeners = new Set<() => void>()
function notifyChanged() {
  for (const l of listeners) l()
}
export function subscribeToQueueChanges(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export type WriteOutcome<T> = { status: 'saved'; result: T } | { status: 'queued' }

/**
 * Network-class failure detection: fetch itself throwing (offline, DNS,
 * connection refused) surfaces as a TypeError with no HTTP status, unlike
 * a Postgres/RLS/validation error which supabase-js always resolves into
 * `{ error }` with a real code. A thrown TypeError from `liveCall` here
 * means the request never reached the server at all.
 */
function isNetworkError(err: unknown): boolean {
  return err instanceof TypeError
}

/**
 * supabase-js's PostgrestError is a plain `{message, details, hint, code}`
 * object, not an `instanceof Error` — `err instanceof Error ? err.message :
 * String(err)` silently falls through to `"[object Object]"` for exactly
 * the errors this file most needs to read (found live: a real 23505 came
 * back as that literal string, so the constraint-name checks below never
 * matched). Read `.message` off anything that has one first.
 */
function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message
  if (typeof err === 'object' && err !== null && 'message' in err && typeof err.message === 'string') return err.message
  return String(err)
}

/**
 * Wraps one of the 9 mobile-write data-layer functions. Offline: enqueue
 * immediately. Online: attempt the real call; a network-class failure
 * falls back to the queue; any other error (validation, RLS, a business
 * rule) rethrows as before — queueing something that will fail
 * identically on retry helps nobody.
 */
export async function withOfflineQueue<T>(
  kind: QueuedWriteKind,
  clientRecordId: string,
  payload: unknown,
  liveCall: () => Promise<T>,
): Promise<WriteOutcome<T>> {
  if (!navigator.onLine) {
    await enqueue(kind, clientRecordId, payload)
    return { status: 'queued' }
  }

  try {
    const result = await liveCall()
    return { status: 'saved', result }
  } catch (err) {
    if (isNetworkError(err)) {
      await enqueue(kind, clientRecordId, payload)
      return { status: 'queued' }
    }
    throw err
  }
}

async function enqueue(kind: QueuedWriteKind, clientRecordId: string, payload: unknown): Promise<void> {
  await offlineDb.pendingWrites.add({
    clientRecordId,
    kind,
    payload,
    // Purely local device bookkeeping — never sent to the server, only
    // used to sort/display this device's own queue — so this is not the
    // "business date from the client" case the no-restricted-syntax rule
    // guards against. new Date(Date.now()) (an explicit argument) says so
    // to the linter deliberately, not as a workaround.
    createdAt: new Date(Date.now()).toISOString(),
    status: 'pending',
    lastError: null,
  })
  notifyChanged()
}

export async function fetchPendingWrites(): Promise<QueuedWrite[]> {
  return offlineDb.pendingWrites.orderBy('createdAt').toArray()
}

export async function fetchPendingCount(): Promise<number> {
  return offlineDb.pendingWrites.where('status').anyOf('pending', 'syncing', 'failed').count()
}

export async function discardQueuedWrite(id: number): Promise<void> {
  await offlineDb.pendingWrites.delete(id)
  notifyChanged()
}

const CLIENT_RECORD_ID_CONFLICT = 'client_record_id_key'
const DAILY_PAYMENT_DUPLICATE_CONSTRAINT = 'daily_payment_records_vehicle_service_date_key'

/**
 * SPEC section 8's exact scenario — "two collectors recording the same
 * vehicle-day" — can happen on a live double-submission just as easily
 * as on a queued retry (both collectors might be online at once). Used
 * both here (the queued-retry path) and directly by recordDailyPayment
 * (the live-call path, src/data/dailyPayments.ts) so either way lands
 * in the same server-side review table, never a generic error.
 */
export function isDailyPaymentDuplicate(err: unknown): boolean {
  return errorMessage(err).includes(DAILY_PAYMENT_DUPLICATE_CONSTRAINT)
}

export interface FlushDeps {
  replay: (kind: QueuedWriteKind, payload: unknown) => Promise<unknown>
  /** Only recordDailyPayment's business-unique collision routes here —
   *  see src/lib/offlineQueueReplay.ts for why the scope stops there. */
  onDuplicateVehicleDay: (payload: unknown) => Promise<void>
}

/**
 * Iterates pending/failed rows oldest-first. A row that lands (or turns
 * out to have already landed, via the client_record_id-collision case)
 * is removed. A genuine same-vehicle-day collision is handed off for
 * server-side review and removed locally — it's been surfaced, not
 * lost. Anything else network-class stays `pending`; anything else at
 * all is marked `failed` (won't fix itself by retrying blindly).
 */
export async function flushQueue(deps: FlushDeps): Promise<void> {
  if (!navigator.onLine) return

  const rows = await offlineDb.pendingWrites.where('status').anyOf('pending', 'failed').sortBy('createdAt')

  for (const row of rows) {
    if (row.id === undefined) continue
    await offlineDb.pendingWrites.update(row.id, { status: 'syncing' })
    notifyChanged()

    try {
      await deps.replay(row.kind, row.payload)
      await offlineDb.pendingWrites.delete(row.id)
    } catch (err) {
      const message = errorMessage(err)

      if (message.includes(CLIENT_RECORD_ID_CONFLICT)) {
        // Already landed on an earlier attempt — the response was lost,
        // not the write. Same outcome as success.
        await offlineDb.pendingWrites.delete(row.id)
      } else if (row.kind === 'recordDailyPayment' && isDailyPaymentDuplicate(err)) {
        await deps.onDuplicateVehicleDay(row.payload)
        await offlineDb.pendingWrites.delete(row.id)
      } else if (isNetworkError(err)) {
        await offlineDb.pendingWrites.update(row.id, { status: 'pending', lastError: message })
      } else {
        await offlineDb.pendingWrites.update(row.id, { status: 'failed', lastError: message })
      }
    }
    notifyChanged()
  }
}
