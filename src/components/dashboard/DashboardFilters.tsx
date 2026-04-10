import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { X, Calendar } from "lucide-react";

const MONTHS = [
  "Octobre", "Novembre", "Décembre",
  "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
  "Juillet", "Août", "Septembre",
];

// Month indices mapped to campaign cycle (Oct=0 -> month 10, etc.)
const MONTH_NUMBERS = [10, 11, 12, 1, 2, 3, 4, 5, 6, 7, 8, 9];

type Props = {
  campaigns: string[];
  selectedCampaign: string;
  onCampaignChange: (c: string) => void;
  selectedMonths: number[];
  onMonthsChange: (months: number[]) => void;
};

export default function DashboardFilters({
  campaigns,
  selectedCampaign,
  onCampaignChange,
  selectedMonths,
  onMonthsChange,
}: Props) {
  function toggleMonth(monthNum: number) {
    if (selectedMonths.includes(monthNum)) {
      onMonthsChange(selectedMonths.filter((m) => m !== monthNum));
    } else {
      onMonthsChange([...selectedMonths, monthNum]);
    }
  }

  function clearMonths() {
    onMonthsChange([]);
  }

  return (
    <div className="flex flex-col gap-3 p-4 rounded-lg border bg-card">
      <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
        <Calendar className="h-4 w-4" />
        Chronologie
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <div className="w-48">
          <Select value={selectedCampaign} onValueChange={onCampaignChange}>
            <SelectTrigger>
              <SelectValue placeholder="Campagne" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Toutes les campagnes</SelectItem>
              {campaigns.map((c) => (
                <SelectItem key={c} value={c}>{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {MONTHS.map((label, i) => {
            const monthNum = MONTH_NUMBERS[i];
            const isSelected = selectedMonths.includes(monthNum);
            return (
              <Badge
                key={monthNum}
                variant={isSelected ? "default" : "outline"}
                className={`cursor-pointer select-none transition-colors ${
                  isSelected
                    ? "bg-primary text-primary-foreground hover:bg-primary/90"
                    : "hover:bg-accent"
                }`}
                onClick={() => toggleMonth(monthNum)}
              >
                {label.substring(0, 3)}
              </Badge>
            );
          })}
        </div>

        {selectedMonths.length > 0 && (
          <Button variant="ghost" size="sm" onClick={clearMonths} className="h-7 px-2">
            <X className="h-3 w-3 mr-1" /> Réinitialiser
          </Button>
        )}
      </div>
    </div>
  );
}
