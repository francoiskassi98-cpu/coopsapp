import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { FileSpreadsheet, Loader2 } from "lucide-react";
import { parseExcelFile, joinFullName, type ProducerRow, type ImportReport } from "@/lib/excel-utils";
import { normalizeCampaign } from "@/lib/campaign";
import { useCampaignLabels } from "@/hooks/useCampaign";

interface CoopOption { id: string; name: string }
interface CoopUser { user_id: string; label: string; email: string }
interface ExistingRegistre { id: string; name: string; users: string[] }

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cooperatives: CoopOption[];
  defaultCoopId?: string | null;
}

/**
 * Import d'un registre par le super administrateur : choix de la coopérative et des utilisateurs,
 * puis import du fichier Excel standard des producteurs (même format que l'import classique).
 * Le registre est identifié par la colonne « Registre » du fichier.
 */
export default function AddRegistreDialog({ open, onOpenChange, cooperatives, defaultCoopId }: Props) {
  const qc = useQueryClient();
  const { activeCampaign } = useCampaignLabels();
  const [coopId, setCoopId] = useState("");
  const [users, setUsers] = useState<CoopUser[]>([]);
  const [existing, setExisting] = useState<ExistingRegistre[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [report, setReport] = useState<ImportReport | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setCoopId(defaultCoopId ?? "");
    setSelected([]); setFile(null); setReport(null);
  }, [open, defaultCoopId]);

  useEffect(() => {
    if (!open || !coopId) { setUsers([]); setExisting([]); return; }
    let cancelled = false;
    (async () => {
      setLoadingUsers(true);
      setSelected([]);
      const [{ data: links }, { data: regs }] = await Promise.all([
        supabase.from("user_cooperatives").select("user_id").eq("cooperative_id", coopId),
        supabase.from("registres").select("id,name").eq("cooperative_id", coopId).order("name"),
      ]);
      const ids = Array.from(new Set((links ?? []).map((l) => l.user_id)));
      const regIds = (regs ?? []).map((r) => r.id);
      const [{ data: profiles }, { data: ur }] = await Promise.all([
        ids.length ? supabase.from("profiles").select("user_id,username,full_name,email").in("user_id", ids) : Promise.resolve({ data: [] as { user_id: string; username: string; full_name: string | null; email: string }[] }),
        regIds.length ? supabase.from("user_registres").select("user_id,registre_id").in("registre_id", regIds) : Promise.resolve({ data: [] as { user_id: string; registre_id: string }[] }),
      ]);
      if (cancelled) return;
      const list = (profiles ?? []).map((p) => ({ user_id: p.user_id, label: p.full_name?.trim() || p.username, email: p.email }))
        .sort((a, b) => a.label.localeCompare(b.label, "fr"));
      const nameOf = new Map(list.map((u) => [u.user_id, u.label]));
      setUsers(list);
      setExisting((regs ?? []).map((r) => ({
        id: r.id, name: r.name,
        users: (ur ?? []).filter((x) => x.registre_id === r.id).map((x) => nameOf.get(x.user_id) ?? "—"),
      })));
      setLoadingUsers(false);
    })().catch((e) => { console.error("[AddRegistreDialog] load", e); if (!cancelled) setLoadingUsers(false); });
    return () => { cancelled = true; };
  }, [open, coopId]);

  const onFile = async (f: File | undefined) => {
    if (!f) return;
    setFile(f);
    try {
      setReport(await parseExcelFile(await f.arrayBuffer()));
    } catch (e) {
      console.error("[AddRegistreDialog] parse", e);
      setReport(null);
      toast.error("Fichier illisible. Utilisez le modèle d'import des producteurs.");
    }
  };

  const toDbRow = (r: ProducerRow, registreId: string) => ({
    registre_id: registreId,
    campaign_label: normalizeCampaign(r.campaign_label) || activeCampaign,
    nom: r.nom,
    prenom: r.prenom || null,
    full_name: joinFullName(r.nom, r.prenom),
    producer_number: r.producer_number || null,
    national_id: r.national_id || null,
    producer_code: r.producer_code || null,
    sexe: r.sexe || null,
    section: r.section,
    total_cocoa_area: r.total_cocoa_area || null,
    num_plots: r.num_plots || null,
    plantation_code: r.plantation_code,
    delivery_potential: r.delivery_potential || 0,
    remaining_potential: r.delivery_potential || 0,
    plantation_area: r.plantation_area || null,
    latitude: r.latitude || null,
    longitude: r.longitude || null,
    is_active: r.status !== "INACTIF",
    carte_ccc: r.carte_ccc ? String(r.carte_ccc) : null,
    commentaire: r.commentaire ? String(r.commentaire) : null,
  });

  const submit = async () => {
    if (!coopId) { toast.error("Choisissez une coopérative."); return; }
    if (selected.length === 0) { toast.error("Choisissez au moins un utilisateur."); return; }
    if (!report || report.rows.length === 0) { toast.error("Importez un fichier de registre valide."); return; }
    if (report.blockingErrors > 0) { toast.error("Le fichier contient des erreurs. Corrigez-les puis réessayez."); return; }
    if (saving) return;
    setSaving(true);
    const created: string[] = [];
    try {
      const names = Array.from(new Set(report.rows.map((r) => r.cooperative.trim()).filter(Boolean)));
      const byName = new Map(existing.map((r) => [r.name.trim().toLowerCase(), r.id]));
      const regMap = new Map<string, string>();
      for (const n of names) {
        let id = byName.get(n.toLowerCase());
        if (!id) {
          const { data: reg, error } = await supabase.from("registres")
            .insert({ name: n, cooperative_id: coopId, status: "active" }).select("id").single();
          if (error || !reg) throw error ?? new Error("insert registre");
          id = reg.id; created.push(reg.id);
        }
        regMap.set(n.toLowerCase(), id);
      }
      // Liaison des utilisateurs choisis (sans doublon)
      const regIds = Array.from(new Set(regMap.values()));
      const { data: links } = await supabase.from("user_registres").select("user_id,registre_id").in("registre_id", regIds);
      const has = new Set((links ?? []).map((l) => `${l.user_id}|${l.registre_id}`));
      const toLink = regIds.flatMap((rid) => selected.filter((u) => !has.has(`${u}|${rid}`)).map((user_id) => ({ user_id, registre_id: rid })));
      if (toLink.length) {
        const { error } = await supabase.from("user_registres").insert(toLink);
        if (error) throw error;
      }
      // Producteurs : on n'ajoute que ceux absents (même registre, campagne, code plantation)
      const rows = report.rows.map((r) => toDbRow(r, regMap.get(r.cooperative.trim().toLowerCase())!));
      const campaigns = Array.from(new Set(rows.map((r) => r.campaign_label)));
      const seen = new Set<string>();
      const codes = rows.map((r) => r.plantation_code);
      for (let i = 0; i < codes.length; i += 500) {
        const { data, error } = await supabase.from("producers").select("registre_id,campaign_label,plantation_code")
          .in("registre_id", regIds).in("campaign_label", campaigns).in("plantation_code", codes.slice(i, i + 500));
        if (error) throw error;
        (data ?? []).forEach((p) => seen.add(`${p.registre_id}|${p.campaign_label}|${p.plantation_code}`));
      }
      const toInsert = rows.filter((r) => !seen.has(`${r.registre_id}|${r.campaign_label}|${r.plantation_code}`));
      for (let i = 0; i < toInsert.length; i += 200) {
        const { error } = await supabase.from("producers").insert(toInsert.slice(i, i + 200) as never);
        if (error) throw error;
      }
      toast.success(`Registre importé : ${toInsert.length} producteur(s) ajouté(s)${rows.length - toInsert.length ? `, ${rows.length - toInsert.length} déjà présent(s)` : ""}.`);
      qc.invalidateQueries({ queryKey: ["registres"] });
      qc.invalidateQueries({ queryKey: ["producers"] });
      qc.invalidateQueries({ queryKey: ["campaign-labels"] });
      onOpenChange(false);
    } catch (e) {
      console.error("[AddRegistreDialog] submit", e);
      // Ne laisse aucun registre vide créé par cette tentative
      for (const id of created) {
        const { count } = await supabase.from("producers").select("id", { count: "exact", head: true }).eq("registre_id", id);
        if (!count) await supabase.from("registres").delete().eq("id", id);
      }
      toast.error("Une erreur est survenue.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !saving && onOpenChange(o)}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Importer un registre</DialogTitle>
          <DialogDescription>Choisissez la coopérative et les utilisateurs, puis importez le fichier du registre.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Coopérative</Label>
            <Select value={coopId} onValueChange={setCoopId}>
              <SelectTrigger aria-label="Coopérative"><SelectValue placeholder="Choisir une coopérative" /></SelectTrigger>
              <SelectContent>
                {cooperatives.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Utilisateurs liés à ce registre</Label>
            {!coopId ? (
              <p className="text-sm text-muted-foreground">Choisissez d'abord une coopérative.</p>
            ) : loadingUsers ? (
              <div className="flex justify-center py-4"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
            ) : users.length === 0 ? (
              <p className="text-sm text-muted-foreground">Aucun utilisateur dans cette coopérative. Créez-en un dans Gestion du projet.</p>
            ) : (
              <div className="rounded-md border divide-y max-h-48 overflow-y-auto">
                {users.map((u) => (
                  <label key={u.user_id} className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-muted/50">
                    <Checkbox
                      checked={selected.includes(u.user_id)}
                      onCheckedChange={(c) => setSelected((s) => c ? [...s, u.user_id] : s.filter((x) => x !== u.user_id))}
                    />
                    <span className="text-sm font-medium">{u.label}</span>
                    <span className="text-xs text-muted-foreground truncate">{u.email}</span>
                  </label>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <Label>Fichier du registre</Label>
            <label className="flex items-center justify-center gap-2 rounded-md border border-dashed px-3 py-4 cursor-pointer hover:bg-muted/50 text-sm">
              <FileSpreadsheet className="h-4 w-4" />
              {file ? file.name : "Sélectionner un fichier Excel"}
              <input type="file" accept=".xlsx" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
            </label>
            {report && (
              <p className={`text-xs ${report.blockingErrors ? "text-destructive" : "text-muted-foreground"}`}>
                {report.validRows} ligne(s) valide(s) sur {report.totalRows}
                {report.blockingErrors ? ` — ${report.blockingErrors} erreur(s) à corriger` : ""}
                {report.rows.length ? ` — registre(s) : ${Array.from(new Set(report.rows.map((r) => r.cooperative.trim()))).join(", ")}` : ""}
              </p>
            )}
          </div>

          {coopId && existing.length > 0 && (
            <div className="space-y-1.5">
              <Label>Registres existants</Label>
              <div className="flex flex-wrap gap-1.5">
                {existing.map((r) => (
                  <Badge key={r.id} variant="outline" title={r.users.join(", ") || "Aucun utilisateur"}>
                    {r.name} · {r.users.length}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Annuler</Button>
          <Button onClick={submit} disabled={saving}>{saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Importer le registre</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
