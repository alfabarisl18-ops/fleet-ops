import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// Mid-range Android over a metered connection is the target device. Every
// setting here exists to keep the first load small: the users pay for this
// traffic out of their own pocket.
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    // PWA shell (Phase 9): precaches the app itself so it *loads* with no
    // signal — deliberately does NOT cache Supabase API responses
    // (/rest/v1, /auth/v1, /functions/v1 stay NetworkOnly by omission from
    // runtimeCaching). Serving a cached balance or target while offline
    // would be a real-money correctness bug, not a convenience; the write
    // queue (src/lib/offlineQueue.ts) is the actual offline mechanism for
    // mutations, and reads simply show their existing "check your
    // connection" error when unreachable.
    VitePWA({
      registerType: 'autoUpdate',
      strategies: 'generateSW',
      includeAssets: ['icon.svg'],
      manifest: {
        name: 'Fleet Operations SL',
        short_name: 'Fleet Ops',
        description: 'Fleet Operations SL',
        theme_color: '#0f172a',
        background_color: '#0f172a',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
          { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Default globPatterns already covers the built JS/CSS/HTML/SVG —
        // no runtimeCaching entries added, so nothing outside the
        // precached shell is ever served from the service worker cache.
        navigateFallback: '/index.html',
      },
    }),
  ],
  resolve: {
    // Mirrors tsconfig.app.json's "paths" — TypeScript's mapping alone
    // doesn't make Vite's bundler resolve "@/...", these are two separate
    // mechanisms and both need to agree.
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  build: {
    // Warn loudly well before a chunk gets expensive to download.
    chunkSizeWarningLimit: 250,
    sourcemap: false,
  },
  server: {
    host: true,
    port: 5173,
  },
})
