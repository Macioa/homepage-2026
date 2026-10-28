// The harness only needs a model that can complete messages (under a JSON schema, or as plain text for
// the caveman rewrite) and be stopped. No WebLLM import here, so the harness runs in tests with a scripted model.

import type { Msg } from '../state/types'

export type Model = {
  complete(messages: Msg[], options: { schema?: string; maxTokens: number }): Promise<string>
  stop(): void
}

type LlmMessage = Pick<Msg, 'role' | 'content'>

// The { complete, stop } handle from useLlmSession, backed by LlmSession.
export type Llm = {
  complete(messages: LlmMessage[], options: { responseFormat?: object; maxTokens: number }): Promise<string>
  stop(): void
}

export function webllmModel(llm: Llm): Model {
  return {
    complete: (messages, { schema, maxTokens }) =>
      llm.complete(
        messages.map(({ role, content }) => ({ role, content })),
        { responseFormat: schema ? { type: 'json_object', schema } : undefined, maxTokens }
      ),
    stop: () => llm.stop()
  }
}
