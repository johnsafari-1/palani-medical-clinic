import React from "react";
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import Header from "./Header";
afterEach(cleanup);
const staff = { name: "Test Doctor", role: "Doctor" };
it("opens navigation and returns focus to its toggle on Escape", () => {
  render(<Header staff={staff} onLogout={vi.fn()} />);
  fireEvent.click(screen.getByRole("button", { name: "Open navigation" }));
  expect(screen.getByRole("button", { name: "Close navigation" }).getAttribute("aria-expanded")).toBe("true");
  expect(document.activeElement).toBe(screen.getByRole("button", { name: "My workspace" }));
  fireEvent.keyDown(document.activeElement, { key: "Escape" });
  expect(document.activeElement).toBe(screen.getByRole("button", { name: "Open navigation" }));
});
it("switches an existing section and focuses content without route navigation", async () => {
  const choose = vi.fn();
  render(<><Header staff={{ ...staff, role: "Admin" }} navigation={[{ key: "staff", label: "Staff accounts" }, { key: "audit", label: "Audit log", onSelect: choose }]} activeItem="staff" /><div id="clinic-content" tabIndex={-1}>Content</div></>);
  fireEvent.click(screen.getByRole("button", { name: "Audit log" }));
  expect(choose).toHaveBeenCalledTimes(1);
  await waitFor(() => expect(document.activeElement.id).toBe("clinic-content"));
});
it("shows only the department workspace and preserves sign out", () => {
  const logout = vi.fn();render(<Header staff={staff} onLogout={logout} />);
  expect(screen.queryByText("Staff accounts")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Sign out" }));expect(logout).toHaveBeenCalledTimes(1);
  expect(screen.getByRole("link", { name: "Skip to workspace" }).getAttribute("href")).toBe("#clinic-content");
});
