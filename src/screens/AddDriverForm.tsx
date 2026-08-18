import { useState } from 'react'
import { IconChip } from '@/components/IconChip'
import type { CreateDriverInput } from '@/data/drivers'
import { assignDriverToVehicle, createDriver } from '@/data/drivers'

interface AddDriverFormProps {
  /** Set when reached from a vehicle profile's "Assign driver" action — SPEC
   *  section 4: "A driver can be added from here or from the Vehicles
   *  workspace, and assigned to a vehicle at either point." */
  assignToVehicleId?: string
  onCreated: (driverId: string) => void
  onCancel: () => void
}

/** Identity fields per SPEC section 4, minus photo/ID-image upload (Storage
 *  integration, out of scope this phase — see docs/log.md). */
export function AddDriverForm({ assignToVehicleId, onCreated, onCancel }: AddDriverFormProps) {
  const [fullName, setFullName] = useState('')
  const [knownAs, setKnownAs] = useState('')
  const [phone, setPhone] = useState('')
  const [phoneAlt, setPhoneAlt] = useState('')
  const [address, setAddress] = useState('')
  const [nextOfKinName, setNextOfKinName] = useState('')
  const [nextOfKinPhone, setNextOfKinPhone] = useState('')
  const [idDocumentType, setIdDocumentType] = useState('')
  const [idDocumentNumber, setIdDocumentNumber] = useState('')
  const [licenceNumber, setLicenceNumber] = useState('')
  const [licenceExpiry, setLicenceExpiry] = useState('')
  const [startedOn, setStartedOn] = useState('')
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (fullName.trim() === '') {
      setError('Full name is required.')
      return
    }

    setSubmitting(true)
    try {
      const input: CreateDriverInput = { fullName: fullName.trim() }
      if (knownAs.trim() !== '') input.knownAs = knownAs.trim()
      if (phone.trim() !== '') input.phone = phone.trim()
      if (phoneAlt.trim() !== '') input.phoneAlt = phoneAlt.trim()
      if (address.trim() !== '') input.address = address.trim()
      if (nextOfKinName.trim() !== '') input.nextOfKinName = nextOfKinName.trim()
      if (nextOfKinPhone.trim() !== '') input.nextOfKinPhone = nextOfKinPhone.trim()
      if (idDocumentType.trim() !== '') input.idDocumentType = idDocumentType.trim()
      if (idDocumentNumber.trim() !== '') input.idDocumentNumber = idDocumentNumber.trim()
      if (licenceNumber.trim() !== '') input.licenceNumber = licenceNumber.trim()
      if (licenceExpiry !== '') input.licenceExpiry = licenceExpiry
      if (startedOn !== '') input.startedOn = startedOn
      if (notes.trim() !== '') input.notes = notes.trim()

      const driverId = await createDriver(input)
      if (assignToVehicleId) {
        await assignDriverToVehicle(driverId, assignToVehicleId, null)
      }
      onCreated(driverId)
    } catch {
      setError('Something went wrong. Try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="mx-auto max-w-xl p-4 sm:p-6">
      <button type="button" onClick={onCancel} className="mb-4 text-sm text-slate-500">
        ← Back
      </button>

      <div className="mb-1 flex items-center gap-3">
        <IconChip section="drivers" />
        <h1 className="font-heading text-xl font-bold text-slate-900">Add Driver</h1>
      </div>
      {assignToVehicleId && <p className="mb-4 text-sm text-slate-500">Will be assigned to this vehicle once added.</p>}

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium text-slate-700">Full name</span>
          <input
            type="text"
            required
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            className="rounded-xl border border-slate-300 px-4 py-3 text-base"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium text-slate-700">Name commonly used (optional)</span>
          <input
            type="text"
            value={knownAs}
            onChange={(e) => setKnownAs(e.target.value)}
            className="rounded-xl border border-slate-300 px-4 py-3 text-base"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium text-slate-700">Phone (optional)</span>
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="rounded-xl border border-slate-300 px-4 py-3 text-base"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium text-slate-700">Alternate phone (optional)</span>
          <input
            type="tel"
            value={phoneAlt}
            onChange={(e) => setPhoneAlt(e.target.value)}
            className="rounded-xl border border-slate-300 px-4 py-3 text-base"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium text-slate-700">Address (optional)</span>
          <textarea
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            rows={2}
            className="rounded-xl border border-slate-300 px-4 py-3 text-base"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium text-slate-700">Next of kin name (optional)</span>
          <input
            type="text"
            value={nextOfKinName}
            onChange={(e) => setNextOfKinName(e.target.value)}
            className="rounded-xl border border-slate-300 px-4 py-3 text-base"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium text-slate-700">Next of kin phone (optional)</span>
          <input
            type="tel"
            value={nextOfKinPhone}
            onChange={(e) => setNextOfKinPhone(e.target.value)}
            className="rounded-xl border border-slate-300 px-4 py-3 text-base"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium text-slate-700">ID document type (optional)</span>
          <input
            type="text"
            value={idDocumentType}
            onChange={(e) => setIdDocumentType(e.target.value)}
            placeholder="e.g. National ID, Voter ID"
            className="rounded-xl border border-slate-300 px-4 py-3 text-base"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium text-slate-700">ID document number (optional)</span>
          <input
            type="text"
            value={idDocumentNumber}
            onChange={(e) => setIdDocumentNumber(e.target.value)}
            className="rounded-xl border border-slate-300 px-4 py-3 text-base"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium text-slate-700">Licence number (optional)</span>
          <input
            type="text"
            value={licenceNumber}
            onChange={(e) => setLicenceNumber(e.target.value)}
            className="rounded-xl border border-slate-300 px-4 py-3 text-base"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium text-slate-700">Licence expiry (optional)</span>
          <input
            type="date"
            value={licenceExpiry}
            onChange={(e) => setLicenceExpiry(e.target.value)}
            className="rounded-xl border border-slate-300 px-4 py-3 text-base"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium text-slate-700">Date started (optional)</span>
          <input
            type="date"
            value={startedOn}
            onChange={(e) => setStartedOn(e.target.value)}
            className="rounded-xl border border-slate-300 px-4 py-3 text-base"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium text-slate-700">Notes (optional)</span>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            className="rounded-xl border border-slate-300 px-4 py-3 text-base"
          />
        </label>

        {error && (
          <p role="alert" className="text-sm text-red-600">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="mt-2 rounded-xl bg-primary-600 px-6 py-3 text-base font-medium text-white disabled:opacity-50"
        >
          {submitting ? 'Adding…' : assignToVehicleId ? 'Add and assign driver' : 'Add driver'}
        </button>
      </form>
    </div>
  )
}
