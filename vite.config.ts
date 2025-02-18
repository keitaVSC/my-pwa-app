import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  base: '/',
  build: {
    assetsDir: 'assets',
    sourcemap: true,
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
        cleanupOutdatedCaches: true
      },
      includeAssets: ['favicon.ico'],
      manifest: {
        name: '勤務管理アプリ',
        short_name: '勤務管理',
        icons: [
          {
            src: './icons/icon-192x192.png',  // 相対パスに変更
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any maskable'
          },
          {
            src: './icons/icon-512x512.png',  // 相対パスに変更
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable'
          }
        ],
        start_url: '/',
        display: 'standalone',
        background_color: '#ffffff',
        theme_color: '#4A90E2'
      }
    })
  ]
})