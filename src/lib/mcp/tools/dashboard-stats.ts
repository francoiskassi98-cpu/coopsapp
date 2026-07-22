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
  name: "get_dashboard_stats",
  title: "Statistiques du tableau de bord",
  description: "Retourne les KPI (potentiel total, poids livré, potentiel restant, nombre de chargements et producteurs) pour un registre donné.",
  inputSchema: {
    registre_id: z.string().uuid().describe("UUID du registre."),
    campaign_label: z.string().trim().optional().describe("Optionnel: campagne, ex '2025-2026'."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ registre_id, campaign_label }, ctx) => {
    if (!ctx.isAuthenticated()) return { content: [{ type: "text", text: "Non authentifié" }], isError: true };
    const sb = sbForUser(ctx);
    const { data, error } = await sb.rpc("get_dashboard_stats_by_registre", {
      p_registre_id: registre_id,
      p_campaign_label: campaign_label ?? null,
    });
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    const row = Array.isArray(data) ? data[0] : data;
    return {
      content: [{ type: "text", text: JSON.stringify(row) }],
      structuredContent: { stats: row },
    };
  },
});
