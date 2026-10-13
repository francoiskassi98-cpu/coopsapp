import { useRef, useState } from "react";
import { UploadCloud, X, FileWarning, FileCheck2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { GEO_ACCEPT, GEO_MAX_FILE_MB, GEO_MAX_FILES, detectGeoFile, formatBytes, extOf, type GeoCheck } from "@/lib/geospatial";

export interface PendingGeoFile { id: string; file: File; check: GeoCheck }

export default function GeoDropzone({ files, onChange, disabled }: {
  files: PendingGeoFile[]; onChange: (f: PendingGeoFile[]) => void; disabled?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);

  const add = async (list: FileList | null) => {
    if (!list) return;
    const incoming = Array.from(list).slice(0, Math.max(0, GEO_MAX_FILES - files.length));
    const checked = await Promise.all(incoming.map(async (file) => ({ id: crypto.randomUUID(), file, check: await detectGeoFile(file) })));
    onChange([...files, ...checked]);
  };

  return (
    <div className="space-y-3">
      <div
        role="button"
        tabIndex={0}
        aria-label="Zone de dépôt des fichiers"
        onClick={() => !disabled && input.current?.click()}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && !disabled && input.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); if (!disabled) add(e.dataTransfer.files); }}
        className={cn(
          "rounded-2xl border-2 border-dashed p-8 text-center cursor-pointer transition-colors",
          over ? "border-primary bg-primary/5" : "border-border hover:border-primary/50",
          disabled && "opacity-50 cursor-not-allowed",
        )}
      >
        <UploadCloud className="h-10 w-10 mx-auto text-primary mb-2" />
        <p className="font-medium">Glissez-déposez vos fichiers ici ou cliquez pour sélectionner</p>
        <p className="text-xs text-muted-foreground mt-1">
          ZIP (Shapefile complet), GeoJSON, KML, KMZ, GPX, GeoPackage — {GEO_MAX_FILE_MB} Mo max par fichier, {GEO_MAX_FILES} fichiers max
        </p>
        <input ref={input} type="file" multiple accept={GEO_ACCEPT} className="hidden"
          onChange={(e) => { add(e.target.files); e.target.value = ""; }} />
      </div>
      <div className="flex justify-start">
        <Button type="button" variant="outline" size="sm" disabled={disabled || files.length >= GEO_MAX_FILES} onClick={() => input.current?.click()}>
          <UploadCloud className="h-4 w-4 mr-1" />Ajouter des fichiers
        </Button>
      </div>

      {files.length > 0 && (
        <ul className="divide-y divide-border rounded-xl border">
          {files.map((p) => (
            <li key={p.id} className="flex items-start gap-3 p-3">
              {p.check.ok ? <FileCheck2 className="h-5 w-5 text-success shrink-0 mt-0.5" /> : <FileWarning className="h-5 w-5 text-destructive shrink-0 mt-0.5" />}
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium truncate">{p.file.name}</div>
                <div className="text-xs text-muted-foreground">
                  .{extOf(p.file.name) || "?"} · {p.check.format} · {formatBytes(p.file.size)}
                </div>
                {p.check.error && <div className="text-xs text-destructive mt-0.5">{p.check.error}</div>}
                {p.check.warning && <div className="text-xs text-secondary mt-0.5">{p.check.warning}</div>}
              </div>
              <Button type="button" variant="ghost" size="sm" aria-label={`Retirer ${p.file.name}`} disabled={disabled}
                onClick={() => onChange(files.filter((x) => x.id !== p.id))}>
                <X className="h-4 w-4 mr-1" />Retirer
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
