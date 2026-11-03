// POST /api/get-jwt -> { token, expires_at }: a 1-hour chat JWT from the Supabase get-jwt edge function, proxied so
// the browser never calls Supabase for it. JWT_PROXY_SECRET goes along as x-proxy-secret, which the edge function
// requires; the browser's Origin goes along too, for the edge function's ALLOWED_ORIGINS check.
// Only the chat role is handed out here.

import { SUPABASE_ENV } from '../supabase.ts'

const ENV = ['JWT_PROXY_SECRET', ...SUPABASE_ENV]
const ERROR_STATUS = 500

export default async (req: Request) => {
  const missing = ENV.filter(name => !process.env[name])
  if (missing.length) return Response.json({ error: `${missing.join(', ')} not set` }, { status: ERROR_STATUS })
  const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? ''
  const res = await fetch(`${process.env.VITE_SUPABASE_URL}/functions/v1/get-jwt`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: key,
      Authorization: `Bearer ${key}`,
      'x-proxy-secret': process.env.JWT_PROXY_SECRET ?? '',
      ...(req.headers.get('origin') ? { Origin: req.headers.get('origin')! } : {})
    },
    body: JSON.stringify({ role: 'chat' })
  })
  return new Response(res.body, { status: res.status, headers: { 'Content-Type': 'application/json' } })
}

export const config = { path: '/api/get-jwt', method: 'POST' }
