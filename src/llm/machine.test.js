// What the app learns about this machine: storage, context size, prefill timing, the watchdog.

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { forgetContextSize, rememberContextSize, smallerContextSize, startingContextSize } from "./contextSize.js";
import { estimateTokens, firstTokenTimeoutMs, learnPrefillRate, prefillRate } from "./prefillTiming.js";
import { machineStore, reloadStore } from "./storage.js";
import { fakeStorage } from "./testing.js";
import { startWatchdog } from "./watchdog.js";

beforeEach(() => {
  vi.stubGlobal("localStorage", fakeStorage());
  vi.stubGlobal("sessionStorage", fakeStorage());
});
afterEach(() => vi.unstubAllGlobals());

describe("storage", () => {
  test("get, set, remove, take", () => {
    machineStore.set("k", 5);
    expect(machineStore.get("k")).toBe("5");
    expect(reloadStore.get("k")).toBeNull();
    reloadStore.set("n", "x");
    expect(reloadStore.take("n")).toBe("x");
    expect(reloadStore.get("n")).toBeNull();
    machineStore.remove("k");
    expect(machineStore.get("k")).toBeNull();
  });

  test("blocked storage acts empty instead of throwing", () => {
    vi.stubGlobal("localStorage", {
      getItem() {
        throw new Error("blocked");
      },
      setItem() {
        throw new Error("blocked");
      },
      removeItem() {
        throw new Error("blocked");
      },
    });
    expect(() => machineStore.set("k", 1)).not.toThrow();
    expect(machineStore.get("k")).toBeNull();
    expect(machineStore.take("k")).toBeNull();
  });
});

describe("context size", () => {
  test("starts at the largest, remembers what worked, steps down", () => {
    expect(startingContextSize()).toBe(16384);
    rememberContextSize(8192);
    expect(startingContextSize()).toBe(8192);
    expect(smallerContextSize(8192)).toBe(4096);
    expect(smallerContextSize(4096)).toBeNull();
    forgetContextSize();
    expect(startingContextSize()).toBe(16384);
  });

  test("ignores a saved size that is not on the list", () => {
    rememberContextSize(1234);
    expect(startingContextSize()).toBe(16384);
  });
});

describe("prefill timing", () => {
  test("estimates tokens and the first-token timeout", () => {
    expect(estimateTokens("x".repeat(401))).toBe(101);
    expect(firstTokenTimeoutMs(1000, 20)).toBe(15_000 + 100_000);
  });

  test("learns the rate only from long prompts", () => {
    expect(prefillRate()).toBe(20);
    learnPrefillRate({ prompt_tokens: 100, extra: { prefill_tokens_per_s: 99 } });
    expect(prefillRate()).toBe(20);
    learnPrefillRate({ prompt_tokens: 1500, extra: { prefill_tokens_per_s: 26.6 } });
    expect(prefillRate()).toBe(27);
    learnPrefillRate(undefined);
    expect(prefillRate()).toBe(27);
  });
});

describe("watchdog", () => {
  beforeEach(() => vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "performance"] }));
  afterEach(() => vi.useRealTimers());

  test("fires timeout when no first token arrives", () => {
    const onExpire = vi.fn();
    startWatchdog(1000, onExpire);
    vi.advanceTimersByTime(1600);
    expect(onExpire).toHaveBeenCalledExactlyOnceWith("timeout");
  });

  test("fires stalled when tokens stop, and never after cancel", () => {
    const onExpire = vi.fn();
    const dog = startWatchdog(1000, onExpire);
    dog.tokenArrived();
    vi.advanceTimersByTime(15_000);
    expect(onExpire).not.toHaveBeenCalled();
    vi.advanceTimersByTime(6_000);
    expect(onExpire).toHaveBeenCalledExactlyOnceWith("stalled");

    const quiet = vi.fn();
    startWatchdog(1000, quiet).cancel();
    vi.advanceTimersByTime(5000);
    expect(quiet).not.toHaveBeenCalled();
  });
});
