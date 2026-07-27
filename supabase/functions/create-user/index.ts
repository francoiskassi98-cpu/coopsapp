import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const VALID_ROLES = ["super_admin", "coop_admin", "agent"] as const;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Non autorisé" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user: caller } } = await callerClient.auth.getUser();
    if (!caller) {
      return new Response(JSON.stringify({ error: "Non autorisé" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const { data: roleData } = await adminClient
      .from("user_roles").select("role").eq("user_id", caller.id).eq("role", "super_admin").maybeSingle();
    if (!roleData) {
      return new Response(JSON.stringify({ error: "Accès refusé." }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { email, password, username, role, registres } = await req.json();
    if (!email || !password || !username) {
      return new Response(JSON.stringify({ error: "Champs requis manquants" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!VALID_ROLES.includes(role)) {
      return new Response(JSON.stringify({ error: "Rôle invalide" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const registreIds: string[] = Array.isArray(registres)
      ? [...new Set(registres.map((r: unknown) => String(r).trim()).filter(Boolean))]
      : [];
    if ((role === "agent" || role === "coop_admin") && registreIds.length === 0) {
      return new Response(JSON.stringify({ error: "Au moins un registre est requis." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Résolution des coopératives associées aux registres (scoping RLS)
    let coopIds: string[] = [];
    if (registreIds.length > 0) {
      const { data: regRows, error: regErr } = await adminClient
        .from("registres").select("id, cooperative_id").in("id", registreIds);
      if (regErr || !regRows || regRows.length !== registreIds.length) {
        return new Response(JSON.stringify({ error: "Un ou plusieurs registres sélectionnés sont introuvables." }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      coopIds = [...new Set(regRows.map((r) => r.cooperative_id).filter(Boolean))];
    }

    const { data: newUser, error: createError } = await adminClient.auth.admin.createUser({
      email, password, email_confirm: true, user_metadata: { username },
    });

    if (createError || !newUser.user) {
      console.error("[create-user] createUser error:", createError?.message);
      const already = (createError?.message || "").toLowerCase().includes("already");
      return new Response(JSON.stringify({
        error: already ? "Un utilisateur existe déjà avec cette adresse e-mail." : "Impossible de créer l'utilisateur.",
      }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const newId = newUser.user.id;

    if (role !== "agent") {
      // le trigger crée déjà role='agent' → on remplace
      await adminClient.from("user_roles").delete().eq("user_id", newId);
      await adminClient.from("user_roles").insert({ user_id: newId, role });
    }

    if (registreIds.length > 0) {
      const { error: urErr } = await adminClient.from("user_registres").insert(
        registreIds.map((id) => ({ user_id: newId, registre_id: id }))
      );
      if (urErr) console.error("[create-user] user_registres:", urErr.message);
      const { error: ucErr } = await adminClient.from("user_cooperatives").insert(
        coopIds.map((id) => ({ user_id: newId, cooperative_id: id }))
      );
      if (ucErr) console.error("[create-user] user_cooperatives:", ucErr.message);
      if (urErr) {
        return new Response(JSON.stringify({ error: "Utilisateur créé mais l'affectation des registres a échoué." }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    return new Response(JSON.stringify({ success: true, user_id: newId }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[create-user] 500:", err instanceof Error ? err.message : err);
    return new Response(JSON.stringify({ error: "Erreur serveur" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
