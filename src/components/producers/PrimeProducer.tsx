import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
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

interface Coop { id: string; name: string; logo_path?: string | null }
interface Campaign { id: string; nom: string }

interface PrimeRow {
  producer_id: string;
  full_name: string;
  section: string;
  volume: number;
  rate: number;
  bonus: number;
}

export default function PrimeProducer() {
  const { isSuperAdmin, cooperativeRefs } = useAuth();
  const [coops, setCoops] = useState<Coop[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [sections, setSections] = useState<string[]>([]);

  const [coopId, setCoopId] = useState<string>("");
  const [campaignId, setCampaignId] = useState<string>("all");
  const [section, setSection] = useState<string>("all");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [bonusType, setBonusType] = useState<"total" | "per_kg">("per_kg");
  const [amount, setAmount] = useState<number>(0);

  const [rows, setRows] = useState<PrimeRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const [{ data: c }, { data: cp }] = await Promise.all([
        supabase.from("cooperatives").select("id,name,logo_path").order("name"),
        supabase.from("campaigns").select("id,nom").order("nom", { ascending: false }),
      ]);
      const list = (c || []) as Coop[];
      setCoops(isSuperAdmin ? list : list.filter(x => cooperativeRefs.some(r => r.id === x.id)));
      setCampaigns((cp || []) as Campaign[]);
      if (!isSuperAdmin && cooperativeRefs[0]) setCoopId(cooperativeRefs[0].id);
    })();
  }, [isSuperAdmin, cooperativeRefs]);

  useEffect(() => {
    if (!coopId || coopId === "all") { setSections([]); return; }
    const coopName = coops.find(c => c.id === coopId)?.name;
    if (!coopName) return;
    supabase.from("producers").select("section").eq("cooperative", coopName).then(({ data }) => {
      setSections([...new Set((data || []).map((d: any) => d.section).filter(Boolean))].sort());
    });
  }, [coopId, coops]);

  const coopSelected = useMemo(() => coops.find(c => c.id === coopId), [coops, coopId]);
  const isAllCoops = coopId === "all";

  async function calculate() {
    if (!coopId || !startDate || !endDate || amount <= 0) {
      toast({ title: "Champs requis", description: "Coopérative, période et montant sont requis.", variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      // 1) Producers scope
      const coopNames = isAllCoops ? coops.map(c => c.name) : [coopSelected?.name].filter(Boolean) as string[];
      let pq = supabase.from("producers").select("id,full_name,section,cooperative").in("cooperative", coopNames);
      if (!isAllCoops && section !== "all") pq = pq.eq("section", section);
      const { data: producers } = await pq;
      const prodList = (producers || []) as Array<{ id: string; full_name: string; section: string; cooperative: string }>;
      if (prodList.length === 0) { setRows([]); return; }
      const prodIds = prodList.map(p => p.id);

      // 2) Deliveries in period, restricted to these producers, filtered by campaign/coop via shipments
      const volumeByProducer = new Map<string, number>();
      let from = 0;
      while (true) {
        let dq = supabase.from("deliveries")
          .select("producer_id,net_weight,delivery_date,shipment_id,shipments!inner(cooperative_id,campaign_id,is_cancelled)")
          .in("producer_id", prodIds)
          .gte("delivery_date", startDate)
          .lte("delivery_date", endDate)
          .eq("shipments.is_cancelled", false);
        if (!isAllCoops) dq = dq.eq("shipments.cooperative_id", coopId);
        if (campaignId !== "all") dq = dq.eq("shipments.campaign_id", campaignId);
        const { data, error } = await dq.range(from, from + 999);
        if (error) throw error;
        if (!data || data.length === 0) break;
        data.forEach((d: any) => {
          volumeByProducer.set(d.producer_id, (volumeByProducer.get(d.producer_id) || 0) + Number(d.net_weight || 0));
        });
        if (data.length < 1000) break;
        from += 1000;
      }

      const totalVolume = Array.from(volumeByProducer.values()).reduce((s, v) => s + v, 0);
      const rate = bonusType === "per_kg" ? amount : (totalVolume > 0 ? amount / totalVolume : 0);

      const out: PrimeRow[] = prodList
        .map(p => {
          const volume = volumeByProducer.get(p.id) || 0;
          return {
            producer_id: p.id,
            full_name: p.full_name,
            section: p.section,
            volume,
            rate,
            bonus: volume * rate,
          };
        })
        .filter(r => r.volume > 0)
        .sort((a, b) => b.volume - a.volume);

      setRows(out);
      toast({ title: "Calcul terminé", description: `${out.length} producteur(s) éligible(s).` });
    } catch (e) {
      console.error(e);
      toast({ title: "Erreur", description: "Une erreur est survenue.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  async function saveCalc() {
    if (!coopId || rows.length === 0) return;
    if (isAllCoops) {
      toast({ title: "Non disponible", description: "L'enregistrement n'est pas disponible en mode « Toutes coopératives ». Sélectionnez une coopérative.", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const { data: setting, error } = await (supabase.from("producer_bonus_settings") as any).insert({
        cooperative_id: coopId,
        campaign_id: campaignId !== "all" ? campaignId : null,
        section: section !== "all" ? section : null,
        start_date: startDate,
        end_date: endDate,
        bonus_type: bonusType,
        amount,
        label: `Prime ${startDate} → ${endDate}`,
      }).select("id").single();
      if (error) throw error;
      const settingId = setting.id;
      const results = rows.map(r => ({
        setting_id: settingId,
        producer_id: r.producer_id,
        cooperative_id: coopId,
        volume_delivered: r.volume,
        rate: r.rate,
        calculated_bonus: r.bonus,
        period_start: startDate,
        period_end: endDate,
      }));
      for (let i = 0; i < results.length; i += 500) {
        const { error: ie } = await (supabase.from("producer_bonus_results") as any).insert(results.slice(i, i + 500));
        if (ie) throw ie;
      }
      toast({ title: "Enregistré", description: "Le calcul de prime a été sauvegardé." });
    } catch (e) {
      console.error(e);
      toast({ title: "Erreur", description: "Une erreur est survenue.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  async function exportXlsx() {
    if (rows.length === 0) return;
    try {
      await generatePrimeExcel({
        cooperativeName: isAllCoops ? "Toutes les coopératives" : (coopSelected?.name ?? ""),
        logoUrl: isAllCoops ? null : (coopSelected?.logo_path ?? null),
        startDate, endDate,
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
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Coins className="h-5 w-5 text-primary" /> Paramètres du calcul
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-3">
            <div>
              <Label className="text-xs">Coopérative *</Label>
              <Select value={coopId} onValueChange={setCoopId} disabled={!isSuperAdmin && cooperativeRefs.length <= 1}>
                <SelectTrigger><SelectValue placeholder="Sélectionner" /></SelectTrigger>
                <SelectContent>
                  {isSuperAdmin && <SelectItem value="all">Toutes les coopératives</SelectItem>}
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
              <Label className="text-xs">Section</Label>
              <Select value={section} onValueChange={setSection}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Toutes</SelectItem>
                  {sections.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Type de prime</Label>
              <Select value={bonusType} onValueChange={(v: any) => setBonusType(v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="per_kg">Montant par kg</SelectItem>
                  <SelectItem value="total">Montant total à répartir</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Date début *</Label>
              <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Date fin *</Label>
              <Input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} />
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
          </div>
        </CardContent>
      </Card>

      {loading && (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10" />)}
        </div>
      )}

      {!loading && rows.length > 0 && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">
              {rows.length} producteur(s) — Volume {totalVolume.toLocaleString("fr-FR")} kg — Prime {Math.round(totalBonus).toLocaleString("fr-FR")} FCFA
            </CardTitle>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={saveCalc} disabled={saving}><Save className="h-4 w-4 mr-2" />Enregistrer</Button>
              <Button size="sm" onClick={exportXlsx}><Download className="h-4 w-4 mr-2" />Exporter Excel</Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="max-h-[60vh] overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>N°</TableHead>
                    <TableHead>Producteur</TableHead>
                    <TableHead>Section</TableHead>
                    <TableHead className="text-right">Volume (kg)</TableHead>
                    <TableHead className="text-right">Taux prime</TableHead>
                    <TableHead className="text-right">Montant prime</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r, i) => (
                    <TableRow key={r.producer_id}>
                      <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                      <TableCell className="font-medium">{r.full_name}</TableCell>
                      <TableCell>{r.section}</TableCell>
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
      )}
    </div>
  );
}
