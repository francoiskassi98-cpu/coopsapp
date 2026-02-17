import { useState, useMemo } from "react";
import { ChargementsTable } from "@/components/chargements/ChargementsTable";
import { ChargementsFilters, type Filters } from "@/components/chargements/ChargementsFilters";
import { DeleteByConnaissementDialog } from "@/components/chargements/DeleteByConnaissementDialog";
import { ConnaissementsByZoneDialog } from "@/components/chargements/ConnaissementsByZoneDialog";
import { ImportDialog } from "@/components/chargements/ImportDialog";
import { useChargements, useDeleteChargement, useUpdateChargement } from "@/hooks/useChargements";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";

export default function ChargementsPage() {
  const { data: chargements, isLoading, isFetching, refetch } = useChargements();
  const deleteChargement = useDeleteChargement();
  const updateChargement = useUpdateChargement();

  const [filters, setFilters] = useState<Filters>({
    search: "",
    zone: null,
    projet: null,
    campagne: null,
    dateFrom: undefined,
    dateTo: undefined,
  });

  // Extract unique values for filter dropdowns
  const { zones, projets, campagnes, connaissements } = useMemo(() => {
    if (!chargements) return { zones: [], projets: [], campagnes: [], connaissements: [] };
    const zoneSet = new Set<string>();
    const projetSet = new Set<string>();
    const campagneSet = new Set<string>();
    const connSet = new Set<string>();
    for (const c of chargements) {
      if (c.zone && c.zone !== "—") zoneSet.add(c.zone);
      if (c.projet) projetSet.add(c.projet);
      if (c.campagne) campagneSet.add(c.campagne);
      if (c.connaissement && c.connaissement !== "—") connSet.add(c.connaissement);
    }
    return {
      zones: Array.from(zoneSet).sort(),
      projets: Array.from(projetSet).sort(),
      campagnes: Array.from(campagneSet).sort(),
      connaissements: Array.from(connSet).sort(),
    };
  }, [chargements]);

  const filteredChargements = useMemo(() => {
    if (!chargements) return [];
    return chargements.filter((c) => {
      if (filters.search) {
        const s = filters.search.toLowerCase();
        const matches =
          c.connaissement.toLowerCase().includes(s) ||
          c.nom_planteur.toLowerCase().includes(s) ||
          (c.numero_recu && c.numero_recu.toLowerCase().includes(s));
        if (!matches) return false;
      }
      if (filters.zone && c.zone !== filters.zone) return false;
      if (filters.projet && c.projet !== filters.projet) return false;
      if (filters.campagne && c.campagne !== filters.campagne) return false;
      if (filters.dateFrom && new Date(c.date_livraison) < filters.dateFrom) return false;
      if (filters.dateTo && new Date(c.date_livraison) > filters.dateTo) return false;
      return true;
    });
  }, [chargements, filters]);

  const handleDelete = (id: string) => {
    deleteChargement.mutate(id);
  };

  const handleEdit = (chargement: any) => {
    updateChargement.mutate(chargement);
  };

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold">Chargements</h1>
          <p className="text-sm text-muted-foreground">
            Gérez et consultez tous les chargements de cacao
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isFetching}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${isFetching ? "animate-spin" : ""}`} />
            Actualiser
          </Button>
          <Badge variant="secondary">
            {filteredChargements.length} chargement{filteredChargements.length !== 1 ? "s" : ""}
          </Badge>
          {(filters.zone || filters.projet || filters.campagne || filters.dateFrom || filters.dateTo) && (
            <Badge variant="outline">Filtré</Badge>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-3 items-center">
        <DeleteByConnaissementDialog connaissements={connaissements} />
        <ConnaissementsByZoneDialog chargements={filteredChargements} />
        <ImportDialog />
      </div>

      <ChargementsFilters
        filters={filters}
        onChange={setFilters}
        zones={zones}
        projets={projets}
        campagnes={campagnes}
      />

      <ChargementsTable
        chargements={filteredChargements}
        onDelete={handleDelete}
        onEdit={handleEdit}
      />
    </div>
  );
}
