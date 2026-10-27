// Tuning for the in-browser model. Values come from testing on Windows (see README).

export const MODEL = "Llama-3.2-1B-Instruct-q4f16_1-MLC";

// Context windows to try, largest first. Each one is proven with a warm-up before it's saved.
export const CONTEXT_SIZES = [16384, 8192, 4096];

// Small prefill chunks keep each GPU job short, so none hits the Windows driver timeout (TDR).
export const PREFILL_CHUNK_SIZE = 256;

// Prefill speed used until a real one is measured (tokens/s). Measured ~26 on the test machine.
export const DEFAULT_PREFILL_RATE = 20;

// Short prompts read much faster than long ones, so only long prompts teach the prefill speed.
export const MIN_TOKENS_TO_LEARN_RATE = 1000;

// First-token timeout = base + safety x (estimated prompt tokens / prefill speed).
export const FIRST_TOKEN_TIMEOUT_BASE_MS = 15_000;
export const FIRST_TOKEN_TIMEOUT_SAFETY = 2;

// Once tokens are streaming, a gap this long counts as stalled.
export const STALL_TIMEOUT_MS = 20_000;

// Pause before reloading the page after a GPU failure.
export const RELOAD_DELAY_MS = 2_000;

// Pause before retrying the same size after a mid-read reload (the old prompt may still be on the GPU).
export const RETRY_SAME_SIZE_DELAY_MS = 10_000;
