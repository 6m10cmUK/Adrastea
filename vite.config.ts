import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import basicSsl from '@vitejs/plugin-basic-ssl'

import { cloudflare } from "@cloudflare/vite-plugin";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), basicSsl(), cloudflare()],
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['src/**/*.test.{ts,tsx}'],
  },
  server: {
    port: 6100,
    strictPort: true, // 6100が使用中なら起動失敗（他ポートへのフォールバック禁止）
    host: true, // LAN内の他デバイス（スマホ等）からアクセス可能にする
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin-allow-popups',
    },
  },
  optimizeDeps: {
    include: ['pdfjs-dist'],
    exclude: ['@jsquash/webp'],
    esbuildOptions: {
      loader: { '.map': 'empty' },
    },
  },
})