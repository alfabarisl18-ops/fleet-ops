import { supabase } from '@/lib/supabase'
import type { LedgerDirection } from '@/data/activityRecords'
import type { LedgerCategory } from '@/data/dailyPayments'
import { formatMinorUnits } from '@/lib/money'

// Screens never call Supabase directly — same convention as src/data/accounting.ts,
// which this reuses the shape of. Kept as its own file rather than added to
// accounting.ts because it's a distinct concern (an unlimited, date-ranged
// dump for download) from that file's capped, summarized reads for screens.

export interface ExportTransactionRow {
  appliesToDate: string
  direction: LedgerDirection
  category: LedgerCategory
  amountMinor: number
  vehicleFleetId: string | null
  reconciled: boolean
  note: string | null
}

/** Every ledger entry in range, not superseded — no cap, unlike
 *  fetchRecentTransactions (which exists for a screen, not a download).
 *  Available to both desktop roles; ledger_select_desktop already grants
 *  full read access to both. */
export async function fetchTransactionsForExport(fromDate: string, toDate: string): Promise<ExportTransactionRow[]> {
  const { data, error } = await supabase
    .from('ledger_entries')
    .select('applies_to_date, direction, category, amount_minor, reconciled_at, note, vehicles(fleet_id)')
    .gte('applies_to_date', fromDate)
    .lte('applies_to_date', toDate)
    .is('superseded_by_id', null)
    .order('applies_to_date', { ascending: true })

  if (error) throw error
  return (data ?? []).map((row) => ({
    appliesToDate: row.applies_to_date,
    direction: row.direction,
    category: row.category,
    amountMinor: row.amount_minor,
    vehicleFleetId: (row.vehicles as unknown as { fleet_id: string } | null)?.fleet_id ?? null,
    reconciled: row.reconciled_at !== null,
    note: row.note,
  }))
}

const CSV_HEADER = ['Date', 'Direction', 'Category', 'Amount', 'Amount (SLE)', 'Vehicle', 'Reconciled', 'Note']

/** Quotes a field only when it needs it (contains a comma, quote, or
 *  newline) — RFC 4180. Doubling an embedded quote is the escape. */
function csvField(value: string): string {
  if (/[",\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}

/**
 * Pure — no Supabase, no DOM — so it's directly testable. Amount is given
 * both as a raw signed minor-units integer (for a bookkeeper's own
 * spreadsheet formulas) and as the same formatted string every screen in
 * this app already shows, so the two never have to be reconciled by eye.
 */
export function buildTransactionsCsv(rows: ExportTransactionRow[]): string {
  const lines = [CSV_HEADER.map(csvField).join(',')]
  for (const row of rows) {
    const signedMinor = row.direction === 'EXPENSE' ? -row.amountMinor : row.amountMinor
    lines.push(
      [
        row.appliesToDate,
        row.direction === 'EXPENSE' ? 'Expense' : 'Income',
        row.category.replaceAll('_', ' '),
        String(signedMinor),
        formatMinorUnits(signedMinor),
        row.vehicleFleetId ?? '',
        row.reconciled ? 'Yes' : 'No',
        row.note ?? '',
      ]
        .map((v) => csvField(String(v)))
        .join(','),
    )
  }
  // CRLF — the RFC 4180 line ending, so the file opens cleanly in Excel on
  // Windows as well as everywhere else.
  return lines.join('\r\n')
}

/** Triggers a same-page download — standard Blob + object URL + a
 *  programmatic <a download> click, no library. Revokes the object URL
 *  immediately after; the click has already captured the data by then. */
export function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}
