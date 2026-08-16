interface DesktopHomeProps {
  onOpenVehicles: () => void
  onOpenDrivers: () => void
  onOpenRecords: () => void
  onOpenMaintenance: () => void
  onOpenAccounting: () => void
  onOpenFuturePurchases: () => void
  onOpenExport: () => void
  onOpenSettings: () => void
}

/**
 * SPEC section 4's full Home card list, now all built: Vehicles, Drivers,
 * Records, Maintenance, Accounting, Future Purchases, Export report,
 * Settings. (Payment targets and Approvals are folded into the vehicle
 * profile and Accounting respectively — see decision 0013 — rather than
 * getting their own top-level cards.)
 */
export function DesktopHome({
  onOpenVehicles,
  onOpenDrivers,
  onOpenRecords,
  onOpenMaintenance,
  onOpenAccounting,
  onOpenFuturePurchases,
  onOpenExport,
  onOpenSettings,
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

        <button
          type="button"
          onClick={onOpenExport}
          className="rounded-xl border border-slate-300 bg-white px-6 py-6 text-left shadow-sm active:bg-slate-50"
        >
          <span className="block text-lg font-semibold text-slate-900">Export report</span>
          <span className="mt-1 block text-sm text-slate-500">Download ledger transactions as a CSV</span>
        </button>

        <button
          type="button"
          onClick={onOpenSettings}
          className="rounded-xl border border-slate-300 bg-white px-6 py-6 text-left shadow-sm active:bg-slate-50"
        >
          <span className="block text-lg font-semibold text-slate-900">Settings</span>
          <span className="mt-1 block text-sm text-slate-500">People, roles, PINs, and permissions</span>
        </button>
      </div>
    </div>
  )
}
