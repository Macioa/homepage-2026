# homepage-2026
Personal homepage (React + Redux), 2026

- `npm run netlify` - Vite plus the Netlify functions (`/api/*`) on DEV_PORT from `.env.local`; keys from the Netlify site env (see `.env.example`)
- `npm run dev` - Vite dev server only (no `/api`)
- `npm run build` - build to `dist/`
- `npm test` - tests (vitest)
- Deploy: Netlify (`netlify.toml`)
- Optional Docker: `docker build -f ops/Dockerfile -t homepage .` (nginx on port 80)

