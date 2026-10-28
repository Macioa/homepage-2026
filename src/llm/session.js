// The in-browser LLM as one object: load it, complete with it, stop it, reload it. No UI framework here.

import { MODEL, RELOAD_DELAY_MS, STALL_TIMEOUT_MS } from "./config.js";
import { rememberContextSize, smallerContextSize } from "./contextSize.js";
import { isContextOverflow, unloadEngine } from "./engine.js";
import { streamReply } from "./generate.js";
import { loadModel } from "./loadModel.js";
import { reloadPage, reloadPageAfter } from "./pageReload.js";
import { estimateTokens, firstTokenTimeoutMs, prefillRate } from "./prefillTiming.js";
import { startWatchdog } from "./watchdog.js";

const seconds = (ms) => `${Math.round(ms / 1000)} s`;
const describeRead = (read) => `~${read.tokens} prompt tokens at ~${read.rate} tok/s`;

// Why complete() rejected. read: { tokens, rate, timeoutMs } for the current prompt.
const STOP_ERRORS = {
  user: () => "Stopped by user.",
  reload: () => "Stopped for a page reload.",
  timeout: (read) => `Timed out: no first token within ${seconds(read.timeoutMs)} (${describeRead(read)}).`,
  stalled: () => `Stalled: no new token for ${seconds(STALL_TIMEOUT_MS)}.`,
};

// Shown on the next page after a stop during prompt reading forced a reload. A reload the user asked for needs none.
const MID_READ_NOTICES = {
  timeout: (read) =>
    `Timed out: prompt reading passed its ${seconds(read.timeoutMs)} limit (${describeRead(read)}). ` +
    "Prompt reading can't be interrupted, so the page reloaded.",
  user: () => "Stopped by user during prompt reading. Prompt reading can't be interrupted, so the page reloaded.",
};

export class LlmSession {
  #engine = null;
  #contextSize = null;
  #readingPrompt = false;
  #stopReason = null;
  #read = null; // { tokens, rate, timeoutMs } of the prompt being read
  #current = null; // promise for the complete() in progress

  // onStatus(text) reports progress; onReady() fires once the model can be asked.
  constructor({ onStatus, onReady }) {
    this.onStatus = onStatus;
    this.onReady = onReady;
  }

  async load() {
    const loaded = await loadModel(this.onStatus);
    if (!loaded) return;
    this.#engine = loaded.engine;
    this.#contextSize = loaded.contextSize;
    this.#reportReady();
    this.onReady();
  }

  // Resolves to the full reply text. Rejects when stopped or when generation fails
  // (after a GPU failure the page also reloads). responseFormat turns on JSON mode.
  complete(messages, { responseFormat, maxTokens } = {}) {
    this.#current = this.#runComplete(messages, { responseFormat, maxTokens }).finally(() => {
      this.#current = null;
    });
    return this.#current;
  }

  // reason: "user" | "reload" | "timeout" | "stalled".
  // WebLLM only checks interrupts between generated tokens, so while the prompt is still
  // being read the only way to stop is reloading the page.
  stop(reason) {
    this.#stopReason = reason;
    if (this.#readingPrompt) {
      reloadPage({
        notice: MID_READ_NOTICES[reason]?.(this.#read),
        retrySameSize: true,
      });
      return;
    }
    this.#engine?.interruptGenerate();
  }

  // Stop cleanly, free the GPU, then start over on a fresh page.
  async reload() {
    if (this.#current) {
      this.stop("reload");
      await this.#current.catch(() => {});
    }
    await unloadEngine(this.#engine);
    reloadPage();
  }

  async #runComplete(messages, options) {
    this.#stopReason = null;
    this.#readingPrompt = true;
    const watchdog = this.#startPromptWatchdog(messages);
    let reply = "";

    try {
      await streamReply(this.#engine, messages, {
        ...options,
        onFirstToken: () => {
          this.#readingPrompt = false;
          this.#reportReady();
        },
        onText: (text) => {
          watchdog.tokenArrived();
          reply += text;
        },
      });
    } catch (err) {
      await this.#handleFailure(err);
      throw err;
    } finally {
      watchdog.cancel();
      this.#readingPrompt = false;
      this.#reportReady();
    }

    if (this.#stopReason) throw new Error(STOP_ERRORS[this.#stopReason](this.#read));
    return reply;
  }

  #startPromptWatchdog(messages) {
    const tokens = estimateTokens(messages.map((m) => m.content).join("\n"));
    const rate = prefillRate();
    const timeoutMs = firstTokenTimeoutMs(tokens, rate);
    this.#read = { tokens, rate, timeoutMs };
    this.onStatus(`Reading ~${tokens} tokens at ~${rate} tok/s (timeout ${seconds(timeoutMs)})...`);
    return startWatchdog(timeoutMs, (reason) => this.stop(reason));
  }

  async #handleFailure(err) {
    console.error("Generation failed:", err);
    if (isContextOverflow(err)) return;

    // Most likely a lost GPU device. Reload one size smaller, or at the same size at the bottom.
    const next = smallerContextSize(this.#contextSize) ?? this.#contextSize;
    this.onStatus(`GPU error: ${err.message}. Reloading the page with a ${next}-token context.`);
    await unloadEngine(this.#engine);
    rememberContextSize(next);
    await reloadPageAfter(RELOAD_DELAY_MS);
  }

  #reportReady() {
    if (this.#contextSize) this.onStatus(`Ready: ${MODEL} (context ${this.#contextSize} tokens)`);
  }
}
