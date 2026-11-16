import react from '@vitejs/plugin-react'
import { sentryVitePlugin } from '@sentry/vite-plugin'
import { defineConfig, loadEnv } from 'vite'

// https://vite.dev/config/
// Dev port from DEV_PORT in .env.local; under `netlify dev` (scripts/netlify-dev.mjs) Vite sits behind it on DEV_TARGET_PORT.
export default defineConfig(({ command, mode }) => {
  const env = { ...loadEnv(mode, process.cwd(), ''), ...process.env }
  const upload = command === 'build' && !!env.SENTRY_AUTH_TOKEN
  const port = Number(env.DEV_TARGET_PORT ?? env.DEV_PORT) || undefined
  // Only behind `netlify dev`: standalone Vite takes DEV_PORT itself and would proxy to itself.
  const apiTarget = env.DEV_TARGET_PORT && env.DEV_PORT ? `http://localhost:${env.DEV_PORT}` : undefined
  return {
    // Source maps go to Sentry (then deleted from dist) when SENTRY_AUTH_TOKEN is set, i.e. Netlify builds.
    plugins: [
      react(),
      upload &&
        sentryVitePlugin({ org: 'self-07h', project: 'homepage-2026', authToken: env.SENTRY_AUTH_TOKEN, sourcemaps: { filesToDeleteAfterUpload: ['dist/**/*.map'] },
          // A failed upload warns instead of failing the build.
          errorHandler: err => console.warn('sentry: source map upload failed', err) }),
    ],
    build: { sourcemap: upload ? 'hidden' : false },
    // Opened on Vite's own port (not DEV_PORT), /api still reaches the functions under `netlify dev`,
    // sent as DEV_PORT's origin since that is the one get-jwt allows.
    server: {
      port,
      strictPort: !!port,
      proxy: apiTarget ? { '/api': { target: apiTarget, headers: { origin: apiTarget } } } : undefined,
    },
  }
})
