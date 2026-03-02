import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Trophy, AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export type CoopStats = {
  name: string;
  potentiel: number;
  delivered: number;
  remaining: number;
  shipmentCount: number;
};

function getDeliveryRate(c: CoopStats) {
  return c.potentiel > 0 ? (c.delivered / c.potentiel) * 100 : 0;
}

function getUrgencyBadge(pct: number) {
  if (pct >= 80) return <Badge className="bg-[hsl(var(--success))] text-[hsl(var(--success-foreground))]">🟢 Excellente</Badge>;
  if (pct >= 50) return <Badge className="bg-[hsl(var(--warning))] text-[hsl(var(--warning-foreground))]">🟡 Moyenne</Badge>;
  return <Badge className="bg-[hsl(var(--destructive))] text-[hsl(var(--destructive-foreground))]">🔴 Critique</Badge>;
}

type Props = { coopStats: CoopStats[] };

export default function CoopPerformance({ coopStats }: Props) {
  if (coopStats.length === 0) return null;

  const sorted = [...coopStats].sort((a, b) => getDeliveryRate(b) - getDeliveryRate(a));
  const best = sorted[0];
  const critical = sorted.filter((c) => getDeliveryRate(c) < 50);
  const avgWeight = coopStats.reduce((s, c) => s + c.delivered, 0) / Math.max(coopStats.reduce((s, c) => s + c.shipmentCount, 0), 1);
  const totalRemaining = coopStats.reduce((s, c) => s + c.remaining, 0);
  const estimatedShipments = avgWeight > 0 ? Math.ceil(totalRemaining / avgWeight) : 0;

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {/* Performance Podium */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><Trophy className="h-4 w-4 text-primary" /> Performance coopératives</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {sorted.map((c, i) => {
            const pct = getDeliveryRate(c);
            const medals = ["🥇", "🥈", "🥉"];
            return (
              <div key={c.name} className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-lg">{medals[i] || "  "}</span>
                  <span className="font-medium text-sm">{c.name}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold">{pct.toFixed(1)}%</span>
                  {getUrgencyBadge(pct)}
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* Alerts & Estimates */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-destructive" /> Alertes & Projections</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {critical.length > 0 && (
            <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20">
              <p className="text-sm font-semibold text-destructive mb-1">⚠️ Coopératives à risque</p>
              {critical.map((c) => (
                <p key={c.name} className="text-sm text-muted-foreground">
                  {c.name} : {getDeliveryRate(c).toFixed(1)}% — reste {c.remaining.toLocaleString("fr-FR")} kg
                </p>
              ))}
            </div>
          )}
          <div className="space-y-2">
            <p className="text-sm font-medium">⏱️ Chargements restants estimés</p>
            <p className="text-2xl font-bold text-primary">~{estimatedShipments} chargements</p>
            <p className="text-xs text-muted-foreground">Basé sur la moyenne de {Math.round(avgWeight / 1000)} t/chargement</p>
          </div>
          <div className="space-y-1">
            <p className="text-sm font-medium">🎯 Pour atteindre 100%</p>
            {sorted.filter((c) => c.remaining > 0).map((c) => {
              const coopAvg = c.shipmentCount > 0 ? c.delivered / c.shipmentCount : avgWeight;
              const need = coopAvg > 0 ? Math.ceil(c.remaining / coopAvg) : 0;
              return (
                <p key={c.name} className="text-xs text-muted-foreground">
                  • {c.name} : +{Math.round(c.remaining).toLocaleString("fr-FR")} kg ({need} chargements, {c.shipmentCount} effectués)
                </p>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
