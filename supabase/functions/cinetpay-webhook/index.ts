import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { sendGmail } from "../_shared/send-gmail.ts";

const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const esc = (s: unknown) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
const fmt = (n: number) => new Intl.NumberFormat("fr-FR").format(n).replace(/\u202f/g, " ");
const fmtDate = (d: string) => new Date(d).toLocaleDateString("fr-FR");

function addMonths(d: Date, m: number) {
  const r = new Date(d); r.setUTCMonth(r.getUTCMonth() + m); r.setUTCDate(r.getUTCDate() - 1); return r;
}

// Accepte l'IPN CinetPay (form-urlencoded) ou une vérification au retour ({ transaction_id }).
// Dans tous les cas, le statut est confirmé auprès de CinetPay : aucune donnée client n'est crue.
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method === "GET") return new Response("ok", { headers: corsHeaders });
  try {
    let tx = "";
    const ct = req.headers.get("content-type") ?? "";
    if (ct.includes("application/json")) {
      const b = await req.json().catch(() => ({}));
      tx = String(b?.transaction_id ?? "");
    } else {
      const f = await req.formData().catch(() => null);
      tx = String(f?.get("cpm_trans_id") ?? "");
    }
    if (!/^SUB\d{6,30}$/.test(tx)) return json({ error: "Requête invalide" }, 400);

    const apiKey = Deno.env.get("CINETPAY_API_KEY");
    const siteId = Deno.env.get("CINETPAY_SITE_ID");
    if (!apiKey || !siteId) return json({ error: "Non configuré" }, 503);

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: pay } = await admin.from("subscription_payments").select("*").eq("transaction_id", tx).maybeSingle();
    if (!pay) return json({ error: "Introuvable" }, 404);
    if (pay.status === "paid") return json({ status: "paid", invoice_number: pay.invoice_number });

    const res = await fetch("https://api-checkout.cinetpay.com/v2/payment/check", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ apikey: apiKey, site_id: siteId, transaction_id: tx }),
    });
    const check = await res.json().catch(() => ({}));
    const st = check?.data?.status as string | undefined;
    if (st !== "ACCEPTED") {
      if (st === "REFUSED" || st === "CANCELED") {
        await admin.from("subscription_payments").update({ status: "failed" }).eq("id", pay.id).eq("status", "pending");
      }
      return json({ status: st === "REFUSED" || st === "CANCELED" ? "failed" : "pending" });
    }
    if (Number(check.data.amount) !== Number(pay.amount_xof) || check.data.currency !== "XOF") {
      console.error("Montant incohérent", tx, check.data);
      return json({ error: "Montant incohérent" }, 400);
    }

    // Période : prolonge à partir de la fin de l'abonnement en cours s'il est encore valide.
    const { data: last } = await admin.from("subscriptions").select("end_date")
      .eq("cooperative_id", pay.cooperative_id).order("end_date", { ascending: false }).limit(1).maybeSingle();
    const today = new Date(new Date().toISOString().slice(0, 10));
    let start = today;
    if (last?.end_date) {
      const next = new Date(last.end_date); next.setUTCDate(next.getUTCDate() + 1);
      if (next > today) start = next;
    }
    const end = addMonths(start, pay.period_months);
    const startS = start.toISOString().slice(0, 10);
    const endS = end.toISOString().slice(0, 10);
    const { data: invNo } = await admin.rpc("next_invoice_number");

    // Mise à jour conditionnelle = idempotence (IPN et retour peuvent arriver en même temps)
    const { data: claimed } = await admin.from("subscription_payments").update({
      status: "paid", paid_at: new Date().toISOString(), payment_method: check.data.payment_method ?? null,
      operator_reference: check.data.operator_id ?? null, invoice_number: invNo, period_start: startS, period_end: endS,
    }).eq("id", pay.id).neq("status", "paid").select("*").maybeSingle();
    if (!claimed) return json({ status: "paid" });

    await admin.from("subscriptions").insert({
      cooperative_id: pay.cooperative_id, plan_name: "Annuel", amount: pay.amount_xof,
      payment_date: today.toISOString().slice(0, 10), start_date: startS, end_date: endS,
      status: "active", created_by: pay.created_by,
    });
    await admin.from("cooperatives").update({ subscription_status: "active" }).eq("id", pay.cooperative_id);

    // Facture par e-mail (non bloquant)
    try {
      const { data: coop } = await admin.from("cooperatives")
        .select("name,acronym,rccm,city,country,official_email,phone").eq("id", pay.cooperative_id).maybeSingle();
      const { data: primary } = await admin.from("user_cooperatives").select("user_id")
        .eq("cooperative_id", pay.cooperative_id).eq("is_primary_admin", true).maybeSingle();
      let adminEmail: string | null = null;
      if (primary?.user_id) {
        const { data: p } = await admin.from("profiles").select("email").eq("user_id", primary.user_id).maybeSingle();
        adminEmail = p?.email ?? null;
      }
      const recipients = [...new Set([adminEmail, coop?.official_email].filter((x): x is string => !!x))];
      const html = `<div style="font-family:Arial,sans-serif;max-width:640px;margin:auto;color:#111">
<h2 style="margin:0 0 4px">FACTURE ${esc(invNo)}</h2>
<p style="color:#555;margin:0 0 16px">Date : ${fmtDate(claimed.paid_at)} — Statut : <strong style="color:#047857">PAYÉE</strong></p>
<p><strong>Client :</strong> ${esc(coop?.name)}${coop?.acronym ? ` (${esc(coop.acronym)})` : ""}<br>
${coop?.rccm ? `RCCM : ${esc(coop.rccm)}<br>` : ""}${esc([coop?.city, coop?.country].filter(Boolean).join(", "))}</p>
<table style="width:100%;border-collapse:collapse;margin:16px 0">
<tr style="background:#f3f4f6"><th style="text-align:left;padding:8px">Désignation</th><th style="text-align:right;padding:8px">Montant</th></tr>
<tr><td style="padding:8px;border-bottom:1px solid #e5e7eb">Abonnement logiciel Coops App — ${pay.period_months} mois<br><small>Du ${fmtDate(startS)} au ${fmtDate(endS)}</small></td>
<td style="padding:8px;text-align:right;border-bottom:1px solid #e5e7eb">${fmt(pay.amount_xof)} FCFA</td></tr>
<tr><td style="padding:8px;text-align:right"><strong>Total payé</strong></td><td style="padding:8px;text-align:right"><strong>${fmt(pay.amount_xof)} FCFA</strong></td></tr>
</table>
<p style="color:#555">Moyen de paiement : ${esc(claimed.payment_method ?? "Mobile Money")}<br>Référence transaction : ${esc(tx)}</p>
<p style="color:#555">La facture reste téléchargeable dans l'application, rubrique « Mon abonnement ».</p></div>`;
      let sent = false;
      for (const to of recipients) {
        const r = await sendGmail({ to, subject: `Facture ${invNo} — Abonnement Coops App`, html });
        if (r.ok) sent = true; else console.error("Envoi facture", to, r.details);
      }
      if (sent) await admin.from("subscription_payments").update({ invoice_sent_at: new Date().toISOString() }).eq("id", pay.id);
    } catch (e) { console.error("Facture e-mail", e); }

    return json({ status: "paid", invoice_number: invNo });
  } catch (e) {
    console.error(e);
    return json({ error: "Une erreur est survenue." }, 500);
  }
});
