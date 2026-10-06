import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// Do not load vite.config.ts: its Development HTTPS setup invokes dotnet and
// reads local certificates. These tests need only an isolated DOM and mock APIs.
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    environmentOptions: { jsdom: { url: 'http://localhost/' } },
  },
})
