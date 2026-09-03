import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const here = path.dirname(fileURLToPath(import.meta.url))
const shared = path.resolve(here, '../shared/src')

// base: './' is required so the built files work inside a Capacitor WebView,
// where the app loads from the filesystem rather than a server root.
export default defineConfig({
  plugins: [react()],
  base: './',
  resolve: {
    alias: [{ find: /^@shared\/(.*)\.js$/, replacement: `${shared}/$1.ts` }],
  },
  server: {
    port: 5173,
    host: true,
    fs: { allow: [here, shared] },
    proxy: { '/api': { target: 'http://localhost:4000', changeOrigin: true } },
  },
  build: { outDir: 'dist', sourcemap: true },
})
