import solid from '@solidjs/vite-plugin'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'

const root = fileURLToPath(new URL('.', import.meta.url))

export default defineConfig({
  base: './',
  devtools: {
    // Remove this `apply` property to enable devtools for build as well
    apply: 'serve',
  },
  plugins: [solid()],
  build: {
    rollupOptions: {
      input: {
        main: resolve(root, 'index.html'),
        connector: resolve(root, 'connector.html'),
      },
    },
  },
})
