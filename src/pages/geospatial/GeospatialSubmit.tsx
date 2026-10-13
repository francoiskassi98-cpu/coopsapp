import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { Upload, Loader2 } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import GeoDropzone, { type PendingGeoFile } from "@/components/geospatial/GeoDropzone";
import { formatBytes, notifyGeo, uploadGeoFile } from "@/lib/geospatial";

export default function GeospatialSubmit() {
  const { user, cooperativeRefs } = useAuth();
  const nav = useNavigate();
  const qc = useQueryClient();
  const [title, setTitle] = useState("");
  const [comment, setComment] = useState("");
  const [files, setFiles] = useState<PendingGeoFile[]>([]);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);

  const coop = cooperativeRefs[0];
  const valid = files.filter((f) => f.check.ok);
  const invalid = files.length - valid.length;
  const total = valid.reduce((s, f) => s + f.file.size, 0);
  const canSubmit = !!coop && !!user && title.trim().length > 0 && valid.length > 0 && invalid === 0 && !busy;

  const submit = async () => {
    if (!canSubmit || !user || !coop) return;
    setBusy(true); setProgress(0);
    let requestId: string | null = null;
    try {
      const { data: req, error } = await supabase.from("geospatial_requests")
        .insert({ cooperative_id: coop.id, created_by: user.id, title: title.trim().slice(0, 200), description: comment.trim() || null })
        .select("id").single();
      if (error || !req) throw error;
      requestId = req.id;
      for (let i = 0; i < valid.length; i++) {
        await uploadGeoFile({ file: valid[i].file, format: valid[i].check.format, requestId, cooperativeId: coop.id, category: "original", userId: user.id });
        setProgress(Math.round(((i + 1) / valid.length) * 100));
      }
      await supabase.from("geospatial_history").insert({
        request_id: requestId, actor_id: user.id, action: "soumission_fichiers",
        details: { count: valid.length, total_bytes: total },
      });
      const { data: n, error: nErr } = await notifyGeo(requestId, "submitted");
      const openAction = { label: "Ouvrir la demande", onClick: () => nav(`/geospatial/${requestId}`) };
      if (nErr || !n?.ok) toast.warning("Demande enregistrée, mais la notification e-mail n'a pas pu être envoyée.", { action: openAction });
      else toast.success("Demande soumise avec succès. Le super administrateur a été notifié.", { action: openAction });
      qc.invalidateQueries({ queryKey: ["geo-dashboard"] });
      qc.invalidateQueries({ queryKey: ["geo-list"] });
      nav(`/geospatial/${requestId}`);
    } catch (e) {
      console.error(e);
      toast.error(requestId
        ? "La demande a été créée mais certains fichiers n'ont pas pu être envoyés. Contactez le super administrateur."
        : "Une erreur est survenue.");
      if (requestId) nav(`/geospatial/${requestId}`);
    } finally {
      setBusy(false); setConfirm(false);
    }
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <PageHeader icon={Upload} title="Soumettre des fichiers polygonaux" description={coop ? `Coopérative : ${coop.name}` : "Aucune coopérative rattachée à votre compte."} />
      <Card><CardContent className="p-5 space-y-5">
        <div className="space-y-1.5">
          <Label htmlFor="geo-title">Titre de la demande *</Label>
          <Input id="geo-title" value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} placeholder="Ex. Polygones section Zatoboua 2026" disabled={busy} />
        </div>
        <div className="space-y-1.5">
          <Label>Fichiers *</Label>
          <GeoDropzone files={files} onChange={setFiles} disabled={busy} />
          {invalid > 0 && <p className="text-xs text-destructive">Retirez les fichiers non reconnus avant d'envoyer.</p>}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="geo-comment">Commentaire ou instructions</Label>
          <Textarea id="geo-comment" value={comment} maxLength={5000} rows={4} onChange={(e) => setComment(e.target.value)} disabled={busy} />
        </div>
        {busy && (
          <div className="space-y-1">
            <div className="h-2 rounded-full bg-muted overflow-hidden"><div className="h-full bg-primary transition-all" style={{ width: `${progress}%` }} /></div>
            <p className="text-xs text-muted-foreground">Envoi en cours… {progress}%</p>
          </div>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="outline" disabled={busy} onClick={() => nav("/geospatial")}>Annuler</Button>
          <Button disabled={!canSubmit} onClick={() => setConfirm(true)}>
            {busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Upload className="h-4 w-4 mr-2" />}Soumettre les données
          </Button>
        </div>
      </CardContent></Card>

      <AlertDialog open={confirm} onOpenChange={(o) => !busy && setConfirm(o)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmer l'envoi</AlertDialogTitle>
            <AlertDialogDescription>
              {valid.length} fichier(s), {formatBytes(total)} au total, seront transmis au super administrateur.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <ul className="text-sm space-y-1 max-h-48 overflow-auto">
            {valid.map((f) => <li key={f.id} className="truncate">• {f.file.name} <span className="text-muted-foreground">({f.check.format})</span></li>)}
          </ul>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Annuler</AlertDialogCancel>
            <AlertDialogAction disabled={busy} onClick={(e) => { e.preventDefault(); submit(); }}>
              {busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Confirmer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
