// Thin wrapper over WebLLM's engine lifecycle.

import { CreateMLCEngine } from "@mlc-ai/web-llm";
import { MODEL, PREFILL_CHUNK_SIZE } from "./config.js";

export function hasWebGPU() {
  return Boolean(navigator.gpu);
}

export function createEngine(contextSize, onProgress) {
  return CreateMLCEngine(
    MODEL,
    { initProgressCallback: (p) => onProgress(p.text) },
    { context_window_size: contextSize, prefill_chunk_size: PREFILL_CHUNK_SIZE },
  );
}

// Loading doesn't allocate the KV cache; the first generation does. A one-token
// generation proves the context size fits in GPU memory before it's trusted.
export async function warmUp(engine) {
  await engine.chat.completions.create({
    messages: [{ role: "user", content: "hi" }],
    max_tokens: 1,
  });
}

export async function unloadEngine(engine) {
  try {
    await engine?.unload();
  } catch {
    // Already broken (e.g. lost device); nothing left to free.
  }
}

// Rejected by WebLLM before any GPU work, so the engine is still healthy.
export function isContextOverflow(err) {
  return err?.name === "ContextWindowSizeExceededError";
}
