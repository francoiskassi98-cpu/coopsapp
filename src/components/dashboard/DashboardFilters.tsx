import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { X, Calendar } from "lucide-react";
import { cn } from "@/lib/utils";

const MONTHS = ["Sep", "Oct", "Nov", "Déc", "Jan", "Fév", "Mar", "Avr", "Mai", "Juin", "Juil", "Août"];
const MONTH_NUMBERS = [9, 10, 11, 12, 1, 2, 3, 4, 5, 6, 7, 8];

type Props = {
  campaigns: string[];
  selectedCampaign: string;
  onCampaignChange: (c: string) => void;
  selectedMonths: number[];
  onMonthsChange: (months: number[]) => void;
};

export default function DashboardFilters({
  campaigns, selectedCampaign, onCampaignChange, selectedMonths, onMonthsChange,
}: Props) {
  function toggleMonth(m: number) {
    if (selectedMonths.includes(m)) onMonthsChange(selectedMonths.filter((x) => x !== m));
    else onMonthsChange([...selectedMonths, m]);
  }

  return (
    <div className="rounded-[20px] border border-border bg-card shadow-glass p-5">
      <div className="flex items-center gap-2 text-sm font-semibold text-foreground/80 mb-4">
        <Calendar className="h-4 w-4 text-primary" />
        Chronologie
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <div className="w-52">
          <Select value={selectedCampaign} onValueChange={onCampaignChange}>
            <SelectTrigger className="rounded-full h-9 bg-background border-border">
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
              <button
                key={monthNum}
                type="button"
                onClick={() => toggleMonth(monthNum)}
                className={cn(
                  "h-9 min-w-[54px] px-3 rounded-full text-xs font-medium transition-all border",
                  isSelected
                    ? "bg-primary text-primary-foreground border-primary shadow-glow"
                    : "bg-background text-foreground/70 border-border hover:border-primary/40 hover:text-foreground"
                )}
              >
                {label}
              </button>
            );
          })}
        </div>

        {selectedMonths.length > 0 && (
          <Button variant="ghost" size="sm" onClick={() => onMonthsChange([])} className="h-9 px-2 rounded-full">
            <X className="h-3 w-3 mr-1" /> Réinitialiser
          </Button>
        )}
      </div>
    </div>
  );
}
