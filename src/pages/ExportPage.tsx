import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { exportToExcel } from "@/lib/excel-utils";
import { fetchAllRows } from "@/lib/database-utils";
import { useCampaigns, useActiveCampaign } from "@/hooks/useActiveCampaign";
import { toast } from "@/hooks/use-toast";
import { FileSpreadsheet, Download, Users, Ship, MapPin, Loader2, Calendar } from "lucide-react";
import PageHeader from "@/components/PageHeader";

const ALL_CAMPAIGNS = "__all__";

const notifyError = (title: string, err?: any) => {
  if (err) console.error(`[Export] ${title}`, err);
  const description = err?.message || err?.details || err?.hint || undefined;
  toast({ title, description, variant: "destructive" });
};

export default function ExportPage() {
  const [shipments, setShipments] = useState<any[]>([]);
  const [registres, setRegistres] = useState<{ id: string; name: string }[]>([]);
  const [selectedRegistre, setSelectedRegistre] = useState("");
  const [selectedConnaissement, setSelectedConnaissement] = useState("");
  const [selectedCampaign, setSelectedCampaign] = useState<string>("");
  const [loading, setLoading] = useState<string | null>(null);
  const { campaigns } = useCampaigns();
  const { campaign: activeCampaign } = useActiveCampaign();

  useEffect(() => {
    if (!selectedCampaign && activeCampaign) {
      setSelectedCampaign(activeCampaign.id);
    }
  }, [activeCampaign, selectedCampaign]);

  useEffect(() => {
    let q: any = (supabase as any)
      .from("shipments")
      .select("id, connaissement, zone, registre_id, campaign_label")
      .eq("status", "active")
      .order("created_at", { ascending: false });
    if (selectedCampaign && selectedCampaign !== ALL_CAMPAIGNS) {
      q = q.eq("campaign_label", selectedCampaign);
    }
    q.then(({ data, error }: any) => {
      if (error) console.error("[Export] load shipments", error);
      setShipments(data || []);
    });
    supabase.from("registres").select("id, name").order("name").then(({ data, error }) => {
      if (error) console.error("[Export] load registres", error);
      setRegistres((data as any) || []);
    });
  }, [selectedCampaign]);

  const campaignLabel = () => {
    if (!selectedCampaign || selectedCampaign === ALL_CAMPAIGNS) return "Toutes-Campagnes";
    return campaigns.find((c) => c.id === selectedCampaign)?.nom || "Campagne";
  };

  const applyCampaignFilter = (q: any, column = "campaign_label") => {
    if (selectedCampaign && selectedCampaign !== ALL_CAMPAIGNS) {
      return q.eq(column, selectedCampaign);
    }
    return q;
  };

  const exportByRegistre = async () => {
    if (!selectedRegistre) { notifyError("Sélectionnez un registre"); return; }
    setLoading("coop");
    try {
      const registreShipments = await fetchAllRows(
        "shipments",
        "id, connaissement, project, destination, zone, total_weight, total_bags, partner_id, campaign_label, partners(name), registres(name)",
        {
          filters: (q) => applyCampaignFilter(q.eq("registre_id", selectedRegistre).eq("status", "active")),
          order: { column: "created_at", ascending: false },
          pageSize: 500,
        }
      );

      if (!registreShipments || registreShipments.length === 0) {
        notifyError("Aucun chargement trouvé pour ce registre dans cette campagne.");
        setLoading(null);
        return;
      }

      const shipmentIds = registreShipments.map((s) => s.id);
      const deliveries: any[] = [];
      const chunkSize = 100;

      for (let i = 0; i < shipmentIds.length; i += chunkSize) {
        const chunk = shipmentIds.slice(i, i + chunkSize);
        const chunkDeliveries = await fetchAllRows(
          "deliveries",
          "*, producers(full_name, section, plantation_code)",
          {
            filters: (q) => q.in("shipment_id", chunk),
            order: { column: "receipt_number", ascending: true },
            pageSize: 500,
          }
        );
        deliveries.push(...chunkDeliveries);
      }

      const shipmentMap = Object.fromEntries(registreShipments.map((s) => [s.id, s]));
      const rows = deliveries.map((d) => {
        const s: any = shipmentMap[d.shipment_id] || {};
        return {
          "N°": "",
          "Connaissement": s?.connaissement || "",
          "N° Reçu": d.receipt_number,
          "Nom complet": (d.producers as any)?.full_name || "",
          "Code plantation": (d.producers as any)?.plantation_code || "",
          "Section": (d.producers as any)?.section || "",
          "Poids net (kg)": d.net_weight,
          "Nombre de sacs": d.num_bags,
          "Date livraison": d.delivery_date,
          "Projet": s?.project || "",
          "Partenaire": s?.partners?.name || "",
          "Zone": s?.registres?.name || s?.zone || "",
          "Destination": s?.destination || "",
          "Campagne": s?.campaign_label || "",
        };
      });

      if (rows.length === 0) { notifyError("Aucune livraison trouvée pour ce registre."); setLoading(null); return; }
      const registreName = registres.find(c => c.id === selectedRegistre)?.name || selectedRegistre;
      await exportToExcel(rows, `Chargements-${registreName}-${campaignLabel()}.xlsx`, "Chargement");
      toast({ title: "Export réussi" });
    } catch (err: any) {
      notifyError("Erreur lors de l'export par registre", err);
    }
    setLoading(null);
  };

  const exportAllOrByConnaissement = async (mode: "all" | "connaissement") => {
    setLoading(mode);
    try {
      let shipmentIdFilter: string[] | undefined;

      if (mode === "connaissement") {
        if (!selectedConnaissement) { notifyError("Sélectionnez un connaissement"); setLoading(null); return; }
        const { data: shipment, error: shErr } = await supabase
          .from("shipments").select("id").eq("connaissement", selectedConnaissement).eq("status", "active").maybeSingle();
        if (shErr) { notifyError("Erreur SQL lors de la recherche du connaissement", shErr); setLoading(null); return; }
        if (!shipment) { notifyError("Connaissement introuvable"); setLoading(null); return; }
        shipmentIdFilter = [shipment.id];
      } else if (selectedCampaign && selectedCampaign !== ALL_CAMPAIGNS) {
        const campaignShipments = await fetchAllRows("shipments", "id", {
          filters: (q) => q.eq("campaign_label", selectedCampaign).eq("status", "active"),
          pageSize: 500,
        });
        shipmentIdFilter = campaignShipments.map((s: any) => s.id);
        if (shipmentIdFilter.length === 0) {
          notifyError("Aucun chargement trouvé pour cette campagne.");
          setLoading(null);
          return;
        }
      }

      const deliveries: any[] = [];
      const selectStr = "*, producers(full_name, section, plantation_code), shipments!inner(connaissement, project, destination, campaign_label, zone, registre_id, registres(name), partners(name))";
      if (shipmentIdFilter && shipmentIdFilter.length > 0) {
        const chunkSize = 100;
        for (let i = 0; i < shipmentIdFilter.length; i += chunkSize) {
          const chunk = shipmentIdFilter.slice(i, i + chunkSize);
          const chunkDeliveries = await fetchAllRows(
            "deliveries",
            selectStr,
            {
              filters: (q) => q.in("shipment_id", chunk),
              order: { column: "receipt_number", ascending: true },
              pageSize: 500,
            }
          );
          deliveries.push(...chunkDeliveries);
        }
      } else {
        const all = await fetchAllRows("deliveries", selectStr, {
          order: { column: "receipt_number", ascending: true },
          pageSize: 500,
        });
        deliveries.push(...all);
      }

      if (!deliveries || deliveries.length === 0) {
        notifyError("Aucun enregistrement trouvé pour les critères sélectionnés.");
        setLoading(null);
        return;
      }

      const rows = deliveries.map((d) => ({
        "N°": "",
        "Connaissement": (d.shipments as any)?.connaissement || "",
        "N° Reçu": d.receipt_number,
        "Nom complet": (d.producers as any)?.full_name || "",
        "Code plantation": (d.producers as any)?.plantation_code || "",
        "Section": (d.producers as any)?.section || "",
        "Poids net (kg)": d.net_weight,
        "Nombre de sacs": d.num_bags,
        "Date livraison": d.delivery_date,
        "Projet": (d.shipments as any)?.project || "",
        "Partenaire": (d.shipments as any)?.partners?.name || "",
        "Zone": (d.shipments as any)?.registres?.name || (d.shipments as any)?.zone || "",
        "Destination": (d.shipments as any)?.destination || "",
        "Campagne": (d.shipments as any)?.campaign_label || "",
      }));

      const filename = mode === "connaissement"
        ? `Chargement-${selectedConnaissement}.xlsx`
        : `Knf-Modèle-FA-${campaignLabel()}.xlsx`;
      await exportToExcel(rows, filename, "Chargement");
      toast({ title: "Export réussi" });
    } catch (err: any) {
      notifyError("Erreur lors de l'export des chargements", err);
    }
    setLoading(null);
  };

  const exportPotentialByRegistre = async () => {
    setLoading("potential");
    try {
      let rows: any[] = [];
      const registreFilter = selectedRegistre || null;

      if (selectedCampaign && selectedCampaign !== ALL_CAMPAIGNS) {
        const registry = await fetchAllRows(
          "producer_registry",
          "nom_complet, section, code_plantation, potentiel_livraison, potentiel_restant, registre_id, registres(name)",
          {
            filters: (q) => {
              let x = q.eq("campaign_label", selectedCampaign);
              if (registreFilter) x = x.eq("registre_id", registreFilter);
              return x;
            },
            pageSize: 500,
          }
        );
        rows = registry.map((p: any) => ({
          "Registre": p.registres?.name || "",
          "Nom complet": p.nom_complet,
          "Section": p.section,
          "Code plantation": p.code_plantation,
          "Potentiel initial (kg)": p.potentiel_livraison,
          "Potentiel restant (kg)": p.potentiel_restant,
        }));
      } else {
        const producers = await fetchAllRows(
          "producers",
          "full_name, section, plantation_code, delivery_potential, remaining_potential, registre_id, registres(name)",
          {
            filters: (q) => registreFilter ? q.eq("registre_id", registreFilter) : q,
            pageSize: 500,
          }
        );
        rows = producers.map((p: any) => ({
          "Registre": p.registres?.name || "",
          "Nom complet": p.full_name,
          "Section": p.section,
          "Code plantation": p.plantation_code,
          "Potentiel initial (kg)": p.delivery_potential,
          "Potentiel restant (kg)": p.remaining_potential,
        }));
      }

      if (!rows.length) {
        notifyError("Aucun enregistrement trouvé pour les critères sélectionnés.");
        setLoading(null);
        return;
      }

      rows.sort((a, b) => String(a["Registre"]).localeCompare(String(b["Registre"])));

      const registreName = registreFilter
        ? (registres.find(r => r.id === registreFilter)?.name || "Registre")
        : "Tous-Registres";
      await exportToExcel(rows, `Potentiel-${registreName}-${campaignLabel()}.xlsx`, "Potentiel");
      toast({ title: "Export réussi" });
    } catch (err: any) {
      notifyError("Erreur lors de l'export du potentiel par registre", err);
    }
    setLoading(null);
  };


  return (
    <div className="p-4 md:p-6 space-y-6">
      <PageHeader
        icon={FileSpreadsheet}
        title="Export Excel"
        description="Exportez vos données au format Excel selon la campagne sélectionnée."
      />

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-primary/10">
              <Calendar className="h-5 w-5 text-primary" />
            </div>
            <div className="flex-1">
              <CardTitle className="text-base">Campagne à exporter</CardTitle>
              <CardDescription>
                Tous les exports ci-dessous seront filtrés sur cette campagne. Sélectionnez « Toutes les campagnes » pour exporter l'historique complet.
              </CardDescription>
            </div>
            {activeCampaign && (
              <Badge variant="secondary" className="shrink-0">
                Active : {activeCampaign.nom}
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <Select value={selectedCampaign} onValueChange={setSelectedCampaign}>
            <SelectTrigger className="max-w-md"><SelectValue placeholder="Sélectionner une campagne" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_CAMPAIGNS}>Toutes les campagnes (historique global)</SelectItem>
              {campaigns.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.nom}{c.utilise_pour_chargement ? " (active)" : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        <Card className="flex flex-col">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2 mb-1">
              <div className="p-2 rounded-lg bg-primary/10">
                <Users className="h-5 w-5 text-primary" />
              </div>
              <CardTitle className="text-base">Par registre</CardTitle>
            </div>
            <CardDescription>Exporter tous les chargements d'un registre</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 flex-1">
            <div className="space-y-1.5">
              <Label className="text-xs">Registre</Label>
              <Select value={selectedRegistre} onValueChange={setSelectedRegistre}>
                <SelectTrigger><SelectValue placeholder="Sélectionner…" /></SelectTrigger>
                <SelectContent>
                  {registres.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button onClick={exportByRegistre} disabled={loading === "coop"} className="mt-auto w-full">
              {loading === "coop" ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Download className="h-4 w-4 mr-2" />}
              Exporter
            </Button>
          </CardContent>
        </Card>

        <Card className="flex flex-col">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2 mb-1">
              <div className="p-2 rounded-lg bg-primary/10">
                <Ship className="h-5 w-5 text-primary" />
              </div>
              <CardTitle className="text-base">Chargements</CardTitle>
            </div>
            <CardDescription>Tous les chargements de la campagne ou filtrer par connaissement</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 flex-1">
            <div className="space-y-1.5">
              <Label className="text-xs">Connaissement (optionnel)</Label>
              <Select value={selectedConnaissement} onValueChange={setSelectedConnaissement}>
                <SelectTrigger><SelectValue placeholder="Tous les chargements" /></SelectTrigger>
                <SelectContent>
                  {shipments.filter((s) => s.connaissement).map((s) => (
                    <SelectItem key={s.id} value={s.connaissement}>{s.connaissement}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-2 mt-auto">
              <Button onClick={() => exportAllOrByConnaissement("all")} disabled={!!loading} variant="outline" className="flex-1">
                {loading === "all" ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Download className="h-4 w-4 mr-2" />}
                Tout
              </Button>
              <Button onClick={() => exportAllOrByConnaissement("connaissement")} disabled={!!loading || !selectedConnaissement} className="flex-1">
                {loading === "connaissement" ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Download className="h-4 w-4 mr-2" />}
                Par n°
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="flex flex-col">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2 mb-1">
              <div className="p-2 rounded-lg bg-primary/10">
                <MapPin className="h-5 w-5 text-primary" />
              </div>
              <CardTitle className="text-base">Potentiel par registre</CardTitle>
            </div>
            <CardDescription>Potentiel initial et restant des producteurs</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 flex-1">
            <div className="space-y-1.5">
              <Label className="text-xs">Registre (optionnel)</Label>
              <Select
                value={selectedRegistre || "__all_reg__"}
                onValueChange={(v) => setSelectedRegistre(v === "__all_reg__" ? "" : v)}
              >
                <SelectTrigger><SelectValue placeholder="Tous les registres" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all_reg__">Tous les registres</SelectItem>
                  {registres.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button onClick={exportPotentialByRegistre} disabled={loading === "potential"} className="w-full mt-auto">
              {loading === "potential" ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Download className="h-4 w-4 mr-2" />}
              Exporter
            </Button>
          </CardContent>
        </Card>

      </div>
    </div>
  );
}
