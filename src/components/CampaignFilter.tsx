import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { currentCampaign } from "@/lib/campaign";

export const ALL_CAMPAIGNS = "__all__";
export const CURRENT_CAMPAIGN = "__current__";

interface Props {
  value: string;
  onChange: (v: string) => void;
  includeAll?: boolean;
  className?: string;
  label?: string;
}

export function CampaignFilter({ value, onChange, includeAll = true, className, label = "Campagne" }: Props) {
  const [options, setOptions] = useState<string[]>([]);

  useEffect(() => {
    (async () => {
      const set = new Set<string>();
      set.add(currentCampaign());
      const { data } = await (supabase as any)
        .from("shipments")
        .select("campaign_label")
        .not("campaign_label", "is", null)
        .limit(2000);
      (data || []).forEach((r: any) => { if (r.campaign_label) set.add(r.campaign_label); });
      setOptions(Array.from(set).sort().reverse());
    })();
  }, []);

  return (
    <div className={className}>
      {label && <Label className="text-xs">{label}</Label>}
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger><SelectValue placeholder="Campagne" /></SelectTrigger>
        <SelectContent>
          {includeAll && <SelectItem value={ALL_CAMPAIGNS}>Toutes les campagnes</SelectItem>}
          <SelectItem value={CURRENT_CAMPAIGN}>Campagne en cours ({currentCampaign()})</SelectItem>
          {options.map((c) => (
            <SelectItem key={c} value={c}>{c}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
