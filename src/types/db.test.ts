import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import { GENERATED_COLUMNS, SERVER_STAMPED_COLUMNS } from './db'
import type { Insertable, Tables } from './db'

// Phase 1 has no screens, so these test the things that actually exist: the
// migration set and the type layer over it. They are deliberately checks on the
// data model rather than on rendered output — a snapshot of a screen would fail
// on every redesign and teach us to ignore failures.

const MIGRATIONS_DIR = join(process.cwd(), 'supabase', 'migrations')

function migrationFiles(): string[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort()
}

function readMigration(name: string): string {
  return readFileSync(join(MIGRATIONS_DIR, name), 'utf8')
}

describe('migrations', () => {
  it('are all present and uniquely timestamped', () => {
    const files = migrationFiles()
    expect(files.length).toBeGreaterThanOrEqual(13)

    const timestamps = files.map((f) => f.split('_')[0])
    expect(new Set(timestamps).size).toBe(timestamps.length)
    expect([...timestamps].sort()).toEqual(timestamps)
  })

  it('run the guards last, so a table added without a policy fails the build', () => {
    const files = migrationFiles()
    const guards = files.findIndex((f) => f.includes('guards'))
    expect(guards).toBeGreaterThan(-1)

    const tableCreating = files
      .map((f, i) => ({ i, creates: /create table public\./.test(readMigration(f)) }))
      .filter((x) => x.creates)
      .map((x) => x.i)

    for (const i of tableCreating) expect(i).toBeLessThan(guards)
  })

  it('enable row level security in the same file that creates the table', () => {
    for (const file of migrationFiles()) {
      const sql = readMigration(file)
      const created = [...sql.matchAll(/create table public\.(\w+)/g)].map((m) => m[1])
      for (const table of created) {
        expect(
          sql.includes(`alter table public.${table}\n  enable row level security`) ||
            new RegExp(`alter table public\\.${table}\\s+enable row level security`).test(sql),
          `${file}: public.${table} is created without enabling RLS in the same migration`,
        ).toBe(true)
      }
    }
  })

  it('never grant anything to anon', () => {
    for (const file of migrationFiles()) {
      const sql = readMigration(file)
      const grants = [...sql.matchAll(/^\s*grant [^;]*;/gim)].map((m) => m[0])
      for (const grant of grants) {
        expect(/\banon\b/.test(grant), `${file}: grants to anon — ${grant.trim()}`).toBe(false)
      }
    }
  })

  it('use bigint for every money column, never numeric or float', () => {
    // A column definition is `<name>_minor <type>`. Anything else mentioning a
    // money column — a check constraint body, a generated expression — has an
    // operator or a comma where the type would be, and is not a definition.
    const SQL_TYPES =
      /^(bigint|integer|int|int4|int8|smallint|numeric|decimal|real|double|float|money)$/

    let checked = 0
    for (const file of migrationFiles()) {
      for (const line of readMigration(file).split('\n')) {
        const match = /^\s+(\w*_minor)\s+(\w+)/.exec(line)
        if (!match) continue
        const type = match[2]?.toLowerCase() ?? ''
        if (!SQL_TYPES.test(type)) continue

        checked += 1
        expect(
          ['bigint', 'integer', 'int', 'int4', 'int8', 'smallint'].includes(type),
          `${file}: ${match[1]} is ${type}, which is not an integer type — ${line.trim()}`,
        ).toBe(true)
      }
    }
    expect(checked).toBeGreaterThan(20)
  })

  it('derive a business date from Freetown, never from the client', () => {
    const businessDateDefaults = migrationFiles()
      .flatMap((f) => readMigration(f).split('\n'))
      .filter((l) => /^\s+(service_date|applies_to_date|received_at|settled_on|paid_on|identified_on|started_on|covers_from_date)\s+date/.test(l))
      .filter((l) => l.includes('default'))

    expect(businessDateDefaults.length).toBeGreaterThan(0)
    for (const line of businessDateDefaults) {
      expect(line, 'a business date defaults to something other than Freetown today').toContain(
        'app.freetown_today()',
      )
    }
  })
})

describe('seed data', () => {
  const seed = readFileSync(join(process.cwd(), 'supabase', 'seed.sql'), 'utf8')

  // The file documents at length that it holds no credentials, so scanning the
  // prose would only ever match its own promise. Scan the SQL.
  const seedSql = seed
    .split('\n')
    .map((line) => line.replace(/--.*$/, ''))
    .join('\n')
    .toLowerCase()

  it('contains no credentials of any kind', () => {
    for (const forbidden of [
      'pin_hash',
      'password',
      'encrypted_password',
      'crypt(',
      'auth.users',
      'user_pin_credentials',
    ]) {
      expect(seedSql, `seed.sql references ${forbidden}`).not.toContain(forbidden)
    }
  })

  it('uses only the reserved example.com domain for emails', () => {
    for (const match of seed.matchAll(/[\w.+-]+@[\w.-]+/g)) {
      expect(match[0]).toMatch(/@example\.com$/)
    }
  })

  it('seeds 5 Sprinters and 1 box truck', () => {
    const sprinters = [...seed.matchAll(/'(LONG|SHORT)_SPRINTER'::public\.vehicle_type/g)]
    const trucks = [...seed.matchAll(/'BOX_TRUCK'::public\.vehicle_type/g)]
    expect(sprinters).toHaveLength(5)
    expect(trucks).toHaveLength(1)
  })

  it('seeds one user per role', () => {
    for (const role of [
      'OWNER_ADMIN',
      'FLEET_MANAGER',
      'COLLECTIONS_FINANCE',
      'MAINTENANCE_REPAIRS',
    ]) {
      expect([...seed.matchAll(new RegExp(`'${role}'`, 'g'))]).toHaveLength(1)
    }
  })
})

describe('Insertable', () => {
  it('lists the generated and server-stamped columns it removes', () => {
    expect(GENERATED_COLUMNS.daily_payment_records).toContain('shortfall_treatment')
    expect(GENERATED_COLUMNS.daily_payment_records).toContain('shortfall_amount_minor')
    expect(GENERATED_COLUMNS.bundled_payments).toContain('covers_to_date')
    expect(SERVER_STAMPED_COLUMNS.ledger_entries).toContain('entered_at')
    expect(SERVER_STAMPED_COLUMNS.vehicle_status_events).toContain('from_status')
  })

  // Compile-time assertions. These fail `npm run typecheck`, not at runtime —
  // which is the point: the mistake should never reach Postgres.
  it('excludes them from the insert type', () => {
    type DailyPayment = Insertable<'daily_payment_records'>

    // @ts-expect-error shortfall_treatment is GENERATED ALWAYS; Postgres rejects it
    const _a: DailyPayment = { shortfall_treatment: 'DRIVER_DEBT' } as DailyPayment
    // @ts-expect-error entered_at is overwritten by trigger
    const _b: DailyPayment = { entered_at: '2026-08-08T00:00:00Z' } as DailyPayment

    // But it is readable on the row, because the database computes it.
    const row = {} as Tables<'daily_payment_records'>
    const treatment: 'DRIVER_DEBT' | 'ACCEPTED_LOSS' | null = row.shortfall_treatment
    const shortfall: number | null = row.shortfall_amount_minor

    expect([_a, _b, treatment, shortfall]).toBeDefined()
  })

  it('requires client_record_id, so the offline queue cannot forget it', () => {
    const payment: Insertable<'daily_payment_records'> = {
      client_record_id: '00000000-0000-4000-8000-000000000000',
      vehicle_id: '00000000-0000-4000-8000-000000000001',
      entered_by: '00000000-0000-4000-8000-000000000002',
      day_outcome: 'FULL_DAY',
      expected_amount_minor: 90000,
      received_amount_minor: 90000,
    }
    expect(payment.client_record_id).toBeTruthy()

    // @ts-expect-error client_record_id is not optional
    const missing: Insertable<'daily_payment_records'> = {
      vehicle_id: '00000000-0000-4000-8000-000000000001',
      entered_by: '00000000-0000-4000-8000-000000000002',
      day_outcome: 'FULL_DAY',
      expected_amount_minor: 90000,
    }
    expect(missing).toBeDefined()
  })
})
