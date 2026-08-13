import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const mapRoot = fileURLToPath(new URL('.', import.meta.url))

export default defineConfig({
  root: mapRoot,
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5274,
    strictPort: true,
  },
  build: {
    outDir: fileURLToPath(new URL('../../dist-map', import.meta.url)),
    emptyOutDir: true,
  },
})
