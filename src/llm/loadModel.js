// Load the model at the largest context size this machine has proven it can handle.
// On failure the page reloads at the same size (once, after a mid-read reload) or one size smaller.

import { CONTEXT_SIZES, RELOAD_DELAY_MS, RETRY_SAME_SIZE_DELAY_MS } from "./config.js";
import {
  forgetContextSize,
  rememberContextSize,
  smallerContextSize,
  startingContextSize,
} from "./contextSize.js";
import { createEngine, hasWebGPU, unloadEngine, warmUp } from "./engine.js";
import { reloadPageAfter, takeRetrySameSize } from "./pageReload.js";

// Resolves to { engine, contextSize } when ready, or null when loading can't continue
// on this page (no WebGPU, a reload is scheduled, or every size failed).
export async function loadModel(onStatus) {
  if (!hasWebGPU()) {
    onStatus("WebGPU is not supported in this browser.");
    return null;
  }

  const size = startingContextSize();
  let engine = null;
  try {
    engine = await createEngine(size, (text) => onStatus(`[ctx ${size}] ${text}`));
    onStatus(`[ctx ${size}] Warming up...`);
    await warmUp(engine);
  } catch (err) {
    console.warn(`Load failed at context ${size}:`, err);
    await unloadEngine(engine);
    handleLoadFailure(size, err, onStatus);
    return null;
  }

  rememberContextSize(size);
  takeRetrySameSize(); // a successful load uses up any pending retry
  return { engine, contextSize: size };
}

function handleLoadFailure(size, err, onStatus) {
  if (takeRetrySameSize()) {
    onStatus(`Context ${size} failed (${err.message}); the GPU may still be busy, retrying the same size...`);
    reloadPageAfter(RETRY_SAME_SIZE_DELAY_MS);
    return;
  }

  const smaller = smallerContextSize(size);
  if (!smaller) {
    forgetContextSize();
    onStatus(`Model failed to load at every context size (${CONTEXT_SIZES.join(", ")} tokens).`);
    return;
  }

  rememberContextSize(smaller);
  onStatus(`Context ${size} failed (${err.message}), reloading with a smaller context...`);
  reloadPageAfter(RELOAD_DELAY_MS);
}
