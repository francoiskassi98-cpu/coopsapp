import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Loader2, UserPlus, Eye, EyeOff, Users, Pencil, Ban, CheckCircle2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

interface UserProfile {
  user_id: string;
  username: string;
  email: string;
  cooperative: string | null;
  created_at: string;
  role: string;
  is_banned: boolean;
}

interface Coop { id: string; name: string }

export default function UserManagement() {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [coops, setCoops] = useState<Coop[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<string>("agent");
  const [coopName, setCoopName] = useState<string>("");

  const [editUser, setEditUser] = useState<UserProfile | null>(null);
  const [editUsername, setEditUsername] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editRole, setEditRole] = useState("agent");
  const [editCoop, setEditCoop] = useState<string>("");
  const [editActive, setEditActive] = useState(true);
  const [saving, setSaving] = useState(false);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const [{ data: profiles }, { data: roles }, banResult, { data: coopList }] = await Promise.all([
        (supabase.from("profiles") as any).select("user_id, username, email, cooperative, created_at"),
        supabase.from("user_roles").select("*"),
        supabase.functions.invoke("manage-user", { body: { action: "list" } }),
        supabase.from("cooperatives").select("id, name").order("name"),
      ]);

      setCoops((coopList || []) as Coop[]);
      const banMap: Record<string, boolean> = banResult.data?.banMap || {};

      if (profiles && roles) {
        const merged = profiles.map((p: any) => ({
          user_id: p.user_id,
          username: p.username,
          email: p.email,
          cooperative: p.cooperative ?? null,
          created_at: p.created_at,
          role: roles.find((r: any) => r.user_id === p.user_id)?.role || "agent",
          is_banned: banMap[p.user_id] || false,
        }));
        setUsers(merged);
      }
    } catch (err) {
      console.error("[UserManagement] fetchUsers", err);
      toast({ title: "Erreur", description: "Impossible de charger les utilisateurs.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchUsers(); }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !email.trim() || !password.trim()) {
      toast({ title: "Erreur", description: "Tous les champs sont requis.", variant: "destructive" });
      return;
    }
    if (role === "agent" && !coopName) {
      toast({ title: "Coopérative requise", description: "Sélectionnez la coopérative de l'agent.", variant: "destructive" });
      return;
    }
    setCreating(true);
    try {
      const { data, error } = await supabase.functions.invoke("create-user", {
        body: { email, password, username, role, cooperative: coopName || null },
      });
      if (error || data?.error) {
        console.error("[create-user]", error || data?.error);
        toast({ title: "Erreur", description: data?.error || "Impossible de créer l'utilisateur.", variant: "destructive" });
        return;
      }
      toast({ title: "Utilisateur créé", description: `${username} a été ajouté.` });
      setUsername(""); setEmail(""); setPassword(""); setRole("agent"); setCoopName("");
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
    setEditUser(u);
    setEditUsername(u.username);
    setEditEmail(u.email);
    setEditRole(u.role);
    setEditCoop(u.cooperative || "");
    setEditActive(!u.is_banned);
  };

  const handleUpdate = async () => {
    if (!editUser) return;
    if (editRole === "agent" && !editCoop) {
      toast({ title: "Coopérative requise", description: "Un agent doit être rattaché à une coopérative.", variant: "destructive" });
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
          cooperative: editCoop || null,
        },
      });
      if (error || data?.error) {
        console.error("[manage-user update]", error || data?.error);
        toast({ title: "Erreur", description: "Impossible de modifier l'utilisateur.", variant: "destructive" });
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
        toast({ title: "Erreur", description: "Impossible de modifier le statut.", variant: "destructive" });
        return;
      }
      toast({ title: activate ? "Utilisateur réactivé" : "Utilisateur désactivé", description: `${u.username} a été ${activate ? "réactivé" : "désactivé"}.` });
      fetchUsers();
    } catch (err) {
      console.error(err);
      toast({ title: "Erreur", description: "Une erreur est survenue.", variant: "destructive" });
    } finally {
      setActionLoading(null);
    }
  };

  const isSelf = (userId: string) => currentUser?.id === userId;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Users className="h-6 w-6" /> Gestion du projet
          </h1>
          <p className="text-muted-foreground text-sm mt-1">Gérer les utilisateurs, rôles et coopératives</p>
        </div>
        <Button onClick={() => setShowForm(!showForm)}>
          <UserPlus className="h-4 w-4 mr-2" />
          Nouvel utilisateur
        </Button>
      </div>

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
                    required
                    minLength={6}
                    className="pr-10"
                  />
                  <button type="button" onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" tabIndex={-1}>
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Rôle</Label>
                <Select value={role} onValueChange={setRole}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="admin">Administrateur</SelectItem>
                    <SelectItem value="agent">Agent coopérative</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label>Coopérative {role === "agent" && <span className="text-destructive">*</span>}</Label>
                <Select value={coopName} onValueChange={setCoopName}>
                  <SelectTrigger>
                    <SelectValue placeholder={role === "admin" ? "Optionnel pour un administrateur" : "Sélectionner la coopérative"} />
                  </SelectTrigger>
                  <SelectContent>
                    {coops.map((c) => (
                      <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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
                  <TableHead>Coopérative</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead>Créé le</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((u) => (
                  <TableRow key={u.user_id} className={u.is_banned ? "opacity-60" : ""}>
                    <TableCell className="font-medium">{u.username}</TableCell>
                    <TableCell>{u.email}</TableCell>
                    <TableCell>
                      <Badge variant={u.role === "admin" ? "default" : "secondary"}>
                        {u.role === "admin" ? "Administrateur" : "Agent"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm">{u.cooperative || <span className="text-muted-foreground">—</span>}</TableCell>
                    <TableCell>
                      {u.is_banned ? (
                        <Badge variant="destructive" className="gap-1">
                          <span className="inline-block w-2 h-2 rounded-full bg-red-300" />
                          Désactivé
                        </Badge>
                      ) : (
                        <Badge className="gap-1 bg-green-600 hover:bg-green-600/80 text-white border-transparent">
                          <span className="inline-block w-2 h-2 rounded-full bg-green-300" />
                          Actif
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>{new Date(u.created_at).toLocaleDateString("fr-FR")}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon" onClick={() => openEdit(u)} title="Modifier">
                          <Pencil className="h-4 w-4" />
                        </Button>
                        {!isSelf(u.user_id) && (
                          <Button
                            variant="ghost"
                            size="icon"
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
        <DialogContent>
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
                  <SelectItem value="admin">Administrateur</SelectItem>
                  <SelectItem value="agent">Agent coopérative</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Coopérative {editRole === "agent" && <span className="text-destructive">*</span>}</Label>
              <Select value={editCoop} onValueChange={setEditCoop}>
                <SelectTrigger>
                  <SelectValue placeholder={editRole === "admin" ? "Optionnel" : "Sélectionner"} />
                </SelectTrigger>
                <SelectContent>
                  {coops.map((c) => (
                    <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
    </div>
  );
}
