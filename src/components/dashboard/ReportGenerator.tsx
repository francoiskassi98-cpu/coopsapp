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


interface Campaign { id: string; nom: string }

export default function ReportGenerator() {
  const { user } = useAuth();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [campaignId, setCampaignId] = useState<string>("");
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");
  const [generating, setGenerating] = useState(false);
  

  useEffect(() => {
    (async () => {
      try {
        const { data } = await (supabase as any)
          .from("shipments")
          .select("campaign_label")
          .not("campaign_label", "is", null)
          .limit(2000);
        const labels = Array.from(new Set(((data as any[]) || []).map((r) => r.campaign_label).filter(Boolean))).sort().reverse();
        const current = (await import("@/lib/campaign")).currentCampaign();
        if (!labels.includes(current)) labels.unshift(current);
        const list = labels.map((l) => ({ id: l, nom: l, utilise_pour_chargement: l === current, active: l === current }));
        setCampaigns(list as Campaign[]);
        setCampaignId(current);
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

      void fileName;
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
            Générer un rapport de campagne
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
            Le rapport inclura automatiquement tous les registres, projets, destinations et partenaires
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

    </div>
  );
}
