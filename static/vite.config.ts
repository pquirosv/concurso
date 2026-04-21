import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [vue()],
  // Keep Vite cache out of node_modules to avoid Docker root-owned cache conflicts.
  cacheDir: '/tmp/concurso-vite-cache',
  build: {
    // Avoid copying static/public into dist; fotos are not used in production.
    copyPublicDir: false,
  },
  server: {
    proxy: {
      '/api': 'http://api:3000',
    },
  },
})
