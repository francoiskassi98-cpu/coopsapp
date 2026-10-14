import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { Eye, Download, MessageSquare, Archive, ArchiveRestore, PlayCircle, HelpCircle, Upload, Send, Trash2, Loader2, MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { GEO_BUCKET, downloadGeoFiles, notifyGeoInfo, setGeoArchived } from "@/lib/geospatial";

export type GeoRowFile = { storage_path: string; file_name: string; file_category: string };
export type GeoRow = { id: string; title: string; status: string; is_archived: boolean; geospatial_files: GeoRowFile[] };

export default function GeoRowActions({ row }: { row: GeoRow }) {
  const { user, isSuperAdmin } = useAuth();
  const nav = useNavigate();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [dialog, setDialog] = useState<null | "info" | "delete">(null);
  const [msg, setMsg] = useState("");
  const [menu, setMenu] = useState(false);
  const MenuItem = ({ onClick, danger, children }: { onClick: () => void; danger?: boolean; children: React.ReactNode }) => (
    <button type="button" className={`flex items-center rounded-md px-2 py-1.5 text-sm text-left hover:bg-muted ${danger ? "text-destructive" : ""}`} onClick={() => { setMenu(false); onClick(); }}>{children}</button>
  );

  const originals = row.geospatial_files.filter((f) => f.file_category === "original");
  const treated = row.geospatial_files.filter((f) => f.file_category === "treated");
  const canDownloadTreated = treated.length > 0 && (isSuperAdmin || row.status === "publie");
  const open = (hash = "") => nav(`/geospatial/${row.id}${hash}`);
  const refresh = () => { qc.invalidateQueries({ queryKey: ["geo-list"] }); qc.invalidateQueries({ queryKey: ["geo-dashboard"] }); qc.invalidateQueries({ queryKey: ["geo-detail", row.id] }); };

  const run = async (fn: () => Promise<void>, ok?: string) => {
    if (busy) return;
    setBusy(true);
    try { await fn(); if (ok) toast.success(ok); refresh(); }
    catch (e) { console.error(e); toast.error("Une erreur est survenue."); }
    finally { setBusy(false); }
  };

  const dl = (list: GeoRowFile[]) => run(async () => { if (user) await downloadGeoFiles(list, row.id, user.id); });
  const takeCharge = () => run(async () => {
    const { error } = await supabase.from("geospatial_requests").update({ status: "en_cours" }).eq("id", row.id);
    if (error) throw error;
  }, "Demande prise en charge.");
  const archive = (v: boolean) => run(() => setGeoArchived(row.id, v), v ? "Demande archivée." : "Demande restaurée.");
  const requestInfo = () => run(async () => {
    if (!user || !msg.trim()) throw new Error("empty");
    const { error } = await supabase.from("geospatial_comments").insert({ request_id: row.id, author_id: user.id, content: msg.trim().slice(0, 5000), is_internal: false });
    if (error) throw error;
    const { data: n, error: nErr } = await notifyGeoInfo(row.id);
    if (nErr || !n?.ok) toast.warning("Demande enregistrée, mais la notification e-mail n'a pas pu être envoyée.");
    else toast.success("Demande d'informations envoyée à la coopérative.");
    setMsg(""); setDialog(null);
  });
  const remove = () => run(async () => {
    const paths = row.geospatial_files.map((f) => f.storage_path);
    if (paths.length) { const { error } = await supabase.storage.from(GEO_BUCKET).remove(paths); if (error) throw error; }
    const { error } = await supabase.from("geospatial_requests").delete().eq("id", row.id);
    if (error) throw error;
    setDialog(null);
  }, "Demande supprimée définitivement.");

  return (
    <div className="flex items-center justify-end gap-1">
      <Button size="sm" variant="outline" onClick={() => open()}><Eye className="h-4 w-4 mr-1" />Voir les détails</Button>
      {isSuperAdmin && row.status === "en_attente" && !row.is_archived && (
        <Button size="sm" disabled={busy} onClick={takeCharge}>{busy ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <PlayCircle className="h-4 w-4 mr-1" />}Prendre en charge</Button>
      )}
      <Popover open={menu} onOpenChange={setMenu}>
        <PopoverTrigger asChild>
          <Button size="sm" variant="ghost" disabled={busy} aria-label="Plus d'actions">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <MoreHorizontal className="h-4 w-4" />}</Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-64 p-1 flex flex-col">
          <MenuItem onClick={() => open()}><Eye className="h-4 w-4 mr-2" />Voir les détails</MenuItem>
          {isSuperAdmin && originals.length > 0 && <MenuItem onClick={() => dl(originals)}><Download className="h-4 w-4 mr-2" />Télécharger les originaux ({originals.length})</MenuItem>}
          {canDownloadTreated && <MenuItem onClick={() => dl(treated)}><Download className="h-4 w-4 mr-2" />Télécharger le fichier traité ({treated.length})</MenuItem>}
          <MenuItem onClick={() => open("#commentaires")}><MessageSquare className="h-4 w-4 mr-2" />{isSuperAdmin ? "Ajouter un commentaire" : "Consulter les commentaires"}</MenuItem>
          {isSuperAdmin && !row.is_archived && row.status !== "publie" && <>
            <div className="my-1 h-px bg-border" />
            <MenuItem onClick={() => setDialog("info")}><HelpCircle className="h-4 w-4 mr-2" />Demander des informations</MenuItem>
            <MenuItem onClick={() => open("#fichiers-traites")}><Upload className="h-4 w-4 mr-2" />Déposer les fichiers traités</MenuItem>
            {treated.length > 0 && <MenuItem onClick={() => open("#fichiers-traites")}><Send className="h-4 w-4 mr-2" />Publier les résultats</MenuItem>}
          </>}
          <div className="my-1 h-px bg-border" />
          {row.is_archived
            ? <MenuItem onClick={() => archive(false)}><ArchiveRestore className="h-4 w-4 mr-2" />Restaurer</MenuItem>
            : <MenuItem onClick={() => archive(true)}><Archive className="h-4 w-4 mr-2" />Archiver</MenuItem>}
          {isSuperAdmin && <MenuItem danger onClick={() => setDialog("delete")}><Trash2 className="h-4 w-4 mr-2" />Supprimer définitivement</MenuItem>}
        </PopoverContent>
      </Popover>

      <AlertDialog open={dialog === "info"} onOpenChange={(o) => !busy && setDialog(o ? "info" : null)}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Demander des informations</AlertDialogTitle>
            <AlertDialogDescription>Ce message sera visible par la coopérative, qui sera notifiée.</AlertDialogDescription></AlertDialogHeader>
          <Textarea value={msg} maxLength={5000} rows={4} onChange={(e) => setMsg(e.target.value)} placeholder="Précisez les informations attendues…" />
          <AlertDialogFooter><AlertDialogCancel disabled={busy}>Annuler</AlertDialogCancel>
            <AlertDialogAction disabled={busy || !msg.trim()} onClick={(e) => { e.preventDefault(); requestInfo(); }}>{busy && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}Envoyer</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={dialog === "delete"} onOpenChange={(o) => !busy && setDialog(o ? "delete" : null)}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Supprimer définitivement « {row.title} » ?</AlertDialogTitle>
            <AlertDialogDescription>La demande, ses {row.geospatial_files.length} fichier(s), ses commentaires et son historique seront effacés. Action irréversible — préférez l'archivage.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel disabled={busy}>Annuler</AlertDialogCancel>
            <AlertDialogAction disabled={busy} className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={(e) => { e.preventDefault(); remove(); }}>Supprimer définitivement</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
