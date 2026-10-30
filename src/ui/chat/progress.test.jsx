// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, test } from "vitest";
import PixelBar from "./PixelBar.jsx";

afterEach(cleanup);

test("PixelBar shows a rounded value, or scans when the value is null", () => {
  const { rerender } = render(<PixelBar label="Loop" value={42.4} />);
  expect(screen.getByRole("progressbar", { name: "Loop" }).getAttribute("aria-valuenow")).toBe("42");
  expect(screen.getByText("Loop")).toBeTruthy();

  rerender(<PixelBar label="Loop" value={null} />);
  expect(screen.getByRole("progressbar", { name: "Loop" }).getAttribute("aria-valuenow")).toBeNull();
});

test("PixelBar hideLabel drops the visible label but keeps the accessible name", () => {
  render(<PixelBar label="Loop" hideLabel value={10} />);
  expect(screen.getByRole("progressbar", { name: "Loop" })).toBeTruthy();
  expect(screen.queryByText("Loop")).toBeNull();
});
