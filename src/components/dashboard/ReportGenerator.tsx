import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Loader2, FileDown, Presentation } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { generateReport, type ReportType } from "@/lib/pptx-report-generator";
import { loadReportData } from "@/hooks/useReportData";
import { normalizeCampaign } from "@/lib/shipment-utils";
import ReportHistory from "./ReportHistory";

const REPORT_TYPES: { value: ReportType; label: string; desc: string }[] = [
  { value: "campaign", label: "Rapport Campagne", desc: "KPIs, évolution, projets, destinations, conclusion" },
  { value: "cooperative", label: "Rapport Coopérative", desc: "Performance par coopérative, top sections" },
  { value: "shipments", label: "Rapport Chargements", desc: "Destinations, partenaires, historique connaissements" },
  { value: "tracability", label: "Rapport Traçabilité", desc: "Producteurs, GPS, CNI, conformité registre" },
  { value: "eudr", label: "Rapport EUDR / Durabilité", desc: "Géolocalisation, conformité, risques" },
];

interface Campaign { id: string; nom: string }
interface Partner { id: string; name: string }

export default function ReportGenerator() {
  const { user, role, cooperatives: userCoops } = useAuth();
  const [type, setType] = useState<ReportType>("campaign");
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [coopsAll, setCoopsAll] = useState<string[]>([]);
  const [partners, setPartners] = useState<Partner[]>([]);
  const [campaignId, setCampaignId] = useState<string>("");
  const [coopSel, setCoopSel] = useState<string[]>([]);
  const [project, setProject] = useState<string>("all");
  const [destination, setDestination] = useState<string>("all");
  const [partnerId, setPartnerId] = useState<string>("all");
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");
  const [generating, setGenerating] = useState(false);
  const [historyRefresh, setHistoryRefresh] = useState(0);

  useEffect(() => {
    (async () => {
      try {
        const [{ data: camps }, { data: coops }, { data: parts }] = await Promise.all([
          supabase.from("campaigns").select("id, nom, utilise_pour_chargement, active").order("date_debut", { ascending: false }),
          supabase.from("cooperatives").select("name").order("name"),
          supabase.from("partners").select("id, name").order("name"),
        ]);
        setCampaigns((camps ?? []) as Campaign[]);
        const activeCamp = (camps ?? []).find((c: any) => c.utilise_pour_chargement) || (camps ?? [])[0];
        if (activeCamp) setCampaignId(activeCamp.id);
        setCoopsAll(((coops ?? []) as { name: string }[]).map((c) => c.name));
        setPartners(((parts ?? []) as Partner[]));
      } catch (e) {
        console.error(e);
        toast.error("Une erreur est survenue.");
      }
    })();
  }, []);

  const availableCoops = useMemo(() => {
    if (role === "admin") return coopsAll;
    const allowed = new Set(userCoops.map((c) => c.toLowerCase()));
    return coopsAll.filter((c) => allowed.has(c.toLowerCase()));
  }, [coopsAll, userCoops, role]);

  const toggleCoop = (name: string) => {
    setCoopSel((p) => (p.includes(name) ? p.filter((x) => x !== name) : [...p, name]));
  };

  const handleGenerate = async () => {
    if (!campaignId) {
      toast.error("Veuillez sélectionner une campagne.");
      return;
    }
    setGenerating(true);
    try {
      const camp = campaigns.find((c) => c.id === campaignId);
      const payload = await loadReportData(
        type,
        {
          campaignId,
          campaignName: camp?.nom ?? "",
          cooperatives: coopSel,
          project: project === "all" ? null : project,
          destination: destination === "all" ? null : destination,
          partnerId: partnerId === "all" ? null : partnerId,
          dateFrom: dateFrom || null,
          dateTo: dateTo || null,
        },
        user?.email ?? null,
      );
      const { fileName } = await generateReport(type, payload);

      // Save to history
      try {
        await (supabase.from("reports_ppt_history") as any).insert({
          user_id: user?.id,
          type_rapport: type,
          campaign_id: campaignId,
          campaign_name: camp?.nom ? normalizeCampaign(camp.nom) : null,
          cooperatives: coopSel,
          file_name: fileName,
          params: { project, destination, partnerId, dateFrom, dateTo },
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
          {/* Type */}
          <div className="space-y-2">
            <Label>Type de rapport</Label>
            <RadioGroup value={type} onValueChange={(v) => setType(v as ReportType)} className="grid gap-2 md:grid-cols-2">
              {REPORT_TYPES.map((t) => (
                <label
                  key={t.value}
                  htmlFor={`rt-${t.value}`}
                  className="flex items-start gap-3 rounded-md border p-3 cursor-pointer hover:bg-muted/50 transition-colors"
                >
                  <RadioGroupItem id={`rt-${t.value}`} value={t.value} className="mt-1" />
                  <div className="space-y-0.5">
                    <p className="text-sm font-medium">{t.label}</p>
                    <p className="text-xs text-muted-foreground">{t.desc}</p>
                  </div>
                </label>
              ))}
            </RadioGroup>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
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
              <Label>Projet</Label>
              <Select value={project} onValueChange={setProject}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tous</SelectItem>
                  <SelectItem value="FT">FT</SelectItem>
                  <SelectItem value="RA">RA</SelectItem>
                  <SelectItem value="Ordinaire">Ordinaire</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Destination</Label>
              <Select value={destination} onValueChange={setDestination}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Toutes</SelectItem>
                  <SelectItem value="Abidjan">Abidjan</SelectItem>
                  <SelectItem value="San-Pedro">San-Pedro</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Partenaire</Label>
              <Select value={partnerId} onValueChange={setPartnerId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tous</SelectItem>
                  {partners.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
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

          <div className="space-y-2">
            <Label>Coopératives {coopSel.length > 0 && <span className="text-xs text-muted-foreground">({coopSel.length} sélectionnée(s))</span>}</Label>
            {availableCoops.length === 0 ? (
              <p className="text-xs text-muted-foreground">Aucune coopérative disponible.</p>
            ) : (
              <div className="grid gap-2 md:grid-cols-3 max-h-48 overflow-y-auto rounded-md border p-3">
                {availableCoops.map((c) => (
                  <label key={c} className="flex items-center gap-2 text-sm cursor-pointer">
                    <Checkbox checked={coopSel.includes(c)} onCheckedChange={() => toggleCoop(c)} />
                    <span>{c}</span>
                  </label>
                ))}
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              Aucune coopérative cochée = toutes celles auxquelles vous avez accès.
            </p>
          </div>

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
