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

  it('never grants anything to anon except the one documented exception', () => {
    // public.mobile_role_roster is the sole deliberate exception — a PIN
    // alone can't say whose PIN it is, so the sign-in picker needs a
    // signed-out-callable name list. It's a function, not a table grant, and
    // it structurally cannot return a desktop role. See
    // docs/decisions/0007-pin-sign-in-becomes-a-real-session.md and the
    // permission-matrix note in docs/schema.md. Any *other* anon grant is
    // still a bug this test should catch.
    const ALLOWED_ANON_GRANTS = [
      'grant execute on function public.mobile_role_roster(public.user_role) to anon, authenticated;',
    ]

    for (const file of migrationFiles()) {
      const sql = readMigration(file)
      const grants = [...sql.matchAll(/^\s*grant [^;]*;/gim)].map((m) => m[0].trim())
      for (const grant of grants) {
        if (!/\banon\b/.test(grant)) continue
        expect(
          ALLOWED_ANON_GRANTS.includes(grant),
          `${file}: unexpected grant to anon — ${grant}`,
        ).toBe(true)
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

describe('auth', () => {
  // Regression test for a real bug: app.is_owner()/is_desktop()/etc. return
  // NULL, not false, for any caller app.current_app_role() can't resolve —
  // which is not just "not signed in" but, since the PIN migration, an idle
  // mobile session too. `NOT NULL` is NULL, and PL/pgSQL's
  // `IF <null> THEN ... END IF;` silently skips the branch — so a naive
  // `if not app.is_owner() then raise exception ... end if;` guard clause
  // does not raise for an unresolved caller; it falls through as though the
  // check had passed. Found by testing public.admin_reset_pin, and the same
  // shape already existed in public.driver_identity_images since Phase 1 —
  // confirmed live against the hosted project to leak a real driver's ID and
  // licence document keys to an unrecognized caller, before
  // 20260810010924_fix_null_unsafe_role_negation.sql closed it. See
  // docs/decisions/0007-pin-sign-in-becomes-a-real-session.md.
  it('never negates a role-check function without coalescing it to false first', () => {
    // Checks each function's *current* body, not every line ever written.
    // `CREATE OR REPLACE FUNCTION` means a later migration's definition is
    // what the database actually runs — migration discipline never edits an
    // applied file in place, so the original, now-superseded
    // driver_identity_images() in 20260808233153 still reads "if not
    // app.is_desktop() then" verbatim in the history, on purpose. Only the
    // last definition of each function is what needs to be correct.
    const latestBodyByFunction = new Map<string, string>()
    const fnRe = /create or replace function ([\w.]+\([^)]*\))[\s\S]*?\n\$\$;/gi

    for (const file of migrationFiles()) {
      const sql = readMigration(file)
      for (const match of sql.matchAll(fnRe)) {
        const signature = match[1]
        if (!signature) continue
        latestBodyByFunction.set(signature.toLowerCase(), match[0])
      }
    }

    expect(latestBodyByFunction.size).toBeGreaterThan(0)

    // Matches both the buggy form (`if not app.is_desktop()`) and the fixed
    // form (`if not coalesce(app.is_desktop(), false)`) — anything between
    // "not" and the function call — so the test still finds something to
    // check once every occurrence is fixed, rather than the assertion below
    // going vacuous.
    const guardRe = /\bif\s+not\s+.*?app\.(is_owner|is_desktop|is_collections|is_maintenance|is_signed_in|has_role)\(/

    let checked = 0
    for (const [name, body] of latestBodyByFunction) {
      for (const line of body.split('\n')) {
        if (!guardRe.test(line)) continue
        checked += 1
        expect(
          line.includes('coalesce('),
          `${name}: negates a nullable role check without coalescing to false — ${line.trim()}`,
        ).toBe(true)
      }
    }
    expect(checked).toBeGreaterThan(0)
  })

  it('restricts verify_pin to service_role only — the plaintext PIN never reaches a broader grant', () => {
    const sql = migrationFiles().map(readMigration).join('\n')
    expect(sql).toContain(
      'revoke all on function public.verify_pin(uuid, text) from public, anon, authenticated;',
    )
    expect(sql).toContain('grant execute on function public.verify_pin(uuid, text) to service_role;')
  })

  it('keeps mobile_role_roster structurally incapable of returning a desktop role', () => {
    const sql = migrationFiles().map(readMigration).join('\n')
    const fn = /create or replace function public\.mobile_role_roster[\s\S]*?\$\$;/.exec(sql)?.[0]
    expect(fn, 'mobile_role_roster function body not found').toBeTruthy()
    expect(fn).toContain("p_role in ('COLLECTIONS_FINANCE', 'MAINTENANCE_REPAIRS')")
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
    expect(GENERATED_COLUMNS.trips).toContain('duration_days')
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

  it('excludes trips.duration_days from the insert type', () => {
    type Trip = Insertable<'trips'>

    // @ts-expect-error duration_days is GENERATED ALWAYS from departed_on/returned_on
    const _a: Trip = { duration_days: 3 } as Trip

    // But it is readable on the row, because the database computes it.
    const row = {} as Tables<'trips'>
    const duration: number | null = row.duration_days

    expect([_a, duration]).toBeDefined()
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
