import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendGmail, welcomeEmailHtml } from "../_shared/send-gmail.ts";


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
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Non autorisé" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user: caller } } = await callerClient.auth.getUser();
    if (!caller) return json({ error: "Non autorisé" }, 401);

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const { data: callerRoles, error: rolesErr } = await adminClient
      .from("user_roles").select("role").eq("user_id", caller.id);
    if (rolesErr) console.error("[create-user] rolesErr:", rolesErr.message);
    const roles = (callerRoles || []).map((r: { role: string }) => r.role);

    const isSuperAdmin = roles.includes("super_admin");
    const isCoopAdmin = roles.includes("coop_admin");
    if (!isSuperAdmin && !isCoopAdmin) {
      return json({ error: "Accès refusé." }, 403);
    }


    const { email, password, username, role, registres } = await req.json();
    if (!email || !password || !username) {
      return json({ error: "Champs requis manquants" }, 400);
    }
    if (!VALID_ROLES.includes(role)) {
      return json({ error: "Rôle invalide" }, 400);
    }
    // Escalade de privilèges impossible : seul le super_admin crée un super_admin
    if (role === "super_admin" && !isSuperAdmin) {
      return json({
        error: "Accès refusé : seul le Super Administrateur est autorisé à créer un compte Super Administrateur.",
      }, 403);
    }

    const registreIds: string[] = Array.isArray(registres)
      ? [...new Set(registres.map((r: unknown) => String(r).trim()).filter(Boolean))]
      : [];
    if ((role === "agent" || role === "coop_admin") && registreIds.length === 0) {
      return json({ error: "Au moins un registre est requis." }, 400);
    }

    // Résolution des coopératives associées aux registres (scoping RLS)
    let coopIds: string[] = [];
    if (registreIds.length > 0) {
      const { data: regRows, error: regErr } = await adminClient
        .from("registres").select("id, cooperative_id").in("id", registreIds);
      if (regErr || !regRows || regRows.length !== registreIds.length) {
        return json({ error: "Un ou plusieurs registres sélectionnés sont introuvables." }, 400);
      }
      coopIds = [...new Set(regRows.map((r) => r.cooperative_id).filter(Boolean))];
    }

    // Un coop_admin ne peut affecter que des registres de ses propres coopératives
    if (!isSuperAdmin) {
      const { data: myCoops } = await adminClient
        .from("user_cooperatives").select("cooperative_id").eq("user_id", caller.id);
      const allowed = new Set((myCoops || []).map((c: { cooperative_id: string }) => c.cooperative_id));
      if (coopIds.length === 0 || coopIds.some((id) => !allowed.has(id))) {
        return json({
          error: "Accès refusé : vous ne pouvez créer des utilisateurs que pour les registres de votre coopérative.",
        }, 403);
      }
    }

    const { data: newUser, error: createError } = await adminClient.auth.admin.createUser({
      email, password, email_confirm: true, user_metadata: { username },
    });

    if (createError || !newUser.user) {
      console.error("[create-user] createUser error:", createError?.message);
      const already = (createError?.message || "").toLowerCase().includes("already");
      return json({
        error: already ? "Un utilisateur existe déjà avec cette adresse e-mail." : "Impossible de créer l'utilisateur.",
      }, 400);
    }

    const newId = newUser.user.id;

    if (role !== "agent") {
      // le trigger crée déjà role='agent' → on remplace
      await adminClient.from("user_roles").delete().eq("user_id", newId);
      await adminClient.from("user_roles").insert({ user_id: newId, role });
    }

    if (registreIds.length > 0) {
      // Le rattachement aux coopératives est synchronisé automatiquement par trigger DB
      const { error: urErr } = await adminClient.from("user_registres").insert(
        registreIds.map((id) => ({ user_id: newId, registre_id: id }))
      );
      if (urErr) {
        console.error("[create-user] user_registres:", urErr.message);
        return json({ error: "Utilisateur créé mais l'affectation des registres a échoué." }, 400);
      }
      // Contrôle de cohérence : la liaison coopérative doit exister
      const { data: ucRows } = await adminClient
        .from("user_cooperatives").select("cooperative_id").eq("user_id", newId);
      const linked = new Set((ucRows || []).map((r: { cooperative_id: string }) => r.cooperative_id));
      const missing = coopIds.filter((id) => !linked.has(id));
      if (missing.length > 0) {
        const { error: ucErr } = await adminClient.from("user_cooperatives").insert(
          missing.map((id) => ({ user_id: newId, cooperative_id: id }))
        );
        if (ucErr) {
          console.error("[create-user] user_cooperatives:", ucErr.message);
          return json({ error: "Utilisateur créé mais le rattachement à la coopérative a échoué." }, 400);
        }
      }
    }

    // Envoi de l'e-mail de bienvenue avec le mot de passe temporaire
    const appUrl = Deno.env.get("APP_URL") || "https://coopsapp.lovable.app";
    const mail = await sendGmail({
      to: email,
      subject: "Vos accès à la plateforme",
      html: welcomeEmailHtml({ username, email, password, role, appUrl }),
    });
    if (!mail.ok) {
      console.error("[create-user] welcome email failed:", mail.status, mail.details);
    }

    return json({ success: true, user_id: newId, email_sent: mail.ok });

  } catch (err) {
    console.error("[create-user] 500:", err instanceof Error ? err.message : err);
    return json({ error: "Erreur serveur" }, 500);
  }
});
