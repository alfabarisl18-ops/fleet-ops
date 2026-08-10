import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Mid-range Android over a metered connection is the target device. Every
// setting here exists to keep the first load small: the users pay for this
// traffic out of their own pocket.
export default defineConfig({
  plugins: [react(), tailwindcss()],
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
