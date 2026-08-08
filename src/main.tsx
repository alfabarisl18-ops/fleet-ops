import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'

// Phase 1 is the foundation: schema, migrations, seed data, types. There are no
// screens yet, and this file exists only so `npm run dev` and `npm run build`
// have something real to compile. Phase 2 (auth and permissions) replaces it.

const root = document.getElementById('root')
if (!root) throw new Error('Root element not found')

createRoot(root).render(
  <StrictMode>
    <main className="grid min-h-full place-items-center p-6 text-center">
      <p className="text-sm text-slate-600">
        Fleet Operations SL — foundation only. No screens yet.
      </p>
    </main>
  </StrictMode>,
)
