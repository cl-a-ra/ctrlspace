import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const apiOrigin = process.env.CTRLSPACE_API_ORIGIN ?? 'http://127.0.0.1:3001'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': apiOrigin,
    },
  },
  preview: {
    proxy: {
      '/api': apiOrigin,
    },
  },
})
