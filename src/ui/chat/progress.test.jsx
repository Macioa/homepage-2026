// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, test } from "vitest";
import PixelBar from "./PixelBar.jsx";

afterEach(cleanup);

test("PixelBar shows a percentage, or scans when the value is null", () => {
  const { rerender } = render(<PixelBar label="Loop" value={42.4} />);
  expect(screen.getByRole("progressbar", { name: "Loop" }).getAttribute("aria-valuenow")).toBe("42");
  expect(screen.getByText("42%")).toBeTruthy();

  rerender(<PixelBar label="Loop" value={null} />);
  expect(screen.getByRole("progressbar", { name: "Loop" }).getAttribute("aria-valuenow")).toBeNull();
  expect(screen.getByText("...")).toBeTruthy();
});
