import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { exportToExcel } from "@/lib/excel-utils";
import { fetchAllRows } from "@/lib/database-utils";
import { useCampaignLabels } from "@/hooks/useCampaign";
import { toast } from "@/hooks/use-toast";
import { FileSpreadsheet, Download, Users, Ship, MapPin, Loader2, Calendar } from "lucide-react";
import PageHeader from "@/components/PageHeader";

const ALL_CAMPAIGNS = "__all__";

/** Détails d'erreur remontés par PostgREST (uniquement pour la console). */
type QueryErrorLike = { message?: string; details?: string; hint?: string } | null | undefined;

const notifyError = (title: string, err?: unknown) => {
  if (err) console.error(`[Export] ${title}`, err);
  const e = (err ?? null) as QueryErrorLike;
  const description = e?.message || e?.details || e?.hint || undefined;
  toast({ title, description, variant: "destructive" });
};

interface ShipmentOption {
  id: string;
  connaissement: string | null;
  zone: string | null;
  registre_id: string;
  campaign_label: string | null;
}

interface NamedRef { name: string | null }

interface ShipmentExportRow {
  id: string;
  connaissement: string | null;
  project: string | null;
  destination: string | null;
  zone: string | null;
  total_weight: number | null;
  total_bags: number | null;
  partner_id: string | null;
  campaign_label: string | null;
  partners: NamedRef | null;
  registres: NamedRef | null;
}

interface DeliveryExportRow {
  shipment_id: string;
  receipt_number: string;
  net_weight: number;
  num_bags: number;
  delivery_date: string;
  producers: { full_name: string | null; section: string | null; plantation_code: string | null } | null;
  shipments?: {
    connaissement: string | null;
    project: string | null;
    destination: string | null;
    campaign_label: string | null;
    zone: string | null;
    registre_id: string | null;
    registres: NamedRef | null;
    partners: NamedRef | null;
  } | null;
}

interface RegistryExportRow {
  nom_complet: string;
  section: string;
  code_plantation: string;
  potentiel_livraison: number | null;
  potentiel_restant: number | null;
  registre_id: string;
  registres: NamedRef | null;
}

interface ProducerExportRow {
  full_name: string;
  section: string;
  plantation_code: string;
  delivery_potential: number | null;
  remaining_potential: number | null;
  registre_id: string;
  registres: NamedRef | null;
}

type PotentialSheetRow = Record<string, string | number | null>;

export default function ExportPage() {
  const [shipments, setShipments] = useState<ShipmentOption[]>([]);
  const [registres, setRegistres] = useState<{ id: string; name: string }[]>([]);
  const [selectedRegistre, setSelectedRegistre] = useState("");
  const [selectedConnaissement, setSelectedConnaissement] = useState("");
  const { labels: campaigns, activeCampaign } = useCampaignLabels();
  const [selectedCampaign, setSelectedCampaign] = useState<string>(activeCampaign);
  const [loading, setLoading] = useState<string | null>(null);

  useEffect(() => {
    let q = supabase
      .from("shipments")
      .select("id, connaissement, zone, registre_id, campaign_label")
      .eq("status", "active")
      .order("created_at", { ascending: false });
    if (selectedCampaign && selectedCampaign !== ALL_CAMPAIGNS) {
      q = q.eq("campaign_label", selectedCampaign);
    }
    q.then(({ data, error }) => {
      if (error) console.error("[Export] load shipments", error);
      setShipments((data ?? []) as ShipmentOption[]);
    });
    supabase.from("registres").select("id, name").order("name").then(({ data, error }) => {
      if (error) console.error("[Export] load registres", error);
      setRegistres(data ?? []);
    });
  }, [selectedCampaign]);


  const campaignLabel = () => {
    if (!selectedCampaign || selectedCampaign === ALL_CAMPAIGNS) return "Toutes-Campagnes";
    return selectedCampaign;
  };

  const applyCampaignFilter = (q: PaginatedQuery, column = "campaign_label"): PaginatedQuery => {
    if (selectedCampaign && selectedCampaign !== ALL_CAMPAIGNS) {
      return q.eq(column, selectedCampaign);
    }
    return q;
  };

  const exportByRegistre = async () => {
    if (!selectedRegistre) { notifyError("Sélectionnez un registre"); return; }
    setLoading("coop");
    try {
      const registreShipments = await fetchAllRows<ShipmentExportRow>(
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
      const deliveries: DeliveryExportRow[] = [];
      const chunkSize = 100;

      for (let i = 0; i < shipmentIds.length; i += chunkSize) {
        const chunk = shipmentIds.slice(i, i + chunkSize);
        const chunkDeliveries = await fetchAllRows<DeliveryExportRow>(
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

      const shipmentMap = new Map(registreShipments.map((s) => [s.id, s]));
      const rows = deliveries.map((d) => {
        const s = shipmentMap.get(d.shipment_id);
        return {
          "N°": "",
          "Connaissement": s?.connaissement || "",
          "N° Reçu": d.receipt_number,
          "Nom complet": d.producers?.full_name || "",
          "Code plantation": d.producers?.plantation_code || "",
          "Section": d.producers?.section || "",
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
    } catch (err: unknown) {
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
        const campaignShipments = await fetchAllRows<{ id: string }>("shipments", "id", {
          filters: (q) => q.eq("campaign_label", selectedCampaign).eq("status", "active"),
          pageSize: 500,
        });
        shipmentIdFilter = campaignShipments.map((s) => s.id);
        if (shipmentIdFilter.length === 0) {
          notifyError("Aucun chargement trouvé pour cette campagne.");
          setLoading(null);
          return;
        }
      }

      const deliveries: DeliveryExportRow[] = [];
      const selectStr = "*, producers(full_name, section, plantation_code), shipments!inner(connaissement, project, destination, campaign_label, zone, registre_id, registres(name), partners(name))";
      if (shipmentIdFilter && shipmentIdFilter.length > 0) {
        const chunkSize = 100;
        for (let i = 0; i < shipmentIdFilter.length; i += chunkSize) {
          const chunk = shipmentIdFilter.slice(i, i + chunkSize);
          const chunkDeliveries = await fetchAllRows<DeliveryExportRow>(
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
        const all = await fetchAllRows<DeliveryExportRow>("deliveries", selectStr, {
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
        "Connaissement": d.shipments?.connaissement || "",
        "N° Reçu": d.receipt_number,
        "Nom complet": d.producers?.full_name || "",
        "Code plantation": d.producers?.plantation_code || "",
        "Section": d.producers?.section || "",
        "Poids net (kg)": d.net_weight,
        "Nombre de sacs": d.num_bags,
        "Date livraison": d.delivery_date,
        "Projet": d.shipments?.project || "",
        "Partenaire": d.shipments?.partners?.name || "",
        "Zone": d.shipments?.registres?.name || d.shipments?.zone || "",
        "Destination": d.shipments?.destination || "",
        "Campagne": d.shipments?.campaign_label || "",
      }));

      const filename = mode === "connaissement"
        ? `Chargement-${selectedConnaissement}.xlsx`
        : `Knf-Modèle-FA-${campaignLabel()}.xlsx`;
      await exportToExcel(rows, filename, "Chargement");
      toast({ title: "Export réussi" });
    } catch (err: unknown) {
      notifyError("Erreur lors de l'export des chargements", err);
    }
    setLoading(null);
  };


  const exportPotentialByRegistre = async () => {
    setLoading("potential");
    try {
      let rows: PotentialSheetRow[] = [];
      const registreFilter = selectedRegistre || null;

      if (selectedCampaign && selectedCampaign !== ALL_CAMPAIGNS) {
        const registry = await fetchAllRows<RegistryExportRow>(
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
        rows = registry.map((p) => ({
          "Registre": p.registres?.name || "",
          "Nom complet": p.nom_complet,
          "Section": p.section,
          "Code plantation": p.code_plantation,
          "Potentiel initial (kg)": p.potentiel_livraison,
          "Potentiel restant (kg)": p.potentiel_restant,
        }));

        // Fallback: si aucune ligne dans producer_registry pour cette campagne,
        // on retombe sur la table producers (registre courant).
        if (rows.length === 0) {
          const producers = await fetchAllRows<ProducerExportRow>(
            "producers",
            "full_name, section, plantation_code, delivery_potential, remaining_potential, registre_id, registres(name)",
            {
              filters: (q) => registreFilter ? q.eq("registre_id", registreFilter) : q,
              pageSize: 500,
            }
          );
          rows = producers.map((p) => ({
            "Registre": p.registres?.name || "",
            "Nom complet": p.full_name,
            "Section": p.section,
            "Code plantation": p.plantation_code,
            "Potentiel initial (kg)": p.delivery_potential,
            "Potentiel restant (kg)": p.remaining_potential,
          }));
        }

      } else {
        const producers = await fetchAllRows<ProducerExportRow>(
          "producers",
          "full_name, section, plantation_code, delivery_potential, remaining_potential, registre_id, registres(name)",
          {
            filters: (q) => registreFilter ? q.eq("registre_id", registreFilter) : q,
            pageSize: 500,
          }
        );
        rows = producers.map((p) => ({
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
    } catch (err: unknown) {
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
            <Badge variant="secondary" className="shrink-0">
              Active : {activeCampaign}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <Select value={selectedCampaign} onValueChange={setSelectedCampaign}>
            <SelectTrigger className="max-w-md"><SelectValue placeholder="Sélectionner une campagne" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_CAMPAIGNS}>Toutes les campagnes (historique global)</SelectItem>
              {campaigns.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}{c === activeCampaign ? " (active)" : ""}
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
