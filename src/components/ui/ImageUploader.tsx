import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Loader2, Upload, X, ImageIcon } from "lucide-react";
import { toast } from "@/hooks/use-toast";

export type ImageBucket =
  | "cooperative-logos"
  | "partner-logos"
  | "shipment-assets"
  | "user-avatars";

interface Props {
  bucket: ImageBucket;
  pathPrefix?: string;
  value: string | null | undefined;
  onChange: (path: string | null) => void;
  label?: string;
  maxSizeMb?: number;
  aspect?: "square" | "wide" | "free";
  disabled?: boolean;
  helper?: string;
}

const ACCEPTED = ["image/png", "image/jpeg", "image/jpg", "image/svg+xml", "image/webp"];

async function compressImage(file: File, maxDim = 800): Promise<File> {
  if (file.type === "image/svg+xml" || file.size < 200 * 1024) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const ratio = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
    if (ratio === 1 && file.size < 500 * 1024) return file;
    const w = Math.round(bitmap.width * ratio);
    const h = Math.round(bitmap.height * ratio);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(bitmap, 0, 0, w, h);
    const blob: Blob | null = await new Promise((res) =>
      canvas.toBlob(res, file.type === "image/png" ? "image/png" : "image/jpeg", 0.85)
    );
    if (!blob) return file;
    return new File([blob], file.name, { type: blob.type });
  } catch (e) {
    console.error("compress failed", e);
    return file;
  }
}

export function ImageUploader({
  bucket,
  pathPrefix = "",
  value,
  onChange,
  label = "Logo",
  maxSizeMb = 2,
  aspect = "square",
  disabled,
  helper,
}: Props) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Resolve preview from path or legacy URL
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!value) {
        setPreviewUrl(null);
        return;
      }
      if (value.startsWith("http://") || value.startsWith("https://") || value.startsWith("data:")) {
        if (!cancelled) setPreviewUrl(value);
        return;
      }
      const { data } = await supabase.storage.from(bucket).createSignedUrl(value, 300);
      if (!cancelled) setPreviewUrl(data?.signedUrl ?? null);
    })();
    return () => {
      cancelled = true;
    };
  }, [value, bucket]);

  const upload = async (file: File) => {
    if (!ACCEPTED.includes(file.type)) {
      toast({ title: "Format non supporté", description: "PNG, JPG, SVG ou WEBP uniquement.", variant: "destructive" });
      return;
    }
    if (file.size > maxSizeMb * 1024 * 1024) {
      toast({ title: "Fichier trop volumineux", description: `Maximum ${maxSizeMb} Mo.`, variant: "destructive" });
      return;
    }
    setBusy(true);
    try {
      const compressed = await compressImage(file);
      const ext = (compressed.name.split(".").pop() || "png").toLowerCase();
      const stamp = Date.now();
      const safePrefix = pathPrefix ? `${pathPrefix.replace(/^\/+|\/+$/g, "")}/` : "";
      const path = `${safePrefix}${stamp}-${crypto.randomUUID().slice(0, 8)}.${ext}`;
      const { error } = await supabase.storage.from(bucket).upload(path, compressed, {
        cacheControl: "3600",
        upsert: false,
        contentType: compressed.type,
      });
      if (error) throw error;
      // Remove previous file if it was an internal path
      if (value && !value.startsWith("http") && !value.startsWith("data:")) {
        await supabase.storage.from(bucket).remove([value]).catch(() => {});
      }
      onChange(path);
      toast({ title: "Image téléversée" });
    } catch (e: any) {
      console.error("upload error", e);
      const denied = e?.statusCode === "403" || e?.status === 403 || /policy|unauthorized|denied/i.test(e?.message ?? "");
      toast({
        title: "Téléversement impossible",
        description: denied
          ? "Vous n'avez pas les droits pour téléverser dans cet emplacement."
          : "Une erreur est survenue.",
        variant: "destructive",
      });
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const remove = async () => {
    if (!value) return;
    setBusy(true);
    try {
      if (!value.startsWith("http") && !value.startsWith("data:")) {
        await supabase.storage.from(bucket).remove([value]).catch(() => {});
      }
      onChange(null);
    } finally {
      setBusy(false);
    }
  };

  const aspectClass =
    aspect === "wide" ? "aspect-[16/9] w-40" : aspect === "free" ? "w-32 h-32" : "w-24 h-24";

  return (
    <div className="space-y-2">
      {label && <Label>{label}</Label>}
      <div
        className={`flex items-center gap-3 rounded-md border-2 border-dashed p-3 transition-colors ${
          dragOver ? "border-primary bg-primary/5" : "border-border"
        }`}
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled) setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          if (disabled) return;
          const f = e.dataTransfer.files?.[0];
          if (f) upload(f);
        }}
      >
        <div className={`${aspectClass} rounded-md bg-muted flex items-center justify-center overflow-hidden shrink-0 border`}>
          {previewUrl ? (
            <img src={previewUrl} alt="aperçu" className="h-full w-full object-contain bg-white" />
          ) : (
            <ImageIcon className="h-6 w-6 text-muted-foreground" />
          )}
        </div>
        <div className="flex flex-col gap-2 min-w-0">
          <input
            ref={fileRef}
            type="file"
            accept={ACCEPTED.join(",")}
            className="hidden"
            onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])}
            disabled={disabled || busy}
          />
          <div className="flex gap-2 flex-wrap">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => fileRef.current?.click()}
              disabled={disabled || busy}
            >
              {busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Upload className="h-4 w-4 mr-2" />}
              {value ? "Remplacer" : "Téléverser"}
            </Button>
            {value && (
              <Button type="button" variant="ghost" size="sm" onClick={remove} disabled={disabled || busy}>
                <X className="h-4 w-4 mr-1" />
                Supprimer
              </Button>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            {helper || `PNG, JPG, SVG ou WEBP — ${maxSizeMb} Mo max. Glisser-déposer accepté.`}
          </p>
        </div>
      </div>
    </div>
  );
}

export default ImageUploader;
