import { flushQueue, type QueuedWriteKind } from '@/lib/offlineQueue'
import { flagDuplicatePayment } from '@/data/accounting'
import { replayRecordBundledPayment, replayRecordDailyPayment, replayRecordOtherPayment } from '@/data/dailyPayments'
import { replayAddMaintenanceNote, replayChangeMaintenanceStatus, replayCreateMaintenanceOrder, replayRecordMaintenancePart } from '@/data/maintenance'
import { replayRecordTrip } from '@/data/accounting'
import { replayChangeVehicleStatus } from '@/data/vehicles'

// The one file that knows about all 9 mobile-write functions AND the
// generic queue mechanism — kept separate from offlineQueue.ts so that
// file has no dependency on src/data/*.ts (which itself depends on
// offlineQueue.ts for withOfflineQueue/WriteOutcome). A registry here
// avoids a circular import.

const REPLAY_HANDLERS: Record<QueuedWriteKind, (payload: unknown) => Promise<unknown>> = {
  recordDailyPayment: replayRecordDailyPayment,
  recordBundledPayment: replayRecordBundledPayment,
  recordTrip: replayRecordTrip,
  recordOtherPayment: replayRecordOtherPayment,
  createMaintenanceOrder: replayCreateMaintenanceOrder,
  changeMaintenanceStatus: replayChangeMaintenanceStatus,
  recordMaintenancePart: replayRecordMaintenancePart,
  addMaintenanceNote: replayAddMaintenanceNote,
  changeVehicleStatus: replayChangeVehicleStatus,
}

/** Same-vehicle-day collision (SPEC section 8) — scoped to
 *  recordDailyPayment only (see offlineQueue.ts's flushQueue doc
 *  comment for why recordBundledPayment isn't covered here). Pulls
 *  vehicleId/serviceDate straight off the queued payload — both
 *  functions' payloads already carry them under those exact names. */
async function onDuplicateVehicleDay(payload: unknown): Promise<void> {
  const p = payload as { vehicleId: string; serviceDate: string }
  await flagDuplicatePayment(p.vehicleId, p.serviceDate, payload)
}

export async function flushOfflineQueue(): Promise<void> {
  await flushQueue({ replay: (kind, payload) => REPLAY_HANDLERS[kind](payload), onDuplicateVehicleDay })
}

let autoFlushInitialized = false

/** Call once (App.tsx) — flushes on the `online` event and once at
 *  startup, in case the device was signed in already offline. No
 *  background poll loop; the pending-sync panel also offers a manual
 *  "Retry now". */
export function initOfflineQueueAutoFlush(): void {
  if (autoFlushInitialized) return
  autoFlushInitialized = true

  window.addEventListener('online', () => {
    flushOfflineQueue().catch(() => {
      /* A flush failure here just means the queue stays as it is; the
       * pending-sync panel surfaces it, nothing to do at the window level. */
    })
  })

  flushOfflineQueue().catch(() => {
    /* Same as above — startup flush is best-effort. */
  })
}
