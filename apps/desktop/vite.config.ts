import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Renderer of the Tauri app: bun run dev (from the root) starts Vite and the Rust core together
export default defineConfig({
  plugins: [react(), tailwindcss()],
  clearScreen: false,
  // The Rust core is rebuilt by tauri dev; Vite must not watch it (cargo locks target/*.exe)
  server: { port: 5181, strictPort: true, host: '127.0.0.1', watch: { ignored: ['**/src-tauri/**'] } },
  build: { target: 'es2023', outDir: 'dist', emptyOutDir: true },
})
