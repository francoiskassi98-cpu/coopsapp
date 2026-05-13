import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  const reqId = crypto.randomUUID().slice(0, 8);
  const url = new URL(req.url);
  const authHeader = req.headers.get("Authorization");
  const apikeyHeader = req.headers.get("apikey");
  console.log(`[manage-user][${reqId}] ▶ ${req.method} ${url.pathname}${url.search}`);
  console.log(
    `[manage-user][${reqId}] headers → Authorization: ${
      authHeader ? `present (${authHeader.slice(0, 16)}…, len=${authHeader.length})` : "MISSING"
    } | apikey: ${apikeyHeader ? "present" : "MISSING"} | content-type: ${
      req.headers.get("content-type") ?? "—"
    } | origin: ${req.headers.get("origin") ?? "—"}`
  );

  if (req.method === "OPTIONS") {
    console.log(`[manage-user][${reqId}] ⏎ CORS preflight OK`);
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Mode démo : auth désactivée, accès libre à la gestion des utilisateurs
    console.log(`[manage-user][${reqId}] mode=démo (auth bypass actif)`);
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const body = await req.json();
    const { action } = body;
    const caller = { id: "" as string };
    console.log(`[manage-user][${reqId}] body parsed → action=${action} user_id=${body?.user_id ?? "—"} role=${body?.role ?? "—"}`);

    if (action === "list") {
      const { data: authUsers } = await adminClient.auth.admin.listUsers({ perPage: 1000 });
      const banMap: Record<string, boolean> = {};
      if (authUsers?.users) {
        for (const u of authUsers.users) {
          const banned = u.banned_until ? new Date(u.banned_until) > new Date() : false;
          banMap[u.id] = banned;
        }
      }
      return new Response(JSON.stringify({ banMap }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { user_id, role, username, email } = body;

    if (!user_id || !action) {
      return new Response(JSON.stringify({ error: "Paramètres manquants" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (action === "deactivate" && user_id === caller.id) {
      return new Response(JSON.stringify({ error: "Vous ne pouvez pas désactiver votre propre compte" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (action === "update") {
      if (role && ["admin", "user"].includes(role)) {
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
      return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (action === "deactivate") {
      const { error } = await adminClient.auth.admin.updateUserById(user_id, {
        ban_duration: "876000h",
      });
      if (error) {
        return new Response(JSON.stringify({ error: error.message }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (action === "activate") {
      const { error } = await adminClient.auth.admin.updateUserById(user_id, {
        ban_duration: "none",
      });
      if (error) {
        return new Response(JSON.stringify({ error: error.message }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ error: "Action inconnue" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    return new Response(JSON.stringify({ error: "Erreur serveur" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
