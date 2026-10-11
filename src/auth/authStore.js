import { homeForRole } from "./roles";

const initialState = { status: "loading", user: null, staff: null, error: "" };

// Auth callbacks only update state and schedule work. Async Supabase calls
// inside onAuthStateChange can deadlock the client.
export function createAuthStore(client, { timeoutMs = 15000 } = {}) {
  let state = initialState;
  let session;
  let generation = 0;
  let running = false;
  let signingOut = false;
  let subscription;
  let scheduled;
  let timeout;
  const listeners = new Set();

  function publish(next) {
    state = next;
    listeners.forEach((listener) => listener());
  }

  function cancelPending() {
    generation += 1;
    clearTimeout(scheduled);
    clearTimeout(timeout);
  }

  function fail(message, status = "error") {
    publish({ status, user: null, staff: null, error: message });
  }

  async function verify(candidate, request) {
    try {
      // Storage is only a session hint. Auth must validate the actual token.
      const { data: identity, error: authError } = await client.auth.getUser(candidate.access_token);
      if (!running || request !== generation) return;
      if (authError || !identity?.user || identity.user.id !== candidate.user.id) {
        clearTimeout(timeout);
        fail("Your session could not be verified. Sign in again, or retry if your connection is unavailable.");
        return;
      }
      const { data: staff, error } = await client.from("staff")
        .select("id, name, role, active").eq("id", identity.user.id).maybeSingle();
      if (!running || request !== generation) return;
      clearTimeout(timeout);
      if (error) {
        fail("Could not verify your staff access. Check your connection and retry.");
      } else if (!staff || staff.id !== identity.user.id) {
        fail("No staff profile is assigned to this account. Contact your Administrator.", "blocked");
      } else if (staff.active !== true) {
        fail("This staff account is deactivated. Contact your Administrator.", "blocked");
      } else if (!homeForRole(staff.role)) {
        fail("This account has no supported staff role. Contact your Administrator.", "blocked");
      } else {
        publish({ status: "authenticated", user: identity.user, staff, error: "" });
      }
    } catch {
      if (!running || request !== generation) return;
      clearTimeout(timeout);
      fail("Could not verify your session. Check your connection and retry.");
    }
  }

  function acceptSession(candidate) {
    if (signingOut && candidate) return;
    cancelPending();
    session = candidate;
    if (!candidate) {
      publish({ status: "signed-out", user: null, staff: null, error: "" });
      return;
    }
    // Never show a previous user's dashboard while validating another account.
    // Preserve a verified dashboard during same-user background refreshes.
    if (state.status !== "authenticated" || state.user.id !== candidate.user.id) publish({ ...initialState });
    const request = generation;
    timeout = setTimeout(() => {
      if (!running || request !== generation) return;
      cancelPending();
      fail("Session verification timed out. Check your connection and retry.");
    }, timeoutMs);
    scheduled = setTimeout(() => { void verify(candidate, request); }, 0);
  }

  return {
    getSnapshot: () => state,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    start() {
      if (running) return;
      running = true;
      publish({ ...initialState });
      const request = generation;
      timeout = setTimeout(() => {
        if (running && request === generation) fail("Could not load your session. Please retry.");
      }, timeoutMs);
      try {
        const { data } = client.auth.onAuthStateChange((_event, nextSession) => {
          if (running) acceptSession(nextSession);
        });
        subscription = data.subscription;
      } catch {
        cancelPending();
        fail("Could not load your session. Please retry.");
      }
    },
    stop() { running = false; cancelPending(); subscription?.unsubscribe(); },
    async retry() {
      if (session !== undefined) { acceptSession(session); return; }
      const request = generation;
      try {
        const { data, error } = await client.auth.getSession();
        if (!running || request !== generation) return;
        if (error) throw error;
        acceptSession(data.session);
      } catch {
        if (running && request === generation) fail("Could not load your session. Please retry.");
      }
    },
    revalidate() { if (running && !signingOut && session && state.status === "authenticated") acceptSession(session); },
    async signOut() {
      if (signingOut) return;
      signingOut = true;
      cancelPending();
      publish({ ...initialState });
      try {
        const { error } = await client.auth.signOut({ scope: "local" });
        if (error) throw error;
        if (running) acceptSession(null);
      } catch {
        if (running) fail("Sign out could not be completed. Retry sign out before leaving this device.");
      } finally {
        signingOut = false;
      }
    },
  };
}
