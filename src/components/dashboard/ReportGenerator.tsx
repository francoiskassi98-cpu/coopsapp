import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Loader2, FileDown, Presentation, Eye, FileSpreadsheet } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { generateReport, generateReportAnnex } from "@/lib/pptx-report-generator";
import { loadReportData, type ReportPayload } from "@/hooks/useReportData";
import { useCampaignLabels } from "@/hooks/useCampaign";
import { useRegistres } from "@/hooks/useRegistres";

const ALL = "__all__";
const fmt = (v: number) => Math.round(v).toLocaleString("fr-FR");

export default function ReportGenerator() {
  const { user } = useAuth();
  const { labels: campaigns, activeCampaign } = useCampaignLabels();
  const { registres } = useRegistres();
  const [campaignId, setCampaignId] = useState<string>(activeCampaign);
  const [registreId, setRegistreId] = useState<string>(ALL);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [busy, setBusy] = useState<null | "preview" | "pptx" | "xlsx">(null);
  const [preview, setPreview] = useState<ReportPayload | null>(null);

  const load = () => loadReportData(
    { campaignId: campaignId || activeCampaign, registreId: registreId === ALL ? null : registreId, dateFrom: dateFrom || null, dateTo: dateTo || null },
    user?.email ?? null,
  );

  const run = async (kind: "preview" | "pptx" | "xlsx") => {
    if (!(campaignId || activeCampaign)) { toast.error("Veuillez sélectionner une campagne."); return; }
    setBusy(kind);
    try {
      const payload = await load();
      setPreview(payload);
      if (kind === "pptx") { await generateReport(payload); toast.success("Rapport PowerPoint téléchargé."); }
      if (kind === "xlsx") { await generateReportAnnex(payload); toast.success("Annexe Excel téléchargée."); }
    } catch (e) {
      console.error("[ReportGenerator]", e);
      toast.error("Une erreur est survenue.");
    } finally {
      setBusy(null);
    }
  };

  const reset = () => setPreview(null);
  const T = preview?.metrics.totals;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Presentation className="h-5 w-5" />
          Générer un rapport de campagne
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid gap-4 md:grid-cols-4">
          <div className="space-y-2">
            <Label>Campagne</Label>
            <Select value={campaignId || activeCampaign} onValueChange={(v) => { setCampaignId(v); reset(); }}>
              <SelectTrigger><SelectValue placeholder="Sélectionner" /></SelectTrigger>
              <SelectContent>
                {campaigns.map((c) => <SelectItem key={c} value={c}>{c}{c === activeCampaign ? " (active)" : ""}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Registre</Label>
            <Select value={registreId} onValueChange={(v) => { setRegistreId(v); reset(); }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Tous les registres</SelectItem>
                {registres.map((r) => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Du</Label>
            <Input type="date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); reset(); }} />
          </div>
          <div className="space-y-2">
            <Label>Au</Label>
            <Input type="date" value={dateTo} onChange={(e) => { setDateTo(e.target.value); reset(); }} />
          </div>
        </div>

        {T && (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              ["Volume livré", `${fmt(T.delivered)} kg`],
              ["Restant à livrer", `${fmt(T.remaining)} kg`],
              ["Chargements", fmt(T.shipments)],
              ["Producteurs livrants", `${fmt(T.producersDelivering)} / ${fmt(T.producersReferenced)}`],
              ["Taux de réalisation", T.rate === null ? "Non calculable" : `${T.rate.toFixed(1)} %`],
              ["Registres livrants", `${T.registresDelivering} / ${T.registresTotal}`],
              ["Sections livrantes", `${T.sectionsDelivering} / ${T.sectionsTotal}`],
              ["Moyenne / producteur", T.avgPerProducer === null ? "Non calculable" : `${fmt(T.avgPerProducer)} kg`],
            ].map(([l, v]) => (
              <div key={l} className="rounded-md border bg-muted/30 p-3">
                <p className="text-xs text-muted-foreground">{l}</p>
                <p className="text-lg font-semibold">{v}</p>
              </div>
            ))}
            {preview.metrics.anomalies.length > 0 && (
              <div className="sm:col-span-2 lg:col-span-4 rounded-md border border-destructive/40 p-3 text-sm">
                <p className="font-medium text-destructive">Points de vigilance</p>
                <ul className="list-disc pl-5 text-muted-foreground">
                  {preview.metrics.anomalies.map((a) => <li key={a}>{a}</li>)}
                </ul>
              </div>
            )}
          </div>
        )}

        <p className="text-xs text-muted-foreground">
          Le rapport utilise uniquement les chargements officiels (non annulés) de la campagne et du périmètre choisis, selon vos accès.
        </p>

        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="outline" onClick={() => run("preview")} disabled={!!busy}>
            {busy === "preview" ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Eye className="h-4 w-4 mr-2" />}
            Aperçu des indicateurs
          </Button>
          <Button variant="outline" onClick={() => run("xlsx")} disabled={!!busy}>
            {busy === "xlsx" ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <FileSpreadsheet className="h-4 w-4 mr-2" />}
            Annexe Excel
          </Button>
          <Button onClick={() => run("pptx")} disabled={!!busy}>
            {busy === "pptx" ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <FileDown className="h-4 w-4 mr-2" />}
            Générer le PowerPoint
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
