import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

/**
 * Strip crossorigin attributes from <link> and <script> tags in the built HTML.
 * Under Electron's file:// protocol, crossorigin triggers CORS checks that fail
 * because there is no HTTP server to respond with CORS headers.
 */
function stripCrossoriginPlugin() {
  return {
    name: 'strip-crossorigin',
    enforce: 'post',
    transformIndexHtml(html) {
      return html.replace(/\s+crossorigin(?:="[^"]*")?/g, '')
    },
  }
}

export default defineConfig({
  plugins: [react(), stripCrossoriginPlugin()],
  base: './',
  server: {
    port: 3005
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src/renderer')
    }
  }
})
