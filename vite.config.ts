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
      injectRegister: 'auto', // 追加
      strategies: 'injectManifest', // 追加
      injectManifest: {
        injectionPoint: undefined,
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
        cleanupOutdatedCaches: true,
        skipWaiting: true, // 追加
        clientsClaim: true // 追加
      },
      includeAssets: ['favicon.ico', 'icons/icon-192x192.png', 'icons/icon-512x512.png'],
      manifest: {
        name: '勤務管理アプリ',
        short_name: '勤務管理',
        description: '勤務管理アプリケーション',
        start_url: '/',
        display: 'standalone',
        background_color: '#ffffff',
        theme_color: '#4A90E2',
        icons: [
          {
            src: '/icons/icon-192x192.png', // 先頭に / を追加
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any maskable'
          },
          {
            src: '/icons/icon-512x512.png', // 先頭に / を追加
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable'
          }
        ]
      }
    })
  ]
})