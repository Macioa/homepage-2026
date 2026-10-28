import { beforeEach, describe, expect, test, vi } from "vitest";
import { fakeStorage } from "./testing.js";

const mocks = vi.hoisted(() => ({ create: null, warm: null }));

vi.mock("@mlc-ai/web-llm", () => ({ CreateMLCEngine: vi.fn(async () => mocks.create()) }));
vi.mock("./pageReload.js", async (importOriginal) => ({
  ...(await importOriginal()),
  reloadPageAfter: vi.fn(async () => {}),
}));

const { loadModel } = await import("./loadModel.js");
const { createEngine, hasWebGPU, isContextOverflow, unloadEngine, warmUp } = await import("./engine.js");
const { reloadPage, reloadPageAfter, takeReloadNotice, takeRetrySameSize } = await import("./pageReload.js");
const { CreateMLCEngine } = await import("@mlc-ai/web-llm");
const { startingContextSize } = await import("./contextSize.js");

const engine = (over = {}) => ({
  chat: { completions: { create: vi.fn(async () => mocks.warm?.()) } },
  unload: vi.fn(async () => {}),
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("localStorage", fakeStorage());
  vi.stubGlobal("sessionStorage", fakeStorage());
  vi.stubGlobal("navigator", { gpu: {} });
  vi.stubGlobal("location", { reload: vi.fn() });
  vi.spyOn(console, "warn").mockImplementation(() => {});
  mocks.create = () => engine();
  mocks.warm = null;
});

describe("engine", () => {
  test("creates at a context size with small prefill chunks, and reports progress", async () => {
    const onProgress = vi.fn();
    await createEngine(4096, onProgress);
    const [model, config, chat] = CreateMLCEngine.mock.calls[0];
    expect(model).toBe("Llama-3.2-1B-Instruct-q4f16_1-MLC");
    expect(chat).toEqual({ context_window_size: 4096, prefill_chunk_size: 256 });
    config.initProgressCallback({ text: "50% completed" });
    expect(onProgress).toHaveBeenCalledWith("50% completed");
  });

  test("warm-up asks for one token; unload never throws; overflow is recognized", async () => {
    const e = engine();
    await warmUp(e);
    expect(e.chat.completions.create).toHaveBeenCalledWith({ messages: [{ role: "user", content: "hi" }], max_tokens: 1 });
    await expect(unloadEngine(engine({ unload: () => Promise.reject(new Error("lost")) }))).resolves.toBeUndefined();
    await expect(unloadEngine(null)).resolves.toBeUndefined();
    expect(isContextOverflow({ name: "ContextWindowSizeExceededError" })).toBe(true);
    expect(isContextOverflow(new Error("x"))).toBe(false);
    expect(hasWebGPU()).toBe(true);
  });
});

describe("loadModel", () => {
  test("no WebGPU", async () => {
    vi.stubGlobal("navigator", {});
    const onStatus = vi.fn();
    expect(await loadModel(onStatus)).toBeNull();
    expect(onStatus).toHaveBeenCalledWith("WebGPU is not supported in this browser.");
  });

  test("loads, warms up and remembers the size that worked", async () => {
    const result = await loadModel(vi.fn());
    expect(result.contextSize).toBe(16384);
    expect(startingContextSize()).toBe(16384);
  });

  test("a failed warm-up reloads one size smaller", async () => {
    mocks.warm = () => Promise.reject(new Error("out of memory"));
    const onStatus = vi.fn();
    expect(await loadModel(onStatus)).toBeNull();
    expect(onStatus).toHaveBeenCalledWith("Context 16384 failed (out of memory), reloading with a smaller context...");
    expect(startingContextSize()).toBe(8192);
    expect(reloadPageAfter).toHaveBeenCalled();
  });

  test("after a mid-read reload, retries the same size once", async () => {
    reloadPage({ retrySameSize: true });
    mocks.warm = () => Promise.reject(new Error("busy"));
    const onStatus = vi.fn();
    await loadModel(onStatus);
    expect(onStatus.mock.calls.at(-1)[0]).toMatch(/^Context 16384 failed \(busy\); the GPU may still be busy/);
    expect(startingContextSize()).toBe(16384);
  });

  test("failing at the smallest size gives up", async () => {
    localStorage.setItem("ctxSize:Llama-3.2-1B-Instruct-q4f16_1-MLC", "4096");
    mocks.create = () => Promise.reject(new Error("no adapter"));
    const onStatus = vi.fn();
    expect(await loadModel(onStatus)).toBeNull();
    expect(onStatus).toHaveBeenCalledWith("Model failed to load at every context size (16384, 8192, 4096 tokens).");
    expect(startingContextSize()).toBe(16384);
  });
});

describe("page reload hand-offs", () => {
  test("a notice and a same-size retry survive one reload, then are used up", () => {
    reloadPage({ notice: "Stopped.", retrySameSize: true });
    expect(location.reload).toHaveBeenCalled();
    expect(takeReloadNotice()).toBe("Stopped.");
    expect(takeReloadNotice()).toBe("");
    expect(takeRetrySameSize()).toBe(true);
    expect(takeRetrySameSize()).toBe(false);
  });
});
