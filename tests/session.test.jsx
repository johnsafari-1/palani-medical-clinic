import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
const mock = vi.hoisted(() => ({ from: vi.fn(), getSession: vi.fn(), signOut: vi.fn(), callback: null }));
vi.mock("../src/supabaseClient", () => ({ supabase: { from: mock.from, auth: {
  getSession: mock.getSession, signOut: mock.signOut,
  onAuthStateChange: (callback) => { mock.callback = callback; return { data: { subscription: { unsubscribe: vi.fn() } } }; },
} } }));
vi.mock("../src/components/LoginScreen", () => ({ default: () => <div>Sign in screen</div> }));
vi.mock("../src/components/AdminDashboard", () => ({ default: ({ staff, onLogout }) => <div>Admin {staff.name}<button onClick={onLogout}>Logout</button></div> }));
vi.mock("../src/components/DoctorDashboard", () => ({ default: ({ staff }) => <div>Doctor {staff.name}</div> }));
import App from "../src/App";
function deferred() { let resolve; const promise = new Promise((r) => { resolve = r; }); return { promise, resolve }; }
function emit(id, token = id) { act(() => mock.callback("SIGNED_IN", id ? { user: { id }, access_token: token } : null)); }
let requests;
beforeEach(() => {
  requests = [];
  mock.getSession.mockResolvedValue({ data: { session: null } });
  mock.signOut.mockResolvedValue({ error: null });
  mock.from.mockImplementation(() => ({ select: () => ({ eq: (_column, id) => ({ single: () => {
    const request = deferred(); requests.push({ id, ...request }); return request.promise;
  } }) }) }));
});
afterEach(cleanup);
describe("staff session isolation", () => {
  it("clears a prior dashboard before the next account profile arrives", async () => {
    render(<App />); emit("a");
    await act(async () => requests[0].resolve({ data: { id: "a", name: "Alice", role: "Admin", active: true } }));
    expect(screen.getByText("Admin Alice")).toBeTruthy();
    emit("b");
    expect(screen.queryByText("Admin Alice")).toBeNull();
    expect(screen.getByText("Verifying your staff access…")).toBeTruthy();
    await act(async () => requests[1].resolve({ data: { id: "b", name: "Bob", role: "Doctor", active: true } }));
    expect(screen.getByText("Doctor Bob")).toBeTruthy();
  });
  it("discards late profiles after sign-out and account switches", async () => {
    render(<App />); emit("a"); emit("b"); emit(null);
    await act(async () => requests.forEach((request) => request.resolve({ data: { id: request.id, name: "Late", role: "Admin" } })));
    expect(screen.getByText("Sign in screen")).toBeTruthy();
    expect(screen.queryByText("Admin Late")).toBeNull();
  });
  it.each([
    [{ id: "a", role: "Admin", active: false }, "deactivated"],
    [{ id: "a", role: "Superuser", active: true }, "supported staff role"],
    [{ id: "someone-else", role: "Admin" }, "Unable to verify"],
    [null, "Unable to verify"],
  ])("denies an invalid staff profile", async (data, message) => {
    render(<App />); emit("a");
    await act(async () => requests[0].resolve({ data }));
    expect(screen.getByText(new RegExp(message))).toBeTruthy();
    expect(screen.queryByText(/Admin /)).toBeNull();
  });
  it("rechecks access on focus and hides the dashboard on query failure", async () => {
    render(<App />); emit("a");
    await act(async () => requests[0].resolve({ data: { id: "a", name: "Alice", role: "Admin" } }));
    fireEvent(window, new Event("focus"));
    await act(async () => requests[1].resolve({ data: null, error: { message: "offline" } }));
    expect(screen.queryByText("Admin Alice")).toBeNull();
    expect(screen.getByText(/Unable to verify/)).toBeTruthy();
  });
  it("does not restore an old session snapshot after an auth event", async () => {
    const initial = deferred(); mock.getSession.mockReturnValue(initial.promise);
    render(<App />); emit(null);
    await act(async () => initial.resolve({ data: { session: { user: { id: "a" }, access_token: "a" } } }));
    expect(screen.getByText("Sign in screen")).toBeTruthy();
    expect(requests).toHaveLength(0);
  });
  it("hides patient UI immediately when logout fails", async () => {
    mock.signOut.mockResolvedValue({ error: new Error("offline") });
    render(<App />); emit("a");
    await act(async () => requests[0].resolve({ data: { id: "a", name: "Alice", role: "Admin" } }));
    await act(async () => fireEvent.click(screen.getByText("Logout")));
    expect(screen.queryByText("Admin Alice")).toBeNull();
    expect(screen.getByText(/Sign-out could not be completed/)).toBeTruthy();
  });
});
