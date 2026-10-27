// Derives load and warm-up progress from LlmSession's status text, so src/llm stays untouched.
// WebLLM reports "N% completed" for weights, then again for GPU shaders; warm-up reports nothing.

import { useRef } from "react";

const PARAMS_SHARE = 85; // weights are most of the load; shaders fill the rest

const percent = (text) => Number(/(\d+)% completed/.exec(text)?.[1] ?? 0);

// load: 0-100. warm: 0-100, or null while warming up (no progress is reported).
export function useLoadProgress(status, ready) {
  const peak = useRef({ load: 0, warm: 0 });
  const p = peak.current;

  if (ready) {
    p.load = 100;
    p.warm = 100;
  } else if (/Warming up/.test(status)) {
    p.load = 100;
    p.warm = null;
  } else if (/Finish loading/.test(status)) {
    p.load = 100;
  } else if (/shader/i.test(status)) {
    p.load = Math.max(p.load, PARAMS_SHARE + (percent(status) * (100 - PARAMS_SHARE)) / 100);
  } else if (/param cache|Loading model/.test(status)) {
    p.load = Math.max(p.load, (percent(status) * PARAMS_SHARE) / 100);
  } else if (p.warm === null) {
    p.warm = 0; // warm-up ended without Ready (failed; the page reloads or shows an error)
  }

  return { ...p };
}
