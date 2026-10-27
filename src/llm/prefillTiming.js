// How long reading a prompt (prefill) should take on this machine, learned from real runs.

import {
  DEFAULT_PREFILL_RATE,
  FIRST_TOKEN_TIMEOUT_BASE_MS,
  FIRST_TOKEN_TIMEOUT_SAFETY,
  MIN_TOKENS_TO_LEARN_RATE,
  MODEL,
} from "./config.js";
import { machineStore } from "./storage.js";

const KEY = `prefillRate:${MODEL}`;

// Rough English estimate; exact counts would need the model's tokenizer.
export function estimateTokens(text) {
  return Math.ceil(text.length / 4);
}

export function prefillRate() {
  return Number(machineStore.get(KEY)) || DEFAULT_PREFILL_RATE;
}

export function firstTokenTimeoutMs(promptTokens, rate) {
  return FIRST_TOKEN_TIMEOUT_BASE_MS + (promptTokens / rate) * 1000 * FIRST_TOKEN_TIMEOUT_SAFETY;
}

// `usage` is WebLLM's final stream chunk usage (requires stream_options.include_usage).
export function learnPrefillRate(usage) {
  const rate = usage?.extra?.prefill_tokens_per_s;
  if (rate > 0 && usage.prompt_tokens >= MIN_TOKENS_TO_LEARN_RATE) {
    machineStore.set(KEY, Math.round(rate));
  }
}
