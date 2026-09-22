import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendGmail, welcomeEmailHtml } from "../_shared/send-gmail.ts";

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
  const log = (stage: string, extra?: unknown) =>
    console.log(`[create-coop][${reqId}] ${stage}${extra !== undefined ? " " + JSON.stringify(extra) : ""}`);
  const fail = (stage: string, code: string, message: string, status = 400, detail?: unknown) => {
    console.error(`[create-coop][${reqId}] CREATE_COOPERATIVE_ERROR ${stage} ${code}`, detail ?? "");
    return new Response(JSON.stringify({ error: message, code, stage }), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  };

  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    log("CREATE_COOPERATIVE_START");

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return fail("AUTH_CHECK", "AUTH_MISSING", "Votre session a expiré. Veuillez vous reconnecter.", 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const callerClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: { user: caller } } = await callerClient.auth.getUser();
    if (!caller) return fail("AUTH_CHECK", "AUTH_INVALID", "Votre session a expiré. Veuillez vous reconnecter.", 401);

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const { data: roleData } = await adminClient
      .from("user_roles").select("role").eq("user_id", caller.id).eq("role", "super_admin").maybeSingle();
    if (!roleData) return fail("AUTH_CHECK", "FORBIDDEN", "Accès refusé. Réservé aux super administrateurs.", 403);
    log("AUTH_CHECK", { caller: caller.id });

    const body = await req.json();
    const { cooperative, admin, logoBase64, logoFileName, subscription } = body ?? {};

    // ---- Validation côté serveur ----
    if (!cooperative?.name || !cooperative?.acronym || !cooperative?.rccm || !cooperative?.tax_number
      || !cooperative?.phone || !cooperative?.address || !cooperative?.city || !cooperative?.country
      || !cooperative?.official_email || !cooperative?.certification_type) {
      return fail("VALIDATION", "COOP_FIELDS_MISSING", "Champs coopérative requis manquants.");
    }
    if (!isValidEmail(cooperative.official_email)) {
      return fail("VALIDATION", "COOP_EMAIL_INVALID", "Email officiel invalide.");
    }
    if (!VALID_CERTIFICATIONS.includes(cooperative.certification_type)) {
      return fail("VALIDATION", "CERTIFICATION_INVALID", "Type de certification invalide.");
    }
    if (!admin?.email || !admin?.password || !admin?.full_name) {
      return fail("VALIDATION", "ADMIN_FIELDS_MISSING", "Champs administrateur requis manquants.");
    }
    if (!isValidEmail(admin.email)) {
      return fail("VALIDATION", "ADMIN_EMAIL_INVALID", "Email administrateur invalide.");
    }
    if (typeof admin.password !== "string" || admin.password.length < 8) {
      return fail("VALIDATION", "PASSWORD_TOO_SHORT", "Mot de passe trop court (8 caractères minimum).");
    }

    // ---- Unicité métier (message explicite) ----
    const dupChecks: Array<{ column: string; value: string; label: string }> = [
      { column: "name", value: String(cooperative.name).trim(), label: "ce nom" },
      { column: "acronym", value: String(cooperative.acronym).trim(), label: "ce sigle" },
      { column: "rccm", value: String(cooperative.rccm).trim(), label: "ce RCCM" },
      { column: "official_email", value: String(cooperative.official_email).trim(), label: "cet email officiel" },
    ];
    for (const c of dupChecks) {
      const { data: dup, error: dupErr } = await adminClient
        .from("cooperatives").select("id").is("deleted_at", null).ilike(c.column, c.value).limit(1);
      if (dupErr) return fail("DUPLICATE_CHECK", "DB_ERROR", "Le serveur n'a pas pu vérifier les doublons. Réessayez.", 500, dupErr.message);
      if (dup && dup.length > 0) {
        return fail("DUPLICATE_CHECK", "COOP_DUPLICATE", `Une coopérative avec ${c.label} existe déjà.`);
      }
    }
    log("DUPLICATE_CHECK", { ok: true });

    // ---- Upload logo (optionnel) ----
    let logo_path: string | null = null;
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
          console.error(`[create-coop][${reqId}] LOGO_UPLOAD failed`, upErr.message);
        } else {
          logo_path = path;
          log("LOGO_UPLOAD", { path });
        }
      } catch (e) {
        console.error(`[create-coop][${reqId}] LOGO_UPLOAD decode`, e instanceof Error ? e.message : e);
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
      const msg = (createErr?.message || "").toLowerCase();
      if (logo_path) await adminClient.storage.from("cooperative-logos").remove([logo_path]);
      if (msg.includes("already") || msg.includes("registered") || msg.includes("exists")) {
        return fail("ADMIN_USER_CREATE", "ADMIN_EMAIL_TAKEN", "Cet email administrateur est déjà utilisé.", 400, createErr?.message);
      }
      if (msg.includes("pwned") || msg.includes("compromis") || msg.includes("weak") || msg.includes("password")) {
        return fail("ADMIN_USER_CREATE", "PASSWORD_REJECTED", "Ce mot de passe est trop faible ou a été compromis lors d'une fuite de données. Choisissez-en un autre.", 400, createErr?.message);
      }
      return fail("ADMIN_USER_CREATE", "ADMIN_CREATE_FAILED", "Impossible de créer le compte administrateur.", 400, createErr?.message);
    }
    log("ADMIN_USER_CREATE", { user_id: newUser.user.id });

    // ---- RPC transactionnelle : coop + rôle + liaison + abonnement ----
    const { data: coopId, error: rpcErr } = await adminClient.rpc("create_cooperative_with_admin", {
      p_user_id: newUser.user.id,
      p_full_name: admin.full_name,
      p_phone: admin.phone ?? null,
      p_coop: { ...cooperative, logo_path },
      p_sub_start: subscription?.start_date ?? null,
      p_sub_end: subscription?.end_date ?? null,
      p_plan: subscription?.plan_name ?? "Pilote",
    });

    if (rpcErr || !coopId) {
      // rollback complet : aucun compte ni logo orphelin
      await adminClient.auth.admin.deleteUser(newUser.user.id);
      if (logo_path) await adminClient.storage.from("cooperative-logos").remove([logo_path]);
      const raw = (rpcErr?.message || "").toLowerCase();
      if (raw.includes("duplicate") || raw.includes("unique")) {
        return fail("RPC_CREATE_COOPERATIVE", "COOP_DUPLICATE", "Impossible de créer la coopérative : certaines informations sont déjà utilisées.", 400, rpcErr?.message);
      }
      return fail("RPC_CREATE_COOPERATIVE", "RPC_FAILED", "Le serveur n'a pas pu terminer la création de la coopérative.", 500, rpcErr?.message);
    }
    log("RPC_CREATE_COOPERATIVE", { cooperative_id: coopId });
    log("ROLE_ASSIGNMENT", { role: "coop_admin" });
    log("COOPERATIVE_ASSIGNMENT", { user_id: newUser.user.id, cooperative_id: coopId });
    log("SUBSCRIPTION_CREATE", { plan: subscription?.plan_name ?? "Pilote" });

    // ---- Notification administrateur (n'annule jamais la création) ----
    let email_sent = false;
    let email_error: string | null = null;
    try {
      const appUrl = Deno.env.get("APP_URL") || "https://coopsapp.lovable.app";
      const mail = await sendGmail({
        to: admin.email,
        subject: `Vos accès administrateur — ${cooperative.name}`,
        html: welcomeEmailHtml({
          username: admin.full_name,
          email: admin.email,
          password: admin.password,
          role: "coop_admin",
          appUrl,
        }),
      });
      email_sent = mail.ok;
      if (!mail.ok) {
        email_error = mail.details ?? `status ${mail.status}`;
        console.error(`[create-coop][${reqId}] ADMIN_NOTIFICATION failed`, mail.status, mail.details);
      } else {
        log("ADMIN_NOTIFICATION", { sent: true });
      }
    } catch (e) {
      email_error = e instanceof Error ? e.message : "unknown";
      console.error(`[create-coop][${reqId}] ADMIN_NOTIFICATION exception`, email_error);
    }

    log("CREATE_COOPERATIVE_SUCCESS", { cooperative_id: coopId, email_sent });

    return new Response(JSON.stringify({
      success: true,
      cooperative_id: coopId,
      cooperative_name: cooperative.name,
      user_id: newUser.user.id,
      admin_email: admin.email,
      email_sent,
      email_error: email_sent ? null : email_error,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    console.error(`[create-coop][${reqId}] CREATE_COOPERATIVE_ERROR 500`, err instanceof Error ? err.message : err);
    return new Response(JSON.stringify({ error: "Le serveur n'a pas pu terminer la création de la coopérative.", code: "SERVER_ERROR" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
