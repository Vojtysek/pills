/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      // Own service worker (src/sw.ts) so it can show push notifications.
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      includeAssets: ['favicon.svg', 'apple-touch-icon-180x180.png'],
      manifest: {
        name: 'Lékárnička',
        short_name: 'Lékárnička',
        description: 'Domácí lékárnička: přehled léků, hlídání expirace a co pomáhá na běžné potíže.',
        lang: 'cs',
        start_url: '/',
        display: 'standalone',
        background_color: '#ffffff',
        theme_color: '#0b6e4f',
        icons: [
          { src: 'pwa-64x64.png', sizes: '64x64', type: 'image/png' },
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      injectManifest: {
        // Precache everything, including the SÚKL data (~8 MB, ~0.9 MB over the wire), so the app
        // works offline from the first visit. Workbox replaces it when a new month's file ships.
        globPatterns: ['**/*.{js,css,html,svg,png,ico,json}'],
        maximumFileSizeToCacheInBytes: 16 * 1024 * 1024,
      },
    }),
  ],
  test: {
    include: ['src/**/*.test.ts', 'server/src/**/*.test.ts'],
    pool: 'forks',
    // node:sqlite (used by the push server) needs a flag before Node 22.13.
    execArgv: needsSqliteFlag() ? ['--experimental-sqlite'] : [],
  },
});

function needsSqliteFlag(): boolean {
  const [major, minor] = process.versions.node.split('.').map(Number);
  return major < 22 || (major === 22 && minor < 13);
}
