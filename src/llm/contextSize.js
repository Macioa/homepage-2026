// Which context window this machine can handle, remembered across visits.

import { CONTEXT_SIZES, MODEL } from "./config.js";
import { machineStore } from "./storage.js";

const KEY = `ctxSize:${MODEL}`;

export function startingContextSize() {
  const saved = Number(machineStore.get(KEY));
  return CONTEXT_SIZES.includes(saved) ? saved : CONTEXT_SIZES[0];
}

export function smallerContextSize(size) {
  return CONTEXT_SIZES.find((s) => s < size) ?? null;
}

export function rememberContextSize(size) {
  machineStore.set(KEY, size);
}

export function forgetContextSize() {
  machineStore.remove(KEY);
}
