import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { AuthContext } from "./AuthProvider";
import { AppRoutes } from "../App";
import { ROLE_PATHS, destinationAfterLogin, homeForRole } from "./roles";
import { supabase } from "../supabaseClient";

vi.mock("../supabaseClient", () => ({
  supabase: { auth: { signInWithPassword: vi.fn() } },
  usernameToEmail: (value) => `${value.trim()}@palani.local`,
}));
vi.mock("../components/AdminDashboard", () => ({ default: () => <h1>Admin dashboard data</h1> }));
vi.mock("../components/ReceptionistDashboard", () => ({ default: () => <h1>Receptionist dashboard data</h1> }));
vi.mock("../components/DoctorDashboard", () => ({ default: () => <h1>Doctor dashboard data</h1> }));
vi.mock("../components/NurseDashboard", () => ({ default: () => <h1>Nurse dashboard data</h1> }));
vi.mock("../components/LabDashboard", () => ({ default: () => <h1>Lab Technician dashboard data</h1> }));
vi.mock("../components/PharmacyDashboard", () => ({ default: () => <h1>Pharmacist dashboard data</h1> }));
vi.mock("../components/CashierDashboard", () => ({ default: () => <h1>Cashier dashboard data</h1> }));

function Location() {
  const location = useLocation();
  return <div data-testid="location">{location.pathname}{location.search}</div>;
}
const authState = (role) => ({ status: "authenticated", staff: { id: "staff-a", role, active: true }, user: { id: "staff-a" }, retry: vi.fn(), signOut: vi.fn() });
const signedOut = { status: "signed-out", user: null, staff: null, retry: vi.fn(), signOut: vi.fn() };
function tree(auth, path, state) {
  return <AuthContext.Provider value={auth}><MemoryRouter initialEntries={[{ pathname: path, state }]}><AppRoutes /><Location /></MemoryRouter></AuthContext.Provider>;
}
afterEach(cleanup);

describe("role-protected app routes", () => {
  const pairs = Object.entries(ROLE_PATHS).flatMap(([userRole]) => Object.entries(ROLE_PATHS).map(([routeRole, path]) => [userRole, routeRole, path]));
  it.each(pairs)("%s visiting the %s route receives only permitted content", (userRole, routeRole, path) => {
    render(tree(authState(userRole), path));
    if (userRole === routeRole) {
      expect(screen.getByText(`${userRole} dashboard data`)).toBeTruthy();
    } else {
      expect(screen.getByText("Access denied")).toBeTruthy();
      expect(screen.queryByText(/dashboard data/)).toBeNull();
      expect(screen.getByText("Go to my dashboard").getAttribute("href")).toBe(ROLE_PATHS[userRole]);
    }
  });

  it.each(Object.entries(ROLE_PATHS))("redirects unauthenticated direct access to %s", async (_role, path) => {
    render(tree(signedOut, path));
    await waitFor(() => expect(screen.getByTestId("location").textContent).toBe("/login"));
    expect(screen.queryByText(/dashboard data/)).toBeNull();
    expect(screen.getByRole("button", { name: "Sign in" })).toBeTruthy();
  });

  it.each(Object.entries(ROLE_PATHS))("routes %s from /app to its assigned dashboard", async (role, path) => {
    render(tree(authState(role), "/app"));
    await waitFor(() => expect(screen.getByTestId("location").textContent).toBe(path));
  });

  it.each(["loading", "error", "blocked"])("never mounts a dashboard while auth is %s", (status) => {
    render(tree({ ...signedOut, status, error: "Cannot verify access" }, "/app/admin"));
    expect(screen.queryByText(/dashboard data/)).toBeNull();
    expect(screen.getByRole(status === "loading" ? "status" : "alert")).toBeTruthy();
  });

  it("removes dashboard content on logout and redirects after signout", async () => {
    const view = render(tree(authState("Doctor"), "/app/doctor"));
    expect(screen.getByText("Doctor dashboard data")).toBeTruthy();
    view.rerender(tree({ ...signedOut, status: "loading" }, "/app/doctor"));
    expect(screen.queryByText(/dashboard data/)).toBeNull();
    view.rerender(tree(signedOut, "/app/doctor"));
    await waitFor(() => expect(screen.getByTestId("location").textContent).toBe("/login"));
  });

  it("ignores a login redirect to another department", async () => {
    render(tree(authState("Doctor"), "/login", { from: { pathname: "/app/admin" } }));
    await waitFor(() => expect(screen.getByTestId("location").textContent).toBe("/app/doctor"));
  });

  it("only restores a local, role-permitted destination", () => {
    expect(destinationAfterLogin("Doctor", { pathname: "https://example.com" })).toBe("/app/doctor");
    expect(destinationAfterLogin("Doctor", { pathname: "//example.com" })).toBe("/app/doctor");
    expect(destinationAfterLogin("Doctor", { pathname: "/app/doctor", search: "?queue=today" })).toBe("/app/doctor?queue=today");
    expect(homeForRole("toString")).toBeNull();
  });

  it("offers retry and signout when access verification fails", () => {
    const auth = { ...signedOut, status: "error", error: "Connection unavailable" };
    render(tree(auth, "/app/doctor"));
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(auth.retry).toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /Back to sign in/ }));
    expect(auth.signOut).toHaveBeenCalled();
  });
});

describe("staff password login", () => {
  function fillAndSubmit() {
    fireEvent.change(screen.getByLabelText("Username"), { target: { value: " doctor1 " } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: " secret pass " } });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
  }

  it("does not let the role card choose the account's authorization", async () => {
    supabase.auth.signInWithPassword.mockResolvedValueOnce({ error: { code: "invalid_credentials" } });
    render(tree(signedOut, "/login"));
    fireEvent.click(screen.getByTitle("Fill the form for a Administrator login"));
    fillAndSubmit();
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("incorrect"));
    expect(supabase.auth.signInWithPassword).toHaveBeenCalledWith({ email: "doctor1@palani.local", password: " secret pass " });
    expect(screen.getByRole("button", { name: "Sign in" }).disabled).toBe(false);
  });

  it("recovers its submit button after a network exception", async () => {
    supabase.auth.signInWithPassword.mockRejectedValueOnce(new Error("offline"));
    render(tree(signedOut, "/login")); fillAndSubmit();
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("connection"));
    expect(screen.getByRole("button", { name: "Sign in" }).disabled).toBe(false);
  });
});
