import { Package, TrendingUp, Leaf, Truck, BarChart3, type LucideIcon } from "lucide-react";

type Props = {
  totalPotential: number;
  totalDelivered: number;
  remaining: number;
  shipmentCount: number;
};

type KpiTone = "green" | "blue" | "orange" | "purple" | "red";

const TONE: Record<KpiTone, { bg: string; ring: string; icon: string; bar: string; chip: string }> = {
  green:  { bg: "bg-emerald-50/70", ring: "ring-emerald-100", icon: "bg-emerald-500 text-white", bar: "bg-emerald-500", chip: "text-emerald-600" },
  blue:   { bg: "bg-blue-50/70",    ring: "ring-blue-100",    icon: "bg-blue-500 text-white",    bar: "bg-blue-500",    chip: "text-blue-600" },
  orange: { bg: "bg-amber-50/70",   ring: "ring-amber-100",   icon: "bg-amber-500 text-white",   bar: "bg-amber-500",   chip: "text-amber-600" },
  purple: { bg: "bg-violet-50/70",  ring: "ring-violet-100",  icon: "bg-violet-500 text-white",  bar: "bg-violet-500",  chip: "text-violet-600" },
  red:    { bg: "bg-rose-50/70",    ring: "ring-rose-100",    icon: "bg-rose-500 text-white",    bar: "bg-rose-500",    chip: "text-rose-600" },
};

export default function KpiCards({ totalPotential, totalDelivered, remaining, shipmentCount }: Props) {
  const deliveryRate = totalPotential > 0 ? (totalDelivered / totalPotential) * 100 : 0;
  const deliveredPct = totalPotential > 0 ? Math.min(100, (totalDelivered / totalPotential) * 100) : 0;
  const remainingPct = totalPotential > 0 ? Math.min(100, (remaining / totalPotential) * 100) : 0;

  const cards: Array<{ label: string; value: string; sub: string; icon: LucideIcon; tone: KpiTone; progress: number }> = [
    { label: "Potentiel total",       value: `${totalPotential.toLocaleString("fr-FR")} kg`, sub: "Objectif de collecte",                     icon: Leaf,      tone: "green",  progress: 100 },
    { label: "Poids livré total",     value: `${totalDelivered.toLocaleString("fr-FR")} kg`, sub: `${deliveryRate.toFixed(1)}% de l'objectif`, icon: Package,   tone: "blue",   progress: deliveredPct },
    { label: "Potentiel restant",     value: `${remaining.toLocaleString("fr-FR")} kg`,      sub: `${(100 - deliveryRate).toFixed(1)}% restant`, icon: TrendingUp, tone: "orange", progress: remainingPct },
    { label: "Taux livraison global", value: `${deliveryRate.toFixed(1)}%`,                  sub: "Performance actuelle",                     icon: BarChart3, tone: "purple", progress: deliveryRate },
    { label: "Total chargements",     value: shipmentCount.toString(),                       sub: "Chargements réalisés",                     icon: Truck,     tone: "red",    progress: Math.min(100, shipmentCount) },
  ];

  return (
    <div className="grid gap-3 sm:gap-4 grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
      {cards.map((c) => {
        const t = TONE[c.tone];
        return (
          <div key={c.label} className={`relative rounded-[20px] p-3 sm:p-4 md:p-5 ring-1 ${t.ring} ${t.bg} shadow-glass transition-all hover:shadow-float`}>
            <div className="flex items-start justify-between gap-2 mb-3 md:mb-4">
              <div className={`h-9 w-9 md:h-11 md:w-11 rounded-full flex items-center justify-center shadow-sm ${t.icon}`}>
                <c.icon className="h-4 w-4 md:h-5 md:w-5" />
              </div>
              <div className="text-[9px] md:text-[10px] font-semibold uppercase tracking-wider text-muted-foreground text-right leading-tight max-w-[100px] md:max-w-[110px]">
                {c.label}
              </div>
            </div>
            <div className="text-lg md:text-[22px] font-bold tracking-tight leading-none mb-1 break-words">{c.value}</div>
            <div className={`text-[10px] md:text-[11px] font-medium ${t.chip} mb-2 md:mb-3 truncate`}>{c.sub}</div>
            <div className="h-1.5 w-full rounded-full bg-white/70 overflow-hidden">
              <div className={`h-full rounded-full ${t.bar} transition-all`} style={{ width: `${c.progress}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
