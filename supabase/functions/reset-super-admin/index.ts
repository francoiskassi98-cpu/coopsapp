// ⚠️ Fonction temporaire — supprimez-la après usage.
// Crée (ou réinitialise) le compte super_admin principal.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPER_ADMIN_EMAIL = "francoiskassi98@gmail.com";
const SUPER_ADMIN_PASSWORD = "SuperAdmin_2026!";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: list } = await admin.auth.admin.listUsers({ perPage: 1000 });
    let user = list.users.find((u) => u.email?.toLowerCase() === SUPER_ADMIN_EMAIL.toLowerCase());

    if (!user) {
      const { data: created, error: createErr } = await admin.auth.admin.createUser({
        email: SUPER_ADMIN_EMAIL,
        password: SUPER_ADMIN_PASSWORD,
        email_confirm: true,
        user_metadata: { username: "Super Admin" },
      });
      if (createErr) throw createErr;
      user = created.user!;
    } else {
      const { error: updErr } = await admin.auth.admin.updateUserById(user.id, {
        password: SUPER_ADMIN_PASSWORD,
        email_confirm: true,
        ban_duration: "none",
      });
      if (updErr) throw updErr;
    }

    // Profile
    await admin.from("profiles").upsert(
      { user_id: user.id, email: SUPER_ADMIN_EMAIL, username: "Super Admin" },
      { onConflict: "user_id" }
    );

    // Role
    await admin.from("user_roles").delete().eq("user_id", user.id);
    await admin.from("user_roles").insert({ user_id: user.id, role: "super_admin" });

    return new Response(
      JSON.stringify({
        success: true,
        email: SUPER_ADMIN_EMAIL,
        password: SUPER_ADMIN_PASSWORD,
        user_id: user.id,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[reset-super-admin]", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Erreur serveur" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
