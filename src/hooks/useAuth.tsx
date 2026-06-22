import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Session, User } from "@supabase/supabase-js";

export type AppRole = "super_admin" | "coop_admin" | "agent";

interface Profile {
  username: string | null;
  email: string | null;
  full_name?: string | null;
  phone?: string | null;
}

export interface CoopRef { id: string; name: string }

interface AuthContextType {
  session: Session | null;
  user: User | null;
  loading: boolean;
  role: AppRole | null;
  cooperatives: string[]; // names (rétrocompat — consommé par les pages/reporting)
  cooperativeRefs: CoopRef[]; // id + name
  profile: Profile | null;
  isSuperAdmin: boolean;
  isCoopAdmin: boolean;
  isAdmin: boolean; // alias = isSuperAdmin (préserve le comportement adminOnly historique)
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  session: null,
  user: null,
  loading: true,
  role: null,
  cooperatives: [],
  cooperativeRefs: [],
  profile: null,
  isSuperAdmin: false,
  isCoopAdmin: false,
  isAdmin: false,
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState<AppRole | null>(null);
  const [cooperativeRefs, setCooperativeRefs] = useState<CoopRef[]>([]);
  const [profile, setProfile] = useState<Profile | null>(null);

  const fetchProfile = async (userId: string) => {
    try {
      const [{ data: roleRow }, { data: ucRows }, { data: profileRow }] = await Promise.all([
        supabase.from("user_roles").select("role").eq("user_id", userId).maybeSingle(),
        (supabase.from("user_cooperatives") as any)
          .select("cooperative_id, cooperatives(id, name)")
          .eq("user_id", userId),
        (supabase.from("profiles") as any)
          .select("username, email, full_name, phone")
          .eq("user_id", userId)
          .maybeSingle(),
      ]);
      setRole(((roleRow?.role as AppRole) ?? "agent"));
      const refs = ((ucRows as Array<{ cooperatives: { id: string; name: string } | null }> | null) ?? [])
        .map((r) => r.cooperatives)
        .filter(Boolean) as CoopRef[];
      setCooperativeRefs(refs);
      setProfile((profileRow as Profile | null) ?? null);
    } catch (e) {
      console.error("[useAuth] fetchProfile", e);
      setRole("agent");
      setCooperativeRefs([]);
      setProfile(null);
    }
  };

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, newSession) => {
      setSession(newSession);
      if (newSession?.user) {
        setTimeout(async () => {
          await fetchProfile(newSession.user.id);
          setLoading(false);
          if (event === "SIGNED_IN") {
            try {
              await (supabase.rpc as any)("log_login_event", { p_user_agent: navigator.userAgent });
            } catch (e) { console.error("[useAuth] log_login_event", e); }
          }
        }, 0);
      } else {
        setRole(null);
        setCooperativeRefs([]);
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

  const isSuperAdmin = role === "super_admin";
  const isCoopAdmin = role === "coop_admin";

  return (
    <AuthContext.Provider value={{
      session,
      user: session?.user ?? null,
      loading,
      role,
      cooperatives: cooperativeRefs.map((c) => c.name),
      cooperativeRefs,
      profile,
      isSuperAdmin,
      isCoopAdmin,
      isAdmin: isSuperAdmin,
      signOut,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
