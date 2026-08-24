import { useState, useMemo } from "react";
import { TableHead } from "@/components/ui/table";
import { ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";

export type SortDirection = "asc" | "desc" | null;
export type SortConfig = { column: string; direction: SortDirection };
/** Valeurs triables retournées par l'accesseur d'une colonne. */
export type SortValue = string | number | boolean | Date | null | undefined;

export function useSortableTable(defaultColumn?: string) {
  const [sortConfig, setSortConfig] = useState<SortConfig>({
    column: defaultColumn || "",
    direction: null,
  });

  function toggleSort(column: string) {
    setSortConfig((prev) => {
      if (prev.column !== column) return { column, direction: "asc" };
      if (prev.direction === "asc") return { column, direction: "desc" };
      if (prev.direction === "desc") return { column: "", direction: null };
      return { column, direction: "asc" };
    });
  }

  function sortData<T>(data: T[], accessor: (item: T, column: string) => SortValue): T[] {
    if (!sortConfig.column || !sortConfig.direction) return data;
    return [...data].sort((a, b) => {
      const aVal = accessor(a, sortConfig.column);
      const bVal = accessor(b, sortConfig.column);
      if (aVal == null && bVal == null) return 0;
      if (aVal == null) return 1;
      if (bVal == null) return -1;
      if (typeof aVal === "string" && typeof bVal === "string") {
        const cmp = aVal.localeCompare(bVal, "fr-FR", { sensitivity: "base" });
        return sortConfig.direction === "asc" ? cmp : -cmp;
      }
      const cmp = aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
      return sortConfig.direction === "asc" ? cmp : -cmp;
    });
  }

  return { sortConfig, toggleSort, sortData };
}

type SortableHeaderProps = {
  column: string;
  label: string;
  sortConfig: SortConfig;
  onToggle: (column: string) => void;
  className?: string;
};

export function SortableHeader({ column, label, sortConfig, onToggle, className }: SortableHeaderProps) {
  const isActive = sortConfig.column === column;
  const Icon = isActive
    ? sortConfig.direction === "asc" ? ArrowUp : ArrowDown
    : ArrowUpDown;

  return (
    <TableHead
      className={`cursor-pointer select-none hover:bg-accent/50 ${className || ""}`}
      onClick={() => onToggle(column)}
    >
      <div className="flex items-center gap-1">
        {label}
        <Icon className={`h-3 w-3 ${isActive ? "text-foreground" : "text-muted-foreground/50"}`} />
      </div>
    </TableHead>
  );
}
