import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

// https://vite.dev/config/
// Dev port from DEV_PORT in .env.local; under `netlify dev` (scripts/netlify-dev.mjs) Vite sits behind it on DEV_TARGET_PORT.
export default defineConfig(({ mode }) => {
  const env = { ...loadEnv(mode, process.cwd(), ''), ...process.env }
  const port = Number(env.DEV_TARGET_PORT ?? env.DEV_PORT) || undefined
  return {
    plugins: [react()],
    server: { port, strictPort: !!port },
  }
})
