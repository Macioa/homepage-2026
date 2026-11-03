// `netlify dev` on DEV_PORT from .env.local (the origin get-jwt allows), with Vite behind it on DEV_PORT + 1.
import { spawn } from 'node:child_process'

process.loadEnvFile?.('.env.local')
const port = Number(process.env.DEV_PORT)
if (!port) throw new Error('Set DEV_PORT in .env.local')
const target = port + 1

spawn('npx', ['netlify', 'dev', '--port', String(port), '--target-port', String(target)], {
  stdio: 'inherit',
  shell: true,
  env: { ...process.env, DEV_TARGET_PORT: String(target) },
}).on('exit', code => process.exit(code ?? 0))
