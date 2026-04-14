import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Non autorisé" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const callerClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user: caller } } = await callerClient.auth.getUser();
    if (!caller) {
      return new Response(JSON.stringify({ error: "Non autorisé" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const { data: roleData } = await adminClient.from("user_roles").select("role").eq("user_id", caller.id).eq("role", "admin").maybeSingle();
    if (!roleData) {
      return new Response(JSON.stringify({ error: "Accès refusé" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const body = await req.json();
    const { action } = body;

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
