import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Витрина компонентов: bun run ui (из корня) или bun run dev (из packages/ui)
export default defineConfig({
  root: 'playground',
  plugins: [react(), tailwindcss()],
  server: { port: 5180, host: '127.0.0.1' },
  build: { outDir: '../dist/playground', emptyOutDir: true },
})
