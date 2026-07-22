import { auth, defineMcp } from "@lovable.dev/mcp-js";
import listProducersTool from "./tools/list-producers";
import listShipmentsTool from "./tools/list-shipments";
import dashboardStatsTool from "./tools/dashboard-stats";

const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "coops-app-mcp",
  title: "COOPS APP MCP",
  version: "0.1.0",
  instructions:
    "Outils métier de COOPS APP (gestion coopératives cacao/café). Utilisez list_producers et list_shipments pour explorer les données du registre de l'utilisateur, et get_dashboard_stats pour les KPI d'un registre. Toutes les données sont filtrées par RLS selon l'utilisateur connecté.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [listProducersTool, listShipmentsTool, dashboardStatsTool],
});
