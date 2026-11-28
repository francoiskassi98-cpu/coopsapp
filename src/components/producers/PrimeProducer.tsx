import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/hooks/use-toast";
import { Calculator, Download, Save, Coins } from "lucide-react";
import { generatePrimeExcel } from "@/lib/prime-excel";
import { useQueryClient } from "@tanstack/react-query";
import { calculatePrimeRows, fetchPrimePages, primePeriodError, primePlantationResults, type PrimeDateBasis, type PrimePlantation, type PrimeResult } from "@/lib/prime-calculation";
import { useCampaignLabels } from "@/hooks/useCampaign";
import { useRegistres } from "@/hooks/useRegistres";


interface Coop { id: string; name: string; logo_path?: string | null }
interface Campaign { id: string; nom: string }
interface ProjectOpt { id: string; name: string; label: string }
interface ProducerOpt { id: string; full_name: string; nom: string | null; prenom: string | null; section: string; registre_id: string | null }

interface PrimeDelivery {
  id: string; shipment_id: string; producer_id: string; net_weight: number; campaign_label: string;
  shipments: { connaissement: string | null; project: string; delivery_start: string; delivery_end: string };
}
interface IncludedShipment { id: string; name: string; project: string; volume: number }

export default function PrimeProducer() {
  
  const { registres } = useRegistres();
  const coops: Coop[] = registres;

  const [sections, setSections] = useState<string[]>([]);
  const [producersList, setProducersList] = useState<ProducerOpt[]>([]);
  const [projects, setProjects] = useState<ProjectOpt[]>([]);

  const [coopId, setCoopId] = useState<string>("");
  const { labels: campaignLabels, activeCampaign } = useCampaignLabels();
  const campaigns: Campaign[] = useMemo(() => campaignLabels.map((l) => ({ id: l, nom: l })), [campaignLabels]);
  const [campaignId, setCampaignId] = useState<string>(activeCampaign);
  const [projectId, setProjectId] = useState<string>("all");
  const [section, setSection] = useState<string>("all");
  const [producerId, setProducerId] = useState<string>("all");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [bonusType, setBonusType] = useState<"total" | "per_kg">("per_kg");
  const [amount, setAmount] = useState<number>(0);

  const [rows, setRows] = useState<PrimeResult[]>([]);
  const dateBasis: PrimeDateBasis = "delivery";
  const [included, setIncluded] = useState<IncludedShipment[]>([]);
  const queryClient = useQueryClient();
  const busy = useRef(false);
  const filtersKey = JSON.stringify([coopId, campaignId, projectId, section, producerId, startDate, endDate, bonusType, amount, dateBasis]);
  const currentFilters = useRef(filtersKey);
  currentFilters.current = filtersKey;
  useEffect(() => { setRows([]); setIncluded([]); }, [filtersKey]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // Sélection auto : un seul registre accessible → on le sélectionne, sinon « Tous »
  useEffect(() => {

    if (coops.length === 0) return;
    setCoopId((prev) => prev || (coops.length === 1 ? coops[0].id : "all"));
  }, [coops]);



  // Charge producteurs + sections + projets en fonction du filtre registre
  useEffect(() => {
    if (!coopId && coops.length === 0) { setSections([]); setProducersList([]); setProjects([]); return; }
    let cancelled = false;
    (async () => {
      let all: ProducerOpt[] = [];
      let from = 0;
      while (true) {
        let q = supabase.from("producers")
          .select("id,full_name,nom,prenom,section,registre_id")
          .order("nom").order("id")
          .range(from, from + 499);
        if (coopId && coopId !== "all") q = q.eq("registre_id", coopId);
        if (campaignId !== "all") q = q.eq("campaign_label", campaignId);
        const { data, error } = await q;
        if (error) { console.error("[PrimeProducer.options]", error); return; }
        if (!data || data.length === 0) break;
        all = all.concat(data);
        from += data.length;
      }
      if (cancelled) return;
      setProducersList(all);
      setSections([...new Set(all.map(p => p.section).filter(Boolean))].sort());
    })();
    (async () => {
      // Les projets sont partagés au niveau coopérative : pas de filtre par registre.
      const { data, error } = await supabase.from("projects").select("id,name,cooperatives(name)").order("name");
      if (error) { console.error("[PrimeProducer.projects]", error); setProjects([]); return; }
      if (!cancelled) setProjects((data ?? []).map((p) => ({ id: p.id, name: p.name, label: (data ?? []).filter((other) => other.name === p.name).length > 1 ? `${p.name} — ${p.cooperatives?.name ?? "Non renseigné"}` : p.name })));
    })();
    setSection("all");
    setProducerId("all");
    setProjectId("all");
    return () => { cancelled = true; };
  }, [coopId, coops, campaignId]);

  const coopSelected = useMemo(() => coops.find(c => c.id === coopId), [coops, coopId]);
  const projectSelected = useMemo(() => projects.find(p => p.id === projectId), [projects, projectId]);
  const isAllCoops = coopId === "all";

  async function calculate() {
    if (!coopId || !startDate || !endDate || amount <= 0) {
      toast({ title: "Champs requis", description: "Registre, période et montant sont requis.", variant: "destructive" });
      return;
    }
    const periodError = primePeriodError(startDate, endDate, campaignId);
    if (periodError) {
      toast({ title: "Période invalide", description: periodError, variant: "destructive" });
      return;
    }
    if (busy.current) return;
    busy.current = true;
    const calculationKey = filtersKey;
    setLoading(true);
    setRows([]);
    setIncluded([]);
    try {
      // Shipments are selected by their delivery period start.
      const deliveries = await fetchPrimePages<PrimeDelivery>((from, to) => {
        let q = supabase.from("deliveries")
          .select("id,shipment_id,producer_id,net_weight,campaign_label,shipments!inner(registre_id,campaign_label,is_cancelled,project_id,deleted_at,delivery_start,delivery_end,connaissement,project)")
          .eq("shipments.is_cancelled", false).is("shipments.deleted_at", null)
          .order("id");
        // Période de livraison du chargement (début de livraison), jamais la date de départ.
        q = q.gte("shipments.delivery_start", startDate).lte("shipments.delivery_start", endDate);
        if (!isAllCoops) q = q.eq("shipments.registre_id", coopId);
        if (campaignId !== "all") q = q.eq("campaign_label", campaignId).eq("shipments.campaign_label", campaignId);
        if (projectId !== "all") q = q.eq("shipments.project_id", projectId);
        return q.range(from, to);
      });
      const ids = [...new Set([...deliveries.map((d) => d.producer_id), ...(producerId === "all" ? [] : [producerId])])];
      const plantations: PrimePlantation[] = [];
      for (let i = 0; i < ids.length; i += 500) {
        const chunk = ids.slice(i, i + 500);
        const data = await fetchPrimePages<PrimePlantation>((from, to) => supabase.from("producers")
          .select("id,producer_code,full_name,section,registre_id,campaign_label")
          .in("id", chunk).order("id").range(from, to));
        plantations.push(...data);
      }
      // Delivery campaign is authoritative, even if plantation metadata was subsequently updated.
      const deliveryCampaigns = new Map(deliveries.map((d) => [d.producer_id, d.campaign_label]));
      const out = calculatePrimeRows(deliveries, plantations.map((p) => ({ ...p, campaign_label: deliveryCampaigns.get(p.id) ?? p.campaign_label })), new Map(coops.map((c) => [c.id, c.name])), amount, bonusType, section, producerId);
      const accepted = new Set(out.flatMap((r) => r.plantations.map((p) => p.producer_id)));
      const summary = new Map<string, IncludedShipment>();
      for (const d of deliveries) {
        if (!accepted.has(d.producer_id)) continue;
        const entry = summary.get(d.shipment_id) ?? { id: d.shipment_id, name: d.shipments.connaissement || "Non renseigné", project: d.shipments.project, volume: 0 };
        entry.volume += Number(d.net_weight);
        summary.set(d.shipment_id, entry);
      }
      if (currentFilters.current !== calculationKey) return;
      setRows(out);
      setIncluded([...summary.values()]);
      toast({ title: out.length ? "Calcul terminé" : "Aucune livraison", description: out.length ? `${out.length} producteur(s), ${summary.size} chargement(s) pris en compte.` : "Aucune livraison ne correspond aux filtres sélectionnés. Vérifiez la période et le projet." });
    } catch (e) {
      console.error("[PrimeProducer.calculate]", e);
      toast({ title: "Erreur", description: "Une erreur est survenue.", variant: "destructive" });
    } finally {
      busy.current = false;
      setLoading(false);
    }
  }


  async function saveCalc() {
    if (!coopId || rows.length === 0) return;
    if (isAllCoops) {
      toast({ title: "Non disponible", description: "L'enregistrement n'est pas disponible en mode « Tous les registres ». Sélectionnez un registre.", variant: "destructive" });
      return;
    }
    if (busy.current || campaignId === "all") return;
    busy.current = true;
    setSaving(true);
    try {
      const { data: setting, error } = await supabase.from("producer_bonus_settings").insert({
        registre_id: coopId,
        campaign_label: campaignId,
        section: section !== "all" ? section : null,
        start_date: startDate,
        end_date: endDate,
        bonus_type: bonusType,
        amount,
        label: `Prime ${startDate} → ${endDate} — Période de livraison — Projet ${projectSelected?.name ?? "Tous"}`,
      }).select("id").single();
      if (error) throw error;
      const settingId = setting.id;
      const results = primePlantationResults(rows).map((r) => ({
        ...r, setting_id: settingId, period_start: startDate, period_end: endDate,
      }));
      for (let i = 0; i < results.length; i += 500) {
        const { error: ie } = await supabase.from("producer_bonus_results").insert(results.slice(i, i + 500));
        if (ie) throw ie;
      }
      await queryClient.invalidateQueries({ queryKey: ["producer-detail"] });
      toast({ title: "Enregistré", description: "Le calcul de prime a été sauvegardé." });
    } catch (e) {
      console.error(e);
      toast({ title: "Erreur", description: "Une erreur est survenue.", variant: "destructive" });
    } finally {
      busy.current = false;
      setSaving(false);
    }
  }

  async function exportXlsx() {
    if (rows.length === 0) return;
    try {
      await generatePrimeExcel({
        cooperativeName: isAllCoops ? "Tous les registres" : (coopSelected?.name ?? ""),
        projectName: projectSelected?.name ?? "Tous",
        logoUrl: isAllCoops ? null : (coopSelected?.logo_path ?? null),
        startDate, endDate, dateBasis,
        bonusType, amount,
        rows,
      });
      toast({ title: "Export généré" });
    } catch (e) {
      console.error(e);
      toast({ title: "Erreur", description: "Une erreur est survenue.", variant: "destructive" });
    }
  }

  const totalVolume = rows.reduce((s, r) => s + r.volume, 0);
  const totalBonus = rows.reduce((s, r) => s + r.bonus, 0);

  return (
    <div className="space-y-4 animate-fade-in">
      <Card className="shadow-glass">
        <CardHeader>
          <CardTitle className="flex items-center gap-3 text-base">
            <span className="h-10 w-10 rounded-2xl bg-primary/10 text-primary flex items-center justify-center">
              <Coins className="h-5 w-5" />
            </span>
            <div>
              <div className="font-bold">Paramètres du calcul</div>
              <p className="text-xs font-normal text-muted-foreground mt-0.5">Sélectionnez la période et le montant pour calculer les primes.</p>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <fieldset disabled={loading || saving} className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-3">
            <div>
              <Label className="text-xs">Registre *</Label>
              <Select value={coopId} onValueChange={setCoopId} disabled={coops.length <= 1}>
                <SelectTrigger><SelectValue placeholder="Sélectionner" /></SelectTrigger>
                <SelectContent>
                  {coops.length > 1 && <SelectItem value="all">Tous les registres</SelectItem>}
                  {coops.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Campagne</Label>
              <Select value={campaignId} onValueChange={setCampaignId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Toutes</SelectItem>
                  {campaigns.map(c => <SelectItem key={c.id} value={c.id}>{c.nom}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Projet</Label>
              <Select value={projectId} onValueChange={setProjectId}>
                <SelectTrigger><SelectValue placeholder="Tous les projets" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tous les projets</SelectItem>
                  {projects.map(p => <SelectItem key={p.id} value={p.id}>{p.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Section</Label>
              <Select value={section} onValueChange={(v) => { setSection(v); setProducerId("all"); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Toutes</SelectItem>
                  {sections.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Producteur</Label>
              <Select value={producerId} onValueChange={setProducerId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tous</SelectItem>
                  {producersList
                    .filter(p => section === "all" || p.section === section)
                    .map(p => <SelectItem key={p.id} value={p.id}>{[p.nom, p.prenom].filter(Boolean).join(" ") || p.full_name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Type de prime</Label>
              <Select value={bonusType} onValueChange={(v) => setBonusType(v as "total" | "per_kg")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="per_kg">Montant par kg</SelectItem>
                  <SelectItem value="total">Montant total à répartir</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="prime-start" className="text-xs">Début de livraison *</Label>
              <Input id="prime-start" type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="prime-end" className="text-xs">Fin de livraison *</Label>
              <Input id="prime-end" type="date" value={endDate} onChange={e => setEndDate(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">{bonusType === "per_kg" ? "Montant par kg (FCFA)" : "Montant total (FCFA)"} *</Label>
              <Input type="number" value={amount || ""} onChange={e => setAmount(Number(e.target.value))} />
            </div>
            <div className="flex items-end">
              <Button onClick={calculate} disabled={loading} className="w-full gap-2">
                <Calculator className="h-4 w-4" /> {loading ? "Calcul..." : "Calculer"}
              </Button>
            </div>
          </fieldset>
        </CardContent>
      </Card>

      {loading && (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10" />)}
        </div>
      )}

      {!loading && rows.length > 0 && (
        <>
          {/* Cartes résumé tonales */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="rounded-[20px] p-4 ring-1 ring-blue-100 bg-blue-50/70 shadow-glass">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Producteurs éligibles</div>
              <div className="text-2xl font-bold tracking-tight mt-1">{rows.length.toLocaleString("fr-FR")}</div>
            </div>
            <div className="rounded-[20px] p-4 ring-1 ring-emerald-100 bg-emerald-50/70 shadow-glass">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Volume total</div>
              <div className="text-2xl font-bold tracking-tight mt-1">{totalVolume.toLocaleString("fr-FR")} <span className="text-sm font-medium text-muted-foreground">kg</span></div>
            </div>
            <div className="rounded-[20px] p-4 ring-1 ring-amber-100 bg-amber-50/70 shadow-glass">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Prime totale</div>
              <div className="text-2xl font-bold tracking-tight mt-1">{Math.round(totalBonus).toLocaleString("fr-FR")} <span className="text-sm font-medium text-muted-foreground">FCFA</span></div>
            </div>
          </div>

        <div className="space-y-2">
          <h3 className="text-sm font-semibold">Chargements pris en compte ({included.length}) — Projet : {projectSelected?.name ?? "Tous"}</h3>
          <div className="max-h-48 overflow-auto">
            <Table>
              <TableHeader><TableRow><TableHead>Connaissement</TableHead><TableHead>Projet</TableHead><TableHead className="text-right">Volume retenu (kg)</TableHead></TableRow></TableHeader>
              <TableBody>{included.map((s) => <TableRow key={s.id}><TableCell>{s.name}</TableCell><TableCell>{s.project}</TableCell><TableCell className="text-right">{s.volume.toLocaleString("fr-FR")}</TableCell></TableRow>)}</TableBody>
            </Table>
          </div>
        </div>
        <Card className="shadow-glass">
          <CardHeader className="flex flex-col sm:flex-row gap-3 sm:items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <span className="h-8 w-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center"><Coins className="h-4 w-4" /></span>
              Détail des primes
            </CardTitle>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={saveCalc} disabled={saving || campaignId === "all" || isAllCoops} title={campaignId === "all" || isAllCoops ? "Sélectionnez un registre et une campagne pour enregistrer." : undefined}><Save className="h-4 w-4 mr-2" />Enregistrer</Button>
              <Button size="sm" onClick={exportXlsx}><Download className="h-4 w-4 mr-2" />Exporter Excel</Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="max-h-[60vh] overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>N°</TableHead>
                    <TableHead>Code producteur</TableHead>
                    <TableHead>Producteur</TableHead>
                    <TableHead>Section</TableHead>
                    <TableHead className="text-right">Plantations</TableHead>
                    <TableHead className="text-right">Volume (kg)</TableHead>
                    <TableHead className="text-right">Taux prime</TableHead>
                    <TableHead className="text-right">Montant prime</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r, i) => (
                    <TableRow key={`${r.producer_code}-${r.producer_id}`}>
                      <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                      <TableCell className="font-mono text-xs">{r.producer_code}</TableCell>
                      <TableCell className="font-medium">{r.full_name}</TableCell>
                      <TableCell>{r.section}</TableCell>
                      <TableCell className="text-right">{r.num_plantations}</TableCell>
                      <TableCell className="text-right">{r.volume.toLocaleString("fr-FR")}</TableCell>
                      <TableCell className="text-right">{r.rate.toFixed(2)}</TableCell>
                      <TableCell className="text-right font-semibold">{Math.round(r.bonus).toLocaleString("fr-FR")}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>

              </Table>
            </div>
          </CardContent>
        </Card>
        </>
      )}
    </div>
  );
}
