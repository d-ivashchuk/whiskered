import { createContext, useContext, useState, type ReactNode } from "react";

interface AuthUser {
  id: string;
  email: string;
}

interface AuthContextType {
  user: AuthUser | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signUp: (email: string, password: string) => Promise<{ error: Error | null; data: { user: AuthUser | null } | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

/**
 * Stub AuthProvider — replace with your own auth backend.
 * Currently always returns a mock user so the app boots without Supabase.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user] = useState<AuthUser | null>(null);
  const [loading] = useState(false);

  const signIn = async (_email: string, _password: string) => {
    // TODO: wire up your auth provider
    return { error: new Error("Auth not configured") };
  };

  const signUp = async (_email: string, _password: string) => {
    // TODO: wire up your auth provider
    return { error: new Error("Auth not configured") as Error | null, data: null };
  };

  const signOut = async () => {
    // TODO: wire up your auth provider
  };

  return (
    <AuthContext.Provider value={{ user, loading, signIn, signUp, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
}
