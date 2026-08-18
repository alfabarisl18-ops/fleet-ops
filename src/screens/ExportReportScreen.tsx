import { useEffect, useState } from 'react'
import { IconChip } from '@/components/IconChip'
import { supabase } from '@/lib/supabase'
import { buildTransactionsCsv, downloadCsv, fetchTransactionsForExport } from '@/data/export'

interface ExportReportScreenProps {
  onBack: () => void
}

function monthStart(today: string): string {
  return `${today.slice(0, 7)}-01`
}

/** SPEC: "Export produces a downloadable report." Confirmed with the
 *  user: a CSV of ledger transactions over a date range, generated
 *  client-side — no PDF library, no server-side report generation. */
export function ExportReportScreen({ onBack }: ExportReportScreenProps) {
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [count, setCount] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [downloading, setDownloading] = useState(false)

  useEffect(() => {
    let cancelled = false
    supabase
      .rpc('freetown_today')
      .then(({ data, error: rpcError }) => {
        if (cancelled) return
        if (rpcError || !data) {
          setError('Could not load today’s date. Check your connection and try again.')
          return
        }
        setFrom(monthStart(data))
        setTo(data)
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (from === '' || to === '') return
    let cancelled = false
    fetchTransactionsForExport(from, to)
      .then((rows) => {
        if (!cancelled) setCount(rows.length)
      })
      .catch(() => {
        if (!cancelled) setError('Could not load transactions for this range.')
      })
    return () => {
      cancelled = true
    }
  }, [from, to])

  async function handleDownload() {
    setDownloading(true)
    setError(null)
    try {
      const rows = await fetchTransactionsForExport(from, to)
      const csv = buildTransactionsCsv(rows)
      downloadCsv(`fleet-ops-ledger-${from}-to-${to}.csv`, csv)
    } catch {
      setError('Could not build the export. Try again.')
    } finally {
      setDownloading(false)
    }
  }

  return (
    <div className="mx-auto max-w-xl p-4 sm:p-6">
      <button type="button" onClick={onBack} className="mb-4 text-sm text-slate-500">
        ← Back
      </button>

      <div className="mb-1 flex items-center gap-3">
        <IconChip section="export" />
        <h1 className="font-heading text-xl font-bold text-slate-900">Export report</h1>
      </div>
      <p className="mb-4 text-sm text-slate-500">Every income and expense entry in the range, as a CSV you can open in Excel or hand to a bookkeeper.</p>

      <div className="mb-4 grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium text-slate-700">From</span>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="rounded-xl border border-slate-300 px-4 py-3 text-base" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium text-slate-700">To</span>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="rounded-xl border border-slate-300 px-4 py-3 text-base" />
        </label>
      </div>

      <p className="mb-4 text-sm text-slate-500">{count !== null ? `${count} transaction${count === 1 ? '' : 's'} in range.` : 'Loading…'}</p>

      {error && (
        <p role="alert" className="mb-4 text-sm text-red-600">
          {error}
        </p>
      )}

      <button
        type="button"
        onClick={handleDownload}
        disabled={downloading || from === '' || to === ''}
        className="rounded-xl bg-primary-600 px-6 py-3 text-base font-medium text-white disabled:opacity-50"
      >
        {downloading ? 'Preparing…' : 'Download CSV'}
      </button>
    </div>
  )
}
