import { useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { MapPin } from "lucide-react";
import type { Chargement } from "@/hooks/useChargements";

interface Props {
  chargements: Chargement[];
}

export function ConnaissementsByZoneDialog({ chargements }: Props) {
  const [open, setOpen] = useState(false);

  const byZone = useMemo(() => {
    const map = new Map<string, { connaissements: Set<string>; totalWeight: number; totalBags: number; count: number }>();
    for (const c of chargements) {
      const zone = c.zone || "Sans zone";
      if (!map.has(zone)) map.set(zone, { connaissements: new Set(), totalWeight: 0, totalBags: 0, count: 0 });
      const entry = map.get(zone)!;
      if (c.connaissement && c.connaissement !== "—") entry.connaissements.add(c.connaissement);
      entry.totalWeight += c.poids_net;
      entry.totalBags += c.nombre_sacs;
      entry.count++;
    }
    return Array.from(map.entries())
      .map(([zone, data]) => ({
        zone,
        connaissements: Array.from(data.connaissements).join(", ") || "—",
        totalWeight: data.totalWeight,
        totalBags: data.totalBags,
        count: data.count,
      }))
      .sort((a, b) => b.totalWeight - a.totalWeight);
  }, [chargements]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <MapPin className="h-4 w-4 mr-2" /> Par zone
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-auto">
        <DialogHeader>
          <DialogTitle>Connaissements par zone</DialogTitle>
        </DialogHeader>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Zone</TableHead>
              <TableHead>Connaissements</TableHead>
              <TableHead>Livraisons</TableHead>
              <TableHead>Poids total (kg)</TableHead>
              <TableHead>Sacs</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {byZone.map((row) => (
              <TableRow key={row.zone}>
                <TableCell className="font-medium">{row.zone}</TableCell>
                <TableCell className="text-xs">{row.connaissements}</TableCell>
                <TableCell>{row.count}</TableCell>
                <TableCell className="font-semibold">{row.totalWeight.toLocaleString("fr-FR")}</TableCell>
                <TableCell>{row.totalBags}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </DialogContent>
    </Dialog>
  );
}
