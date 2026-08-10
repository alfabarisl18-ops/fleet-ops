import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

// The publishable key is safe in the browser: every permission is enforced by
// row level security in Postgres, not by keeping this key secret. See
// README.md.
//
// This deliberately uses the legacy anon-key format (a real JWT), not the
// newer sb_publishable_... format. Testing this phase's PIN flow found that
// the newer key format breaks when supabase-js places it on the
// Authorization header for certain request types (see
// docs/decisions/0007-pin-sign-in-becomes-a-real-session.md and
// supabase/functions/_shared/mobile-auth.ts) — the legacy format has none of
// that risk for a client that will, moment to moment, be either signed out
// (using this key alone) or signed in (using a real user session JWT
// supabase-js manages automatically). Revisit if legacy keys are ever
// actually turned off.
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

if (!supabaseUrl || !supabasePublishableKey) {
  throw new Error(
    'Missing VITE_SUPABASE_URL or VITE_SUPABASE_PUBLISHABLE_KEY. Copy .env.example to .env.local and fill them in.',
  )
}

export const supabase = createClient<Database>(supabaseUrl, supabasePublishableKey)
