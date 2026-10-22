import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";
import { createOpenAI } from "npm:@ai-sdk/openai@2";
import { streamText, tool, stepCountIs, type ModelMessage } from "npm:ai@5";
import { z } from "npm:zod@3";

const RUN_ID = "X-Lovable-AIG-Run-ID";

const BodySchema = z.object({
  threadId: z.string().uuid(),
  question: z.string().trim().min(1).max(2000),
});

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: userData, error: userErr } = await sb.auth.getUser();
    if (userErr || !userData.user) return json({ error: "Non authentifié" }, 401);
    const userId = userData.user.id;

    const parsed = BodySchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return json({ error: "Requête invalide" }, 400);
    const { threadId, question } = parsed.data;

    const { data: thread } = await sb.from("ai_chat_threads").select("id,title").eq("id", threadId).maybeSingle();
    if (!thread) return json({ error: "Discussion introuvable" }, 404);

    const { data: history } = await sb.from("ai_chat_messages").select("role,content")
      .eq("thread_id", threadId).order("created_at", { ascending: true }).limit(30);

    const { error: insErr } = await sb.from("ai_chat_messages").insert({ thread_id: threadId, user_id: userId, role: "user", content: question });
    if (insErr) { console.error(insErr); return json({ error: "Enregistrement impossible" }, 500); }
    const patch: Record<string, string> = { updated_at: new Date().toISOString() };
    if (thread.title === "Nouvelle discussion") patch.title = question.slice(0, 60);
    await sb.from("ai_chat_threads").update(patch).eq("id", threadId);

    // Context: registres accessibles (RLS limite à la coopérative de l'utilisateur)
    const { data: registres } = await sb.from("registres").select("id,name,cooperative_id").limit(100);
    const registreNames = new Map((registres ?? []).map((r) => [r.id, r.name]));
    const nameOf = (id: string | null) => (id ? registreNames.get(id) ?? id : null);

    const tools = {
      liste_registres: tool({
        description: "Liste les registres accessibles à l'utilisateur (id et nom).",
        inputSchema: z.object({}),
        execute: async () => registres ?? [],
      }),
      statistiques_campagne: tool({
        description: "KPI d'une campagne : potentiel total, potentiel restant, poids livré, sacs, nombre de chargements et de producteurs. Filtrable par registre.",
        inputSchema: z.object({
          campaign_label: z.string().nullable().describe("Ex '2026-2027', null = toutes"),
          registre_id: z.string().nullable(),
        }),
        execute: async ({ campaign_label, registre_id }) => {
          let ship = sb.from("shipments").select("total_weight,total_bags", { count: "exact" }).is("deleted_at", null).limit(5000);
          if (campaign_label) ship = ship.eq("campaign_label", campaign_label);
          if (registre_id) ship = ship.eq("registre_id", registre_id);
          const s = await ship;
          let prod = sb.from("producers").select("delivery_potential,remaining_potential", { count: "exact" }).is("deleted_at", null).limit(20000);
          if (campaign_label) prod = prod.eq("campaign_label", campaign_label);
          if (registre_id) prod = prod.eq("registre_id", registre_id);
          const p = await prod;
          if (s.error || p.error) return { erreur: "Lecture impossible" };
          const sum = (a: any[] | null, k: string) => (a ?? []).reduce((t, r) => t + Number(r[k] ?? 0), 0);
          return {
            chargements: s.count ?? 0,
            poids_livre_kg: sum(s.data, "total_weight"),
            sacs: sum(s.data, "total_bags"),
            producteurs: p.count ?? 0,
            potentiel_total_kg: sum(p.data, "delivery_potential"),
            potentiel_restant_kg: sum(p.data, "remaining_potential"),
            note: (p.count ?? 0) > 20000 ? "Échantillon limité à 20000 producteurs" : undefined,
          };
        },
      }),
      rechercher_chargements: tool({
        description: "Recherche des chargements (connaissement, lot, campagne, registre, période). Retourne les 50 plus récents.",
        inputSchema: z.object({
          search: z.string().nullable().describe("Texte dans connaissement ou numéro de lot"),
          campaign_label: z.string().nullable(),
          registre_id: z.string().nullable(),
          date_from: z.string().nullable().describe("YYYY-MM-DD"),
          date_to: z.string().nullable(),
        }),
        execute: async (a) => {
          let q = sb.from("shipments")
            .select("id,connaissement,lot_number,campaign_label,registre_id,total_weight,total_bags,avg_bag_weight,delivery_start,delivery_end,departure_date,destination,project,status,partners(name)")
            .is("deleted_at", null).order("created_at", { ascending: false }).limit(50);
          if (a.search) {
            const s = a.search.replace(/[,()%]/g, " ").trim();
            q = q.or(`connaissement.ilike.%${s}%,lot_number.ilike.%${s}%`);
          }
          if (a.campaign_label) q = q.eq("campaign_label", a.campaign_label);
          if (a.registre_id) q = q.eq("registre_id", a.registre_id);
          if (a.date_from) q = q.gte("delivery_start", a.date_from);
          if (a.date_to) q = q.lte("delivery_start", a.date_to);
          const { data, error } = await q;
          if (error) { console.error(error); return { erreur: "Lecture impossible" }; }
          return (data ?? []).map((r: any) => ({ ...r, registre: nameOf(r.registre_id) }));
        },
      }),
      detail_chargement: tool({
        description: "Détail d'un chargement : producteurs livrés avec poids et sacs.",
        inputSchema: z.object({ shipment_id: z.string() }),
        execute: async ({ shipment_id }) => {
          const { data, error } = await sb.from("deliveries")
            .select("producer_id,net_weight,num_bags,receipt_number,delivery_date").eq("shipment_id", shipment_id).limit(500);
          if (error) { console.error(error); return { erreur: "Lecture impossible" }; }
          const ids = [...new Set((data ?? []).map((d) => d.producer_id))];
          const { data: prods } = ids.length
            ? await sb.from("producers").select("id,full_name,section,plantation_code").in("id", ids)
            : { data: [] as any[] };
          const pm = new Map((prods ?? []).map((p: any) => [p.id, p]));
          return (data ?? []).map((d) => ({ ...d, producteur: pm.get(d.producer_id) ?? null }));
        },
      }),
      rechercher_producteurs: tool({
        description: "Recherche des producteurs par nom, code plantation ou section ; retourne potentiel initial et restant.",
        inputSchema: z.object({
          search: z.string().nullable(),
          section: z.string().nullable(),
          campaign_label: z.string().nullable(),
          registre_id: z.string().nullable(),
          tri: z.enum(["potentiel_restant_desc", "potentiel_restant_asc", "nom"]).nullable(),
        }),
        execute: async (a) => {
          let q = sb.from("producers")
            .select("id,full_name,section,plantation_code,carte_ccc,campaign_label,registre_id,delivery_potential,remaining_potential,is_active,sexe").is("deleted_at", null).limit(50);
          if (a.search) {
            const s = a.search.replace(/[,()%]/g, " ").trim();
            q = q.or(`full_name.ilike.%${s}%,plantation_code.ilike.%${s}%`);
          }
          if (a.section) q = q.ilike("section", `%${a.section}%`);
          if (a.campaign_label) q = q.eq("campaign_label", a.campaign_label);
          if (a.registre_id) q = q.eq("registre_id", a.registre_id);
          q = a.tri === "potentiel_restant_desc" ? q.order("remaining_potential", { ascending: false })
            : a.tri === "potentiel_restant_asc" ? q.order("remaining_potential", { ascending: true })
            : q.order("full_name");
          const { data, error } = await q;
          if (error) { console.error(error); return { erreur: "Lecture impossible" }; }
          return (data ?? []).map((r: any) => ({ ...r, registre: nameOf(r.registre_id) }));
        },
      }),
      livraisons_producteur: tool({
        description: "Historique des livraisons d'un producteur (id producteur).",
        inputSchema: z.object({ producer_id: z.string() }),
        execute: async ({ producer_id }) => {
          const { data, error } = await sb.from("deliveries")
            .select("delivery_date,net_weight,num_bags,receipt_number,shipment_id,campaign_label")
            .eq("producer_id", producer_id).order("delivery_date", { ascending: false }).limit(100);
          if (error) { console.error(error); return { erreur: "Lecture impossible" }; }
          return data;
        },
      }),
      repartition_sections: tool({
        description: "Agrégat par section : nombre de producteurs, potentiel total, restant et livré.",
        inputSchema: z.object({ campaign_label: z.string().nullable(), registre_id: z.string().nullable() }),
        execute: async (a) => {
          let q = sb.from("producers").select("section,delivery_potential,remaining_potential").is("deleted_at", null).limit(20000);
          if (a.campaign_label) q = q.eq("campaign_label", a.campaign_label);
          if (a.registre_id) q = q.eq("registre_id", a.registre_id);
          const { data, error } = await q;
          if (error) { console.error(error); return { erreur: "Lecture impossible" }; }
          const agg: Record<string, { producteurs: number; potentiel: number; restant: number; livre: number }> = {};
          for (const r of data ?? []) {
            const k = r.section || "Sans section";
            agg[k] ??= { producteurs: 0, potentiel: 0, restant: 0, livre: 0 };
            agg[k].producteurs++;
            agg[k].potentiel += Number(r.delivery_potential);
            agg[k].restant += Number(r.remaining_potential);
            agg[k].livre = agg[k].potentiel - agg[k].restant;
          }
          return agg;
        },
      }),
    };

    const now = new Date();
    const y = now.getUTCMonth() >= 8 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
    const system = `Tu es l'assistant analytique de COOPS APP, une application de gestion de coopératives cacao/café.
Réponds TOUJOURS en français, de façon claire et concise, avec des chiffres formatés (ex : 12 450 kg) et des tableaux markdown si utile.
Utilise exclusivement les outils pour obtenir les données ; n'invente jamais de chiffres. Si une donnée est absente, dis-le.
Les campagnes vont du 1er septembre au 31 août au format "AAAA-AAAA". Campagne en cours : ${y}-${y + 1}. Date du jour : ${now.toISOString().slice(0, 10)}.
Registres accessibles : ${(registres ?? []).map((r) => `${r.name} (${r.id})`).join(", ") || "aucun"}.
Tu es en lecture seule : tu ne peux rien modifier.`;

    const messages: ModelMessage[] = [
      ...((history ?? []).map((m) => ({ role: m.role as "user" | "assistant", content: m.content }))),
      { role: "user", content: question },
    ];

    let runId: string | undefined;
    const runFetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      if (runId && !headers.has(RUN_ID)) headers.set(RUN_ID, runId);
      const res = await fetch(input, { ...init, headers });
      runId ??= res.headers.get(RUN_ID)?.trim() || undefined;
      return res;
    };
    const openai = createOpenAI({
      baseURL: "https://ai.gateway.lovable.dev/v1",
      apiKey: Deno.env.get("LOVABLE_API_KEY")!,
      headers: { "Lovable-API-Key": Deno.env.get("LOVABLE_API_KEY")!, "X-Lovable-AIG-SDK": "vercel-ai-sdk" },
      fetch: runFetch as typeof fetch,
    });

    const result = streamText({
      model: openai.responses("openai/gpt-6-astra"),
      system,
      messages,
      tools,
      stopWhen: stepCountIs(8),
      abortSignal: req.signal,
      providerOptions: {
        openai: { forceReasoning: true, reasoningEffort: "low", reasoningSummary: "auto", store: false, include: ["reasoning.encrypted_content"] },
      },
      onError: ({ error }) => console.error("AI error", error),
      onFinish: async ({ text }) => {
        if (!text.trim()) return;
        const { error } = await sb.from("ai_chat_messages").insert({ thread_id: threadId, user_id: userId, role: "assistant", content: text });
        if (error) console.error("save assistant", error);
      },
    });

    return result.toTextStreamResponse({ headers: corsHeaders });
  } catch (e) {
    console.error(e);
    return json({ error: "Une erreur est survenue." }, 500);
  }
});
