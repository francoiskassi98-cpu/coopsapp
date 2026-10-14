import { useEffect, useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Map, Download, Trash2, Archive, ArchiveRestore, Send, Loader2, Upload, Lock, ArrowLeft, PlayCircle, HelpCircle } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import GeoStatusBadge from "@/components/geospatial/GeoStatusBadge";
import GeoDropzone, { type PendingGeoFile } from "@/components/geospatial/GeoDropzone";
import { ACTION_LABEL, GEO_BUCKET, STATUS_LABEL, downloadGeoFile, downloadGeoFiles, formatBytes, notifyGeo, notifyGeoInfo, setGeoArchived, uploadGeoFile } from "@/lib/geospatial";

type FileRow = { id: string; file_name: string; storage_path: string; file_size_bytes: number; detected_format: string; file_category: string; comment: string | null; created_at: string; uploaded_by: string };

const ROLE_LABEL: Record<string, string> = { super_admin: "Super administrateur", coop_admin: "Admin coopérative", agent: "Agent" };

export default function GeospatialDetail() {
  const { id = "" } = useParams();
  const { user, isSuperAdmin } = useAuth();
  const nav = useNavigate();
  const qc = useQueryClient();
  const [comment, setComment] = useState("");
  const [internal, setInternal] = useState(false);
  const [treated, setTreated] = useState<PendingGeoFile[]>([]);
  const [treatedComment, setTreatedComment] = useState("");
  const [returnComment, setReturnComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [dialog, setDialog] = useState<null | "publish" | "delete" | "info">(null);
  const [infoMsg, setInfoMsg] = useState("");

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["geo-detail", id],
    enabled: !!id,
    queryFn: async () => {
      const [req, files, comments, hist] = await Promise.all([
        supabase.from("geospatial_requests").select("*, cooperatives(name)").eq("id", id).maybeSingle(),
        supabase.from("geospatial_files").select("*").eq("request_id", id).order("created_at"),
        supabase.from("geospatial_comments").select("*").eq("request_id", id).order("created_at"),
        supabase.from("geospatial_history").select("*").eq("request_id", id).order("created_at", { ascending: false }),
      ]);
      if (req.error) throw req.error;
      const ids = Array.from(new Set([req.data?.created_by, ...(comments.data ?? []).map((c) => c.author_id), ...(hist.data ?? []).map((h) => h.actor_id)].filter(Boolean) as string[]));
      const { data: profs } = ids.length ? await supabase.from("profiles").select("user_id,full_name,username,email").in("user_id", ids) : { data: [] };
      const names = new globalThis.Map((profs ?? []).map((p) => [p.user_id, { name: p.full_name || p.username || p.email, email: p.email }]));
      return { req: req.data, files: (files.data ?? []) as FileRow[], comments: comments.data ?? [], hist: hist.data ?? [], names };
    },
  });

  useEffect(() => {
    if (!data?.req || !window.location.hash) return;
    document.getElementById(window.location.hash.slice(1))?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [data?.req]);

  const refresh = () => { refetch(); qc.invalidateQueries({ queryKey: ["geo-list"] }); qc.invalidateQueries({ queryKey: ["geo-dashboard"] }); };
  const fail = (e: unknown) => { console.error(e); toast.error("Une erreur est survenue."); };

  if (isLoading) return <div className="space-y-4"><Skeleton className="h-12 w-1/2" /><Skeleton className="h-64 w-full" /></div>;
  if (isError || !data?.req) return (
    <div className="text-center py-16 space-y-3">
      <p className="text-muted-foreground">Demande introuvable ou accès non autorisé.</p>
      <Button asChild variant="outline"><Link to="/geospatial">Retour au centre géospatial</Link></Button>
    </div>
  );

  const { req, files, comments, hist, names } = data;
  const originals = files.filter((f) => f.file_category === "original");
  const treatedFiles = files.filter((f) => f.file_category === "treated");
  const author = names.get(req.created_by);

  const download = async (f: FileRow) => {
    if (!user) return;
    try { await downloadGeoFile(f, id, user.id); } catch (e) { fail(e); }
  };

  const updateReq = async (patch: Record<string, unknown>, msg: string) => {
    setBusy(true);
    const { error } = await supabase.from("geospatial_requests").update(patch).eq("id", id);
    setBusy(false);
    if (error) return fail(error);
    toast.success(msg); refresh();
  };

  const addComment = async () => {
    if (!user || !comment.trim()) return;
    setBusy(true);
    const { error } = await supabase.from("geospatial_comments").insert({ request_id: id, author_id: user.id, content: comment.trim().slice(0, 5000), is_internal: isSuperAdmin && internal });
    setBusy(false);
    if (error) return fail(error);
    setComment(""); refresh();
  };

  const uploadTreated = async () => {
    if (!user) return;
    const ok = treated.filter((t) => t.check.ok);
    if (!ok.length || ok.length !== treated.length) return toast.error("Retirez les fichiers non reconnus.");
    setBusy(true);
    try {
      for (const t of ok) await uploadGeoFile({ file: t.file, format: t.check.format, requestId: id, cooperativeId: req.cooperative_id, category: "treated", userId: user.id, comment: treatedComment.trim() || null });
      if (req.status === "en_attente" || req.status === "en_cours") await supabase.from("geospatial_requests").update({ status: "traite" }).eq("id", id);
      setTreated([]); setTreatedComment(""); toast.success("Fichiers traités déposés."); refresh();
    } catch (e) { fail(e); } finally { setBusy(false); }
  };

  const removeTreated = async (f: FileRow) => {
    setBusy(true);
    const { error } = await supabase.storage.from(GEO_BUCKET).remove([f.storage_path]);
    const { error: e2 } = error ? { error } : await supabase.from("geospatial_files").delete().eq("id", f.id);
    setBusy(false);
    if (e2) return fail(e2);
    refresh();
  };

  const publish = async () => {
    if (!user) return;
    setBusy(true);
    const { error } = await supabase.from("geospatial_requests").update({
      status: "publie", published_at: new Date().toISOString(), published_by: user.id, return_comment: returnComment.trim() || null,
    }).eq("id", id);
    if (error) { setBusy(false); setDialog(null); return fail(error); }
    const { data: n, error: nErr } = await notifyGeo(id, "published");
    setBusy(false); setDialog(null);
    if (nErr || !n?.ok) toast.warning("Résultats publiés, mais la notification e-mail n'a pas pu être envoyée.");
    else toast.success("Résultats publiés et coopérative notifiée.");
    refresh();
  };

  const remove = async () => {
    setBusy(true);
    try {
      if (files.length) {
        const { error } = await supabase.storage.from(GEO_BUCKET).remove(files.map((f) => f.storage_path));
        if (error) throw error;
      }
      const { error } = await supabase.from("geospatial_requests").delete().eq("id", id);
      if (error) throw error;
      toast.success("Demande supprimée définitivement.");
      qc.invalidateQueries({ queryKey: ["geo-list"] }); qc.invalidateQueries({ queryKey: ["geo-dashboard"] });
      nav("/geospatial/historique");
    } catch (e) { fail(e); } finally { setBusy(false); setDialog(null); }
  };

  const dlAll = async (list: FileRow[]) => {
    if (!user || busy) return;
    setBusy(true);
    try { await downloadGeoFiles(list, id, user.id); } catch (e) { fail(e); } finally { setBusy(false); }
  };

  const toggleArchive = async () => {
    setBusy(true);
    try { await setGeoArchived(id, !req.is_archived); toast.success(req.is_archived ? "Demande restaurée." : "Demande archivée."); refresh(); }
    catch (e) { fail(e); } finally { setBusy(false); }
  };

  const requestInfo = async () => {
    if (!user || !infoMsg.trim()) return;
    setBusy(true);
    const { error } = await supabase.from("geospatial_comments").insert({ request_id: id, author_id: user.id, content: infoMsg.trim().slice(0, 5000), is_internal: false });
    if (error) { setBusy(false); return fail(error); }
    const { data: n, error: nErr } = await notifyGeoInfo(id);
    setBusy(false); setDialog(null); setInfoMsg("");
    if (nErr || !n?.ok) toast.warning("Demande enregistrée, mais la notification e-mail n'a pas pu être envoyée.");
    else toast.success("Demande d'informations envoyée à la coopérative.");
    refresh();
  };

  const FileList = ({ list, canDelete }: { list: FileRow[]; canDelete?: boolean }) => (
    list.length === 0 ? <p className="text-sm text-muted-foreground">Aucun fichier.</p> :
    <ul className="divide-y divide-border rounded-xl border">
      {list.map((f) => (
        <li key={f.id} className="flex items-center gap-3 p-3">
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium truncate">{f.file_name}</div>
            <div className="text-xs text-muted-foreground">{f.detected_format} · {formatBytes(Number(f.file_size_bytes))} · {new Date(f.created_at).toLocaleString("fr-FR")}</div>
            {f.comment && <div className="text-xs mt-0.5">{f.comment}</div>}
          </div>
          <Button size="sm" variant="outline" onClick={() => download(f)}><Download className="h-4 w-4 mr-1" />Télécharger</Button>
          {canDelete && <Button size="icon" variant="ghost" aria-label="Supprimer le fichier" disabled={busy} onClick={() => removeTreated(f)}><Trash2 className="h-4 w-4" /></Button>}
        </li>
      ))}
    </ul>
  );

  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm"><Link to="/geospatial/historique"><ArrowLeft className="h-4 w-4 mr-1" />Historique</Link></Button>
      <PageHeader icon={Map} title={req.title}
        description={<span className="flex flex-wrap items-center gap-2"><GeoStatusBadge status={req.status} />{req.is_archived && <span className="text-xs rounded-full bg-muted px-2 py-0.5">Archivée</span>}</span>}
        actions={<div className="flex flex-wrap gap-2">
          {isSuperAdmin && req.status === "en_attente" && !req.is_archived && (
            <Button disabled={busy} onClick={() => updateReq({ status: "en_cours" }, "Demande prise en charge.")}><PlayCircle className="h-4 w-4 mr-1" />Prendre en charge</Button>
          )}
          {isSuperAdmin && originals.length > 0 && <Button variant="outline" disabled={busy} onClick={() => dlAll(originals)}><Download className="h-4 w-4 mr-1" />Télécharger les originaux</Button>}
          {treatedFiles.length > 0 && (isSuperAdmin || req.status === "publie") && <Button variant="outline" disabled={busy} onClick={() => dlAll(treatedFiles)}><Download className="h-4 w-4 mr-1" />Télécharger les fichiers traités</Button>}
          {isSuperAdmin && req.status !== "publie" && !req.is_archived && <Button variant="outline" disabled={busy} onClick={() => setDialog("info")}><HelpCircle className="h-4 w-4 mr-1" />Demander des informations</Button>}
          {isSuperAdmin && req.status !== "publie" && <Button disabled={busy || treatedFiles.length === 0} title={treatedFiles.length === 0 ? "Déposez d'abord un fichier traité" : undefined} onClick={() => { setReturnComment(req.return_comment ?? ""); setDialog("publish"); }}><Send className="h-4 w-4 mr-1" />Publier les résultats</Button>}
          <Button variant="outline" disabled={busy} onClick={toggleArchive}>
            {req.is_archived ? <><ArchiveRestore className="h-4 w-4 mr-1" />Restaurer</> : <><Archive className="h-4 w-4 mr-1" />Archiver</>}
          </Button>
          {isSuperAdmin && <Button variant="destructive" disabled={busy} onClick={() => setDialog("delete")}><Trash2 className="h-4 w-4 mr-1" />Supprimer définitivement</Button>}
        </div>} />

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card><CardHeader><CardTitle className="text-base">Informations</CardTitle></CardHeader>
            <CardContent className="grid sm:grid-cols-2 gap-3 text-sm">
              <div><span className="text-muted-foreground">Coopérative : </span>{(req.cooperatives as { name: string } | null)?.name}</div>
              <div><span className="text-muted-foreground">Auteur : </span>{author?.name ?? "—"}{author?.email ? ` (${author.email})` : ""}</div>
              <div><span className="text-muted-foreground">Soumise le : </span>{new Date(req.created_at).toLocaleString("fr-FR")}</div>
              {req.published_at && <div><span className="text-muted-foreground">Publiée le : </span>{new Date(req.published_at).toLocaleString("fr-FR")}</div>}
              <div className="sm:col-span-2"><span className="text-muted-foreground">Instructions : </span>{req.description || "Aucune"}</div>
              {isSuperAdmin && req.notification_error && <div className="sm:col-span-2 text-destructive text-xs">Notification : {req.notification_error}</div>}
              {isSuperAdmin && (
                <div className="sm:col-span-2 flex items-center gap-2">
                  <Label>Statut</Label>
                  <Select value={req.status} disabled={busy || req.status === "publie"} onValueChange={(v) => updateReq({ status: v }, "Statut mis à jour.")}>
                    <SelectTrigger className="w-60"><SelectValue /></SelectTrigger>
                    <SelectContent>{Object.entries(STATUS_LABEL).filter(([k]) => k !== "publie").map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              )}
            </CardContent></Card>

          <Card><CardHeader><CardTitle className="text-base">Fichiers d'origine ({originals.length})</CardTitle></CardHeader>
            <CardContent><FileList list={originals} /></CardContent></Card>

          <Card id="fichiers-traites"><CardHeader><CardTitle className="text-base">Fichiers traités ({treatedFiles.length})</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              {!isSuperAdmin && req.status !== "publie"
                ? <p className="text-sm text-muted-foreground">Les résultats seront disponibles après publication par le super administrateur.</p>
                : <FileList list={treatedFiles} canDelete={isSuperAdmin && req.status !== "publie"} />}
              {req.return_comment && <div className="rounded-lg bg-muted/50 p-3 text-sm"><b>Commentaire de restitution : </b>{req.return_comment}</div>}
              {isSuperAdmin && req.status !== "publie" && (
                <div className="space-y-3 border-t pt-4">
                  <GeoDropzone files={treated} onChange={setTreated} disabled={busy} />
                  <Textarea placeholder="Commentaire associé aux fichiers (optionnel)" value={treatedComment} maxLength={2000} onChange={(e) => setTreatedComment(e.target.value)} />
                  <div className="flex flex-wrap gap-2 justify-end">
                    <Button variant="outline" disabled={busy || treated.length === 0} onClick={uploadTreated}>
                      {busy ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Upload className="h-4 w-4 mr-1" />}Déposer les fichiers traités
                    </Button>
                    <Button disabled={busy || treatedFiles.length === 0} onClick={() => { setReturnComment(req.return_comment ?? ""); setDialog("publish"); }}>
                      <Send className="h-4 w-4 mr-1" />Publier les résultats
                    </Button>
                  </div>
                </div>
              )}
            </CardContent></Card>

          <Card id="commentaires"><CardHeader><CardTitle className="text-base">Commentaires</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {comments.length === 0 && <p className="text-sm text-muted-foreground">Aucun commentaire.</p>}
              {comments.map((c) => (
                <div key={c.id} className={`rounded-lg p-3 text-sm ${c.is_internal ? "bg-secondary/10 border border-secondary/30" : "bg-muted/40"}`}>
                  <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                    {c.is_internal && <Lock className="h-3 w-3" />}
                    <b>{names.get(c.author_id)?.name ?? "—"}</b> · {ROLE_LABEL[c.author_role ?? ""] ?? ""} · {new Date(c.created_at).toLocaleString("fr-FR")}
                    {c.is_internal && " · Note interne"}
                  </div>
                  <p className="whitespace-pre-wrap">{c.content}</p>
                </div>
              ))}
              <Textarea placeholder="Ajouter un commentaire…" value={comment} maxLength={5000} onChange={(e) => setComment(e.target.value)} />
              <div className="flex items-center justify-between gap-2">
                {isSuperAdmin ? <label className="flex items-center gap-2 text-sm"><Switch checked={internal} onCheckedChange={setInternal} />Note interne (invisible pour la coopérative)</label> : <span />}
                <Button size="sm" disabled={busy || !comment.trim()} onClick={addComment}>Ajouter un commentaire</Button>
              </div>
            </CardContent></Card>
        </div>

        <Card className="h-fit"><CardHeader><CardTitle className="text-base">Historique</CardTitle></CardHeader>
          <CardContent>
            <ol className="relative border-l border-border ml-2 space-y-4">
              {hist.map((h) => {
                const d = (h.details ?? {}) as Record<string, string>;
                return (
                  <li key={h.id} className="ml-4">
                    <span className="absolute -left-1.5 mt-1.5 h-3 w-3 rounded-full bg-primary" />
                    <div className="text-sm font-medium">{ACTION_LABEL[h.action] ?? h.action}</div>
                    <div className="text-xs text-muted-foreground">
                      {h.actor_id ? names.get(h.actor_id)?.name ?? "—" : "Système"} · {new Date(h.created_at).toLocaleString("fr-FR")}
                    </div>
                    {d.to && <div className="text-xs">{STATUS_LABEL[d.from as keyof typeof STATUS_LABEL] ?? d.from} → {STATUS_LABEL[d.to as keyof typeof STATUS_LABEL] ?? d.to}</div>}
                    {d.file && <div className="text-xs truncate">{d.file}</div>}
                  </li>
                );
              })}
            </ol>
          </CardContent></Card>
      </div>

      <AlertDialog open={dialog === "publish"} onOpenChange={(o) => !busy && setDialog(o ? "publish" : null)}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Publier les résultats ?</AlertDialogTitle>
            <AlertDialogDescription>Ces {treatedFiles.length} fichier(s) deviendront téléchargeables par la coopérative, qui sera notifiée.</AlertDialogDescription></AlertDialogHeader>
          <ul className="text-sm space-y-1 max-h-40 overflow-auto">{treatedFiles.map((f) => <li key={f.id} className="truncate">• {f.file_name} ({formatBytes(Number(f.file_size_bytes))})</li>)}</ul>
          <Textarea placeholder="Commentaire de restitution" value={returnComment} maxLength={5000} onChange={(e) => setReturnComment(e.target.value)} />
          <AlertDialogFooter><AlertDialogCancel disabled={busy}>Annuler</AlertDialogCancel>
            <AlertDialogAction disabled={busy} onClick={(e) => { e.preventDefault(); publish(); }}>{busy && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}Publier</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={dialog === "info"} onOpenChange={(o) => !busy && setDialog(o ? "info" : null)}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Demander des informations</AlertDialogTitle>
            <AlertDialogDescription>Ce message sera visible par la coopérative, qui sera notifiée.</AlertDialogDescription></AlertDialogHeader>
          <Textarea value={infoMsg} maxLength={5000} rows={4} onChange={(e) => setInfoMsg(e.target.value)} placeholder="Précisez les informations attendues…" />
          <AlertDialogFooter><AlertDialogCancel disabled={busy}>Annuler</AlertDialogCancel>
            <AlertDialogAction disabled={busy || !infoMsg.trim()} onClick={(e) => { e.preventDefault(); requestInfo(); }}>{busy && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}Envoyer</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={dialog === "delete"} onOpenChange={(o) => !busy && setDialog(o ? "delete" : null)}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Supprimer définitivement ?</AlertDialogTitle>
            <AlertDialogDescription>La demande, ses {files.length} fichier(s), ses commentaires et son historique seront effacés. Cette action est irréversible. Préférez l'archivage pour conserver les données.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel disabled={busy}>Annuler</AlertDialogCancel>
            <AlertDialogAction disabled={busy} className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={(e) => { e.preventDefault(); remove(); }}>Supprimer</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
