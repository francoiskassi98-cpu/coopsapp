import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Session, User } from "@supabase/supabase-js";

type AppRole = "admin" | "agent";

interface Profile {
  username: string | null;
  email: string | null;
}

interface AuthContextType {
  session: Session | null;
  user: User | null;
  loading: boolean;
  role: AppRole | null;
  cooperatives: string[];
  profile: Profile | null;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  session: null,
  user: null,
  loading: true,
  role: null,
  cooperatives: [],
  profile: null,
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState<AppRole | null>(null);
  const [cooperatives, setCooperatives] = useState<string[]>([]);
  const [profile, setProfile] = useState<Profile | null>(null);

  const fetchProfile = async (userId: string) => {
    try {
      const [{ data: roleRow }, { data: ucRows }, { data: profileRow }] = await Promise.all([
        supabase.from("user_roles").select("role").eq("user_id", userId).maybeSingle(),
        (supabase.from("user_cooperatives") as any).select("cooperative").eq("user_id", userId),
        (supabase.from("profiles") as any).select("username, email").eq("user_id", userId).maybeSingle(),
      ]);
      setRole(((roleRow?.role as AppRole) ?? "agent"));
      setCooperatives(((ucRows as { cooperative: string }[] | null) ?? []).map((r) => r.cooperative));
      setProfile((profileRow as Profile | null) ?? null);
    } catch (e) {
      console.error("[useAuth] fetchProfile", e);
      setRole("agent");
      setCooperatives([]);
      setProfile(null);
    }
  };

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      if (newSession?.user) {
        setTimeout(async () => {
          await fetchProfile(newSession.user.id);
          setLoading(false);
        }, 0);
      } else {
        setRole(null);
        setCooperatives([]);
        setProfile(null);
        setLoading(false);
      }
    });

    supabase.auth.getSession().then(async ({ data: { session: existing } }) => {
      setSession(existing);
      if (existing?.user) {
        await fetchProfile(existing.user.id);
      }
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signOut = async () => { await supabase.auth.signOut(); };

  return (
    <AuthContext.Provider value={{ session, user: session?.user ?? null, loading, role, cooperatives, profile, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
