import { resolve } from 'node:path'
import { defineConfig } from 'electron-vite'
import release from './release.config.json'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const updateRepository = process.env.BINGTOOLS_UPDATE_REPOSITORY ?? release.repository
if (updateRepository && !/^[A-Za-z0-9][A-Za-z0-9-]*\/[A-Za-z0-9_.-]+$/.test(updateRepository)) throw new Error('Invalid update repository: expected owner/repo')

export default defineConfig({
  main: { define: { __UPDATE_REPOSITORY__: JSON.stringify(updateRepository) }, build: { externalizeDeps: false, rollupOptions: { external: ['electron-updater'] } } },
  preload: { build: { externalizeDeps: false } },
  renderer: {
    build: { minify: true },
    resolve: { alias: { '@': resolve('src/renderer/src') } },
    plugins: [react(), tailwindcss(), {
      name: 'renderer-csp',
      transformIndexHtml(_html, context) {
        const policy = context.server
          ? "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' ws://127.0.0.1:*; object-src 'none'; base-uri 'none'; frame-src 'none'"
          : "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'none'; object-src 'none'; base-uri 'none'; frame-src 'none'"
        return [{ tag: 'meta', attrs: { 'http-equiv': 'Content-Security-Policy', content: policy }, injectTo: 'head' as const }]
      },
    }],
    server: { host: '127.0.0.1' },
  },
})
