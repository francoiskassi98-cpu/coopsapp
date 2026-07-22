import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Users, UserCheck, UserCog, Activity, TrendingUp, Package, Weight, PieChart as PieIcon, Layers, Building2,
} from "lucide-react";
import {
  ResponsiveContainer, PieChart, Pie, Cell, Tooltip, Legend,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, LineChart, Line,
} from "recharts";

interface Producer {
  id: string;
  full_name: string;
  cooperative: string;
  section: string;
  sexe: string | null;
  delivery_potential: number;
  remaining_potential: number;
  is_active: boolean | null;
}

interface Delivery {
  id: string;
  shipment_id: string;
  net_weight: number;
  delivery_date: string;
}

interface Shipment {
  id: string;
  cooperative_id: string | null;
  campaign_label: string | null;
  total_weight: number;
  departure_date: string | null;
  is_cancelled: boolean | null;
}

interface Campaign { id: string; nom: string }

const COLORS = {
  primary: "hsl(174 72% 56%)",
  female: "hsl(340 82% 65%)",
  male: "hsl(200 85% 60%)",
  accent1: "hsl(45 95% 60%)",
  accent2: "hsl(150 65% 55%)",
  accent3: "hsl(280 70% 65%)",
};

async function fetchAll<T>(table: string, select = "*"): Promise<T[]> {
  let all: T[] = [];
  let from = 0;
  const PAGE = 1000;
  while (true) {
    const { data, error } = await ((supabase as any).from(table)).select(select).range(from, from + PAGE - 1);
    if (error) { console.error(error); break; }
    if (!data || data.length === 0) break;
    all = all.concat(data as T[]);
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return all;
}

function KpiCard({ label, value, icon: Icon, accent = "primary", loading }: {
  label: string; value: string | number; icon: any; accent?: string; loading?: boolean;
}) {
  return (
    <Card className="relative overflow-hidden group hover:shadow-glow transition-all duration-300 animate-fade-in">
      <div className={`absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-transparent opacity-50`} />
      <CardContent className="p-5 relative">
        <div className="flex items-center justify-between mb-3">
          <div className="text-[11px] font-semibold tracking-wider uppercase text-muted-foreground">{label}</div>
          <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
            <Icon className="h-4 w-4 text-primary" />
          </div>
        </div>
        {loading ? (
          <Skeleton className="h-8 w-24" />
        ) : (
          <div className="text-2xl font-bold tracking-tight">{value}</div>
        )}
      </CardContent>
    </Card>
  );
}

export default function ProducersAnalytics() {
  const { isSuperAdmin } = useAuth();
  const [loading, setLoading] = useState(true);
  const [producers, setProducers] = useState<Producer[]>([]);
  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);

  // Filters
  const [coopFilter, setCoopFilter] = useState("all");
  const [campaignFilter, setCampaignFilter] = useState("all");
  const [sectionFilter, setSectionFilter] = useState("all");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const [p, s, d, c] = await Promise.all([
          fetchAll<Producer>("producers", "id,full_name,cooperative,section,sexe,delivery_potential,remaining_potential,is_active"),
          fetchAll<Shipment>("shipments", "id,cooperative_id,campaign_label,total_weight,departure_date,is_cancelled"),
          fetchAll<Delivery>("deliveries", "id,shipment_id,net_weight,delivery_date"),
          fetchAll<Campaign>("campaigns", "id,nom"),
        ]);
        setProducers(p);
        setShipments(s);
        setDeliveries(d);
        setCampaigns(c);
      } catch (e) {
        console.error("[ProducersAnalytics]", e);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const coopList = useMemo(() => [...new Set(producers.map(p => p.cooperative).filter(Boolean))].sort(), [producers]);
  const sectionList = useMemo(() => [...new Set(producers.map(p => p.section).filter(Boolean))].sort(), [producers]);

  // Filtered producers
  const filtered = useMemo(() => producers.filter(p => {
    if (coopFilter !== "all" && p.cooperative !== coopFilter) return false;
    if (sectionFilter !== "all" && p.section !== sectionFilter) return false;
    return true;
  }), [producers, coopFilter, sectionFilter]);

  // Filtered deliveries (by period + campaign coop)
  const filteredDeliveries = useMemo(() => {
    const shipmentsByCoop = new Map(shipments.map(s => [s.id, s]));
    return deliveries.filter(d => {
      const ship = shipmentsByCoop.get(d.shipment_id);
      if (!ship || ship.is_cancelled) return false;
      if (campaignFilter !== "all" && ship.campaign_label !== campaignFilter) return false;
      if (startDate && d.delivery_date < startDate) return false;
      if (endDate && d.delivery_date > endDate) return false;
      return true;
    });
  }, [deliveries, shipments, campaignFilter, startDate, endDate]);

  // KPIs — normalisation (accepte Homme/Femme, H/F, M, Masculin/Feminin)
  const sexeKey = (v: string | null) => {
    const s = (v || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
    if (["h", "m", "homme", "hommes", "masculin", "male"].includes(s)) return "H";
    if (["f", "femme", "femmes", "feminin", "female"].includes(s)) return "F";
    return "";
  };
  const total = filtered.length;
  const males = filtered.filter(p => sexeKey(p.sexe) === "H").length;
  const females = filtered.filter(p => sexeKey(p.sexe) === "F").length;
  const pctF = total ? Math.round((females / total) * 100) : 0;
  const actives = filtered.filter(p => p.is_active !== false).length;
  const potentielTotal = filtered.reduce((s, p) => s + Number(p.delivery_potential || 0), 0);
  const livre = filteredDeliveries.reduce((s, d) => s + Number(d.net_weight || 0), 0);
  const restant = filtered.reduce((s, p) => s + Number(p.remaining_potential || 0), 0);

  const fmt = (n: number) => n.toLocaleString("fr-FR");
  const fmtKg = (n: number) => `${fmt(Math.round(n))} kg`;

  // Charts data
  const sexData = useMemo(() => [
    { name: "Hommes", value: males, color: COLORS.male },
    { name: "Femmes", value: females, color: COLORS.female },
  ].filter(d => d.value > 0), [males, females]);

  const topSections = useMemo(() => {
    const map = new Map<string, number>();
    filtered.forEach(p => map.set(p.section, (map.get(p.section) || 0) + 1));
    return Array.from(map.entries())
      .map(([section, count]) => ({ section, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);
  }, [filtered]);

  const deliveriesByMonth = useMemo(() => {
    const map = new Map<string, number>();
    filteredDeliveries.forEach(d => {
      const ym = (d.delivery_date || "").slice(0, 7);
      if (!ym) return;
      map.set(ym, (map.get(ym) || 0) + Number(d.net_weight || 0));
    });
    return Array.from(map.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .slice(-12)
      .map(([month, kg]) => ({ month, kg: Math.round(kg) }));
  }, [filteredDeliveries]);

  const byCampaign = useMemo(() => {
    const map = new Map<string, number>();
    const cName = new Map(campaigns.map(c => [c.id, c.nom]));
    deliveries.forEach(d => {
      const ship = shipments.find(s => s.id === d.shipment_id);
      if (!ship || ship.is_cancelled || !ship.campaign_label) return;
      const name = cName.get(ship.campaign_label) || "—";
      map.set(name, (map.get(name) || 0) + Number(d.net_weight || 0));
    });
    return Array.from(map.entries()).map(([campagne, kg]) => ({ campagne, kg: Math.round(kg) }));
  }, [deliveries, shipments, campaigns]);

  const byCoop = useMemo(() => {
    const map = new Map<string, number>();
    producers.forEach(p => map.set(p.cooperative, (map.get(p.cooperative) || 0) + 1));
    return Array.from(map.entries()).map(([cooperative, count]) => ({ cooperative, count }));
  }, [producers]);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3">
          {Array.from({ length: 10 }).map((_, i) => <Skeleton key={i} className="h-28" />)}
        </div>
        <Skeleton className="h-80" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Filters */}
      <Card className="bg-card/50 backdrop-blur-sm border-border/50">
        <CardContent className="p-4 flex flex-wrap gap-3 items-end">
          {isSuperAdmin && (
            <div className="min-w-[180px]">
              <Label className="text-xs">Registre</Label>
              <Select value={coopFilter} onValueChange={setCoopFilter}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Toutes</SelectItem>
                  {coopList.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="min-w-[180px]">
            <Label className="text-xs">Campagne</Label>
            <Select value={campaignFilter} onValueChange={setCampaignFilter}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Toutes</SelectItem>
                {campaigns.map(c => <SelectItem key={c.id} value={c.id}>{c.nom}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="min-w-[160px]">
            <Label className="text-xs">Section</Label>
            <Select value={sectionFilter} onValueChange={setSectionFilter}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Toutes</SelectItem>
                {sectionList.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Du</Label>
            <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="w-40" />
          </div>
          <div>
            <Label className="text-xs">Au</Label>
            <Input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="w-40" />
          </div>
        </CardContent>
      </Card>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3">
        <KpiCard label="Producteurs" value={fmt(total)} icon={Users} />
        <KpiCard label="Hommes" value={fmt(males)} icon={UserCog} />
        <KpiCard label="Femmes" value={fmt(females)} icon={UserCheck} />
        <KpiCard label="% Femmes" value={`${pctF}%`} icon={PieIcon} />
        <KpiCard label="Actifs" value={fmt(actives)} icon={Activity} />
        <KpiCard label="Potentiel total" value={fmtKg(potentielTotal)} icon={TrendingUp} />
        <KpiCard label="Volume livré" value={fmtKg(livre)} icon={Weight} />
        <KpiCard label="Volume restant" value={fmtKg(restant)} icon={Package} />
        <KpiCard label="Sections" value={fmt(sectionList.length)} icon={Layers} />
        {isSuperAdmin && <KpiCard label="Registres" value={fmt(coopList.length)} icon={Building2} />}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="animate-fade-in">
          <CardHeader><CardTitle className="text-base">Répartition Hommes / Femmes</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie data={sexData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} innerRadius={50} paddingAngle={4}>
                  {sexData.map((e, i) => <Cell key={i} fill={e.color} />)}
                </Pie>
                <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="animate-fade-in">
          <CardHeader><CardTitle className="text-base">Évolution des livraisons</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={deliveriesByMonth}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} />
                <Line type="monotone" dataKey="kg" stroke={COLORS.primary} strokeWidth={2.5} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="animate-fade-in">
          <CardHeader><CardTitle className="text-base">Top sections (nombre de producteurs)</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={topSections}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="section" tick={{ fontSize: 10 }} interval={0} angle={-25} textAnchor="end" height={60} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} />
                <Bar dataKey="count" fill={COLORS.accent2} radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="animate-fade-in">
          <CardHeader><CardTitle className="text-base">Volume livré par campagne</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={byCampaign}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="campagne" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} />
                <Bar dataKey="kg" fill={COLORS.accent1} radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {isSuperAdmin && (
          <Card className="lg:col-span-2 animate-fade-in">
            <CardHeader><CardTitle className="text-base">Producteurs par registre</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={byCoop}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="cooperative" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} />
                  <Bar dataKey="count" fill={COLORS.accent3} radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
