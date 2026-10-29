// @vitest-environment jsdom
// The chat UI end to end with a fake onSend: greeting, Send, loop bar, typed answer, Stop.

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import Chat from "./Chat.jsx";

beforeEach(() => {
  vi.stubGlobal("matchMedia", () => ({ matches: false }));
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
});
afterEach(cleanup);

const loopBar = () => screen.getByRole("progressbar", { name: "Loop" });
const screenText = () => document.querySelector(".reply").textContent;

function ask(text) {
  fireEvent.change(screen.getByRole("textbox"), { target: { value: text } });
  fireEvent.click(screen.getByRole("button", { name: "Send" }));
}

test("greets, sends a prompt, shows progress, types the answer", async () => {
  let answer;
  const onSend = vi.fn(() => new Promise((resolve) => (answer = resolve)));
  render(<Chat onSend={onSend} />);

  await vi.waitFor(() => expect(screenText()).toMatch(/^Wake up, visitor/), { timeout: 5000 });
  expect(loopBar().getAttribute("aria-valuenow")).toBe("0");

  ask("Tell me about his React work");
  await vi.waitFor(() => expect(screenText()).toBe("> thinking..."));
  expect(onSend.mock.calls[0][0]).toBe("Tell me about his React work");
  expect(loopBar().getAttribute("aria-valuenow")).toBeNull();
  expect(screen.getByRole("button", { name: "Generating..." }).disabled).toBe(true);

  await act(async () => answer("He built this site."));
  await vi.waitFor(() => expect(screenText()).toBe("He built this site."), { timeout: 3000 });
  expect(loopBar().getAttribute("aria-valuenow")).toBe("100");
});

test("Stop aborts the running send", async () => {
  const onSend = (_prompt, signal) =>
    new Promise((_, reject) => signal.addEventListener("abort", () => reject(new Error("aborted"))));
  render(<Chat onSend={onSend} />);

  ask("Slow question");
  await vi.waitFor(() => expect(screenText()).toBe("> thinking..."));
  fireEvent.click(screen.getByRole("button", { name: "Stop" }));
  await vi.waitFor(() => expect(screenText()).toBe("Stopped by user."), { timeout: 3000 });
});

test("Send is disabled without onSend", () => {
  render(<Chat />);
  expect(screen.getByRole("button", { name: "Send" }).disabled).toBe(true);
});
