import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Renderer of the Tauri app: bun run dev (from the root) starts Vite and the Rust core together.
// KINO_DEV_PORT — another port, for E2E next to a running bun run dev (e2e/global-setup.ts)
const port = Number(process.env.KINO_DEV_PORT ?? 5181)

export default defineConfig({
  plugins: [react(), tailwindcss()],
  clearScreen: false,
  // The Rust core is rebuilt by tauri dev; Vite must not watch it (cargo locks target/*.exe)
  server: { port, strictPort: true, host: '127.0.0.1', watch: { ignored: ['**/src-tauri/**'] } },
  build: { target: 'es2023', outDir: 'dist', emptyOutDir: true },
})
