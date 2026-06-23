// ⚠️ Fonction temporaire — à supprimer après utilisation.
// Réinitialise le mot de passe du super_admin principal.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ALLOWED_EMAIL = "francoiskassi98@gmail.com";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const { email, new_password } = await req.json();
    if (email !== ALLOWED_EMAIL) {
      return new Response(JSON.stringify({ error: "Email non autorisé" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (!new_password || String(new_password).length < 8) {
      return new Response(JSON.stringify({ error: "Mot de passe trop court (min 8)" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );
    const { data: list, error: listErr } = await admin.auth.admin.listUsers({ perPage: 1000 });
    if (listErr) throw listErr;
    const target = list.users.find((u) => u.email?.toLowerCase() === ALLOWED_EMAIL.toLowerCase());
    if (!target) {
      return new Response(JSON.stringify({ error: "Compte super_admin introuvable" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const { error: updErr } = await admin.auth.admin.updateUserById(target.id, {
      password: new_password,
      email_confirm: true,
      ban_duration: "none",
    });
    if (updErr) throw updErr;
    return new Response(JSON.stringify({ success: true, user_id: target.id }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    console.error("[reset-super-admin]", err);
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "Erreur serveur" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
