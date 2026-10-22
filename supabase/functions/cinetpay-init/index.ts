import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { z } from "npm:zod@3";

const Body = z.object({
  cooperative_id: z.string().uuid(),
  return_url: z.string().url().max(300),
});

const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const auth = req.headers.get("Authorization");
    if (!auth?.startsWith("Bearer ")) return json({ error: "Non authentifié" }, 401);
    const url = Deno.env.get("SUPABASE_URL")!;
    const userClient = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: auth } } });
    const { data: claims } = await userClient.auth.getClaims(auth.replace("Bearer ", ""));
    const userId = claims?.claims?.sub as string | undefined;
    if (!userId) return json({ error: "Non authentifié" }, 401);

    const parsed = Body.safeParse(await req.json());
    if (!parsed.success) return json({ error: "Requête invalide" }, 400);
    const { cooperative_id, return_url } = parsed.data;

    const apiKey = Deno.env.get("CINETPAY_API_KEY");
    const siteId = Deno.env.get("CINETPAY_SITE_ID");
    if (!apiKey || !siteId) return json({ error: "Paiement en ligne non configuré." }, 503);

    const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const [{ data: roles }, { data: link }] = await Promise.all([
      admin.from("user_roles").select("role").eq("user_id", userId),
      admin.from("user_cooperatives").select("id").eq("user_id", userId).eq("cooperative_id", cooperative_id).maybeSingle(),
    ]);
    const r = (roles ?? []).map((x) => x.role);
    if (!(r.includes("super_admin") || (r.includes("coop_admin") && link))) return json({ error: "Accès refusé" }, 403);

    const { data: coop } = await admin.from("cooperatives")
      .select("name,subscription_price_xof,subscription_period_months").eq("id", cooperative_id).maybeSingle();
    if (!coop) return json({ error: "Coopérative introuvable" }, 404);
    const amount = Number(coop.subscription_price_xof);
    if (!amount || amount < 100 || amount % 5 !== 0) {
      return json({ error: "Le montant de l'abonnement n'est pas défini (multiple de 5 FCFA, minimum 100)." }, 400);
    }

    const transaction_id = `SUB${Date.now()}${Math.floor(Math.random() * 1e6)}`;
    const { error: insErr } = await admin.from("subscription_payments").insert({
      cooperative_id, transaction_id, amount_xof: amount,
      period_months: coop.subscription_period_months, created_by: userId,
    });
    if (insErr) { console.error(insErr); return json({ error: "Une erreur est survenue." }, 500); }

    const sep = return_url.includes("?") ? "&" : "?";
    const res = await fetch("https://api-checkout.cinetpay.com/v2/payment", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        apikey: apiKey, site_id: siteId, transaction_id, amount, currency: "XOF",
        description: `Abonnement ${coop.subscription_period_months} mois`.replace(/[^\w\s-]/g, ""),
        notify_url: `${url}/functions/v1/cinetpay-webhook`,
        return_url: `${return_url}${sep}tx=${transaction_id}`,
        channels: "ALL", lang: "fr", metadata: cooperative_id,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (data?.code !== "201" || !data?.data?.payment_url) {
      console.error("CinetPay init", data);
      await admin.from("subscription_payments").update({ status: "failed" }).eq("transaction_id", transaction_id);
      return json({ error: "Le guichet de paiement est indisponible. Réessayez plus tard." }, 502);
    }
    return json({ payment_url: data.data.payment_url, transaction_id });
  } catch (e) {
    console.error(e);
    return json({ error: "Une erreur est survenue." }, 500);
  }
});
