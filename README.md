# homepage-2026
Personal homepage (React + Redux), 2026

- `npm run dev` - Vite plus the Netlify functions (`/api/*`) on DEV_PORT from `.env.local`; keys from the Netlify site env (see `.env.example`)
- `npm run vite` - Vite only, no `/api` (no chat token, no projects); use `npm run dev`
- `npm run build` - build to `dist/`
- `npm test` - tests (vitest)
- Deploy: Netlify (`netlify.toml`)
- Optional Docker: `docker build -f ops/Dockerfile -t homepage .` (nginx on port 80)

