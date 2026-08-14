import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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

    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user: caller }, error: authErr } = await callerClient.auth.getUser();
    if (authErr || !caller) return json({ error: "Non autorisé" }, 401);

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    // Rôle du caller : réservé au super_admin
    const { data: callerRoles } = await adminClient
      .from("user_roles").select("role").eq("user_id", caller.id);
    const isSuperAdmin = (callerRoles || []).some((r: { role: string }) => r.role === "super_admin");
    if (!isSuperAdmin) {
      return json({ error: "Accès refusé. Cette fonctionnalité est réservée au Super Admin." }, 403);
    }

    const body = await req.json().catch(() => ({}));
    const user_id = typeof body?.user_id === "string" ? body.user_id.trim() : "";
    if (!user_id) return json({ error: "Paramètres manquants" }, 400);

    // Auto-suppression interdite
    if (user_id === caller.id) {
      return json({ error: "Vous ne pouvez pas supprimer votre propre compte administrateur." }, 400);
    }

    // Cible
    const { data: targetUser } = await adminClient.auth.admin.getUserById(user_id);
    const { data: targetRoleRows } = await adminClient
      .from("user_roles").select("role").eq("user_id", user_id);
    const targetRoles = (targetRoleRows || []).map((r: { role: string }) => r.role);
    const { data: targetProfile } = await adminClient
      .from("profiles").select("username, email").eq("user_id", user_id).maybeSingle();

    if (!targetUser?.user && !targetProfile) {
      return json({ error: "Utilisateur introuvable." }, 404);
    }

    // Protection : dernier super_admin
    if (targetRoles.includes("super_admin")) {
      const { count } = await adminClient
        .from("user_roles").select("user_id", { count: "exact", head: true }).eq("role", "super_admin");
      if ((count ?? 0) <= 1) {
        return json({ error: "Impossible de supprimer le dernier Super Administrateur du système." }, 400);
      }
    }

    // Coopératives rattachées (pour l'audit)
    const { data: ucRows } = await adminClient
      .from("user_cooperatives").select("cooperative_id, cooperatives(name)").eq("user_id", user_id);
    const coopNames = (ucRows || [])
      .map((r: { cooperatives: { name: string } | null }) => r.cooperatives?.name)
      .filter(Boolean);

    const email = targetUser?.user?.email ?? targetProfile?.email ?? null;

    // 1. Détacher les références historiques (les données métier sont conservées)
    const detach: Array<[string, string]> = [
      ["projects", "created_by"],
      ["producer_bonus_settings", "created_by"],
      ["shipment_excel_templates", "created_by"],
      ["subscriptions", "created_by"],
    ];
    for (const [table, col] of detach) {
      const { error } = await adminClient.from(table).update({ [col]: null }).eq(col, user_id);
      if (error) console.error(`[delete-user][${reqId}] detach ${table}.${col}:`, error.message);
    }

    // 2. Supprimer les associations d'accès
    for (const table of ["user_registres", "user_cooperatives", "user_roles", "notifications", "profiles"]) {
      const { error } = await adminClient.from(table).delete().eq("user_id", user_id);
      if (error) console.error(`[delete-user][${reqId}] cleanup ${table}:`, error.message);
    }

    // 3. Audit AVANT suppression du compte (conservé même après suppression)
    const { error: auditErr } = await adminClient.from("audit_logs").insert({
      table_name: "auth.users",
      record_id: user_id,
      action: "DELETE_USER",
      old_data: {
        user_id,
        email,
        username: targetProfile?.username ?? null,
        roles: targetRoles,
        cooperatives: coopNames,
      },
      changed_by: caller.id,
      changed_by_email: caller.email ?? null,
    });
    if (auditErr) console.error(`[delete-user][${reqId}] audit:`, auditErr.message);

    // 4. Suppression du compte Auth (invalide toutes les sessions et tokens)
    if (targetUser?.user) {
      const { error: delErr } = await adminClient.auth.admin.deleteUser(user_id);
      if (delErr) {
        console.error(`[delete-user][${reqId}] deleteUser:`, delErr.message);
        // Repli : bannissement irréversible + invalidation des sessions
        await adminClient.auth.admin.updateUserById(user_id, { ban_duration: "876000h" });
        await adminClient.auth.admin.signOut(user_id, "global").catch(() => {});
        return json({ error: "La suppression de l'utilisateur a échoué." }, 400);
      }
    }

    console.log(`[delete-user][${reqId}] caller=${caller.id} deleted=${user_id}`);
    return json({ success: true });
  } catch (err) {
    console.error(`[delete-user][${reqId}] 500:`, err instanceof Error ? err.message : err);
    return json({ error: "Erreur serveur" }, 500);
  }
});
