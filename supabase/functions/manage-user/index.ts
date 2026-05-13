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
      console.log(`[manage-user][${reqId}] path=list → admin.listUsers`);
      const { data: authUsers, error: listErr } = await adminClient.auth.admin.listUsers({ perPage: 1000 });
      if (listErr) console.error(`[manage-user][${reqId}] listUsers error:`, listErr.message);
      const banMap: Record<string, boolean> = {};
      if (authUsers?.users) {
        for (const u of authUsers.users) {
          const banned = u.banned_until ? new Date(u.banned_until) > new Date() : false;
          banMap[u.id] = banned;
        }
      }
      console.log(`[manage-user][${reqId}] ⏎ list 200 (count=${Object.keys(banMap).length})`);
      return new Response(JSON.stringify({ banMap }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { user_id, role, username, email } = body;

    if (!user_id || !action) {
      console.warn(`[manage-user][${reqId}] ⏎ 400 Paramètres manquants (user_id=${user_id}, action=${action})`);
      return new Response(JSON.stringify({ error: "Paramètres manquants" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (action === "deactivate" && user_id === caller.id) {
      console.warn(`[manage-user][${reqId}] ⏎ 400 self-deactivate refusé`);
      return new Response(JSON.stringify({ error: "Vous ne pouvez pas désactiver votre propre compte" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (action === "update") {
      console.log(`[manage-user][${reqId}] path=update (role=${role ?? "—"}, username=${username ?? "—"}, email=${email ?? "—"})`);
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
      console.log(`[manage-user][${reqId}] ⏎ update 200`);
      return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (action === "deactivate") {
      console.log(`[manage-user][${reqId}] path=deactivate user_id=${user_id}`);
      const { error } = await adminClient.auth.admin.updateUserById(user_id, {
        ban_duration: "876000h",
      });
      if (error) {
        console.error(`[manage-user][${reqId}] ⏎ 400 deactivate error:`, error.message);
        return new Response(JSON.stringify({ error: error.message }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      console.log(`[manage-user][${reqId}] ⏎ deactivate 200`);
      return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (action === "activate") {
      console.log(`[manage-user][${reqId}] path=activate user_id=${user_id}`);
      const { error } = await adminClient.auth.admin.updateUserById(user_id, {
        ban_duration: "none",
      });
      if (error) {
        console.error(`[manage-user][${reqId}] ⏎ 400 activate error:`, error.message);
        return new Response(JSON.stringify({ error: error.message }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      console.log(`[manage-user][${reqId}] ⏎ activate 200`);
      return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    console.warn(`[manage-user][${reqId}] ⏎ 400 action inconnue: ${action}`);
    return new Response(JSON.stringify({ error: "Action inconnue" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    console.error(`[manage-user][${reqId}] ⏎ 500 Erreur serveur:`, err instanceof Error ? `${err.message}\n${err.stack}` : err);
    return new Response(JSON.stringify({ error: "Erreur serveur" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
