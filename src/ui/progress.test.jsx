// @vitest-environment jsdom

import { cleanup, render, renderHook, screen } from "@testing-library/react";
import { afterEach, expect, test } from "vitest";
import PixelBar from "./PixelBar.jsx";
import { useLoadProgress } from "./useLoadProgress.js";

afterEach(cleanup);

test("PixelBar shows a percentage, or scans when the value is null", () => {
  const { rerender } = render(<PixelBar label="Loop" value={42.4} />);
  expect(screen.getByRole("progressbar", { name: "Loop" }).getAttribute("aria-valuenow")).toBe("42");
  expect(screen.getByText("42%")).toBeTruthy();

  rerender(<PixelBar label="Loop" value={null} />);
  expect(screen.getByRole("progressbar", { name: "Loop" }).getAttribute("aria-valuenow")).toBeNull();
  expect(screen.getByText("...")).toBeTruthy();
});

test("useLoadProgress follows WebLLM's status text and never goes backwards", () => {
  const { result, rerender } = renderHook(({ status, ready }) => useLoadProgress(status, ready), {
    initialProps: { status: "Loading model...", ready: false },
  });
  expect(result.current).toEqual({ load: 0, warm: 0 });

  rerender({ status: "[ctx 16384] Fetching param cache[1/10]: 50% completed", ready: false });
  expect(result.current.load).toBeCloseTo(42.5);
  rerender({ status: "[ctx 16384] Fetching param cache[1/10]: 10% completed", ready: false });
  expect(result.current.load).toBeCloseTo(42.5);

  rerender({ status: "Loading GPU shader modules: 50% completed", ready: false });
  expect(result.current.load).toBeCloseTo(92.5);
  rerender({ status: "Finish loading on WebGPU", ready: false });
  expect(result.current.load).toBe(100);

  rerender({ status: "[ctx 16384] Warming up...", ready: false });
  expect(result.current).toEqual({ load: 100, warm: null });
  rerender({ status: "Something failed", ready: false });
  expect(result.current.warm).toBe(0);

  rerender({ status: "Ready", ready: true });
  expect(result.current).toEqual({ load: 100, warm: 100 });
});
