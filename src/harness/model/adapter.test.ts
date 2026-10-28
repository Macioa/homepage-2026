import { expect, test, vi } from 'vitest'
import { webllmModel } from './adapter'

test('webllmModel strips harness bookkeeping and turns the schema into JSON mode', async () => {
  const llm = { complete: vi.fn().mockResolvedValue('{"type":"final"}'), stop: vi.fn() }
  const model = webllmModel(llm)

  const reply = await model.complete([{ role: 'user', content: 'x', kind: 'observation', callId: 'a#1' }], {
    schema: '{"anyOf":[]}',
    maxTokens: 64
  })
  model.stop()

  expect(reply).toBe('{"type":"final"}')
  expect(llm.complete).toHaveBeenCalledWith([{ role: 'user', content: 'x' }], {
    responseFormat: { type: 'json_object', schema: '{"anyOf":[]}' },
    maxTokens: 64
  })
  expect(llm.stop).toHaveBeenCalledOnce()
})

test('without a schema the reply is plain text', async () => {
  const llm = { complete: vi.fn().mockResolvedValue('about React'), stop: vi.fn() }
  await webllmModel(llm).complete([{ role: 'user', content: 'x' }], { maxTokens: 64 })
  expect(llm.complete).toHaveBeenCalledWith([{ role: 'user', content: 'x' }], { responseFormat: undefined, maxTokens: 64 })
})
