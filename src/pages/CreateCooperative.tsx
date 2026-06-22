import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { Loader2, Building2, UserCog, CheckCircle2, ArrowLeft, ArrowRight, Upload, Eye, EyeOff } from "lucide-react";

type CertType = "fairtrade" | "rainforest" | "eudr" | "ordinaire";

interface CoopForm {
  name: string; acronym: string; rccm: string; tax_number: string;
  phone: string; address: string; city: string; country: string;
  official_email: string; president_name: string;
  estimated_producers: string; certification_type: CertType | "";
}
interface AdminForm {
  full_name: string; email: string; phone: string;
  password: string; password_confirm: string;
}

const initialCoop: CoopForm = {
  name: "", acronym: "", rccm: "", tax_number: "", phone: "", address: "",
  city: "", country: "Côte d'Ivoire", official_email: "", president_name: "",
  estimated_producers: "", certification_type: "",
};
const initialAdmin: AdminForm = {
  full_name: "", email: "", phone: "", password: "", password_confirm: "",
};

const PHONE_RE = /^[0-9+\s().-]{8,}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validatePassword(pw: string): string | null {
  if (pw.length < 8) return "Le mot de passe doit contenir au moins 8 caractères.";
  if (!/[A-Z]/.test(pw)) return "Le mot de passe doit contenir une majuscule.";
  if (!/[a-z]/.test(pw)) return "Le mot de passe doit contenir une minuscule.";
  if (!/[0-9]/.test(pw)) return "Le mot de passe doit contenir un chiffre.";
  return null;
}

export default function CreateCooperative() {
  const navigate = useNavigate();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [coop, setCoop] = useState<CoopForm>(initialCoop);
  const [admin, setAdmin] = useState<AdminForm>(initialAdmin);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [showPw, setShowPw] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const upd = <T,>(setter: (s: T) => void, s: T) => (k: keyof T) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setter({ ...s, [k]: e.target.value });

  const handleLogo = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] ?? null;
    setLogoFile(f);
    if (f) {
      const reader = new FileReader();
      reader.onload = (ev) => setLogoPreview(ev.target?.result as string);
      reader.readAsDataURL(f);
    } else {
      setLogoPreview(null);
    }
  };

  const validateStep1 = (): string | null => {
    if (!coop.name.trim()) return "Le nom de la coopérative est requis.";
    if (!coop.acronym.trim()) return "Le sigle est requis.";
    if (!coop.rccm.trim()) return "Le RCCM est requis.";
    if (!coop.tax_number.trim()) return "Le numéro contribuable est requis.";
    if (!PHONE_RE.test(coop.phone)) return "Téléphone coopérative invalide.";
    if (!coop.address.trim()) return "L'adresse est requise.";
    if (!coop.city.trim()) return "La ville est requise.";
    if (!coop.country.trim()) return "Le pays est requis.";
    if (!EMAIL_RE.test(coop.official_email)) return "Email officiel invalide.";
    if (!coop.certification_type) return "Le type de certification est requis.";
    if (coop.estimated_producers && Number.isNaN(parseInt(coop.estimated_producers))) return "Nombre de producteurs invalide.";
    return null;
  };
  const validateStep2 = (): string | null => {
    if (!admin.full_name.trim()) return "Le nom complet est requis.";
    if (!EMAIL_RE.test(admin.email)) return "Email administrateur invalide.";
    if (!PHONE_RE.test(admin.phone)) return "Téléphone administrateur invalide.";
    const pwErr = validatePassword(admin.password);
    if (pwErr) return pwErr;
    if (admin.password !== admin.password_confirm) return "Les mots de passe ne correspondent pas.";
    return null;
  };

  const next = () => {
    const err = step === 1 ? validateStep1() : step === 2 ? validateStep2() : null;
    if (err) { toast({ title: "Erreur", description: err, variant: "destructive" }); return; }
    setStep((s) => (s + 1) as 1 | 2 | 3);
  };
  const prev = () => setStep((s) => (s - 1) as 1 | 2 | 3);

  const submit = async () => {
    setSubmitting(true);
    try {
      let logoBase64: string | undefined;
      let logoFileName: string | undefined;
      if (logoFile) {
        logoBase64 = await new Promise<string>((resolve, reject) => {
          const r = new FileReader();
          r.onload = () => resolve(r.result as string);
          r.onerror = reject;
          r.readAsDataURL(logoFile);
        });
        logoFileName = logoFile.name;
      }
      const { data, error } = await supabase.functions.invoke("create-cooperative", {
        body: {
          cooperative: coop,
          admin: {
            full_name: admin.full_name,
            email: admin.email,
            phone: admin.phone,
            password: admin.password,
            username: admin.email.split("@")[0],
          },
          logoBase64,
          logoFileName,
        },
      });
      if (error || data?.error) {
        console.error("[create-cooperative]", error || data?.error);
        toast({ title: "Erreur", description: (data?.error as string) || "Une erreur est survenue.", variant: "destructive" });
        return;
      }
      toast({ title: "Coopérative créée", description: `${coop.name} et son administrateur ont été enregistrés. L'abonnement pilote est actif.` });
      navigate("/gestion");
    } catch (e) {
      console.error(e);
      toast({ title: "Erreur", description: "Une erreur est survenue.", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const StepIndicator = () => (
    <div className="flex items-center justify-center gap-2 sm:gap-4 mb-8">
      {[1, 2, 3].map((n, i) => (
        <div key={n} className="flex items-center gap-2 sm:gap-4">
          <div className={`flex h-9 w-9 items-center justify-center rounded-full text-sm font-semibold transition-colors ${step >= n ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
            {step > n ? <CheckCircle2 className="h-5 w-5" /> : n}
          </div>
          <span className={`text-sm font-medium hidden sm:inline ${step >= n ? "text-foreground" : "text-muted-foreground"}`}>
            {n === 1 ? "Coopérative" : n === 2 ? "Administrateur" : "Récapitulatif"}
          </span>
          {i < 2 && <div className={`h-px w-8 sm:w-16 ${step > n ? "bg-primary" : "bg-border"}`} />}
        </div>
      ))}
    </div>
  );

  return (
    <div className="p-4 sm:p-6 max-w-4xl mx-auto">
      <div className="mb-6">
        <Button variant="ghost" size="sm" onClick={() => navigate("/gestion")}>
          <ArrowLeft className="h-4 w-4 mr-2" /> Retour à la gestion
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5" /> Nouvelle coopérative
          </CardTitle>
          <CardDescription>
            Créez une coopérative, son administrateur principal et activez automatiquement l'abonnement pilote.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <StepIndicator />

          {step === 1 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2"><Label>Nom de la coopérative *</Label>
                <Input value={coop.name} onChange={upd<CoopForm>(setCoop, coop)("name")} placeholder="ex: COOPACI" /></div>
              <div className="space-y-2"><Label>Sigle *</Label>
                <Input value={coop.acronym} onChange={upd<CoopForm>(setCoop, coop)("acronym")} placeholder="ex: CPC" /></div>
              <div className="space-y-2"><Label>RCCM *</Label>
                <Input value={coop.rccm} onChange={upd<CoopForm>(setCoop, coop)("rccm")} placeholder="ex: CI-ABJ-2024-B-12345" /></div>
              <div className="space-y-2"><Label>Numéro contribuable *</Label>
                <Input value={coop.tax_number} onChange={upd<CoopForm>(setCoop, coop)("tax_number")} /></div>
              <div className="space-y-2"><Label>Téléphone *</Label>
                <Input value={coop.phone} onChange={upd<CoopForm>(setCoop, coop)("phone")} placeholder="+225 ..." /></div>
              <div className="space-y-2"><Label>Email officiel *</Label>
                <Input type="email" value={coop.official_email} onChange={upd<CoopForm>(setCoop, coop)("official_email")} /></div>
              <div className="space-y-2 md:col-span-2"><Label>Adresse *</Label>
                <Input value={coop.address} onChange={upd<CoopForm>(setCoop, coop)("address")} /></div>
              <div className="space-y-2"><Label>Ville *</Label>
                <Input value={coop.city} onChange={upd<CoopForm>(setCoop, coop)("city")} /></div>
              <div className="space-y-2"><Label>Pays *</Label>
                <Input value={coop.country} onChange={upd<CoopForm>(setCoop, coop)("country")} /></div>
              <div className="space-y-2"><Label>Nom du président</Label>
                <Input value={coop.president_name} onChange={upd<CoopForm>(setCoop, coop)("president_name")} /></div>
              <div className="space-y-2"><Label>Nombre estimé de producteurs</Label>
                <Input type="number" min={0} value={coop.estimated_producers} onChange={upd<CoopForm>(setCoop, coop)("estimated_producers")} /></div>
              <div className="space-y-2"><Label>Type de certification *</Label>
                <Select value={coop.certification_type} onValueChange={(v) => setCoop({ ...coop, certification_type: v as CertType })}>
                  <SelectTrigger><SelectValue placeholder="Sélectionner" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="fairtrade">Fairtrade</SelectItem>
                    <SelectItem value="rainforest">Rainforest Alliance</SelectItem>
                    <SelectItem value="eudr">EUDR</SelectItem>
                    <SelectItem value="ordinaire">Ordinaire</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label>Logo (optionnel)</Label>
                <div className="flex items-center gap-3">
                  <label className="flex-1 cursor-pointer rounded-md border border-dashed border-border p-4 text-center hover:bg-accent/30 transition-colors">
                    <Upload className="h-4 w-4 mx-auto mb-2 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">{logoFile?.name || "Choisir un fichier"}</span>
                    <input type="file" accept="image/*" className="hidden" onChange={handleLogo} />
                  </label>
                  {logoPreview && (
                    <img src={logoPreview} alt="aperçu" className="h-16 w-16 rounded-md object-cover border" />
                  )}
                </div>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2 md:col-span-2"><Label>Nom complet *</Label>
                <Input value={admin.full_name} onChange={upd<AdminForm>(setAdmin, admin)("full_name")} placeholder="Jean Dupont" /></div>
              <div className="space-y-2"><Label>Email *</Label>
                <Input type="email" value={admin.email} onChange={upd<AdminForm>(setAdmin, admin)("email")} /></div>
              <div className="space-y-2"><Label>Téléphone *</Label>
                <Input value={admin.phone} onChange={upd<AdminForm>(setAdmin, admin)("phone")} /></div>
              <div className="space-y-2 md:col-span-2">
                <Label>Mot de passe * <span className="text-xs text-muted-foreground ml-1">(min 8, 1 maj, 1 min, 1 chiffre)</span></Label>
                <div className="relative">
                  <Input type={showPw ? "text" : "password"} value={admin.password}
                    onChange={upd<AdminForm>(setAdmin, admin)("password")} className="pr-10" />
                  <button type="button" onClick={() => setShowPw(!showPw)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" tabIndex={-1}>
                    {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              <div className="space-y-2 md:col-span-2"><Label>Confirmation du mot de passe *</Label>
                <Input type={showPw ? "text" : "password"} value={admin.password_confirm}
                  onChange={upd<AdminForm>(setAdmin, admin)("password_confirm")} /></div>
              <div className="md:col-span-2 rounded-md bg-muted/40 p-3 text-sm text-muted-foreground flex items-start gap-2">
                <UserCog className="h-4 w-4 mt-0.5 shrink-0" />
                <span>Cet utilisateur sera créé avec le rôle <strong className="text-foreground">Admin coopérative</strong> et associé automatiquement à la nouvelle coopérative.</span>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-6">
              <section>
                <h3 className="text-sm font-semibold mb-3 text-muted-foreground uppercase tracking-wide">Coopérative</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2 text-sm rounded-md border p-4">
                  <div><span className="text-muted-foreground">Nom :</span> <strong>{coop.name}</strong></div>
                  <div><span className="text-muted-foreground">Sigle :</span> <strong>{coop.acronym}</strong></div>
                  <div><span className="text-muted-foreground">RCCM :</span> {coop.rccm}</div>
                  <div><span className="text-muted-foreground">Contribuable :</span> {coop.tax_number}</div>
                  <div><span className="text-muted-foreground">Tél :</span> {coop.phone}</div>
                  <div><span className="text-muted-foreground">Email :</span> {coop.official_email}</div>
                  <div className="md:col-span-2"><span className="text-muted-foreground">Adresse :</span> {coop.address}, {coop.city}, {coop.country}</div>
                  <div><span className="text-muted-foreground">Président :</span> {coop.president_name || "—"}</div>
                  <div><span className="text-muted-foreground">Producteurs estimés :</span> {coop.estimated_producers || "—"}</div>
                  <div><span className="text-muted-foreground">Certification :</span> <span className="capitalize">{coop.certification_type}</span></div>
                  <div><span className="text-muted-foreground">Logo :</span> {logoFile?.name || "—"}</div>
                </div>
              </section>
              <section>
                <h3 className="text-sm font-semibold mb-3 text-muted-foreground uppercase tracking-wide">Administrateur principal</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2 text-sm rounded-md border p-4">
                  <div><span className="text-muted-foreground">Nom :</span> <strong>{admin.full_name}</strong></div>
                  <div><span className="text-muted-foreground">Email :</span> {admin.email}</div>
                  <div><span className="text-muted-foreground">Téléphone :</span> {admin.phone}</div>
                  <div><span className="text-muted-foreground">Rôle :</span> Admin coopérative</div>
                </div>
              </section>
              <section className="rounded-md bg-primary/5 border border-primary/20 p-4 text-sm">
                <strong className="text-foreground">Abonnement pilote</strong> activé automatiquement :
                période 1<sup>er</sup> septembre → 30 novembre {new Date().getFullYear()}, statut <em>trial</em>.
              </section>
            </div>
          )}

          <div className="flex justify-between mt-8 pt-4 border-t">
            <Button variant="outline" onClick={prev} disabled={step === 1 || submitting}>
              <ArrowLeft className="h-4 w-4 mr-2" /> Précédent
            </Button>
            {step < 3 ? (
              <Button onClick={next}>
                Suivant <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            ) : (
              <Button onClick={submit} disabled={submitting}>
                {submitting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                Créer la coopérative
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
