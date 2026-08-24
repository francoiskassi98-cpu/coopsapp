import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const VALID_ROLES = ["super_admin", "coop_admin", "agent"] as const;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  const reqId = crypto.randomUUID().slice(0, 8);
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Non autorisé" }, 401);

    const callerClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: { user: caller }, error: authErr } = await callerClient.auth.getUser();
    if (authErr || !caller) return json({ error: "Non autorisé" }, 401);

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const { data: callerRoles } = await adminClient
      .from("user_roles").select("role").eq("user_id", caller.id);
    const roles = (callerRoles || []).map((r: { role: string }) => r.role);
    const isSuperAdmin = roles.includes("super_admin");
    const isCoopAdmin = roles.includes("coop_admin");
    if (!isSuperAdmin && !isCoopAdmin) {
      return json({ error: "Accès refusé. Réservé aux administrateurs." }, 403);
    }

    // Coopératives du caller (scoping coop_admin)
    let myCoopIds: string[] = [];
    if (!isSuperAdmin) {
      const { data: myCoops } = await adminClient
        .from("user_cooperatives").select("cooperative_id").eq("user_id", caller.id);
      myCoopIds = [...new Set((myCoops || []).map((c: { cooperative_id: string }) => c.cooperative_id).filter(Boolean))];
    }

    const usersInMyCoops = async (): Promise<Set<string>> => {
      if (isSuperAdmin) return new Set();
      if (myCoopIds.length === 0) return new Set();
      const { data } = await adminClient
        .from("user_cooperatives").select("user_id").in("cooperative_id", myCoopIds);
      return new Set((data || []).map((r: { user_id: string }) => r.user_id));
    };

    const roleOf = async (userId: string): Promise<string | null> => {
      const { data } = await adminClient.from("user_roles").select("role").eq("user_id", userId).maybeSingle();
      return (data?.role as string) ?? null;
    };

    // Coopératives où le caller est ADMINISTRATEUR PRINCIPAL (source de vérité serveur)
    const primaryCoopIdsOf = async (userId: string): Promise<string[]> => {
      const { data } = await adminClient
        .from("user_cooperatives").select("cooperative_id")
        .eq("user_id", userId).eq("is_primary_admin", true);
      return (data || []).map((r: { cooperative_id: string }) => r.cooperative_id);
    };

    const coopIdsOf = async (userId: string): Promise<string[]> => {
      const { data } = await adminClient
        .from("user_cooperatives").select("cooperative_id").eq("user_id", userId);
      return (data || []).map((r: { cooperative_id: string }) => r.cooperative_id);
    };


    if (action === "list") {
      const [{ data: authUsers, error: listErr }, { data: urRows }, { data: ucRowsAll }] = await Promise.all([
        adminClient.auth.admin.listUsers({ perPage: 1000 }),
        adminClient.from("user_registres").select("user_id, registre_id, registres(id, name)"),
        adminClient.from("user_cooperatives").select("user_id, cooperative_id, cooperatives(id, name, acronym)"),
      ]);
      if (listErr) console.error(`[manage-user][${reqId}] listUsers error:`, listErr.message);

      let visible: Set<string> | null = null;
      if (!isSuperAdmin) {
        const scoped = await usersInMyCoops();
        scoped.add(caller.id);
        // Aucun super_admin n'est visible pour un coop_admin
        const { data: superRows } = await adminClient
          .from("user_roles").select("user_id").eq("role", "super_admin");
        for (const r of (superRows || []) as Array<{ user_id: string }>) scoped.delete(r.user_id);
        visible = scoped;
      }

      const banMap: Record<string, boolean> = {};
      const lastSignInMap: Record<string, string | null> = {};
      if (authUsers?.users) {
        for (const u of authUsers.users) {
          if (visible && !visible.has(u.id)) continue;
          banMap[u.id] = u.banned_until ? new Date(u.banned_until) > new Date() : false;
          lastSignInMap[u.id] = u.last_sign_in_at ?? null;
        }
      }
      const registresByUser: Record<string, Array<{ id: string; name: string }>> = {};
      for (const r of (urRows || []) as Array<{ user_id: string; registre_id: string; registres: { id: string; name: string } | null }>) {
        if (visible && !visible.has(r.user_id)) continue;
        if (r.registres) (registresByUser[r.user_id] ||= []).push(r.registres);
      }
      const cooperativesByUser: Record<string, Array<{ id: string; name: string; acronym: string | null }>> = {};
      for (const r of (ucRowsAll || []) as Array<{ user_id: string; cooperatives: { id: string; name: string; acronym: string | null } | null }>) {
        if (visible && !visible.has(r.user_id)) continue;
        if (r.cooperatives) (cooperativesByUser[r.user_id] ||= []).push(r.cooperatives);
      }
      return json({
        banMap,
        registresByUser,
        cooperativesByUser,
        lastSignInMap,
        allowedUserIds: visible ? [...visible] : null,
      });
    }

    const { user_id, role, username, email, registres, cooperative_id } = body;

    if (!user_id || !action) return json({ error: "Paramètres manquants" }, 400);

    // Scoping des cibles pour un coop_admin
    if (!isSuperAdmin) {
      const targetRole = await roleOf(user_id);
      if (targetRole === "super_admin") {
        return json({ error: "Accès refusé : vous ne pouvez pas gérer un Super Administrateur." }, 403);
      }
      const scoped = await usersInMyCoops();
      if (user_id !== caller.id && !scoped.has(user_id)) {
        return json({ error: "Accès refusé : cet utilisateur n'appartient pas à votre coopérative." }, 403);
      }
      if (role === "super_admin") {
        return json({
          error: "Accès refusé : seul le Super Administrateur est autorisé à créer un compte Super Administrateur.",
        }, 403);
      }
    }

    if (action === "deactivate" && user_id === caller.id) {
      return json({ error: "Vous ne pouvez pas désactiver votre propre compte" }, 400);
    }

    if (action === "update") {
      if (role && VALID_ROLES.includes(role)) {
        await adminClient.from("user_roles").delete().eq("user_id", user_id);
        await adminClient.from("user_roles").insert({ user_id, role });
      }
      const profileUpdate: Record<string, string> = {};
      if (username) profileUpdate.username = username;
      if (email) profileUpdate.email = email;
      if (Object.keys(profileUpdate).length > 0) {
        await adminClient.from("profiles").update(profileUpdate).eq("user_id", user_id);
      }
      if (email) {
        await adminClient.auth.admin.updateUserById(user_id, { email });
      }
      const coopId: string | null = typeof cooperative_id === "string" && cooperative_id.trim() ? cooperative_id.trim() : null;
      if (coopId) {
        const { data: coopRow } = await adminClient.from("cooperatives").select("id").eq("id", coopId).maybeSingle();
        if (!coopRow) return json({ error: "Coopérative introuvable." }, 400);
        if (!isSuperAdmin && !myCoopIds.includes(coopId)) {
          return json({ error: "Accès refusé : coopérative hors de votre périmètre." }, 403);
        }
      }

      if (Array.isArray(registres)) {
        const registreIds: string[] = [...new Set(registres.map((r: unknown) => String(r).trim()).filter(Boolean))];
        const effectiveRole = role || (await roleOf(user_id));
        if ((effectiveRole === "agent" || effectiveRole === "coop_admin") && registreIds.length === 0) {
          return json({ error: "Un agent ou un admin doit avoir au moins un registre assigné." }, 400);
        }

        let coopIds: string[] = [];
        if (registreIds.length > 0) {
          const { data: regRows, error: regErr } = await adminClient
            .from("registres").select("id, cooperative_id").in("id", registreIds);
          if (regErr || !regRows || regRows.length !== registreIds.length) {
            return json({ error: "Un ou plusieurs registres sélectionnés sont introuvables." }, 400);
          }
          coopIds = [...new Set(regRows.map((r) => r.cooperative_id).filter(Boolean))];
        }

        if (coopId && coopIds.some((id) => id !== coopId)) {
          return json({ error: "Les registres sélectionnés doivent appartenir à la coopérative choisie." }, 400);
        }

        if (!isSuperAdmin) {
          const allowed = new Set(myCoopIds);
          if (coopIds.some((id) => !allowed.has(id))) {
            return json({ error: "Accès refusé : registre hors de votre coopérative." }, 403);
          }
        }

        await adminClient.from("user_registres").delete().eq("user_id", user_id);
        await adminClient.from("user_cooperatives").delete().eq("user_id", user_id);
        if (registreIds.length > 0) {
          // Le rattachement coopérative est synchronisé automatiquement par trigger DB
          const { error: urErr } = await adminClient.from("user_registres").insert(
            registreIds.map((id) => ({ user_id, registre_id: id }))
          );
          if (urErr) {
            console.error(`[manage-user][${reqId}] user_registres:`, urErr.message);
            return json({ error: "L'affectation des registres a échoué." }, 400);
          }
          const { data: ucRows } = await adminClient
            .from("user_cooperatives").select("cooperative_id").eq("user_id", user_id);
          const linked = new Set((ucRows || []).map((r: { cooperative_id: string }) => r.cooperative_id));
          const missing = coopIds.filter((id) => !linked.has(id));
          if (missing.length > 0) {
            const { error: ucErr } = await adminClient.from("user_cooperatives").insert(
              missing.map((id) => ({ user_id, cooperative_id: id }))
            );
            if (ucErr) {
              console.error(`[manage-user][${reqId}] user_cooperatives:`, ucErr.message);
              return json({ error: "Le rattachement à la coopérative a échoué." }, 400);
            }
          }
        }
      }

      // Rattachement coopérative : source de vérité côté serveur
      if (coopId) {
        await adminClient.from("user_cooperatives").delete().eq("user_id", user_id).neq("cooperative_id", coopId);
        const { data: existing } = await adminClient
          .from("user_cooperatives").select("cooperative_id")
          .eq("user_id", user_id).eq("cooperative_id", coopId).maybeSingle();
        if (!existing) {
          const { error: ucErr } = await adminClient
            .from("user_cooperatives").insert({ user_id, cooperative_id: coopId });
          if (ucErr) {
            console.error(`[manage-user][${reqId}] user_cooperatives:`, ucErr.message);
            return json({ error: "Le rattachement à la coopérative a échoué." }, 400);
          }
        }
      }
      return json({ success: true });
    }

    if (action === "deactivate") {
      const { error } = await adminClient.auth.admin.updateUserById(user_id, { ban_duration: "876000h" });
      if (error) return json({ error: "Erreur serveur" }, 400);
      return json({ success: true });
    }

    if (action === "activate") {
      const { error } = await adminClient.auth.admin.updateUserById(user_id, { ban_duration: "none" });
      if (error) return json({ error: "Erreur serveur" }, 400);
      return json({ success: true });
    }

    if (action === "reset_password") {
      const { data: targetUser, error: getErr } = await adminClient.auth.admin.getUserById(user_id);
      if (getErr || !targetUser?.user?.email) {
        return json({ error: "Utilisateur introuvable" }, 404);
      }
      // Allow-list stricte des origines autorisées pour le lien de récupération
      const allowedOrigins = new Set([
        "https://coopsapp.lovable.app",
        "https://id-preview--4dc9a2b3-3771-430d-afb9-327fc3fd5bf1.lovable.app",
        "http://localhost:8080",
      ]);
      let redirectTo: string | undefined;
      if (typeof body.redirectTo === "string" && body.redirectTo.length <= 500) {
        try {
          const u = new URL(body.redirectTo);
          if (allowedOrigins.has(u.origin) && u.pathname === "/reset-password") {
            redirectTo = `${u.origin}/reset-password`;
          }
        } catch { /* URL invalide : ignorée */ }
      }
      if (body.redirectTo && !redirectTo) {
        return json({ error: "URL de redirection non autorisée." }, 400);
      }
      const { error: resetErr } = await adminClient.auth.resetPasswordForEmail(targetUser.user.email, redirectTo ? { redirectTo } : undefined);
      if (resetErr) {
        console.error(`[manage-user][${reqId}] reset error:`, resetErr.message);
        return json({ error: "Erreur serveur" }, 400);
      }
      return json({ success: true });
    }

    return json({ error: "Action inconnue" }, 400);
  } catch (err) {
    console.error(`[manage-user][${reqId}] 500:`, err instanceof Error ? err.message : err);
    return json({ error: "Erreur serveur" }, 500);
  }
});
