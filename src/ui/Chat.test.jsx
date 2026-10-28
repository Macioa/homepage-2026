// @vitest-environment jsdom
// The chat UI end to end with a fake LlmSession: greeting, Send through the harness (caveman rewrite,
// then the loop), step line, loop bar, typed answer, Stop.

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Provider } from "react-redux";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

const llm = vi.hoisted(() => ({ replies: [], seen: [], stop: null }));

vi.mock("../llm/session.js", () => ({
  LlmSession: class {
    constructor({ onStatus, onReady }) {
      this.onStatus = onStatus;
      this.onReady = onReady;
    }
    async load() {
      this.onStatus("Ready: test model");
      this.onReady();
    }
    complete(messages, options) {
      llm.seen.push({ messages, options });
      const reply = llm.replies.shift();
      if (typeof reply === "function") return reply();
      return Promise.resolve(typeof reply === "string" ? reply : JSON.stringify(reply));
    }
    stop(reason) {
      llm.stop?.(reason);
    }
  },
}));

const { store } = await import("../store/index.ts");
const { default: Chat } = await import("./Chat.jsx");

beforeEach(() => {
  vi.stubGlobal("matchMedia", () => ({ matches: false }));
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
  llm.seen = [];
});
afterEach(cleanup);

const loopBar = () => screen.getByRole("progressbar", { name: "Loop" });
const screenText = () => document.querySelector(".reply").textContent;

test("greets, runs a prompt through the harness, shows progress, types the answer", async () => {
  let answer;
  llm.replies = [
    "about his React work?",
    { type: "tool", tool: "search_projects", args: { query: "react" } },
    () => new Promise((resolve) => (answer = resolve)),
  ];
  render(
    <Provider store={store}>
      <Chat />
    </Provider>,
  );

  await vi.waitFor(() => expect(screenText()).toMatch(/^Wake up, visitor/), { timeout: 5000 });
  expect(loopBar().getAttribute("aria-valuenow")).toBe("0");

  fireEvent.change(screen.getByRole("textbox"), { target: { value: "Could you tell me about his React work?" } });
  fireEvent.click(screen.getByRole("button", { name: "Send" }));

  // First the prompt is rewritten caveman (plain text); step 1 calls a tool; step 2 waits on the model.
  await vi.waitFor(() => expect(screenText()).toBe("> step 2 · thinking..."), { timeout: 3000 });
  expect(loopBar().getAttribute("aria-valuenow")).toBeNull();
  expect(screen.getByRole("button", { name: "Generating..." }).disabled).toBe(true);
  expect(llm.seen[0].messages.at(-1).content).toBe('Delete filler: "Could you tell me about his React work?"');
  expect(llm.seen[0].options.responseFormat).toBeUndefined();
  expect(llm.seen[1].messages.at(-1).content).toBe("about his React work?");
  expect(llm.seen[1].options.responseFormat.type).toBe("json_object");

  await act(async () =>
    answer(JSON.stringify({ type: "final", answer: "He built this site.", used: ["search_projects#1"] })),
  );
  await vi.waitFor(() => expect(screenText()).toBe("He built this site."), { timeout: 3000 });
  expect(loopBar().getAttribute("aria-valuenow")).toBe("100");
  expect(store.getState().harness.history.at(-1)).toMatchObject({ status: "done", answer: "He built this site." });
});

test("Stop ends the running turn", async () => {
  // The store is shared: the first test's answer is rewritten caveman before step 1 hangs.
  llm.replies = ["built this site.", () => new Promise(() => {})];
  llm.stop = vi.fn();
  render(
    <Provider store={store}>
      <Chat />
    </Provider>,
  );
  await vi.waitFor(() => expect(screen.getByRole("button", { name: "Send" }).disabled).toBe(false));

  fireEvent.change(screen.getByRole("textbox"), { target: { value: "Slow question" } });
  fireEvent.click(screen.getByRole("button", { name: "Send" }));
  await vi.waitFor(() => expect(screenText()).toBe("> step 1 · thinking..."), { timeout: 3000 });
  fireEvent.click(screen.getByRole("button", { name: "Stop" }));

  await vi.waitFor(() => expect(screenText()).toBe("Stopped by user at step 1."), { timeout: 3000 });
  expect(llm.stop).toHaveBeenCalledWith("user");
});
