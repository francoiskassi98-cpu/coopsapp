import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import { Loader2, UserPlus, Eye, EyeOff, Users, Pencil, Ban, CheckCircle2, KeyRound, Mail, Calendar, Shield, Trash2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import PageHeader from "@/components/PageHeader";
import { PasswordRequirements } from "@/components/PasswordRequirements";
import { isPasswordValid, PASSWORD_MIN_LENGTH, PASSWORD_REJECTED_MESSAGE } from "@/lib/password-policy";


interface UserProfile {
  user_id: string;
  username: string;
  email: string;
  registres: Array<{ id: string; name: string }>;
  created_at: string;
  role: string;
  is_banned: boolean;
  last_sign_in_at: string | null;
}

interface Registre { id: string; name: string }

const ROLE_LABEL: Record<string, string> = {
  super_admin: "Super administrateur",
  coop_admin: "Admin coopérative",
  agent: "Agent",
};

/** Extrait le message d'erreur métier renvoyé par une Edge Function (y compris sur statut 4xx/5xx). */
async function edgeErrorMessage(error: unknown, data: unknown, fallback: string): Promise<string> {
  const d = data as { error?: unknown } | null;
  if (typeof d?.error === "string") return d.error;
  const ctx = (error as { context?: Response } | null)?.context;
  if (ctx && typeof (ctx as Response).clone === "function") {
    try {
      const body = await (ctx as Response).clone().json();
      if (typeof body?.error === "string") return body.error;
    } catch (e) {
      console.error("[edgeErrorMessage] parse", e);
    }
  }
  return fallback;
}


export default function UserManagement() {
  const { user: currentUser, isSuperAdmin } = useAuth();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [registres, setRegistres] = useState<Registre[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<string>("agent");
  const [selectedRegistres, setSelectedRegistres] = useState<string[]>([]); // IDs

  const [editUser, setEditUser] = useState<UserProfile | null>(null);
  const [editUsername, setEditUsername] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editRole, setEditRole] = useState("agent");
  const [editRegistres, setEditRegistres] = useState<string[]>([]); // IDs
  const [editActive, setEditActive] = useState(true);
  const [saving, setSaving] = useState(false);

  const [detailUser, setDetailUser] = useState<UserProfile | null>(null);
  const [resetLoading, setResetLoading] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<UserProfile | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const [{ data: profiles }, { data: roles }, manageResult, { data: registreList }] = await Promise.all([
        supabase.from("profiles").select("user_id, username, email, created_at"),
        supabase.from("user_roles").select("*"),
        supabase.functions.invoke("manage-user", { body: { action: "list" } }),
        supabase.from("registres").select("id, name").order("name"),
      ]);

      setRegistres(registreList ?? []);
      const banMap: Record<string, boolean> = manageResult.data?.banMap || {};
      const registresByUser: Record<string, Array<{ id: string; name: string }>> = manageResult.data?.registresByUser || {};
      const lastSignInMap: Record<string, string | null> = manageResult.data?.lastSignInMap || {};
      const allowedUserIds: string[] | null = manageResult.data?.allowedUserIds ?? null;
      const allowedSet = allowedUserIds ? new Set(allowedUserIds) : null;

      if (profiles && roles) {
        const merged = profiles
          .filter((p) => !allowedSet || allowedSet.has(p.user_id))
          .map((p) => ({
          user_id: p.user_id,
          username: p.username,
          email: p.email,
          registres: registresByUser[p.user_id] || [],
          created_at: p.created_at,
          role: roles.find((r) => r.user_id === p.user_id)?.role || "agent",
          is_banned: banMap[p.user_id] || false,
          last_sign_in_at: lastSignInMap[p.user_id] || null,
        }))
          .filter((u) => isSuperAdmin || u.role !== "super_admin");
        setUsers(merged);
      }
    } catch (err) {
      console.error("[UserManagement] fetchUsers", err);
      toast({ title: "Erreur", description: "Une erreur est survenue.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [isSuperAdmin]);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  const toggleInList = (list: string[], value: string) =>
    list.includes(value) ? list.filter((v) => v !== value) : [...list, value];

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !email.trim() || !password.trim()) {
      toast({ title: "Erreur", description: "Tous les champs sont requis.", variant: "destructive" });
      return;
    }
    if (!isPasswordValid(password)) {
      toast({ title: "Mot de passe non conforme", description: PASSWORD_REJECTED_MESSAGE, variant: "destructive" });
      return;
    }

    if (role === "super_admin" && !isSuperAdmin) {
      toast({ title: "Accès refusé", description: "Seul le Super Administrateur est autorisé à créer un compte Super Administrateur.", variant: "destructive" });
      return;
    }
    if ((role === "agent" || role === "coop_admin") && selectedRegistres.length === 0) {
      toast({ title: "Registres requis", description: "Sélectionnez au moins un registre.", variant: "destructive" });
      return;
    }
    setCreating(true);
    try {
      const { data, error } = await supabase.functions.invoke("create-user", {
        body: { email, password, username, role, registres: selectedRegistres },
      });
      if (error || data?.error) {
        console.error("[create-user]", error || data?.error);
        toast({
          title: "Création impossible",
          description: await edgeErrorMessage(error, data, "La création de l'utilisateur a échoué."),
          variant: "destructive",
        });
        return;
      }

      toast({ title: "Utilisateur créé", description: `${username} a été ajouté.` });
      setUsername(""); setEmail(""); setPassword(""); setRole("agent"); setSelectedRegistres([]);
      setShowForm(false);
      fetchUsers();
    } catch (err) {
      console.error(err);
      toast({ title: "Erreur", description: "Une erreur est survenue.", variant: "destructive" });
    } finally {
      setCreating(false);
    }
  };

  const openEdit = (u: UserProfile) => {
    if (u.role === "super_admin" && !isSuperAdmin) {
      toast({ title: "Accès refusé", description: "Vous ne pouvez pas modifier un Super Administrateur.", variant: "destructive" });
      return;
    }
    setEditUser(u);
    setEditUsername(u.username);
    setEditEmail(u.email);
    setEditRole(u.role);
    setEditRegistres(u.registres.map((r) => r.id));
    setEditActive(!u.is_banned);
  };

  const handleUpdate = async () => {
    if (!editUser) return;
    if (editRole === "super_admin" && !isSuperAdmin) {
      toast({ title: "Accès refusé", description: "Seul le Super Administrateur peut attribuer ce rôle.", variant: "destructive" });
      return;
    }
    if ((editRole === "agent" || editRole === "coop_admin") && editRegistres.length === 0) {
      toast({ title: "Registres requis", description: "Un agent ou un admin doit avoir au moins un registre assigné.", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const { data, error } = await supabase.functions.invoke("manage-user", {
        body: {
          action: "update",
          user_id: editUser.user_id,
          username: editUsername,
          email: editEmail,
          role: editRole,
          registres: editRegistres,
        },
      });
      if (error || data?.error) {
        console.error("[manage-user update]", error || data?.error);
        toast({
          title: "Modification impossible",
          description: await edgeErrorMessage(error, data, "La modification de l'utilisateur a échoué."),
          variant: "destructive",
        });
        return;
      }


      const wasBanned = editUser.is_banned;
      if (wasBanned && editActive) {
        await supabase.functions.invoke("manage-user", { body: { action: "activate", user_id: editUser.user_id } });
      } else if (!wasBanned && !editActive && editUser.user_id !== currentUser?.id) {
        await supabase.functions.invoke("manage-user", { body: { action: "deactivate", user_id: editUser.user_id } });
      }

      toast({ title: "Utilisateur modifié", description: `${editUsername} a été mis à jour.` });
      setEditUser(null);
      fetchUsers();
    } catch (err) {
      console.error(err);
      toast({ title: "Erreur", description: "Une erreur est survenue.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (u: UserProfile, activate: boolean) => {
    setActionLoading(u.user_id);
    try {
      const { data, error } = await supabase.functions.invoke("manage-user", {
        body: { action: activate ? "activate" : "deactivate", user_id: u.user_id },
      });
      if (error || data?.error) {
        console.error("[manage-user toggle]", error || data?.error);
        toast({
          title: "Erreur",
          description: await edgeErrorMessage(error, data, "Le changement de statut a échoué."),
          variant: "destructive",
        });
        return;
      }

      toast({ title: activate ? "Utilisateur réactivé" : "Utilisateur désactivé", description: `${u.username}` });
      fetchUsers();
    } catch (err) {
      console.error(err);
      toast({ title: "Erreur", description: "Une erreur est survenue.", variant: "destructive" });
    } finally {
      setActionLoading(null);
    }
  };

  const isSelf = (userId: string) => currentUser?.id === userId;

  const handleDeleteUser = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const { data, error } = await supabase.functions.invoke("delete-user", {
        body: { user_id: deleteTarget.user_id },
      });
      if (error || data?.error) {
        console.error("[delete-user]", error || data?.error);
        toast({
          title: "Suppression impossible",
          description: await edgeErrorMessage(
            error, data,
            "La suppression de l'utilisateur a échoué. Aucun accès n'a été supprimé partiellement.",
          ),
          variant: "destructive",
        });
        return;
      }
      setUsers((prev) => prev.filter((u) => u.user_id !== deleteTarget.user_id));
      setDetailUser((d) => (d?.user_id === deleteTarget.user_id ? null : d));
      setDeleteTarget(null);
      toast({
        title: "Utilisateur supprimé",
        description: "Utilisateur supprimé avec succès. Son accès au système a été définitivement révoqué.",
      });
    } catch (err) {
      console.error(err);
      toast({
        title: "Erreur",
        description: "La suppression de l'utilisateur a échoué. Aucun accès n'a été supprimé partiellement.",
        variant: "destructive",
      });
    } finally {
      setDeleting(false);
    }
  };

  const handleResetPassword = async (u: UserProfile) => {
    setResetLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("manage-user", {
        body: {
          action: "reset_password",
          user_id: u.user_id,
          redirectTo: `${window.location.origin}/reset-password`,
        },
      });
      if (error || data?.error) {
        console.error("[manage-user reset]", error || data?.error);
        toast({
          title: "Erreur",
          description: await edgeErrorMessage(error, data, "L'envoi du lien de réinitialisation a échoué."),
          variant: "destructive",
        });
        return;
      }

      toast({ title: "Lien envoyé", description: `Un email de réinitialisation a été envoyé à ${u.email}.` });
    } catch (err) {
      console.error(err);
      toast({ title: "Erreur", description: "Une erreur est survenue.", variant: "destructive" });
    } finally {
      setResetLoading(false);
    }
  };

  const fmtDate = (d: string | null | undefined) =>
    d ? new Date(d).toLocaleString("fr-FR", { dateStyle: "long", timeStyle: "short" }) : "Jamais";

  const RegistrePicker = ({ selected, onChange }: { selected: string[]; onChange: (v: string[]) => void }) => (
    <div className="max-h-48 overflow-y-auto rounded-md border p-3 space-y-2">
      {registres.length === 0 ? (
        <p className="text-sm text-muted-foreground">Aucun registre disponible.</p>
      ) : (
        registres.map((c) => (
          <label key={c.id} className="flex items-center gap-2 text-sm cursor-pointer">
            <Checkbox
              checked={selected.includes(c.id)}
              onCheckedChange={() => onChange(toggleInList(selected, c.id))}
            />
            <span>{c.name}</span>
          </label>
        ))
      )}
    </div>
  );

  return (
    <div className="p-4 md:p-6 space-y-6">
      <PageHeader
        icon={Users}
        title="Gestion du projet"
        description="Gérer les utilisateurs, rôles et registres"
        actions={
          <Button onClick={() => setShowForm(!showForm)}>
            <UserPlus className="h-4 w-4 mr-2" /> Nouvel utilisateur
          </Button>
        }
      />

      {showForm && (
        <Card>
          <CardHeader><CardTitle className="text-lg">Créer un utilisateur</CardTitle></CardHeader>
          <CardContent>
            <form onSubmit={handleCreate} className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Nom d'utilisateur</Label>
                <Input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="ex: jean.dupont" required />
              </div>
              <div className="space-y-2">
                <Label>Adresse e-mail</Label>
                <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email@exemple.com" required />
              </div>
              <div className="space-y-2">
                <Label>Mot de passe</Label>
                <div className="relative">
                  <Input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    required minLength={PASSWORD_MIN_LENGTH} className="pr-10"
                  />
                  <button type="button" onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" tabIndex={-1}>
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                <PasswordRequirements value={password} />
              </div>

              <div className="space-y-2">
                <Label>Rôle</Label>
                <Select value={role} onValueChange={setRole}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {isSuperAdmin && <SelectItem value="super_admin">Super administrateur</SelectItem>}
                    <SelectItem value="coop_admin">Admin de coopérative</SelectItem>
                    <SelectItem value="agent">Agent</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label>
                  Registres {(role === "agent" || role === "coop_admin") && <span className="text-destructive">*</span>}
                  <span className="text-xs text-muted-foreground ml-2">
                    (sélection multiple — l'utilisateur accédera aux données de tous ses registres)
                  </span>
                </Label>
                <RegistrePicker selected={selectedRegistres} onChange={setSelectedRegistres} />
              </div>
              <div className="md:col-span-2 flex gap-2">
                <Button type="submit" disabled={creating}>
                  {creating && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                  Créer l'utilisateur
                </Button>
                <Button type="button" variant="outline" onClick={() => setShowForm(false)}>Annuler</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle className="text-lg">Utilisateurs enregistrés</CardTitle></CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nom d'utilisateur</TableHead>
                  <TableHead>E-mail</TableHead>
                  <TableHead>Rôle</TableHead>
                  <TableHead>Registres</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead>Créé le</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((u) => (
                  <TableRow
                    key={u.user_id}
                    onClick={() => setDetailUser(u)}
                    className={`cursor-pointer hover:bg-muted/40 ${u.is_banned ? "opacity-60" : ""}`}
                  >
                    <TableCell className="font-medium">{u.username}</TableCell>
                    <TableCell>{u.email}</TableCell>
                    <TableCell>
                      <Badge variant={u.role === "super_admin" ? "default" : u.role === "coop_admin" ? "default" : "secondary"}>
                        {ROLE_LABEL[u.role] ?? u.role}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm">
                      {u.registres.length === 0 ? (
                        <span className="text-muted-foreground">—</span>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {u.registres.map((c) => (
                            <Badge key={c.id} variant="outline" className="text-xs">{c.name}</Badge>
                          ))}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      {u.is_banned ? (
                        <Badge variant="destructive">Désactivé</Badge>
                      ) : (
                        <Badge className="bg-green-600 hover:bg-green-600/80 text-white border-transparent">Actif</Badge>
                      )}
                    </TableCell>
                    <TableCell>{new Date(u.created_at).toLocaleDateString("fr-FR")}</TableCell>
                    <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon" onClick={() => openEdit(u)} title="Modifier">
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost" size="icon"
                          onClick={() => handleResetPassword(u)}
                          disabled={resetLoading}
                          title="Envoyer un lien de réinitialisation"
                        >
                          <KeyRound className="h-4 w-4" />
                        </Button>
                        {!isSelf(u.user_id) && (
                          <Button
                            variant="ghost" size="icon"
                            onClick={() => handleToggleActive(u, u.is_banned)}
                            disabled={actionLoading === u.user_id}
                            title={u.is_banned ? "Activer" : "Désactiver"}
                            className={u.is_banned ? "text-green-600 hover:text-green-700" : "text-destructive hover:text-destructive"}
                          >
                            {actionLoading === u.user_id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : u.is_banned ? (
                              <CheckCircle2 className="h-4 w-4" />
                            ) : (
                              <Ban className="h-4 w-4" />
                            )}
                          </Button>
                        )}
                        {isSuperAdmin && !isSelf(u.user_id) && (
                          <Button
                            variant="ghost" size="icon"
                            onClick={() => setDeleteTarget(u)}
                            title="Supprimer l'utilisateur"
                            className="text-destructive hover:text-destructive"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {users.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                      Aucun utilisateur enregistré
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!editUser} onOpenChange={(open) => { if (!open) setEditUser(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Modifier l'utilisateur</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Nom d'utilisateur</Label>
              <Input value={editUsername} onChange={(e) => setEditUsername(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Adresse e-mail</Label>
              <Input type="email" value={editEmail} onChange={(e) => setEditEmail(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Rôle</Label>
              <Select value={editRole} onValueChange={setEditRole}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {isSuperAdmin && <SelectItem value="super_admin">Super administrateur</SelectItem>}
                  <SelectItem value="coop_admin">Admin de coopérative</SelectItem>
                  <SelectItem value="agent">Agent</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>
                Registres {(editRole === "agent" || editRole === "coop_admin") && <span className="text-destructive">*</span>}
                <span className="text-xs text-muted-foreground ml-2">(sélection multiple)</span>
              </Label>
              <RegistrePicker selected={editRegistres} onChange={setEditRegistres} />
            </div>
            {editUser && !isSelf(editUser.user_id) && (
              <div className="flex items-center justify-between rounded-lg border p-3">
                <div className="space-y-0.5">
                  <Label className="text-sm font-medium">Statut du compte</Label>
                  <p className="text-xs text-muted-foreground">
                    {editActive ? "L'utilisateur peut se connecter" : "L'utilisateur ne peut pas se connecter"}
                  </p>
                </div>
                <Switch checked={editActive} onCheckedChange={setEditActive} />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditUser(null)}>Annuler</Button>
            <Button onClick={handleUpdate} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Enregistrer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Sheet open={!!detailUser} onOpenChange={(open) => { if (!open) setDetailUser(null); }}>
        <SheetContent className="w-full sm:max-w-md overflow-y-auto">
          {detailUser && (
            <>
              <SheetHeader>
                <SheetTitle className="flex items-center gap-2">
                  <Users className="h-5 w-5" />
                  {detailUser.username}
                </SheetTitle>
                <SheetDescription>{detailUser.email}</SheetDescription>
              </SheetHeader>

              <div className="mt-6 space-y-5">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={detailUser.role === "agent" ? "secondary" : "default"}>
                    <Shield className="h-3 w-3 mr-1" />
                    {ROLE_LABEL[detailUser.role] ?? detailUser.role}
                  </Badge>
                  {detailUser.is_banned ? (
                    <Badge variant="destructive">Désactivé</Badge>
                  ) : (
                    <Badge className="bg-green-600 hover:bg-green-600/80 text-white border-transparent">Actif</Badge>
                  )}
                </div>

                <Separator />

                <div className="grid grid-cols-1 gap-3 text-sm">
                  <div className="flex items-start gap-2">
                    <Mail className="h-4 w-4 mt-0.5 text-muted-foreground" />
                    <div>
                      <div className="text-xs text-muted-foreground">Email</div>
                      <div className="font-medium break-all">{detailUser.email}</div>
                    </div>
                  </div>
                  <div className="flex items-start gap-2">
                    <Calendar className="h-4 w-4 mt-0.5 text-muted-foreground" />
                    <div>
                      <div className="text-xs text-muted-foreground">Date de création</div>
                      <div className="font-medium">{fmtDate(detailUser.created_at)}</div>
                    </div>
                  </div>
                  <div className="flex items-start gap-2">
                    <Calendar className="h-4 w-4 mt-0.5 text-muted-foreground" />
                    <div>
                      <div className="text-xs text-muted-foreground">Dernière connexion</div>
                      <div className="font-medium">{fmtDate(detailUser.last_sign_in_at)}</div>
                    </div>
                  </div>
                </div>

                <Separator />

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <Label className="text-sm">
                      Registres attribués
                      <span className="ml-2 text-xs text-muted-foreground">({detailUser.registres.length})</span>
                    </Label>
                  </div>
                  {detailUser.registres.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Aucun registre attribué.</p>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {detailUser.registres.map((c) => (
                        <Badge key={c.id} variant="outline">{c.name}</Badge>
                      ))}
                    </div>
                  )}
                  <p className="text-xs text-muted-foreground mt-2">
                    Pour ajouter ou retirer un registre, utilisez le bouton « Modifier ».
                  </p>
                </div>

                <Separator />

                <div className="space-y-2">
                  <Button
                    className="w-full"
                    variant="outline"
                    onClick={() => { openEdit(detailUser); setDetailUser(null); }}
                  >
                    <Pencil className="h-4 w-4 mr-2" />
                    Modifier l'utilisateur
                  </Button>
                  <Button
                    className="w-full"
                    variant="outline"
                    disabled={resetLoading}
                    onClick={() => handleResetPassword(detailUser)}
                  >
                    {resetLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <KeyRound className="h-4 w-4 mr-2" />}
                    Envoyer un lien de réinitialisation
                  </Button>
                  {!isSelf(detailUser.user_id) && (
                    <Button
                      className="w-full"
                      variant={detailUser.is_banned ? "default" : "destructive"}
                      disabled={actionLoading === detailUser.user_id}
                      onClick={() => handleToggleActive(detailUser, detailUser.is_banned)}
                    >
                      {actionLoading === detailUser.user_id ? (
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      ) : detailUser.is_banned ? (
                        <CheckCircle2 className="h-4 w-4 mr-2" />
                      ) : (
                        <Ban className="h-4 w-4 mr-2" />
                      )}
                      {detailUser.is_banned ? "Réactiver le compte" : "Désactiver le compte"}
                    </Button>
                  )}
                </div>

                <p className="text-[11px] text-muted-foreground pt-2 border-t">
                  Les mots de passe sont chiffrés et gérés exclusivement par le système d'authentification. Ils ne sont jamais affichés ni stockés en clair.
                </p>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open && !deleting) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer définitivement cet utilisateur ?</AlertDialogTitle>
            <AlertDialogDescription>
              Cette opération révoquera définitivement l'accès de {deleteTarget?.username} ({deleteTarget?.email}) à
              AgroServices Digital. L'utilisateur ne pourra plus se connecter. Les données métier qu'il a créées sont
              conservées. Cette action est irréversible.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); handleDeleteUser(); }}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Supprimer définitivement
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
