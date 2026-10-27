// Reloading the page is the only reliable GPU recovery: after a lost device the page keeps
// getting DXGI_ERROR_DEVICE_REMOVED, and prompt reading (prefill) can't be interrupted.
// These helpers reload and pass a note to the next page.

import { reloadStore } from "./storage.js";

const NOTICE_KEY = "notice";
const RETRY_KEY = "retrySameSize";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// notice: text for the next page to show.
// retrySameSize: the next page gets one retry at the same context size if its warm-up fails,
// because the GPU may still be busy with work from this page.
export function reloadPage({ notice, retrySameSize = false } = {}) {
  if (notice) reloadStore.set(NOTICE_KEY, notice);
  if (retrySameSize) reloadStore.set(RETRY_KEY, "1");
  location.reload();
}

export async function reloadPageAfter(delayMs, options) {
  await sleep(delayMs);
  reloadPage(options);
}

export function takeReloadNotice() {
  return reloadStore.take(NOTICE_KEY) ?? "";
}

export function takeRetrySameSize() {
  return reloadStore.take(RETRY_KEY) === "1";
}
