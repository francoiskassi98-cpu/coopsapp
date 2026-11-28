import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

interface CoopOption { id: string; name: string }
interface CoopUser { user_id: string; label: string; email: string }
interface ExistingRegistre { id: string; name: string; users: string[] }

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cooperatives: CoopOption[];
  defaultCoopId?: string | null;
}

/** Création d'un registre par le super administrateur, avec rattachement à des utilisateurs de la coopérative. */
export default function AddRegistreDialog({ open, onOpenChange, cooperatives, defaultCoopId }: Props) {
  const qc = useQueryClient();
  const [coopId, setCoopId] = useState("");
  const [name, setName] = useState("");
  const [responsable, setResponsable] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [users, setUsers] = useState<CoopUser[]>([]);
  const [existing, setExisting] = useState<ExistingRegistre[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setCoopId(defaultCoopId ?? "");
    setName(""); setResponsable(""); setPhone(""); setAddress(""); setSelected([]);
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

  const submit = async () => {
    const trimmed = name.trim();
    if (!coopId) { toast.error("Choisissez une coopérative."); return; }
    if (!trimmed) { toast.error("Le nom du registre est obligatoire."); return; }
    if (selected.length === 0) { toast.error("Choisissez au moins un utilisateur."); return; }
    if (existing.some((r) => r.name.trim().toLowerCase() === trimmed.toLowerCase())) {
      toast.error(`Le registre « ${trimmed} » existe déjà dans cette coopérative.`); return;
    }
    if (saving) return;
    setSaving(true);
    try {
      const { data: reg, error } = await supabase.from("registres").insert({
        name: trimmed, cooperative_id: coopId, status: "active",
        responsable: responsable.trim() || null, phone: phone.trim() || null, address: address.trim() || null,
      }).select("id").single();
      if (error || !reg) throw error ?? new Error("insert registre");
      const { error: linkErr } = await supabase.from("user_registres")
        .insert(selected.map((user_id) => ({ user_id, registre_id: reg.id })));
      if (linkErr) {
        await supabase.from("registres").delete().eq("id", reg.id);
        throw linkErr;
      }
      toast.success(`Registre « ${trimmed} » créé et attribué.`);
      qc.invalidateQueries({ queryKey: ["registres"] });
      onOpenChange(false);
    } catch (e) {
      console.error("[AddRegistreDialog] submit", e);
      toast.error("Une erreur est survenue.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !saving && onOpenChange(o)}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nouveau registre</DialogTitle>
          <DialogDescription>Créez un registre pour une coopérative et liez-le à ses utilisateurs.</DialogDescription>
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
            <Label htmlFor="reg-name">Nom du registre</Label>
            <Input id="reg-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex. Section Daloa" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label htmlFor="reg-resp">Responsable</Label><Input id="reg-resp" value={responsable} onChange={(e) => setResponsable(e.target.value)} /></div>
            <div className="space-y-1.5"><Label htmlFor="reg-phone">Téléphone</Label><Input id="reg-phone" value={phone} onChange={(e) => setPhone(e.target.value)} /></div>
          </div>
          <div className="space-y-1.5"><Label htmlFor="reg-addr">Adresse</Label><Input id="reg-addr" value={address} onChange={(e) => setAddress(e.target.value)} /></div>

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
          <Button onClick={submit} disabled={saving}>{saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Créer le registre</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
