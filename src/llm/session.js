// The in-browser LLM as one object: load it, ask it, stop it, reload it. No UI framework here.

import { MODEL, RELOAD_DELAY_MS } from "./config.js";
import { rememberContextSize, smallerContextSize } from "./contextSize.js";
import { isContextOverflow, unloadEngine } from "./engine.js";
import { streamReply } from "./generate.js";
import { loadModel } from "./loadModel.js";
import { reloadPage, reloadPageAfter } from "./pageReload.js";
import { estimateTokens, firstTokenTimeoutMs, prefillRate } from "./prefillTiming.js";
import { startWatchdog } from "./watchdog.js";

const STOP_NOTES = {
  user: "Stopped",
  reload: "Stopped",
  timeout: "Stopped: timed out",
  stalled: "Stopped: generation stalled",
};

const MID_READ_NOTICES = {
  timeout: "Stopped: the prompt took too long to read, so the page was reloaded. Try a shorter prompt.",
  other: "Stopped while reading the prompt, so the page was reloaded.",
};

export class LlmSession {
  #engine = null;
  #contextSize = null;
  #readingPrompt = false;
  #stopReason = null;
  #currentAsk = null; // promise for the ask() in progress

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

  // Streams the reply to onText. Notes such as "[Stopped]" and errors are streamed too.
  ask(prompt, onText) {
    this.#currentAsk = this.#runAsk(prompt, onText).finally(() => {
      this.#currentAsk = null;
    });
    return this.#currentAsk;
  }

  // reason: "user" | "reload" | "timeout" | "stalled".
  // WebLLM only checks interrupts between generated tokens, so while the prompt is still
  // being read the only way to stop is reloading the page.
  stop(reason) {
    this.#stopReason = reason;
    if (this.#readingPrompt) {
      reloadPage({
        notice: MID_READ_NOTICES[reason] ?? MID_READ_NOTICES.other,
        retrySameSize: true,
      });
      return;
    }
    this.#engine?.interruptGenerate();
  }

  // Stop cleanly, free the GPU, then start over on a fresh page.
  async reload() {
    if (this.#currentAsk) {
      this.stop("reload");
      await this.#currentAsk;
    }
    await unloadEngine(this.#engine);
    reloadPage();
  }

  async #runAsk(prompt, onText) {
    this.#stopReason = null;
    this.#readingPrompt = true;
    const watchdog = this.#startPromptWatchdog(prompt);

    try {
      await streamReply(this.#engine, prompt, {
        onFirstToken: () => {
          this.#readingPrompt = false;
          this.#reportReady();
        },
        onText: (text) => {
          watchdog.tokenArrived();
          onText(text);
        },
      });
      if (this.#stopReason) onText(`\n\n[${STOP_NOTES[this.#stopReason]}]`);
    } catch (err) {
      await this.#handleAskFailure(err, onText);
    } finally {
      watchdog.cancel();
      this.#readingPrompt = false;
      this.#reportReady();
    }
  }

  #startPromptWatchdog(prompt) {
    const tokens = estimateTokens(prompt);
    const rate = prefillRate();
    const timeoutMs = firstTokenTimeoutMs(tokens, rate);
    this.onStatus(`Reading ~${tokens} tokens at ~${rate} tok/s (timeout ${Math.round(timeoutMs / 1000)}s)...`);
    return startWatchdog(timeoutMs, (reason) => this.stop(reason));
  }

  async #handleAskFailure(err, onText) {
    console.error("Chat failed:", err);
    if (isContextOverflow(err)) {
      onText(`Error: ${err.message}`);
      return;
    }

    // Most likely a lost GPU device. Reload one size smaller, or at the same size at the bottom.
    onText(`Error: ${err.message}\n\nThe GPU may have run out of memory. Reloading the page...`);
    await unloadEngine(this.#engine);
    rememberContextSize(smallerContextSize(this.#contextSize) ?? this.#contextSize);
    await reloadPageAfter(RELOAD_DELAY_MS);
  }

  #reportReady() {
    if (this.#contextSize) this.onStatus(`Ready: ${MODEL} (context ${this.#contextSize} tokens)`);
  }
}
