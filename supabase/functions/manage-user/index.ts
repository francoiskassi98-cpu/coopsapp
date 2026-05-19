import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  const reqId = crypto.randomUUID().slice(0, 8);
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Non autorisé" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const callerClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: { user: caller }, error: authErr } = await callerClient.auth.getUser();
    if (authErr || !caller) {
      return new Response(JSON.stringify({ error: "Non autorisé" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const { data: roleData } = await adminClient
      .from("user_roles").select("role").eq("user_id", caller.id).eq("role", "admin").maybeSingle();
    if (!roleData) {
      return new Response(JSON.stringify({ error: "Accès refusé. Réservé aux administrateurs." }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const body = await req.json();
    const { action } = body;
    console.log(`[manage-user][${reqId}] caller=${caller.id} action=${action}`);

    if (action === "list") {
      const [{ data: authUsers, error: listErr }, { data: ucRows }] = await Promise.all([
        adminClient.auth.admin.listUsers({ perPage: 1000 }),
        adminClient.from("user_cooperatives").select("user_id, cooperative"),
      ]);
      if (listErr) console.error(`[manage-user][${reqId}] listUsers error:`, listErr.message);
      const banMap: Record<string, boolean> = {};
      if (authUsers?.users) {
        for (const u of authUsers.users) {
          banMap[u.id] = u.banned_until ? new Date(u.banned_until) > new Date() : false;
        }
      }
      const coopsByUser: Record<string, string[]> = {};
      for (const r of (ucRows || []) as { user_id: string; cooperative: string }[]) {
        (coopsByUser[r.user_id] ||= []).push(r.cooperative);
      }
      return new Response(JSON.stringify({ banMap, coopsByUser }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { user_id, role, username, email, cooperatives } = body;

    if (!user_id || !action) {
      return new Response(JSON.stringify({ error: "Paramètres manquants" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (action === "deactivate" && user_id === caller.id) {
      return new Response(JSON.stringify({ error: "Vous ne pouvez pas désactiver votre propre compte" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (action === "update") {
      if (role && ["admin", "agent"].includes(role)) {
        await adminClient.from("user_roles").update({ role }).eq("user_id", user_id);
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
      if (Array.isArray(cooperatives)) {
        const coops: string[] = cooperatives.map((c: unknown) => String(c).trim()).filter(Boolean);
        const effectiveRole = role || (await adminClient.from("user_roles").select("role").eq("user_id", user_id).maybeSingle()).data?.role;
        if (effectiveRole === "agent" && coops.length === 0) {
          return new Response(JSON.stringify({ error: "Un agent doit avoir au moins une coopérative." }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
        await adminClient.from("user_cooperatives").delete().eq("user_id", user_id);
        if (coops.length > 0) {
          await adminClient.from("user_cooperatives").insert(
            coops.map((c) => ({ user_id, cooperative: c }))
          );
        }
      }
      return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (action === "deactivate") {
      const { error } = await adminClient.auth.admin.updateUserById(user_id, { ban_duration: "876000h" });
      if (error) return new Response(JSON.stringify({ error: "Erreur serveur" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (action === "activate") {
      const { error } = await adminClient.auth.admin.updateUserById(user_id, { ban_duration: "none" });
      if (error) return new Response(JSON.stringify({ error: "Erreur serveur" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ error: "Action inconnue" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    console.error(`[manage-user][${reqId}] 500:`, err instanceof Error ? err.message : err);
    return new Response(JSON.stringify({ error: "Erreur serveur" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
