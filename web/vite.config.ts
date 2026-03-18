import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// The Vite configuration keeps the frontend simple and points API traffic at the Go backend in development.
export default defineConfig({
  plugins: [vue()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
  },
})
