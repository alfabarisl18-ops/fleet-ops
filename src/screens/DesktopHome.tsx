interface DesktopHomeProps {
  onOpenVehicles: () => void
  onOpenDrivers: () => void
}

/**
 * SPEC section 4 lists a much larger Home than this — Records, Maintenance,
 * Accounting, Future Purchases, Approvals, Payment targets, Export report,
 * Settings alongside Vehicles and Drivers. None of those exist yet, and
 * SPEC's own rule is "every card that looks actionable must work" — so this
 * phase's Home shows exactly the two entry points that do something real,
 * not placeholders for the rest. See docs/log.md's Phase 3 entry.
 */
export function DesktopHome({ onOpenVehicles, onOpenDrivers }: DesktopHomeProps) {
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
      </div>
    </div>
  )
}
