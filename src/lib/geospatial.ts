import { supabase } from "@/integrations/supabase/client";

export const GEO_MAX_FILE_MB = 50;
export const GEO_MAX_FILE_BYTES = GEO_MAX_FILE_MB * 1024 * 1024;
export const GEO_MAX_FILES = 20;
export const GEO_BUCKET = "geospatial-files";
export const GEO_ACCEPT = ".zip,.geojson,.json,.kml,.kmz,.gpx,.gpkg";

export type GeoStatus = "en_attente" | "en_cours" | "traite" | "publie" | "rejete";
export const STATUS_LABEL: Record<GeoStatus, string> = {
  en_attente: "En attente",
  en_cours: "En cours de traitement",
  traite: "Traité (non publié)",
  publie: "Publié",
  rejete: "Rejeté",
};
export const STATUS_CLASS: Record<GeoStatus, string> = {
  en_attente: "bg-secondary/20 text-secondary",
  en_cours: "bg-primary/15 text-primary",
  traite: "bg-accent/20 text-accent-foreground",
  publie: "bg-success/15 text-success",
  rejete: "bg-destructive/15 text-destructive",
};

export const ACTION_LABEL: Record<string, string> = {
  creation: "Création de la demande",
  soumission_fichiers: "Soumission des fichiers",
  changement_statut: "Changement de statut",
  depot_fichier_traite: "Dépôt d'un fichier traité",
  publication: "Publication des résultats",
  archivage: "Archivage",
  restauration: "Restauration",
  telechargement: "Téléchargement",
  commentaire: "Commentaire",
};

const DANGEROUS = /\.(exe|bat|cmd|com|msi|sh|ps1|vbs|js|jar|dll|scr|apk|app|php|py|html?)$/i;

export interface GeoCheck {
  ok: boolean;
  format: string;
  error?: string;
  warning?: string;
}

export const formatBytes = (n: number) =>
  n >= 1048576 ? `${(n / 1048576).toFixed(2)} Mo` : n >= 1024 ? `${(n / 1024).toFixed(1)} Ko` : `${n} o`;

export const extOf = (name: string) => (name.includes(".") ? name.split(".").pop()!.toLowerCase() : "");

/** Liste les noms d'entrées d'une archive ZIP via le répertoire central (sans extraction). */
export function listZipEntries(buf: ArrayBuffer): string[] | null {
  const v = new DataView(buf);
  const min = Math.max(0, buf.byteLength - 65557);
  let eocd = -1;
  for (let i = buf.byteLength - 22; i >= min; i--) {
    if (v.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) return null;
  const count = v.getUint16(eocd + 10, true);
  let off = v.getUint32(eocd + 16, true);
  const dec = new TextDecoder();
  const names: string[] = [];
  for (let i = 0; i < count; i++) {
    if (off + 46 > buf.byteLength || v.getUint32(off, true) !== 0x02014b50) return null;
    const nl = v.getUint16(off + 28, true), el = v.getUint16(off + 30, true), cl = v.getUint16(off + 32, true);
    names.push(dec.decode(new Uint8Array(buf, off + 46, nl)));
    off += 46 + nl + el + cl;
  }
  return names;
}

export async function detectGeoFile(file: File): Promise<GeoCheck> {
  const ext = extOf(file.name);
  if (file.size === 0) return { ok: false, format: "Inconnu", error: "Fichier vide." };
  if (file.size > GEO_MAX_FILE_BYTES) return { ok: false, format: "Inconnu", error: `Fichier trop volumineux (max ${GEO_MAX_FILE_MB} Mo).` };
  if (DANGEROUS.test(file.name)) return { ok: false, format: "Interdit", error: "Type de fichier dangereux refusé." };
  const head = new Uint8Array(await file.slice(0, 4).arrayBuffer());
  const isZipSig = head[0] === 0x50 && head[1] === 0x4b;

  if (ext === "zip" || ext === "kmz") {
    if (!isZipSig) return { ok: false, format: "Inconnu", error: "Le contenu ne correspond pas à une archive ZIP." };
    const names = listZipEntries(await file.arrayBuffer());
    if (!names) return { ok: false, format: "ZIP", error: "Archive ZIP illisible ou corrompue." };
    if (names.some((n) => n.includes("..") || n.startsWith("/") || /^[a-z]:/i.test(n)))
      return { ok: false, format: "ZIP", error: "Archive refusée : chemins suspects." };
    if (names.some((n) => DANGEROUS.test(n) || /\.zip$/i.test(n)))
      return { ok: false, format: "ZIP", error: "Archive refusée : fichier exécutable ou archive imbriquée détecté." };
    if (ext === "kmz") return names.some((n) => /\.kml$/i.test(n)) ? { ok: true, format: "KMZ" } : { ok: false, format: "KMZ", error: "KMZ sans fichier KML." };
    const lower = names.map((n) => n.toLowerCase());
    const hasShp = lower.some((n) => n.endsWith(".shp"));
    if (hasShp) {
      const missing = [".shx", ".dbf"].filter((x) => !lower.some((n) => n.endsWith(x)));
      return missing.length
        ? { ok: true, format: "Shapefile (ZIP) incomplet", warning: `Composants manquants : ${missing.join(", ")}.` }
        : { ok: true, format: "Shapefile (ZIP)" };
    }
    if (lower.some((n) => /\.(geojson|json|kml|gpkg|gpx)$/.test(n))) return { ok: true, format: "Archive géospatiale (ZIP)" };
    return { ok: false, format: "ZIP", error: "Aucun fichier géospatial reconnu dans l'archive." };
  }

  if (ext === "geojson" || ext === "json") {
    try {
      const txt = await file.text();
      const j = JSON.parse(txt);
      const t = j?.type;
      if (["FeatureCollection", "Feature", "Polygon", "MultiPolygon", "Point", "MultiPoint", "LineString", "MultiLineString", "GeometryCollection"].includes(t))
        return { ok: true, format: "GeoJSON" };
      if (t === "Topology") return { ok: true, format: "TopoJSON" };
      return { ok: false, format: "JSON", error: "Ce JSON ne contient pas de géométries reconnues (GeoJSON attendu)." };
    } catch {
      return { ok: false, format: "JSON", error: "JSON invalide." };
    }
  }
  if (ext === "kml") {
    const txt = await file.slice(0, 4096).text();
    return /<kml[\s>]/i.test(txt) ? { ok: true, format: "KML" } : { ok: false, format: "KML", error: "Contenu KML non reconnu." };
  }
  if (ext === "gpx") {
    const txt = await file.slice(0, 4096).text();
    return /<gpx[\s>]/i.test(txt) ? { ok: true, format: "GPX" } : { ok: false, format: "GPX", error: "Contenu GPX non reconnu." };
  }
  if (ext === "gpkg") {
    const txt = await file.slice(0, 16).text();
    return txt.startsWith("SQLite format 3") ? { ok: true, format: "GeoPackage" } : { ok: false, format: "GPKG", error: "GeoPackage non reconnu." };
  }
  if (ext === "shp") return { ok: false, format: "Shapefile", error: "Un Shapefile doit être envoyé dans une archive ZIP complète (.shp, .shx, .dbf, .prj)." };
  return { ok: false, format: "Inconnu", error: "Format non pris en charge." };
}

const safeName = (n: string) => n.normalize("NFD").replace(/[^\w.-]+/g, "_").slice(-120);

export async function uploadGeoFile(opts: {
  file: File; format: string; requestId: string; cooperativeId: string;
  category: "original" | "treated"; userId: string; comment?: string | null;
}) {
  const folder = opts.category === "original" ? "originals" : "treated";
  const path = `${folder}/${opts.cooperativeId}/${opts.requestId}/${crypto.randomUUID()}_${safeName(opts.file.name)}`;
  const { error: upErr } = await supabase.storage.from(GEO_BUCKET).upload(path, opts.file, {
    upsert: false, contentType: opts.file.type || "application/octet-stream",
  });
  if (upErr) throw upErr;
  const { error } = await supabase.from("geospatial_files").insert({
    request_id: opts.requestId, file_category: opts.category, file_name: opts.file.name.slice(0, 255),
    storage_path: path, file_size_bytes: opts.file.size, detected_format: opts.format,
    mime_type: opts.file.type || null, uploaded_by: opts.userId, comment: opts.comment || null,
  });
  if (error) {
    await supabase.storage.from(GEO_BUCKET).remove([path]);
    throw error;
  }
}

export async function downloadGeoFile(f: { storage_path: string; file_name: string }, requestId: string, userId: string) {
  const { data, error } = await supabase.storage.from(GEO_BUCKET).createSignedUrl(f.storage_path, 60, { download: f.file_name });
  if (error || !data) throw error ?? new Error("signed url");
  await supabase.from("geospatial_history").insert({
    request_id: requestId, actor_id: userId, action: "telechargement", details: { file: f.file_name },
  });
  window.location.assign(data.signedUrl);
}

export function notifyGeo(requestId: string, event: "submitted" | "published") {
  return supabase.functions.invoke("notify-geospatial", {
    body: { request_id: requestId, event, app_url: window.location.origin },
  });
}

export function notifyGeoInfo(requestId: string) {
  return supabase.functions.invoke("notify-geospatial", {
    body: { request_id: requestId, event: "info_requested", app_url: window.location.origin },
  });
}

/** Archive / restaure une demande (contrôle serveur : super admin ou membre de la coopérative). */
export async function setGeoArchived(requestId: string, archived: boolean) {
  const { error } = await supabase.rpc("geo_set_archived", { _request_id: requestId, _archived: archived });
  if (error) throw error;
}

/** Télécharge séquentiellement une liste de fichiers via URL signées courtes (aucun lien public). */
export async function downloadGeoFiles(files: { storage_path: string; file_name: string }[], requestId: string, userId: string) {
  for (const f of files) {
    const { data, error } = await supabase.storage.from(GEO_BUCKET).createSignedUrl(f.storage_path, 60, { download: f.file_name });
    if (error || !data) throw error ?? new Error("signed url");
    const a = document.createElement("a");
    a.href = data.signedUrl; a.rel = "noopener"; document.body.appendChild(a); a.click(); a.remove();
    await supabase.from("geospatial_history").insert({ request_id: requestId, actor_id: userId, action: "telechargement", details: { file: f.file_name } });
    await new Promise((r) => setTimeout(r, 400));
  }
}
