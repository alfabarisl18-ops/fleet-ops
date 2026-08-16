interface DesktopHomeProps {
  onOpenVehicles: () => void
  onOpenDrivers: () => void
  onOpenRecords: () => void
  onOpenMaintenance: () => void
  onOpenAccounting: () => void
  onOpenFuturePurchases: () => void
}

/**
 * SPEC section 4 lists a much larger Home than this — Payment targets,
 * Export report, Settings alongside Vehicles, Drivers, Records,
 * Maintenance, Accounting, and (as of Phase 10) Future Purchases. The
 * rest don't exist yet, and SPEC's own rule is "every card that looks
 * actionable must work" — so Home shows exactly the entry points that
 * do something real, not placeholders for the rest. See docs/log.md.
 * (Payment targets and Approvals are folded into the vehicle profile
 * and Accounting respectively — see decision 0013 — rather than getting
 * their own top-level cards yet.)
 */
export function DesktopHome({
  onOpenVehicles,
  onOpenDrivers,
  onOpenRecords,
  onOpenMaintenance,
  onOpenAccounting,
  onOpenFuturePurchases,
}: DesktopHomeProps) {
  return (
    <div className="mx-auto max-w-3xl p-4 sm:p-6">
      <h1 className="mb-6 text-xl font-semibold text-slate-900">Home</h1>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <button
          type="button"
          onClick={onOpenVehicles}
          className="rounded-xl border border-slate-300 bg-white px-6 py-6 text-left shadow-sm active:bg-slate-50"
        >
          <span className="block text-lg font-semibold text-slate-900">Vehicles</span>
          <span className="mt-1 block text-sm text-slate-500">Fleet list, status, and profiles</span>
        </button>

        <button
          type="button"
          onClick={onOpenDrivers}
          className="rounded-xl border border-slate-300 bg-white px-6 py-6 text-left shadow-sm active:bg-slate-50"
        >
          <span className="block text-lg font-semibold text-slate-900">Drivers</span>
          <span className="mt-1 block text-sm text-slate-500">Everyone who has driven for the business</span>
        </button>

        <button
          type="button"
          onClick={onOpenRecords}
          className="rounded-xl border border-slate-300 bg-white px-6 py-6 text-left shadow-sm active:bg-slate-50"
        >
          <span className="block text-lg font-semibold text-slate-900">Records</span>
          <span className="mt-1 block text-sm text-slate-500">Every vehicle, driver, and correction event</span>
        </button>

        <button
          type="button"
          onClick={onOpenMaintenance}
          className="rounded-xl border border-slate-300 bg-white px-6 py-6 text-left shadow-sm active:bg-slate-50"
        >
          <span className="block text-lg font-semibold text-slate-900">Maintenance</span>
          <span className="mt-1 block text-sm text-slate-500">Problems, repairs, parts, and vehicle status</span>
        </button>

        <button
          type="button"
          onClick={onOpenAccounting}
          className="rounded-xl border border-slate-300 bg-white px-6 py-6 text-left shadow-sm active:bg-slate-50"
        >
          <span className="block text-lg font-semibold text-slate-900">Accounting</span>
          <span className="mt-1 block text-sm text-slate-500">Income, expenses, and the ledger</span>
        </button>

        <button
          type="button"
          onClick={onOpenFuturePurchases}
          className="rounded-xl border border-slate-300 bg-white px-6 py-6 text-left shadow-sm active:bg-slate-50"
        >
          <span className="block text-lg font-semibold text-slate-900">Future Purchases</span>
          <span className="mt-1 block text-sm text-slate-500">Savings goals, purchases, transit, and onboarding</span>
        </button>
      </div>
    </div>
  )
}
