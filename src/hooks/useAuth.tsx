import { createContext, Fragment, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Session, User } from "@supabase/supabase-js";
import { useVersionGuard } from "@/hooks/useVersionGuard";

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
  isAdmin: boolean; // true pour super_admin OU coop_admin
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
  const queryClient = useQueryClient();
  const identity = useRef<string | null | undefined>(undefined);
  const generation = useRef(0);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState<AppRole | null>(null);
  const [cooperativeRefs, setCooperativeRefs] = useState<CoopRef[]>([]);
  const [profile, setProfile] = useState<Profile | null>(null);

  const resetIdentity = (userId: string | null) => {
    identity.current = userId;
    generation.current += 1;
    setRole(null);
    setCooperativeRefs([]);
    setProfile(null);
    void queryClient.cancelQueries();
    queryClient.clear();
    sessionStorage.removeItem("knf-update-session");
  };

  const fetchProfile = async (userId: string, requestGeneration: number) => {
    const isCurrent = () => generation.current === requestGeneration && identity.current === userId;
    try {
      const [{ data: roleRow }, { data: ucRows }, { data: profileRow }] = await Promise.all([
        supabase.from("user_roles").select("role").eq("user_id", userId).maybeSingle(),
        supabase.from("user_cooperatives")
          .select("cooperative_id, cooperatives(id, name)")
          .eq("user_id", userId),
        supabase.from("profiles")
          .select("username, email, full_name, phone")
          .eq("user_id", userId)
          .maybeSingle(),
      ]);
      if (!isCurrent()) return;
      setRole(((roleRow?.role as AppRole) ?? "agent"));
      const refs = ((ucRows as Array<{ cooperatives: { id: string; name: string } | null }> | null) ?? [])
        .map((r) => r.cooperatives)
        .filter(Boolean) as CoopRef[];
      setCooperativeRefs(refs);
      setProfile((profileRow as Profile | null) ?? null);
    } catch (e) {
      console.error("[useAuth] fetchProfile", e);
      if (!isCurrent()) return;
      setRole("agent");
      setCooperativeRefs([]);
      setProfile(null);
    }
  };

  useEffect(() => {
    let active = true;
    let authEventReceived = false;
    const applySession = (newSession: Session | null, event?: string) => {
      if (!active) return;
      const userId = newSession?.user.id ?? null;
      const changed = identity.current !== userId;
      if (changed) resetIdentity(userId);
      setSession(newSession);
      // Token refreshes must not unmount the current user's pages or clear their cache.
      if (!changed) return;
      if (newSession?.user) {
        setLoading(true);
        const requestGeneration = generation.current;
        setTimeout(async () => {
          if (!active || generation.current !== requestGeneration) return;
          await fetchProfile(newSession.user.id, requestGeneration);
          if (!active || generation.current !== requestGeneration) return;
          setLoading(false);
          if (event === "SIGNED_IN") {
            try {
              await supabase.rpc("log_login_event", { p_user_agent: navigator.userAgent });
            } catch (e) { console.error("[useAuth] log_login_event", e); }
          }
        }, 0);
      } else {
        setLoading(false);
      }
    };
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, newSession) => {
      authEventReceived = true;
      applySession(newSession, event);
    });

    supabase.auth.getSession().then(({ data: { session: existing } }) => {
      // A late bootstrap response cannot overwrite a newer login/logout event.
      if (!authEventReceived) applySession(existing);
    }).catch((error: unknown) => {
      console.error("[useAuth] getSession", error);
      if (!authEventReceived) applySession(null);
    });

    return () => {
      active = false;
      generation.current += 1;
      identity.current = undefined;
      subscription.unsubscribe();
    };
  }, [queryClient]);

  useVersionGuard(!!session);

  const signOut = async () => {
    resetIdentity(null);
    setSession(null);
    setLoading(false);
    const { error } = await supabase.auth.signOut();
    if (error) {
      console.error("[useAuth] signOut", error);
      await supabase.auth.signOut({ scope: "local" });
    }
  };

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
      isAdmin: isSuperAdmin || isCoopAdmin,
      signOut,
    }}>
      <Fragment key={session?.user.id ?? "signed-out"}>{children}</Fragment>
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
