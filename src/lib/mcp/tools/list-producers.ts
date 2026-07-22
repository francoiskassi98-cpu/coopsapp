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
  name: "list_producers",
  title: "Lister les producteurs",
  description: "Liste les producteurs accessibles à l'utilisateur (filtré par RLS/registres). Retourne au plus 200 lignes.",
  inputSchema: {
    search: z.string().trim().optional().describe("Filtre optionnel sur le nom du producteur."),
    limit: z.number().int().min(1).max(200).optional().describe("Nombre max de lignes (défaut 50)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ search, limit }, ctx) => {
    if (!ctx.isAuthenticated()) return { content: [{ type: "text", text: "Non authentifié" }], isError: true };
    const sb = sbForUser(ctx);
    let q = sb.from("producers")
      .select("id,full_name,section,plantation_code,delivery_potential,remaining_potential,sexe,is_active,registre_id")
      .order("full_name", { ascending: true })
      .limit(limit ?? 50);
    if (search) q = q.ilike("full_name", `%${search}%`);
    const { data, error } = await q;
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: `${data?.length ?? 0} producteur(s)` }],
      structuredContent: { rows: data ?? [] },
    };
  },
});
