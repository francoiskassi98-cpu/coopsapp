import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertCircle, Trash2 } from "lucide-react";
import { useDeleteByConnaissement } from "@/hooks/useChargements";

interface Props {
  connaissements: string[];
}

export function DeleteByConnaissementDialog({ connaissements }: Props) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState("");
  const deleteMutation = useDeleteByConnaissement();

  const handleDelete = () => {
    if (!selected) return;
    deleteMutation.mutate(selected, {
      onSuccess: () => {
        setOpen(false);
        setSelected("");
      },
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="destructive" size="sm">
          <Trash2 className="h-4 w-4 mr-2" /> Supprimer par connaissement
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-destructive" /> Supprimer un chargement complet
          </DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Sélectionnez un connaissement pour supprimer toutes les livraisons associées.
        </p>
        <Select value={selected} onValueChange={setSelected}>
          <SelectTrigger>
            <SelectValue placeholder="Sélectionner un connaissement" />
          </SelectTrigger>
          <SelectContent>
            {connaissements.map((c) => (
              <SelectItem key={c} value={c}>{c}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button variant="destructive" onClick={handleDelete} disabled={!selected || deleteMutation.isPending} className="w-full">
          {deleteMutation.isPending ? "Suppression..." : "Confirmer la suppression"}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
