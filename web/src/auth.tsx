import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { api, onUnauthorized, tokenStore } from "./api";

export interface Session {
  user: { id: number; name: string; email: string; role: "dono" | "vendedor" };
  store: { id: number; name: string };
  plan: { id: "basico" | "profissional"; name: string; jevAssistant: boolean };
}

interface AuthState {
  session: Session | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (data: { storeName: string; name: string; email: string; password: string }) => Promise<void>;
  logout: () => void;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  const logout = useCallback(() => {
    tokenStore.set(null);
    setSession(null);
  }, []);

  const refresh = useCallback(async () => {
    if (!tokenStore.get()) {
      setSession(null);
      return;
    }
    try {
      setSession(await api<Session>("/auth/me"));
    } catch {
      logout();
    }
  }, [logout]);

  useEffect(() => {
    onUnauthorized(logout);
    refresh().finally(() => setLoading(false));
  }, [refresh, logout]);

  const entrar = async (token: string) => {
    tokenStore.set(token);
    await refresh();
  };

  const value: AuthState = {
    session,
    loading,
    logout,
    refresh,
    login: async (email, password) => entrar((await api<{ token: string }>("/auth/login", { body: { email, password } })).token),
    signup: async (data) => entrar((await api<{ token: string }>("/auth/signup", { body: data })).token),
  };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth fora do AuthProvider");
  return ctx;
}
