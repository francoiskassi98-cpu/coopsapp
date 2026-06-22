import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const VALID_CERTIFICATIONS = ["fairtrade", "rainforest", "eudr", "ordinaire"] as const;

function isValidEmail(v: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

Deno.serve(async (req) => {
  const reqId = crypto.randomUUID().slice(0, 8);
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Non autorisé" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const callerClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: { user: caller } } = await callerClient.auth.getUser();
    if (!caller) {
      return new Response(JSON.stringify({ error: "Non autorisé" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const { data: roleData } = await adminClient
      .from("user_roles").select("role").eq("user_id", caller.id).eq("role", "super_admin").maybeSingle();
    if (!roleData) {
      return new Response(JSON.stringify({ error: "Accès refusé. Réservé aux super administrateurs." }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const body = await req.json();
    const { cooperative, admin, logoBase64, logoFileName } = body ?? {};

    // ---- Validation côté serveur ----
    if (!cooperative?.name || !cooperative?.acronym || !cooperative?.rccm || !cooperative?.tax_number
      || !cooperative?.phone || !cooperative?.address || !cooperative?.city || !cooperative?.country
      || !cooperative?.official_email || !cooperative?.certification_type) {
      return new Response(JSON.stringify({ error: "Champs coopérative requis manquants." }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (!isValidEmail(cooperative.official_email)) {
      return new Response(JSON.stringify({ error: "Email officiel invalide." }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (!VALID_CERTIFICATIONS.includes(cooperative.certification_type)) {
      return new Response(JSON.stringify({ error: "Type de certification invalide." }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (!admin?.email || !admin?.password || !admin?.full_name) {
      return new Response(JSON.stringify({ error: "Champs administrateur requis manquants." }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (!isValidEmail(admin.email)) {
      return new Response(JSON.stringify({ error: "Email administrateur invalide." }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (typeof admin.password !== "string" || admin.password.length < 8) {
      return new Response(JSON.stringify({ error: "Mot de passe trop court (8 caractères minimum)." }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ---- Unicité (pré-check pour message clair) ----
    const { data: existCoop } = await adminClient
      .from("cooperatives").select("id").ilike("name", cooperative.name).maybeSingle();
    if (existCoop) {
      return new Response(JSON.stringify({ error: "Une coopérative avec ce nom existe déjà." }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ---- Upload logo (optionnel) ----
    let logo_url: string | null = null;
    if (logoBase64 && logoFileName) {
      try {
        const m = String(logoBase64).match(/^data:(.+);base64,(.*)$/);
        const mime = m ? m[1] : "image/png";
        const b64 = m ? m[2] : logoBase64;
        const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
        const ext = (logoFileName.split(".").pop() || "png").toLowerCase();
        const path = `${crypto.randomUUID()}.${ext}`;
        const { error: upErr } = await adminClient.storage.from("cooperative-logos").upload(path, bytes, { contentType: mime, upsert: false });
        if (upErr) {
          console.error(`[create-coop][${reqId}] logo upload`, upErr.message);
        } else {
          logo_url = path; // stocké comme chemin ; URL signée générée côté client si besoin
        }
      } catch (e) {
        console.error(`[create-coop][${reqId}] logo decode`, e instanceof Error ? e.message : e);
      }
    }

    // ---- Créer l'utilisateur auth ----
    const { data: newUser, error: createErr } = await adminClient.auth.admin.createUser({
      email: admin.email,
      password: admin.password,
      email_confirm: true,
      user_metadata: {
        username: admin.username || admin.email.split("@")[0],
        full_name: admin.full_name,
        phone: admin.phone ?? null,
      },
    });
    if (createErr || !newUser?.user) {
      console.error(`[create-coop][${reqId}] createUser`, createErr?.message);
      return new Response(JSON.stringify({ error: createErr?.message?.includes("already") ? "Cet email est déjà utilisé." : "Impossible de créer l'administrateur." }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ---- RPC transactionnelle : coop + rôle + liaison + abonnement pilote ----
    const { data: coopId, error: rpcErr } = await adminClient.rpc("create_cooperative_with_admin", {
      p_user_id: newUser.user.id,
      p_full_name: admin.full_name,
      p_phone: admin.phone ?? null,
      p_coop: { ...cooperative, logo_url },
    });

    if (rpcErr) {
      console.error(`[create-coop][${reqId}] rpc`, rpcErr.message);
      // rollback : supprimer le user
      await adminClient.auth.admin.deleteUser(newUser.user.id);
      if (logo_url) await adminClient.storage.from("cooperative-logos").remove([logo_url]);
      return new Response(JSON.stringify({ error: "Erreur lors de la création de la coopérative." }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ success: true, cooperative_id: coopId, user_id: newUser.user.id }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error(`[create-coop][${reqId}] 500`, err instanceof Error ? err.message : err);
    return new Response(JSON.stringify({ error: "Erreur serveur" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
