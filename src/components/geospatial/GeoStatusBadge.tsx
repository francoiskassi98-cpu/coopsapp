import { cn } from "@/lib/utils";
import { STATUS_CLASS, STATUS_LABEL, type GeoStatus } from "@/lib/geospatial";

export default function GeoStatusBadge({ status, className }: { status: string; className?: string }) {
  const s = status as GeoStatus;
  return (
    <span className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap", STATUS_CLASS[s] ?? "bg-muted", className)}>
      {STATUS_LABEL[s] ?? status}
    </span>
  );
}
