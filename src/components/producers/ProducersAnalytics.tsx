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
  registre_id: string | null;
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
  registre_id: string | null;
  campaign_label: string | null;
  total_weight: number;
  departure_date: string | null;
  is_cancelled: boolean | null;
}

interface Registre { id: string; name: string }

// Palette alignée sur les tokens du Design System (thème navy/blue)
const COLORS = {
  primary: "hsl(221 83% 53%)",
  primaryGlow: "hsl(217 91% 60%)",
  female: "hsl(340 82% 60%)",
  male: "hsl(221 83% 53%)",
  success: "hsl(158 84% 39%)",
  warning: "hsl(38 92% 50%)",
  violet: "hsl(262 70% 58%)",
  teal: "hsl(174 72% 42%)",
};

type Tone = "blue" | "green" | "orange" | "violet" | "rose" | "teal";
const TONE: Record<Tone, { bg: string; ring: string; icon: string; chip: string }> = {
  blue:   { bg: "bg-blue-50/70",    ring: "ring-blue-100",    icon: "bg-blue-500 text-white",    chip: "text-blue-600" },
  green:  { bg: "bg-emerald-50/70", ring: "ring-emerald-100", icon: "bg-emerald-500 text-white", chip: "text-emerald-600" },
  orange: { bg: "bg-amber-50/70",   ring: "ring-amber-100",   icon: "bg-amber-500 text-white",   chip: "text-amber-600" },
  violet: { bg: "bg-violet-50/70",  ring: "ring-violet-100",  icon: "bg-violet-500 text-white",  chip: "text-violet-600" },
  rose:   { bg: "bg-rose-50/70",    ring: "ring-rose-100",    icon: "bg-rose-500 text-white",    chip: "text-rose-600" },
  teal:   { bg: "bg-teal-50/70",    ring: "ring-teal-100",    icon: "bg-teal-500 text-white",    chip: "text-teal-600" },
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

function KpiCard({ label, value, icon: Icon, tone = "blue", sub, loading }: {
  label: string; value: string | number; icon: any; tone?: Tone; sub?: string; loading?: boolean;
}) {
  const t = TONE[tone];
  return (
    <div className={`relative rounded-[20px] p-4 md:p-5 ring-1 ${t.ring} ${t.bg} shadow-glass hover:shadow-float transition-all animate-fade-in`}>
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className={`h-10 w-10 rounded-full flex items-center justify-center shadow-sm ${t.icon}`}>
          <Icon className="h-4 w-4" />
        </div>
        <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground text-right leading-tight max-w-[110px]">
          {label}
        </div>
      </div>
      {loading ? (
        <Skeleton className="h-7 w-24" />
      ) : (
        <>
          <div className="text-xl md:text-[22px] font-bold tracking-tight leading-none mb-1 break-words">{value}</div>
          {sub && <div className={`text-[11px] font-medium ${t.chip} truncate`}>{sub}</div>}
        </>
      )}
    </div>
  );
}

export default function ProducersAnalytics() {
  const { isSuperAdmin } = useAuth();
  const [loading, setLoading] = useState(true);
  const [producers, setProducers] = useState<Producer[]>([]);
  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [registres, setRegistres] = useState<Registre[]>([]);

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
        const [p, s, d, r] = await Promise.all([
          fetchAll<Producer>("producers", "id,full_name,registre_id,section,sexe,delivery_potential,remaining_potential,is_active"),
          fetchAll<Shipment>("shipments", "id,registre_id,campaign_label,total_weight,departure_date,is_cancelled"),
          fetchAll<Delivery>("deliveries", "id,shipment_id,net_weight,delivery_date"),
          fetchAll<Registre>("registres", "id,name"),
        ]);
        setProducers(p);
        setShipments(s);
        setDeliveries(d);
        setRegistres(r);
      } catch (e) {
        console.error("[ProducersAnalytics]", e);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const registreName = useMemo(() => {
    const m: Record<string, string> = {};
    registres.forEach(r => { m[r.id] = r.name; });
    return m;
  }, [registres]);
  const producerCoop = (p: Producer) => (p.registre_id ? registreName[p.registre_id] || "" : "");
  const campaignsList = useMemo(() => Array.from(new Set(shipments.map(s => s.campaign_label).filter(Boolean))).sort() as string[], [shipments]);

  const coopList = useMemo(() => [...new Set(producers.map(p => producerCoop(p)).filter(Boolean))].sort(), [producers, registreName]);
  const sectionList = useMemo(() => [...new Set(producers.map(p => p.section).filter(Boolean))].sort(), [producers]);

  // Filtered producers
  const filtered = useMemo(() => producers.filter(p => {
    if (coopFilter !== "all" && producerCoop(p) !== coopFilter) return false;
    if (sectionFilter !== "all" && p.section !== sectionFilter) return false;
    return true;
  }), [producers, coopFilter, sectionFilter, registreName]);

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
    deliveries.forEach(d => {
      const ship = shipments.find(s => s.id === d.shipment_id);
      if (!ship || ship.is_cancelled || !ship.campaign_label) return;
      const name = ship.campaign_label;
      map.set(name, (map.get(name) || 0) + Number(d.net_weight || 0));
    });
    return Array.from(map.entries()).map(([campagne, kg]) => ({ campagne, kg: Math.round(kg) }));
  }, [deliveries, shipments]);

  const byCoop = useMemo(() => {
    const map = new Map<string, number>();
    producers.forEach(p => { const c = producerCoop(p) || "—"; map.set(c, (map.get(c) || 0) + 1); });
    return Array.from(map.entries()).map(([cooperative, count]) => ({ cooperative, count }));
  }, [producers, registreName]);

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
                {campaignsList.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
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
