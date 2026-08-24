import { useMemo, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, ArrowLeft, User, MapPin, Truck, Coins, Activity, TrendingUp, Search } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { normalizeCampaign, getCurrentCampaign } from "@/lib/shipment-utils";
import type { PaginatedQuery } from "@/lib/database-utils";

const fmt = (n: number) => Number(n || 0).toLocaleString("fr-FR");

interface DeliveryDetailRow {
  id: string;
  receipt_number: string | null;
  delivery_date: string;
  net_weight: number | null;
  num_bags: number | null;
  campaign_label: string | null;
  shipment_id: string | null;
  shipments?: {
    connaissement: string | null;
    project: string | null;
    destination: string | null;
    partner_id: string | null;
    partners?: { name: string | null } | null;
  } | null;
}

interface BonusDetailRow {
  id: string;
  campaign_label: string | null;
  period_start: string;
  period_end: string;
  volume_delivered: number | null;
  rate: number | null;
  calculated_bonus: number | null;
  created_at: string;
}

interface AuditDetailRow {
  id: string;
  table_name: string;
  action: string;
  changed_by_email: string | null;
  changed_at: string;
  campaign_label: string | null;
}

async function fetchAll<T>(query: PaginatedQuery): Promise<T[]> {
  const out: T[] = [];
  let from = 0;
  const size = 1000;
  while (true) {
    const { data, error } = await query.range(from, from + size - 1);
    if (error || !data || data.length === 0) break;
    out.push(...(data as T[]));
    if (data.length < size) break;
    from += size;
  }
  return out;
}

const EMPTY_DELIVERIES: DeliveryDetailRow[] = [];
const EMPTY_BONUSES: BonusDetailRow[] = [];
const EMPTY_AUDIT: AuditDetailRow[] = [];

export default function ProducerDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const producerQ = useQuery({
    queryKey: ["producer-detail", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase.from("producers").select("*").eq("id", id!).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const registreQ = useQuery({
    queryKey: ["producer-detail", "registre", producerQ.data?.registre_id],
    enabled: !!producerQ.data?.registre_id,
    queryFn: async () => {
      const { data } = await supabase
        .from("registres")
        .select("id, name, code, responsable, cooperative_id, cooperatives(name, city, country)")
        .eq("id", producerQ.data!.registre_id)
        .maybeSingle();
      return data;
    },
  });

  const deliveriesQ = useQuery({
    queryKey: ["producer-detail", "deliveries", id],
    enabled: !!id,
    queryFn: async () => {
      const q = supabase
        .from("deliveries")
        .select("id, receipt_number, delivery_date, net_weight, num_bags, campaign_label, shipment_id, shipments(connaissement, project, destination, partner_id, partners(name))")
        .eq("producer_id", id!)
        .order("delivery_date", { ascending: false }) as unknown as PaginatedQuery;
      return fetchAll<DeliveryDetailRow>(q);
    },
  });

  const bonusQ = useQuery({
    queryKey: ["producer-detail", "bonus", id],
    enabled: !!id,
    queryFn: async () => {
      const { data } = await supabase
        .from("producer_bonus_results")
        .select("id, campaign_label, period_start, period_end, volume_delivered, rate, calculated_bonus, created_at")
        .eq("producer_id", id!)
        .order("created_at", { ascending: false })
        .returns<BonusDetailRow[]>();
      return data ?? [];
    },
  });

  const auditQ = useQuery({
    queryKey: ["producer-detail", "audit", id],
    enabled: !!id,
    queryFn: async () => {
      const { data } = await supabase
        .from("audit_logs")
        .select("id, table_name, action, changed_by_email, changed_at, campaign_label")
        .eq("record_id", id!)
        .order("changed_at", { ascending: false })
        .limit(200)
        .returns<AuditDetailRow[]>();
      return data ?? [];
    },
  });

  const producer = producerQ.data;
  const deliveries = deliveriesQ.data ?? EMPTY_DELIVERIES;
  const bonuses = bonusQ.data ?? EMPTY_BONUSES;
  const audit = auditQ.data ?? EMPTY_AUDIT;

  // Filters for deliveries
  const [search, setSearch] = useState("");
  const [campFilter, setCampFilter] = useState(getCurrentCampaign());
  const [page, setPage] = useState(0);
  const pageSize = 20;

  const campaigns = useMemo(() => {
    const s = new Set<string>();
    s.add(getCurrentCampaign());
    deliveries.forEach((d) => d.campaign_label && s.add(normalizeCampaign(d.campaign_label)));
    return Array.from(s).sort().reverse();
  }, [deliveries]);

  const filteredDeliveries = useMemo(() => {
    return deliveries.filter((d) => {
      if (campFilter !== "all" && normalizeCampaign(d.campaign_label) !== campFilter) return false;
      if (!search) return true;
      const s = search.toLowerCase();
      return (
        (d.receipt_number || "").toLowerCase().includes(s) ||
        (d.shipments?.connaissement || "").toLowerCase().includes(s) ||
        (d.shipments?.partners?.name || "").toLowerCase().includes(s)
      );
    });
  }, [deliveries, campFilter, search]);

  const pagedDeliveries = filteredDeliveries.slice(page * pageSize, (page + 1) * pageSize);
  const totalPages = Math.max(1, Math.ceil(filteredDeliveries.length / pageSize));

  // Aggregates
  const byCampaign = useMemo(() => {
    const map: Record<string, { volume: number; count: number }> = {};
    deliveries.forEach((d) => {
      const c = normalizeCampaign(d.campaign_label) || "—";
      if (!map[c]) map[c] = { volume: 0, count: 0 };
      map[c].volume += Number(d.net_weight || 0);
      map[c].count += 1;
    });
    return Object.entries(map)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([campaign, v]) => ({ campaign, volume: v.volume, count: v.count }));
  }, [deliveries]);

  const totals = useMemo(() => {
    const totalVolume = deliveries.reduce((s, d) => s + Number(d.net_weight || 0), 0);
    const count = deliveries.length;
    const avg = count ? totalVolume / count : 0;
    const dates = deliveries.map((d) => new Date(d.delivery_date).getTime()).filter((n) => !isNaN(n));
    const first = dates.length ? new Date(Math.min(...dates)) : null;
    const last = dates.length ? new Date(Math.max(...dates)) : null;
    const partners = new Set(deliveries.map((d) => d.shipments?.partners?.name).filter(Boolean));
    const avgCampaign = byCampaign.length ? totalVolume / byCampaign.length : 0;
    return { totalVolume, count, avg, first, last, partners: partners.size, avgCampaign };
  }, [deliveries, byCampaign]);

  const bonusTotals = useMemo(() => {
    const total = bonuses.reduce((s, b) => s + Number(b.calculated_bonus || 0), 0);
    return { total, count: bonuses.length };
  }, [bonuses]);

  if (producerQ.isLoading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[40vh]">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!producer) {
    return (
      <div className="p-6 space-y-4">
        <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4 mr-2" /> Retour
        </Button>
        <p className="text-muted-foreground">Producteur introuvable.</p>
      </div>
    );
  }

  const registre = registreQ.data;
  const coopName = registre?.cooperatives?.name;

  const kpis = [
    { label: "Volume total livré", value: `${fmt(totals.totalVolume)} kg`, icon: Truck, tone: "bg-blue-50 text-blue-700 ring-blue-200" },
    { label: "Livraisons", value: fmt(totals.count), icon: Activity, tone: "bg-emerald-50 text-emerald-700 ring-emerald-200" },
    { label: "Volume moyen / livraison", value: `${fmt(Math.round(totals.avg))} kg`, icon: TrendingUp, tone: "bg-amber-50 text-amber-700 ring-amber-200" },
    { label: "Primes totales", value: fmt(Math.round(bonusTotals.total)), icon: Coins, tone: "bg-fuchsia-50 text-fuchsia-700 ring-fuchsia-200" },
  ];

  return (
    <div className="p-4 md:p-6 space-y-6">
      <Button variant="ghost" size="sm" onClick={() => navigate(-1)} className="-ml-2">
        <ArrowLeft className="h-4 w-4 mr-2" /> Retour à la liste
      </Button>

      <PageHeader
        icon={User}
        title={producer.full_name}
        description={
          <>
            <span className="font-mono">{producer.plantation_code}</span>
            {producer.producer_code && <> · Code producteur <span className="font-mono">{producer.producer_code}</span></>}
            {registre?.name && <> · Registre {registre.name}</>}
            {coopName && <> · {coopName}</>}
          </>
        }
        actions={
          producer.is_active === false ? (
            <Badge variant="destructive">Inactif</Badge>
          ) : (
            <Badge className="bg-emerald-600 hover:bg-emerald-600">Actif</Badge>
          )
        }
      />

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {kpis.map((k) => (
          <Card key={k.label} className="shadow-glass">
            <CardContent className="p-4 flex items-center gap-3">
              <div className={`h-10 w-10 rounded-xl flex items-center justify-center ring-1 ${k.tone}`}>
                <k.icon className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{k.label}</p>
                <p className="text-lg font-semibold">{k.value}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Tabs defaultValue="general" className="space-y-4">
        <TabsList className="bg-muted/50 p-1 rounded-full h-auto flex-wrap">
          <TabsTrigger value="general" className="rounded-full px-4 py-2">Général</TabsTrigger>
          <TabsTrigger value="tracabilite" className="rounded-full px-4 py-2">Traçabilité</TabsTrigger>
          <TabsTrigger value="livraisons" className="rounded-full px-4 py-2">Livraisons</TabsTrigger>
          <TabsTrigger value="primes" className="rounded-full px-4 py-2">Primes</TabsTrigger>
          <TabsTrigger value="performances" className="rounded-full px-4 py-2">Performances</TabsTrigger>
          <TabsTrigger value="historique" className="rounded-full px-4 py-2">Historique</TabsTrigger>
        </TabsList>

        {/* GENERAL */}
        <TabsContent value="general" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader><CardTitle className="text-base">Informations générales</CardTitle></CardHeader>
              <CardContent>
                <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                  <Info label="Nom complet" value={producer.full_name} />
                  <Info label="Sexe" value={producer.sexe} />
                  <Info label="N° producteur" value={producer.producer_number} />
                  <Info label="Code producteur" value={producer.producer_code} mono />
                  <Info label="Code plantation" value={producer.plantation_code} mono />
                  <Info label="CNI" value={producer.national_id} />
                  <Info label="Section" value={producer.section} />
                  <Info label="Registre" value={registre?.name} />
                  <Info label="Coopérative" value={coopName} />
                  <Info label="Responsable" value={registre?.responsable} />
                  <Info label="Statut" value={producer.is_active === false ? "Inactif" : "Actif"} />
                  <Info label="Enregistré le" value={producer.created_at ? new Date(producer.created_at).toLocaleDateString("fr-FR") : null} />
                </dl>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-base">Potentiel de livraison</CardTitle></CardHeader>
              <CardContent>
                <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                  <Info label="Potentiel initial" value={`${fmt(producer.delivery_potential)} kg`} />
                  <Info label="Potentiel restant" value={`${fmt(producer.remaining_potential)} kg`} />
                  <Info label="Volume livré (calculé)" value={`${fmt(totals.totalVolume)} kg`} />
                  <Info label="Nombre d'hommes" value={producer.num_men} />
                  <Info label="Nombre de femmes" value={producer.num_women} />
                  <Info label="Campagne d'enregistrement" value={producer.campaign_label} />
                </dl>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* TRACABILITE */}
        <TabsContent value="tracabilite" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <MapPin className="h-4 w-4" /> Traçabilité de la plantation
              </CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-2 text-sm">
                <Info label="Nombre de parcelles" value={producer.num_plots} />
                <Info label="Surface plantation (ha)" value={producer.plantation_area} />
                <Info label="Surface cacao totale (ha)" value={producer.total_cocoa_area} />
                <Info label="Latitude" value={producer.latitude} />
                <Info label="Longitude" value={producer.longitude} />
                <Info label="Code plantation" value={producer.plantation_code} mono />
              </dl>
              {producer.latitude && producer.longitude && (
                <div className="mt-4">
                  <a
                    href={`https://www.google.com/maps?q=${producer.latitude},${producer.longitude}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-sm text-primary underline"
                  >
                    Ouvrir la localisation dans Google Maps →
                  </a>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* LIVRAISONS */}
        <TabsContent value="livraisons" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Historique des livraisons ({filteredDeliveries.length})</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-wrap gap-2 items-center">
                <div className="relative w-64">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Reçu, connaissement, partenaire..."
                    value={search}
                    onChange={(e) => { setSearch(e.target.value); setPage(0); }}
                    className="pl-9"
                  />
                </div>
                <Select value={campFilter} onValueChange={(v) => { setCampFilter(v); setPage(0); }}>
                  <SelectTrigger className="w-48"><SelectValue placeholder="Toutes campagnes" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Toutes les campagnes</SelectItem>
                    {campaigns.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              {deliveriesQ.isLoading ? (
                <p className="text-sm text-muted-foreground">Chargement...</p>
              ) : filteredDeliveries.length === 0 ? (
                <p className="text-sm text-muted-foreground">Aucune livraison.</p>
              ) : (
                <>
                  <div className="overflow-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Date</TableHead>
                          <TableHead>Campagne</TableHead>
                          <TableHead>Reçu</TableHead>
                          <TableHead>Connaissement</TableHead>
                          <TableHead>Partenaire</TableHead>
                          <TableHead>Destination</TableHead>
                          <TableHead className="text-right">Poids (kg)</TableHead>
                          <TableHead className="text-right">Sacs</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {pagedDeliveries.map((d) => (
                          <TableRow key={d.id}>
                            <TableCell>{new Date(d.delivery_date).toLocaleDateString("fr-FR")}</TableCell>
                            <TableCell>{normalizeCampaign(d.campaign_label)}</TableCell>
                            <TableCell className="font-mono text-xs">{d.receipt_number}</TableCell>
                            <TableCell className="font-mono text-xs">{d.shipments?.connaissement || "—"}</TableCell>
                            <TableCell>{d.shipments?.partners?.name || "—"}</TableCell>
                            <TableCell>{d.shipments?.destination || "—"}</TableCell>
                            <TableCell className="text-right">{fmt(d.net_weight)}</TableCell>
                            <TableCell className="text-right">{d.num_bags}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                  {totalPages > 1 && (
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Page {page + 1} / {totalPages}</span>
                      <div className="flex gap-2">
                        <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Précédent</Button>
                        <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage((p) => p + 1)}>Suivant</Button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Synthèse par campagne</CardTitle></CardHeader>
            <CardContent>
              {byCampaign.length === 0 ? (
                <p className="text-sm text-muted-foreground">Aucune donnée.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Campagne</TableHead>
                      <TableHead className="text-right">Livraisons</TableHead>
                      <TableHead className="text-right">Volume livré (kg)</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {byCampaign.map((c) => (
                      <TableRow key={c.campaign}>
                        <TableCell>{c.campaign}</TableCell>
                        <TableCell className="text-right">{c.count}</TableCell>
                        <TableCell className="text-right font-medium">{fmt(c.volume)}</TableCell>
                      </TableRow>
                    ))}
                    <TableRow className="font-semibold bg-muted/40">
                      <TableCell>Total</TableCell>
                      <TableCell className="text-right">{totals.count}</TableCell>
                      <TableCell className="text-right">{fmt(totals.totalVolume)}</TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Évolution des livraisons par campagne</CardTitle></CardHeader>
            <CardContent className="h-72">
              {byCampaign.length === 0 ? (
                <p className="text-sm text-muted-foreground flex items-center justify-center h-full">Aucune donnée</p>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={byCampaign}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="campaign" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                    <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} />
                    <Tooltip formatter={(v: number) => `${fmt(v)} kg`} contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))" }} />
                    <Bar dataKey="volume" fill="hsl(var(--primary))" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* PRIMES */}
        <TabsContent value="primes" className="space-y-4">
          <div className="grid gap-3 md:grid-cols-3">
            <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Primes reçues</p><p className="text-2xl font-semibold">{bonusTotals.count}</p></CardContent></Card>
            <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Montant total</p><p className="text-2xl font-semibold">{fmt(Math.round(bonusTotals.total))}</p></CardContent></Card>
            <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Volume pris en compte</p><p className="text-2xl font-semibold">{fmt(bonuses.reduce((s, b) => s + Number(b.volume_delivered || 0), 0))} kg</p></CardContent></Card>
          </div>
          <Card>
            <CardHeader><CardTitle className="text-base">Détail des primes</CardTitle></CardHeader>
            <CardContent>
              {bonuses.length === 0 ? (
                <p className="text-sm text-muted-foreground">Aucune prime enregistrée.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Campagne</TableHead>
                      <TableHead>Période</TableHead>
                      <TableHead className="text-right">Volume (kg)</TableHead>
                      <TableHead className="text-right">Taux</TableHead>
                      <TableHead className="text-right">Prime</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {bonuses.map((b) => (
                      <TableRow key={b.id}>
                        <TableCell>{normalizeCampaign(b.campaign_label)}</TableCell>
                        <TableCell>{new Date(b.period_start).toLocaleDateString("fr-FR")} → {new Date(b.period_end).toLocaleDateString("fr-FR")}</TableCell>
                        <TableCell className="text-right">{fmt(b.volume_delivered)}</TableCell>
                        <TableCell className="text-right">{fmt(b.rate)}</TableCell>
                        <TableCell className="text-right font-medium">{fmt(Math.round(b.calculated_bonus))}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* PERFORMANCES */}
        <TabsContent value="performances" className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
            <Perf label="Volume total livré" value={`${fmt(totals.totalVolume)} kg`} />
            <Perf label="Nombre de livraisons" value={fmt(totals.count)} />
            <Perf label="Volume moyen par campagne" value={`${fmt(Math.round(totals.avgCampaign))} kg`} />
            <Perf label="Volume moyen par livraison" value={`${fmt(Math.round(totals.avg))} kg`} />
            <Perf label="Première livraison" value={totals.first ? totals.first.toLocaleDateString("fr-FR") : "—"} />
            <Perf label="Dernière livraison" value={totals.last ? totals.last.toLocaleDateString("fr-FR") : "—"} />
            <Perf label="Campagnes actives" value={fmt(byCampaign.length)} />
            <Perf label="Partenaires acheteurs" value={fmt(totals.partners)} />
          </div>
        </TabsContent>

        {/* HISTORIQUE */}
        <TabsContent value="historique" className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Journal des activités</CardTitle></CardHeader>
            <CardContent>
              {auditQ.isLoading ? (
                <p className="text-sm text-muted-foreground">Chargement...</p>
              ) : audit.length === 0 ? (
                <p className="text-sm text-muted-foreground">Aucune activité enregistrée.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Action</TableHead>
                      <TableHead>Table</TableHead>
                      <TableHead>Campagne</TableHead>
                      <TableHead>Par</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {audit.map((a) => (
                      <TableRow key={a.id}>
                        <TableCell>{new Date(a.changed_at).toLocaleString("fr-FR")}</TableCell>
                        <TableCell><Badge variant="outline">{a.action}</Badge></TableCell>
                        <TableCell className="font-mono text-xs">{a.table_name}</TableCell>
                        <TableCell>{a.campaign_label || "—"}</TableCell>
                        <TableCell className="text-xs">{a.changed_by_email || "—"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Info({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
  const display = value === null || value === undefined || value === "" ? "—" : String(value);
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={mono ? "font-mono text-xs" : "font-medium"}>{display}</dd>
    </>
  );
}

function Perf({ label, value }: { label: string; value: string }) {
  return (
    <Card><CardContent className="p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-xl font-semibold mt-1">{value}</p>
    </CardContent></Card>
  );
}
