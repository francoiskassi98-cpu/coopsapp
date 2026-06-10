import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useCampaigns } from "@/hooks/useActiveCampaign";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Calendar, CheckCircle2, Archive, Plus, Truck } from "lucide-react";

export default function Campaigns() {
  const { campaigns, refetch } = useCampaigns();
  const [open, setOpen] = useState(false);
  const [year, setYear] = useState<number>(new Date().getFullYear());
  const [creating, setCreating] = useState(false);

  async function createCampaign() {
    const nom = `${year}-${year + 1}`;
    setCreating(true);
    const { error } = await (supabase.from as any)("campaigns").insert({
      nom,
      date_debut: `${year}-09-01`,
      date_fin: `${year + 1}-08-31`,
      active: true,
      utilise_pour_chargement: false,
      archived: false,
    });
    setCreating(false);
    if (error) {
      console.error(error);
      toast({ title: "Erreur", description: "Une erreur est survenue.", variant: "destructive" });
      return;
    }
    toast({ title: "Campagne créée", description: nom });
    setOpen(false);
    refetch();
  }

  async function setUsedForShipments(id: string) {
    const { error } = await (supabase.from as any)("campaigns")
      .update({ utilise_pour_chargement: true, active: true, archived: false })
      .eq("id", id);
    if (error) {
      console.error(error);
      toast({ title: "Erreur", description: "Une erreur est survenue.", variant: "destructive" });
      return;
    }
    toast({ title: "Campagne définie pour les chargements" });
    refetch();
  }

  async function toggleActive(id: string, current: boolean) {
    const { error } = await (supabase.from as any)("campaigns")
      .update({ active: !current })
      .eq("id", id);
    if (error) { console.error(error); toast({ title: "Erreur", description: "Une erreur est survenue.", variant: "destructive" }); }
    else refetch();
  }

  async function toggleArchive(id: string, current: boolean) {
    const { error } = await (supabase.from as any)("campaigns")
      .update({ archived: !current })
      .eq("id", id);
    if (error) { console.error(error); toast({ title: "Erreur", description: "Une erreur est survenue.", variant: "destructive" }); }
    else refetch();
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Calendar className="h-6 w-6" /> Gestion des campagnes
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Période officielle : 01 septembre AAAA → 31 août AAAA+1. Une seule campagne peut être utilisée pour les chargements.
          </p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="h-4 w-4 mr-2" />Nouvelle campagne</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Créer une nouvelle campagne</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <label className="text-sm font-medium">Année de début</label>
                <Input
                  type="number"
                  value={year}
                  onChange={(e) => setYear(parseInt(e.target.value) || new Date().getFullYear())}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  La campagne sera nommée <strong>{year}-{year + 1}</strong> (du 01/09/{year} au 31/08/{year + 1}).
                </p>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>Annuler</Button>
              <Button onClick={createCampaign} disabled={creating}>
                {creating ? "Création..." : "Créer"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Campagnes ({campaigns.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Campagne</TableHead>
                <TableHead>Période</TableHead>
                <TableHead>Statut</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {campaigns.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">{c.nom}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {new Date(c.date_debut).toLocaleDateString("fr-FR")} → {new Date(c.date_fin).toLocaleDateString("fr-FR")}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {c.utilise_pour_chargement && (
                        <Badge className="bg-primary text-primary-foreground"><Truck className="h-3 w-3 mr-1" />Chargements</Badge>
                      )}
                      {c.active ? (
                        <Badge variant="outline" className="border-green-500 text-green-600">Active</Badge>
                      ) : (
                        <Badge variant="outline" className="border-muted-foreground text-muted-foreground">Désactivée</Badge>
                      )}
                      {c.archived && <Badge variant="secondary"><Archive className="h-3 w-3 mr-1" />Archivée</Badge>}
                    </div>
                  </TableCell>
                  <TableCell className="text-right space-x-2">
                    {!c.utilise_pour_chargement && (
                      <Button size="sm" variant="outline" onClick={() => setUsedForShipments(c.id)}>
                        <CheckCircle2 className="h-3 w-3 mr-1" />Utiliser pour chargements
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" onClick={() => toggleActive(c.id, c.active)}>
                      {c.active ? "Désactiver" : "Activer"}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => toggleArchive(c.id, c.archived)}>
                      {c.archived ? "Désarchiver" : "Archiver"}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {campaigns.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                    Aucune campagne. Créez-en une pour commencer.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
