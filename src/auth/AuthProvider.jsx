import { createContext, useContext, useEffect, useState, useSyncExternalStore } from "react";
import { supabase } from "../supabaseClient";
import { createAuthStore } from "./authStore";

export const AuthContext = createContext(null);

export function AuthProvider({ children, client = supabase }) {
  const [store] = useState(() => createAuthStore(client));
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot);
  useEffect(() => {
    store.start();
    const onFocus = () => store.revalidate();
    const onVisible = () => { if (!document.hidden) store.revalidate(); };
    const interval = setInterval(() => { if (!document.hidden) store.revalidate(); }, 60000);
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(interval);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisible);
      store.stop();
    };
  }, [store]);
  return <AuthContext.Provider value={{ ...state, retry: store.retry, signOut: store.signOut }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider.");
  return context;
}
