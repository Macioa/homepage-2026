// Fires once if the first token takes too long, or if tokens stop arriving.

import { STALL_TIMEOUT_MS } from "./config.js";

const CHECK_INTERVAL_MS = 500;

// onExpire receives "timeout" (no first token) or "stalled" (gap between tokens).
export function startWatchdog(firstTokenMs, onExpire) {
  let gotFirstToken = false;
  let deadline = performance.now() + firstTokenMs;

  const timer = setInterval(() => {
    if (performance.now() <= deadline) return;
    clearInterval(timer);
    onExpire(gotFirstToken ? "stalled" : "timeout");
  }, CHECK_INTERVAL_MS);

  return {
    tokenArrived() {
      gotFirstToken = true;
      deadline = performance.now() + STALL_TIMEOUT_MS;
    },
    cancel() {
      clearInterval(timer);
    },
  };
}
