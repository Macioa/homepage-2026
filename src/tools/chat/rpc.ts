// Shared by the chat tools: the Redux chat JWT, read at call time so a refreshed token is used.

import { callRpc } from '../../connections/supabase'
import { z } from 'zod'

export type GetToken = () => string | null

export const mode = z.enum(['precise', 'start_to_end']).describe('precise: actual days used; start_to_end: first to last use')

export async function rpc(getToken: GetToken, fn: string, args: Record<string, unknown>, signal: AbortSignal) {
  const token = getToken()
  if (!token) throw new Error('chat token not ready')
  return callRpc(fn, args, token, signal)
}
