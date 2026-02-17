import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Trash2 } from "lucide-react";
import type { Chargement } from "@/hooks/useChargements";

interface Props {
  chargements: Chargement[];
  onDelete: (id: string) => void;
  onEdit: (chargement: Chargement) => void;
}

export function ChargementsTable({ chargements, onDelete }: Props) {
  if (chargements.length === 0) {
    return (
      <p className="text-sm text-muted-foreground text-center py-12">
        Aucun chargement trouvé.
      </p>
    );
  }

  return (
    <div className="overflow-auto max-h-[70vh]">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>N° Reçu</TableHead>
            <TableHead>Connaissement</TableHead>
            <TableHead>Producteur</TableHead>
            <TableHead>Section</TableHead>
            <TableHead>Zone</TableHead>
            <TableHead>Poids (kg)</TableHead>
            <TableHead>Sacs</TableHead>
            <TableHead>Date</TableHead>
            <TableHead>Projet</TableHead>
            <TableHead>Partenaire</TableHead>
            <TableHead>Campagne</TableHead>
            <TableHead>Destination</TableHead>
            <TableHead className="w-12"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {chargements.map((c) => (
            <TableRow key={c.id}>
              <TableCell className="font-mono text-xs">{c.numero_recu}</TableCell>
              <TableCell>{c.connaissement}</TableCell>
              <TableCell>{c.nom_planteur}</TableCell>
              <TableCell>{c.section}</TableCell>
              <TableCell>{c.zone}</TableCell>
              <TableCell className="font-semibold">{c.poids_net.toLocaleString("fr-FR")}</TableCell>
              <TableCell>{c.nombre_sacs}</TableCell>
              <TableCell className="text-xs">{c.date_livraison}</TableCell>
              <TableCell>
                <Badge variant="outline" className="text-xs">{c.projet}</Badge>
              </TableCell>
              <TableCell>{c.partenaire}</TableCell>
              <TableCell className="text-xs">{c.campagne}</TableCell>
              <TableCell>{c.destination}</TableCell>
              <TableCell>
                <Button variant="ghost" size="icon" onClick={() => onDelete(c.id)} className="h-8 w-8 text-destructive hover:text-destructive">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
