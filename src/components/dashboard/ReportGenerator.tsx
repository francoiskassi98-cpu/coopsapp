import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Loader2, FileDown, Presentation } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { generateReport } from "@/lib/pptx-report-generator";
import { loadReportData } from "@/hooks/useReportData";
import { normalizeCampaign } from "@/lib/shipment-utils";
import ReportHistory from "./ReportHistory";

interface Campaign { id: string; nom: string }

export default function ReportGenerator() {
  const { user } = useAuth();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [campaignId, setCampaignId] = useState<string>("");
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");
  const [generating, setGenerating] = useState(false);
  const [historyRefresh, setHistoryRefresh] = useState(0);

  useEffect(() => {
    (async () => {
      try {
        const { data: camps } = await supabase
          .from("campaigns")
          .select("id, nom, utilise_pour_chargement, active")
          .order("date_debut", { ascending: false });
        setCampaigns((camps ?? []) as Campaign[]);
        const activeCamp = (camps ?? []).find((c: any) => c.utilise_pour_chargement) || (camps ?? [])[0];
        if (activeCamp) setCampaignId(activeCamp.id);
      } catch (e) {
        console.error(e);
        toast.error("Une erreur est survenue.");
      }
    })();
  }, []);

  const handleGenerate = async () => {
    if (!campaignId) {
      toast.error("Veuillez sélectionner une campagne.");
      return;
    }
    setGenerating(true);
    try {
      const camp = campaigns.find((c) => c.id === campaignId);
      const payload = await loadReportData(
        "campaign",
        {
          campaignId,
          campaignName: camp?.nom ?? "",
          cooperatives: [],
          project: null,
          destination: null,
          partnerId: null,
          dateFrom: dateFrom || null,
          dateTo: dateTo || null,
        },
        user?.email ?? null,
      );
      const { fileName } = await generateReport("campaign", payload);

      try {
        await (supabase.from("reports_ppt_history") as any).insert({
          user_id: user?.id,
          type_rapport: "campaign",
          campaign_id: campaignId,
          campaign_name: camp?.nom ? normalizeCampaign(camp.nom) : null,
          cooperatives: [],
          file_name: fileName,
          params: { dateFrom, dateTo },
        });
        setHistoryRefresh((n) => n + 1);
      } catch (e) {
        console.error("history insert", e);
      }

      toast.success("Rapport PowerPoint généré et téléchargé.");
    } catch (e) {
      console.error(e);
      toast.error("Une erreur est survenue.");
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Presentation className="h-5 w-5" />
            Générer un rapport PowerPoint
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <Label>Campagne</Label>
              <Select value={campaignId} onValueChange={setCampaignId}>
                <SelectTrigger><SelectValue placeholder="Sélectionner" /></SelectTrigger>
                <SelectContent>
                  {campaigns.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{normalizeCampaign(c.nom)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Du</Label>
              <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Au</Label>
              <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
            </div>
          </div>

          <p className="text-xs text-muted-foreground">
            Le rapport inclura automatiquement toutes les coopératives, projets, destinations et partenaires
            de la campagne et de la période sélectionnées (selon vos accès).
          </p>

          <div className="flex justify-end">
            <Button onClick={handleGenerate} disabled={generating}>
              {generating ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <FileDown className="h-4 w-4 mr-2" />}
              Générer & Télécharger
            </Button>
          </div>
        </CardContent>
      </Card>

      <ReportHistory refreshKey={historyRefresh} />
    </div>
  );
}
