import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";

export interface Filters {
  search: string;
  zone: string | null;
  projet: string | null;
  campagne: string | null;
  dateFrom: Date | undefined;
  dateTo: Date | undefined;
}

interface Props {
  filters: Filters;
  onChange: (filters: Filters) => void;
  zones: string[];
  projets: string[];
  campagnes: string[];
}

export function ChargementsFilters({ filters, onChange, zones, projets, campagnes }: Props) {
  const hasFilters = filters.zone || filters.projet || filters.campagne || filters.dateFrom || filters.dateTo;

  const clearFilters = () =>
    onChange({ search: filters.search, zone: null, projet: null, campagne: null, dateFrom: undefined, dateTo: undefined });

  return (
    <div className="flex flex-wrap gap-3 items-end">
      <div className="flex-1 min-w-[200px]">
        <Input
          placeholder="Rechercher (nom, reçu, connaissement)..."
          value={filters.search}
          onChange={(e) => onChange({ ...filters, search: e.target.value })}
        />
      </div>

      <Select value={filters.zone || "all"} onValueChange={(v) => onChange({ ...filters, zone: v === "all" ? null : v })}>
        <SelectTrigger className="w-[160px]">
          <SelectValue placeholder="Zone" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Toutes les zones</SelectItem>
          {zones.map((z) => (
            <SelectItem key={z} value={z}>{z}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={filters.projet || "all"} onValueChange={(v) => onChange({ ...filters, projet: v === "all" ? null : v })}>
        <SelectTrigger className="w-[160px]">
          <SelectValue placeholder="Projet" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Tous les projets</SelectItem>
          {projets.map((p) => (
            <SelectItem key={p} value={p}>{p}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={filters.campagne || "all"} onValueChange={(v) => onChange({ ...filters, campagne: v === "all" ? null : v })}>
        <SelectTrigger className="w-[160px]">
          <SelectValue placeholder="Campagne" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Toutes</SelectItem>
          {campagnes.map((c) => (
            <SelectItem key={c} value={c}>{c}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Input
        type="date"
        className="w-[150px]"
        value={filters.dateFrom ? filters.dateFrom.toISOString().slice(0, 10) : ""}
        onChange={(e) => onChange({ ...filters, dateFrom: e.target.value ? new Date(e.target.value) : undefined })}
        placeholder="Date début"
      />
      <Input
        type="date"
        className="w-[150px]"
        value={filters.dateTo ? filters.dateTo.toISOString().slice(0, 10) : ""}
        onChange={(e) => onChange({ ...filters, dateTo: e.target.value ? new Date(e.target.value) : undefined })}
        placeholder="Date fin"
      />

      {hasFilters && (
        <Button variant="ghost" size="icon" onClick={clearFilters}>
          <X className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
}
