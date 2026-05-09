import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { boneyardPlugin } from 'boneyard-js/vite'
import path from 'path'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const mainApiBackendUrl = env.VITE_MAIN_API_BACKEND_URL || ''

  console.log('[Vite Config] Backend URL:', mainApiBackendUrl || '(none - using relative paths)')

  return {
    plugins: [
      react(),
      boneyardPlugin()
    ],
    server: {
      port: 5173,
      proxy: {
        '/backend-api': {
          target: mainApiBackendUrl,
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/backend-api/, '')
        },
        '/api': {
          target: mainApiBackendUrl,
          changeOrigin: true
        },
        '/wado-rs': {
          target: mainApiBackendUrl,
          changeOrigin: true
        }
      }
    },
    resolve: {
      alias: {
        '@cornerstonejs/core': path.resolve(__dirname, 'node_modules/@cornerstonejs/core/dist/umd/index.js'),
        '@cornerstonejs/tools': path.resolve(__dirname, 'node_modules/@cornerstonejs/tools/dist/umd/index.js'),
      },
      dedupe: ['react', 'react-dom', '@cornerstonejs/core', '@cornerstonejs/tools']
    },
    build: {
      sourcemap: false,
      minify: false, // DANGEROUS FIX: Disable minification to solve circular dependency TDZ errors
      target: 'es2022',
      chunkSizeWarningLimit: 50000,
      rollupOptions: {
        output: {
          manualChunks: undefined // Let Rollup decide the best order
        }
      },
      commonjsOptions: {
        transformMixedEsModules: true
      }
    }
  }
})
