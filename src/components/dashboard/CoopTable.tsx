import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Eye } from "lucide-react";
import type { CoopStats } from "./CoopPerformance";

function getUrgencyIcon(pct: number) {
  if (pct >= 80) return "🟢";
  if (pct >= 50) return "🟡";
  return "🔴";
}

type Props = {
  coopStats: CoopStats[];
  totalDelivered: number;
  totalRemaining: number;
  onViewDetail: (name: string) => void;
};

export default function CoopTable({ coopStats, totalDelivered, totalRemaining, onViewDetail }: Props) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Détail par registre</CardTitle>
      </CardHeader>
      <CardContent>
        {coopStats.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">Aucune donnée</p>
        ) : (
          <div className="max-h-[50vh] overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Registre</TableHead>
                  <TableHead>Potentiel (kg)</TableHead>
                  <TableHead>Livré (kg)</TableHead>
                  <TableHead>% Livraison</TableHead>
                  <TableHead>Restant (kg)</TableHead>
                  <TableHead>Nb charg.</TableHead>
                  <TableHead>kg/charg.</TableHead>
                  <TableHead>% du livré</TableHead>
                  <TableHead>% du restant</TableHead>
                  <TableHead>Urg.</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {coopStats.map((c) => {
                  const pct = c.potentiel > 0 ? (c.delivered / c.potentiel) * 100 : 0;
                  const avgPerShipment = c.shipmentCount > 0 ? Math.round(c.delivered / c.shipmentCount) : 0;
                  const shareDelivered = totalDelivered > 0 ? (c.delivered / totalDelivered) * 100 : 0;
                  const shareRemaining = totalRemaining > 0 ? (c.remaining / totalRemaining) * 100 : 0;
                  return (
                    <TableRow key={c.name}>
                      <TableCell className="font-medium">{c.name}</TableCell>
                      <TableCell>{c.potentiel.toLocaleString("fr-FR")}</TableCell>
                      <TableCell>{c.delivered.toLocaleString("fr-FR")}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div className="w-16 h-2 rounded-full bg-muted overflow-hidden">
                            <div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(pct, 100)}%` }} />
                          </div>
                          <span className="text-xs font-medium">{pct.toFixed(1)}%</span>
                        </div>
                      </TableCell>
                      <TableCell>{c.remaining.toLocaleString("fr-FR")}</TableCell>
                      <TableCell>{c.shipmentCount}</TableCell>
                      <TableCell>{avgPerShipment.toLocaleString("fr-FR")}</TableCell>
                      <TableCell>{shareDelivered.toFixed(1)}%</TableCell>
                      <TableCell>{shareRemaining.toFixed(1)}%</TableCell>
                      <TableCell className="text-center">{getUrgencyIcon(pct)}</TableCell>
                      <TableCell className="text-right">
                        <Button variant="outline" size="sm" onClick={() => onViewDetail(c.name)} disabled={c.shipmentCount === 0}>
                          <Eye className="h-4 w-4 mr-1" /> Détails
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
