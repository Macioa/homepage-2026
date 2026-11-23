// LLM provider adapters for the chat function. Each one says which key it needs, how to build its LangChain model
// and how to read the HTTP status off its errors; everything else in chat.mts is provider-agnostic.

import type { BaseChatModel } from '@langchain/core/language_models/chat_models'
import { ChatGoogleGenerativeAI } from '@langchain/google-genai'
import { ChatOpenRouter } from '@langchain/openrouter'

export type ProviderName = 'gemini' | 'openrouter'

export type LlmAdapter = {
  name: ProviderName
  model: string
  envKey: string
  // Whether its calls count in the shared rate window.
  rateLimited: boolean
  create: (apiKey: string) => BaseChatModel
  status: (error: unknown) => number | undefined
}

// No retries: LangChain would wait out a 429, so the usage limit would stall the run instead of reaching the browser.
const MAX_RETRIES = 0
const GEMINI_MODEL = 'gemini-3.1-flash-lite'
// OpenRouter picks any available free model that supports the request's features (such as tool calling).
const OPENROUTER_MODEL = 'openrouter/free'

const ADAPTERS: Record<ProviderName, LlmAdapter> = {
  gemini: {
    name: 'gemini',
    model: GEMINI_MODEL,
    envKey: 'GEMINI_API_KEY',
    rateLimited: true,
    create: apiKey => new ChatGoogleGenerativeAI({ model: GEMINI_MODEL, apiKey, maxRetries: MAX_RETRIES }),
    status: error => (error as { status?: number }).status
  },
  openrouter: {
    name: 'openrouter',
    model: OPENROUTER_MODEL,
    envKey: 'OPENROUTER_API_KEY',
    rateLimited: false,
    create: apiKey => new ChatOpenRouter({ model: OPENROUTER_MODEL, apiKey, maxRetries: MAX_RETRIES, siteUrl: process.env.URL }),
    status: error => (error as { statusCode?: number }).statusCode
  }
}

export const DEFAULT_PROVIDER: ProviderName = 'gemini'

// Throws on a provider this function doesn't know; the request comes from the browser.
export function llmAdapter(provider: string = DEFAULT_PROVIDER) {
  if (!Object.hasOwn(ADAPTERS, provider)) throw new Error(`unknown provider: ${provider}`)
  return ADAPTERS[provider as ProviderName]
}
