// GET /api/visitor -> { id }: the first 20 bits of a SHA-256 of the caller's IP, so browser telemetry can count unique
// visitors. Short on purpose: ~4,000 IPs share each id, so it can't be reversed to an IP, while a site with dozens of
// visitors rarely sees two share one (<1%).

import { createHash } from 'node:crypto'

const handler = (req: Request) => {
  const ip = req.headers.get('x-nf-client-connection-ip')
  const id = ip ? createHash('sha256').update(ip).digest('hex').slice(0, 5) : null
  return Response.json({ id }, { headers: { 'Cache-Control': 'no-store' } })
}

export const config = { path: '/api/visitor', method: 'GET' }

export default handler
