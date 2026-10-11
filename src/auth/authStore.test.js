import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createAuthStore } from "./authStore";

const candidate = (id = "staff-a") => ({ user: { id }, access_token: `token-${id}` });
const profile = (id = "staff-a", role = "Doctor") => ({ id, name: "Staff", role, active: true });
const deferred = () => {
  let resolve;
  const promise = new Promise((r) => { resolve = r; });
  return { promise, resolve };
};

function harness() {
  let callback;
  const unsubscribe = vi.fn();
  const query = { select: vi.fn(), eq: vi.fn(), maybeSingle: vi.fn() };
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  query.maybeSingle.mockResolvedValue({ data: profile(), error: null });
  const client = {
    auth: {
      onAuthStateChange: vi.fn((cb) => { callback = cb; return { data: { subscription: { unsubscribe } } }; }),
      getUser: vi.fn(async (token) => ({ data: { user: { id: token.slice(6) } }, error: null })),
      getSession: vi.fn(async () => ({ data: { session: null }, error: null })),
      signOut: vi.fn(async () => ({ error: null })),
    },
    from: vi.fn(() => query),
  };
  const store = createAuthStore(client, { timeoutMs: 1000 });
  store.start();
  return { client, query, store, unsubscribe, emit: (session, event = "SIGNED_IN") => callback(event, session) };
}

describe("verified staff access", () => {
  let h;
  beforeEach(() => { vi.useFakeTimers(); h = harness(); });
  afterEach(() => { h.store.stop(); vi.useRealTimers(); });
  const flush = () => vi.advanceTimersByTimeAsync(1);

  it("starts with no dashboard and handles INITIAL_SESSION while signed out", () => {
    expect(h.store.getSnapshot().status).toBe("loading");
    h.emit(null, "INITIAL_SESSION");
    expect(h.store.getSnapshot().status).toBe("signed-out");
    expect(h.client.auth.getUser).not.toHaveBeenCalled();
  });

  it("validates a restored token and staff membership outside the auth callback", async () => {
    h.emit(candidate(), "INITIAL_SESSION");
    expect(h.client.auth.getUser).not.toHaveBeenCalled();
    expect(h.store.getSnapshot().staff).toBeNull();
    await flush();
    expect(h.client.auth.getUser).toHaveBeenCalledWith("token-staff-a");
    expect(h.query.eq).toHaveBeenCalledWith("id", "staff-a");
    expect(h.store.getSnapshot().status).toBe("authenticated");
  });

  it.each(["Admin", "Receptionist", "Doctor", "Nurse", "Lab Technician", "Pharmacist", "Cashier"])("accepts an active %s assigned by the database", async (role) => {
    h.query.maybeSingle.mockResolvedValue({ data: profile("staff-a", role), error: null });
    h.emit(candidate()); await flush();
    expect(h.store.getSnapshot().staff.role).toBe(role);
  });

  it.each([
    [null, "No staff profile"],
    [{ ...profile(), active: false }, "deactivated"],
    [{ ...profile(), active: null }, "deactivated"],
    [{ ...profile(), role: "Owner" }, "supported staff role"],
    [profile("different-user"), "No staff profile"],
  ])("denies missing, inactive, unsupported, and mismatched profiles", async (data, message) => {
    h.query.maybeSingle.mockResolvedValue({ data, error: null });
    h.emit(candidate()); await flush();
    expect(h.store.getSnapshot()).toMatchObject({ status: "blocked", staff: null, user: null });
    expect(h.store.getSnapshot().error).toContain(message);
  });

  it("does not trust a forged local user or an expired token", async () => {
    h.client.auth.getUser.mockResolvedValueOnce({ data: { user: null }, error: new Error("expired") });
    h.emit(candidate()); await flush();
    expect(h.store.getSnapshot().status).toBe("error");
    expect(h.client.from).not.toHaveBeenCalled();
    h.client.auth.getUser.mockResolvedValueOnce({ data: { user: { id: "someone-else" } }, error: null });
    await h.store.retry(); await flush();
    expect(h.store.getSnapshot().status).toBe("error");
    expect(h.client.from).not.toHaveBeenCalled();
  });

  it("blocks access on query failure and allows an explicit retry", async () => {
    h.query.maybeSingle.mockResolvedValueOnce({ data: null, error: new Error("offline") });
    h.emit(candidate()); await flush();
    expect(h.store.getSnapshot().status).toBe("error");
    await h.store.retry(); await flush();
    expect(h.store.getSnapshot().status).toBe("authenticated");
  });

  it("does not restore a dashboard when a profile request finishes after logout", async () => {
    const slow = deferred();
    h.query.maybeSingle.mockReturnValueOnce(slow.promise);
    h.emit(candidate()); await flush();
    h.emit(null, "SIGNED_OUT");
    slow.resolve({ data: profile(), error: null }); await flush();
    expect(h.store.getSnapshot()).toMatchObject({ status: "signed-out", staff: null });
  });

  it("clears the previous dashboard and ignores late responses across account switches", async () => {
    h.emit(candidate()); await flush();
    const slow = deferred();
    h.query.maybeSingle.mockReturnValueOnce(slow.promise);
    h.store.revalidate(); await flush();
    h.emit(candidate("staff-b"));
    expect(h.store.getSnapshot()).toMatchObject({ status: "loading", staff: null });
    h.query.maybeSingle.mockResolvedValue({ data: profile("staff-b", "Nurse"), error: null });
    await flush();
    slow.resolve({ data: profile(), error: null }); await flush();
    expect(h.store.getSnapshot().staff).toMatchObject({ id: "staff-b", role: "Nurse" });
  });

  it("preserves a same-user dashboard during refresh, then removes deactivated access", async () => {
    h.emit(candidate()); await flush();
    h.query.maybeSingle.mockResolvedValue({ data: { ...profile(), active: false }, error: null });
    h.emit(candidate(), "TOKEN_REFRESHED");
    expect(h.store.getSnapshot().status).toBe("authenticated");
    await flush();
    expect(h.store.getSnapshot()).toMatchObject({ status: "blocked", staff: null });
  });

  it("times out safely and discards a late successful response", async () => {
    const slow = deferred();
    h.client.auth.getUser.mockReturnValueOnce(slow.promise);
    h.emit(candidate()); await flush();
    await vi.advanceTimersByTimeAsync(1000);
    expect(h.store.getSnapshot().status).toBe("error");
    slow.resolve({ data: { user: { id: "staff-a" } }, error: null }); await flush();
    expect(h.store.getSnapshot().staff).toBeNull();
  });

  it("reports a failed initial session load and can recover", async () => {
    await vi.advanceTimersByTimeAsync(1000);
    expect(h.store.getSnapshot().status).toBe("error");
    await h.store.retry();
    expect(h.store.getSnapshot().status).toBe("signed-out");
  });

  it("unsubscribes and prevents late requests from changing state after cleanup", async () => {
    const slow = deferred();
    h.client.auth.getUser.mockReturnValueOnce(slow.promise);
    h.emit(candidate()); await flush();
    h.store.stop();
    slow.resolve({ data: { user: { id: "staff-a" } }, error: null }); await flush();
    expect(h.unsubscribe).toHaveBeenCalledOnce();
    expect(h.store.getSnapshot().staff).toBeNull();
  });

  it("clears staff immediately during logout and ignores refreshes until it completes", async () => {
    h.emit(candidate()); await flush();
    const slow = deferred();
    h.client.auth.signOut.mockReturnValueOnce(slow.promise);
    const logout = h.store.signOut();
    h.store.revalidate(); h.emit(candidate(), "TOKEN_REFRESHED"); await flush();
    expect(h.store.getSnapshot().staff).toBeNull();
    slow.resolve({ error: null }); await logout;
    expect(h.store.getSnapshot().status).toBe("signed-out");
    expect(h.client.auth.signOut).toHaveBeenCalledWith({ scope: "local" });
  });

  it("reports signout errors without restoring dashboard access", async () => {
    h.emit(candidate()); await flush();
    h.client.auth.signOut.mockResolvedValueOnce({ error: new Error("offline") });
    await h.store.signOut(); h.store.revalidate(); await flush();
    expect(h.store.getSnapshot()).toMatchObject({ status: "error", staff: null });
    expect(h.store.getSnapshot().error).toContain("Sign out");
  });
});
