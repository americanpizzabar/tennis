import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  // Vercel/Netlify などのホスティングではドメイン直下に置くので絶対パスがベスト。
  // file:// で開きたい場合は './' に切り替える。
  base: '/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'Tennis AI Coach',
        short_name: 'Tennis Coach',
        description: 'スコア・スタッツ・戦術アドバイスを 1 アプリで',
        theme_color: '#0D1F0D',
        background_color: '#0A1A0A',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        scope: '/',
        icons: [
          {
            src: 'favicon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any maskable',
          },
        ],
      },
      workbox: {
        cleanupOutdatedCaches: true,
        clientsClaim: true,
      },
    }),
  ],
})
