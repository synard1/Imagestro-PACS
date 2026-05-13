import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      'react': path.resolve(__dirname, './node_modules/react'),
      'react-dom': path.resolve(__dirname, './node_modules/react-dom'),
      'react-router-dom': path.resolve(__dirname, './node_modules/react-router-dom'),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./tests/setup.js'], // Global test setup
    include: [
      'tests/**/*.test.js',
      'tests/**/*.test.jsx',
      'tests/**/*.property.test.js',
      'tests/**/*.spec.js',
      'src/services/__tests__/**/*.test.js',
      'src/services/__tests__/**/*.property.test.js',
      'mobile-app/src/**/*.test.jsx', // Include mobile-app component tests
    ],
    exclude: [
      'tests/unit/useServiceMode.test.jsx'
    ],
    coverage: {
      reporter: ['text', 'json', 'html', 'lcov'],
      provider: 'v8',
    },
    // Environment selection based on file patterns
    environmentMatchGlobs: [
      ['tests/**/*.test.jsx', 'jsdom'],  // React component tests need browser environment
      ['src/**/*.test.jsx', 'jsdom'],    // React component tests need browser environment
      ['mobile-app/src/**/*.test.jsx', 'jsdom'], // Mobile app tests need browser environment
      ['src/**/*.test.js', 'node'],      // Service tests run in node
    ],
  },
})
