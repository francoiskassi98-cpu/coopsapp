import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { z } from "npm:zod@3";
import { sendGmail } from "../_shared/send-gmail.ts";

const Body = z.object({
  request_id: z.string().uuid(),
  event: z.enum(["submitted", "published", "info_requested"]),
  app_url: z.string().url().max(300).optional(),
});

const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const esc = (s: string | null | undefined) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

const fmtSize = (n: number) =>
  n >= 1048576 ? `${(n / 1048576).toFixed(2)} Mo` : n >= 1024 ? `${(n / 1024).toFixed(1)} Ko` : `${n} o`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const auth = req.headers.get("Authorization");
    if (!auth?.startsWith("Bearer ")) return json({ error: "Non authentifié" }, 401);
    const url = Deno.env.get("SUPABASE_URL")!;
    const userClient = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: auth } },
    });
    const { data: claims, error: claimErr } = await userClient.auth.getClaims(auth.replace("Bearer ", ""));
    if (claimErr || !claims?.claims?.sub) return json({ error: "Non authentifié" }, 401);
    const callerId = claims.claims.sub as string;

    const parsed = Body.safeParse(await req.json());
    if (!parsed.success) return json({ error: "Requête invalide" }, 400);
    const { request_id, event } = parsed.data;
    const appUrl = (parsed.data.app_url ?? "https://coopsapp.lovable.app").replace(/\/$/, "");

    // Contrôle d'accès via RLS : l'appelant doit voir la demande
    const { data: visible } = await userClient.from("geospatial_requests").select("id").eq("id", request_id).maybeSingle();
    if (!visible) return json({ error: "Accès refusé" }, 403);

    const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: callerRole } = await admin.from("user_roles").select("role").eq("user_id", callerId).maybeSingle();
    if ((event === "published" || event === "info_requested") && callerRole?.role !== "super_admin") return json({ error: "Accès refusé" }, 403);

    const { data: r } = await admin.from("geospatial_requests").select("*").eq("id", request_id).single();
    if (!r) return json({ error: "Introuvable" }, 404);
    if (event === "submitted" && r.submission_notified_at) return json({ ok: true, already: true });
    if (event === "published" && (r.publication_notified_at || r.status !== "publie")) return json({ ok: true, already: true });

    const [{ data: coop }, { data: author }, { data: files }] = await Promise.all([
      admin.from("cooperatives").select("name").eq("id", r.cooperative_id).maybeSingle(),
      admin.from("profiles").select("full_name,username,email").eq("user_id", r.created_by).maybeSingle(),
      admin.from("geospatial_files").select("file_name,detected_format,file_size_bytes,file_category")
        .eq("request_id", request_id).eq("file_category", event === "submitted" ? "original" : "treated"),
    ]);
    const list = files ?? [];
    const total = list.reduce((s, f) => s + Number(f.file_size_bytes), 0);
    const link = `${appUrl}/geospatial/${request_id}`;
    const authorName = author?.full_name || author?.username || "Utilisateur";
    const rows = list.map((f) =>
      `<tr><td style="padding:4px 8px">${esc(f.file_name)}</td><td style="padding:4px 8px">${esc(f.detected_format)}</td><td style="padding:4px 8px">${fmtSize(Number(f.file_size_bytes))}</td></tr>`).join("");

    let recipients: { email: string; user_id: string }[] = [];
    let subject = "", html = "";
    if (event === "submitted") {
      const { data: sa } = await admin.from("user_roles").select("user_id").eq("role", "super_admin");
      const ids = (sa ?? []).map((x) => x.user_id);
      const { data: profs } = ids.length ? await admin.from("profiles").select("user_id,email").in("user_id", ids) : { data: [] };
      recipients = (profs ?? []).filter((p) => p.email);
      subject = "Nouvelle soumission de données géospatiales";
      html = `<div style="font-family:Arial,sans-serif;max-width:620px;margin:auto;padding:24px;background:#fff">
<h2 style="color:#1B2A5B">Nouvelle soumission de données géospatiales</h2>
<p><b>Coopérative :</b> ${esc(coop?.name)}<br><b>Soumis par :</b> ${esc(authorName)}${author?.email ? ` (${esc(author.email)})` : ""}<br>
<b>Date :</b> ${new Date(r.created_at).toLocaleString("fr-FR", { timeZone: "UTC" })} UTC<br><b>Titre :</b> ${esc(r.title)}<br>
<b>Nombre de fichiers :</b> ${list.length} — <b>Taille totale :</b> ${fmtSize(total)}</p>
<table style="border-collapse:collapse;font-size:13px;border:1px solid #ddd"><tr style="background:#F5F7FB"><th style="padding:4px 8px;text-align:left">Fichier</th><th style="padding:4px 8px;text-align:left">Format</th><th style="padding:4px 8px;text-align:left">Taille</th></tr>${rows}</table>
<p><b>Commentaire :</b><br>${esc(r.description) || "<i>Aucun</i>"}</p>
<p><a href="${link}" style="background:#1B2A5B;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none">Ouvrir la demande</a></p></div>`;
    } else if (event === "info_requested") {
      const { data: members } = await admin.from("user_cooperatives").select("user_id").eq("cooperative_id", r.cooperative_id);
      const ids = Array.from(new Set([...(members ?? []).map((m) => m.user_id), r.created_by]));
      const { data: profs } = await admin.from("profiles").select("user_id,email").in("user_id", ids);
      recipients = (profs ?? []).filter((p) => p.email);
      const { data: last } = await admin.from("geospatial_comments").select("content").eq("request_id", request_id).eq("is_internal", false).order("created_at", { ascending: false }).limit(1).maybeSingle();
      subject = "Informations complémentaires demandées — données géospatiales";
      html = `<div style="font-family:Arial,sans-serif;max-width:620px;margin:auto;padding:24px;background:#fff">
<h2 style="color:#1B2A5B">Informations complémentaires demandées</h2>
<p>Le super administrateur a besoin d'informations sur la demande <b>${esc(r.title)}</b> (${esc(coop?.name)}).</p>
<p style="white-space:pre-wrap;background:#F5F7FB;padding:12px;border-radius:8px">${esc(last?.content)}</p>
<p><a href="${link}" style="background:#1B2A5B;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none">Répondre</a></p></div>`;
    } else {
      const { data: members } = await admin.from("user_cooperatives").select("user_id").eq("cooperative_id", r.cooperative_id);
      const ids = Array.from(new Set([...(members ?? []).map((m) => m.user_id), r.created_by]));
      const { data: profs } = await admin.from("profiles").select("user_id,email").in("user_id", ids);
      recipients = (profs ?? []).filter((p) => p.email);
      subject = "Vos données géospatiales traitées sont disponibles";
      html = `<div style="font-family:Arial,sans-serif;max-width:620px;margin:auto;padding:24px;background:#fff">
<h2 style="color:#1B2A5B">Résultats géospatiaux publiés</h2>
<p>La demande <b>${esc(r.title)}</b> de ${esc(coop?.name)} a été traitée.</p>
<table style="border-collapse:collapse;font-size:13px;border:1px solid #ddd">${rows}</table>
<p><b>Commentaire de restitution :</b><br>${esc(r.return_comment) || "<i>Aucun</i>"}</p>
<p><a href="${link}" style="background:#1B2A5B;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none">Télécharger les fichiers</a></p></div>`;
    }

    // Notifications in-app
    if (recipients.length) {
      await admin.from("notifications").insert(recipients.map((p) => ({
        user_id: p.user_id, title: subject, message: `${coop?.name ?? ""} — ${r.title}`,
        link: `/geospatial/${request_id}`, type: "geospatial",
      })));
    }

    let failures = 0;
    for (const p of recipients) {
      const res = await sendGmail({ to: p.email, subject, html });
      if (!res.ok) failures++;
    }
    const ok = recipients.length > 0 && failures < recipients.length;
    const stamp = new Date().toISOString();
    if (event === "info_requested") return json({ ok, sent: recipients.length - failures });
    await admin.from("geospatial_requests").update({
      ...(event === "submitted" ? { submission_notified_at: ok ? stamp : null } : { publication_notified_at: ok ? stamp : null }),
      notification_error: ok ? null : "Échec de l'envoi de l'e-mail",
    }).eq("id", request_id);

    return json({ ok, sent: recipients.length - failures });
  } catch (e) {
    console.error("[notify-geospatial]", e);
    return json({ error: "Une erreur est survenue." }, 500);
  }
});
