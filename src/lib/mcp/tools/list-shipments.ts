import { createClient } from "@supabase/supabase-js";
import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { z } from "zod";

function sbForUser(ctx: ToolContext) {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
    global: { headers: { Authorization: `Bearer ${ctx.getToken()}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export default defineTool({
  name: "list_shipments",
  title: "Lister les chargements",
  description: "Liste les chargements récents accessibles à l'utilisateur (filtré par RLS). Optionnellement filtré par campagne.",
  inputSchema: {
    campaign_label: z.string().trim().optional().describe("Ex: '2025-2026'."),
    limit: z.number().int().min(1).max(200).optional().describe("Nombre max de lignes (défaut 50)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ campaign_label, limit }, ctx) => {
    if (!ctx.isAuthenticated()) return { content: [{ type: "text", text: "Non authentifié" }], isError: true };
    const sb = sbForUser(ctx);
    let q = sb.from("shipments")
      .select("id,lot_number,campaign_label,total_weight,total_bags,departure_date,is_cancelled,registre_id")
      .order("created_at", { ascending: false })
      .limit(limit ?? 50);
    if (campaign_label) q = q.eq("campaign_label", campaign_label);
    const { data, error } = await q;
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: `${data?.length ?? 0} chargement(s)` }],
      structuredContent: { rows: data ?? [] },
    };
  },
});
