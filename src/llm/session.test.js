import { beforeEach, describe, expect, test, vi } from "vitest";
import { fakeEngine, fakeStorage } from "./testing.js";

const mocks = vi.hoisted(() => ({ loaded: null }));

vi.mock("./loadModel.js", () => ({ loadModel: vi.fn(async () => mocks.loaded) }));
vi.mock("./pageReload.js", () => ({ reloadPage: vi.fn(), reloadPageAfter: vi.fn(async () => {}) }));
vi.mock("./engine.js", () => ({
  isContextOverflow: (err) => err?.name === "ContextWindowSizeExceededError",
  unloadEngine: vi.fn(async () => {}),
}));

const { LlmSession } = await import("./session.js");
const { reloadPage, reloadPageAfter } = await import("./pageReload.js");
const { unloadEngine } = await import("./engine.js");
const { startingContextSize } = await import("./contextSize.js");

const messages = [{ role: "user", content: "x".repeat(400) }];

async function ready(engine) {
  mocks.loaded = { engine, contextSize: 8192 };
  const status = [];
  const onReady = vi.fn();
  const session = new LlmSession({ onStatus: (text) => status.push(text), onReady });
  await session.load();
  return { session, status, onReady };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("localStorage", fakeStorage());
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("load", () => {
  test("ready once the model loads", async () => {
    const { status, onReady } = await ready(fakeEngine());
    expect(onReady).toHaveBeenCalledOnce();
    expect(status.at(-1)).toBe("Ready: Llama-3.2-1B-Instruct-q4f16_1-MLC (context 8192 tokens)");
  });

  test("not ready when loading can't continue", async () => {
    mocks.loaded = null;
    const onReady = vi.fn();
    await new LlmSession({ onStatus() {}, onReady }).load();
    expect(onReady).not.toHaveBeenCalled();
  });
});

describe("complete", () => {
  test("resolves to the whole reply and reports the prompt read", async () => {
    const engine = fakeEngine({ pieces: ['{"type"', ':"final"}'] });
    const { session, status } = await ready(engine);

    const reply = await session.complete(messages, { responseFormat: { type: "json_object" }, maxTokens: 8 });

    expect(reply).toBe('{"type":"final"}');
    expect(engine.requests[0]).toMatchObject({ response_format: { type: "json_object" }, max_tokens: 8 });
    expect(status).toContain("Reading ~100 tokens at ~20 tok/s (timeout 25 s)...");
    expect(status.at(-1)).toMatch(/^Ready:/);
  });

  test("stop after the first token interrupts generation and rejects", async () => {
    const engine = fakeEngine({ pieces: ["a", "b", "c", "d"] });
    const { session } = await ready(engine);
    const reply = session.complete(messages);
    await vi.waitFor(() => expect(engine.requests).toHaveLength(1));
    await new Promise((resolve) => setTimeout(resolve, 5));
    session.stop("user");
    await expect(reply).rejects.toThrow("Stopped by user.");
    expect(engine.interrupted).toBe(true);
  });

  test("a stall after the first token says how long it waited", async () => {
    const { session } = await ready(fakeEngine({ pieces: ["a", "b", "c"] }));
    const reply = session.complete(messages);
    await new Promise((resolve) => setTimeout(resolve, 5));
    session.stop("stalled");
    await expect(reply).rejects.toThrow("Stalled: no new token for 20 s.");
  });

  test.each([
    ["user", "Stopped by user during prompt reading. Prompt reading can't be interrupted, so the page reloaded."],
    [
      "timeout",
      "Timed out: prompt reading passed its 25 s limit (~100 prompt tokens at ~20 tok/s). " +
        "Prompt reading can't be interrupted, so the page reloaded.",
    ],
    ["reload", undefined],
  ])("stop(%s) during prompt reading reloads the page with a notice", async (reason, notice) => {
    const { session } = await ready(fakeEngine({ firstTokenDelayMs: 50 }));
    const reply = session.complete(messages);
    session.stop(reason);
    expect(reloadPage).toHaveBeenCalledWith({ notice, retrySameSize: true });
    await reply.catch(() => {});
  });

  test("a GPU failure reloads one context size smaller and rejects", async () => {
    const { session, status } = await ready(fakeEngine({ fail: new Error("Device lost") }));
    await expect(session.complete(messages)).rejects.toThrow("Device lost");
    expect(status).toContain("GPU error: Device lost. Reloading the page with a 4096-token context.");
    expect(unloadEngine).toHaveBeenCalled();
    expect(reloadPageAfter).toHaveBeenCalled();
    expect(startingContextSize()).toBe(4096);
  });

  test("a context overflow rejects without reloading", async () => {
    const overflow = Object.assign(new Error("too long"), { name: "ContextWindowSizeExceededError" });
    const { session } = await ready(fakeEngine({ fail: overflow }));
    await expect(session.complete(messages)).rejects.toThrow("too long");
    expect(reloadPageAfter).not.toHaveBeenCalled();
  });
});

test("reload stops the current reply, frees the GPU and reloads", async () => {
  const { session } = await ready(fakeEngine({ pieces: ["a", "b", "c"] }));
  session.complete(messages).catch(() => {});
  await new Promise((resolve) => setTimeout(resolve, 5));
  await session.reload();
  expect(unloadEngine).toHaveBeenCalled();
  expect(reloadPage).toHaveBeenCalledWith();
});
