import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { api, ApiError } from "../lib/api";

export interface SessionUser {
  id: number;
  username: string;
  role: "admin" | "staff";
  isSuperAdmin: boolean;
}

export interface SessionTenant {
  id: number;
  companyName: string;
  subscriptionStatus: "trial" | "active" | "past_due" | "cancelled";
  trialEndsAt: string | null;
  billingPlan: "monthly" | "annual" | null;
  addonStatus: "active" | "past_due" | "cancelled" | null;
}

interface AuthState {
  user: SessionUser | null;
  tenant: SessionTenant | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  setSession: (user: SessionUser, tenant: SessionTenant | null) => void;
}

const AuthContext = createContext<AuthState | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [tenant, setTenant] = useState<SessionTenant | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get<{ user: SessionUser; tenant: SessionTenant | null }>("/auth/me")
      .then((res) => {
        setUser(res.user);
        setTenant(res.tenant);
      })
      .catch((err) => {
        if (!(err instanceof ApiError && err.status === 401)) console.error(err);
      })
      .finally(() => setLoading(false));
  }, []);

  async function login(username: string, password: string) {
    const res = await api.post<{ user: SessionUser; tenant: SessionTenant | null }>(
      "/auth/login",
      { username, password }
    );
    setUser(res.user);
    setTenant(res.tenant);
  }

  async function logout() {
    await api.post("/auth/logout");
    setUser(null);
    setTenant(null);
  }

  function setSession(u: SessionUser, t: SessionTenant | null) {
    setUser(u);
    setTenant(t);
  }

  return (
    <AuthContext.Provider value={{ user, tenant, loading, login, logout, setSession }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
