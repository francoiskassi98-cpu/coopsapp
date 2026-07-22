import { useState } from "react";
import { Navigate } from "react-router-dom";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { Loader2, Eye, EyeOff, Sprout, ShieldCheck, BarChart3, Leaf } from "lucide-react";
import heroImage from "@/assets/auth-hero.jpg";

const STATS = [
  { value: "100%", label: "Traçabilité EUDR" },
  { value: "24/7", label: "Pilotage temps réel" },
  { value: "RLS", label: "Sécurité par coop" },
];

export default function Auth() {
  const { session, loading: authLoading, isSuperAdmin } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const [forgotOpen, setForgotOpen] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotLoading, setForgotLoading] = useState(false);

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (session) {
    if (isSuperAdmin) return <Navigate to="/gestion/cooperatives/nouvelle" replace />;
    return <Navigate to="/" replace />;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      toast({ title: "Connexion réussie" });
    } catch (err) {
      console.error("[auth]", err);
      toast({ title: "Erreur", description: "Email ou mot de passe incorrect.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleForgot = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!forgotEmail.trim()) return;
    setForgotLoading(true);
    try {
      await supabase.auth.resetPasswordForEmail(forgotEmail.trim(), {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      toast({ title: "Email envoyé", description: "Si cette adresse existe, vous recevrez un lien sécurisé." });
      setForgotOpen(false);
      setForgotEmail("");
    } catch (err) {
      console.error("[forgot-password]", err);
      toast({ title: "Email envoyé", description: "Si cette adresse existe, vous recevrez un lien sécurisé." });
      setForgotOpen(false);
    } finally {
      setForgotLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full grid lg:grid-cols-2 bg-background overflow-hidden">
      <motion.aside
        initial={{ opacity: 0, x: -30 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
        className="relative hidden lg:flex flex-col justify-between p-12 overflow-hidden"
        style={{ background: "linear-gradient(160deg, hsl(0 0% 100%) 0%, hsl(240 5% 98%) 100%)" }}
      >
        <div className="absolute inset-0 opacity-10 mix-blend-multiply">
          <img src={heroImage} alt="" aria-hidden className="h-full w-full object-cover" width={1024} height={1536} />
        </div>
        <div className="absolute -top-32 -right-32 h-96 w-96 rounded-full bg-primary/10 blur-3xl" />
        <div className="absolute -bottom-32 -left-20 h-96 w-96 rounded-full bg-secondary/10 blur-3xl" />


        <div className="relative">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-primary shadow-glow">
              <Sprout className="h-6 w-6 text-primary-foreground" />
            </div>
            <div>
              <div className="text-xl font-bold tracking-tight">AgroServices <span className="gradient-text">Digital</span></div>
              <div className="text-xs text-foreground/60">Plateforme SaaS — cacao &amp; EUDR</div>
            </div>
          </div>
        </div>

        <div className="relative space-y-8">
          <motion.h2
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2, duration: 0.6 }}
            className="text-4xl font-bold leading-tight max-w-md"
          >
            Pilotez vos coopératives <span className="gradient-text">en temps réel.</span>
          </motion.h2>
          <p className="text-foreground/70 max-w-md leading-relaxed">
            ERP agricole moderne, traçabilité EUDR, reporting automatisé. Conçu pour les coopératives cacao
            d'Afrique de l'Ouest qui veulent être autonomes.
          </p>

          <div className="grid grid-cols-3 gap-4 max-w-md">
            {STATS.map((s, i) => (
              <motion.div
                key={s.label}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4 + i * 0.1 }}
                className="glass-card p-4"
              >
                <div className="text-2xl font-bold gradient-text">{s.value}</div>
                <div className="text-[11px] text-foreground/60 mt-1">{s.label}</div>
              </motion.div>
            ))}
          </div>

          <div className="flex flex-wrap gap-3 max-w-md text-xs text-foreground/60">
            <span className="inline-flex items-center gap-1.5"><ShieldCheck className="h-3.5 w-3.5 text-primary" /> RLS Supabase</span>
            <span className="inline-flex items-center gap-1.5"><BarChart3 className="h-3.5 w-3.5 text-primary" /> Analytics premium</span>
            <span className="inline-flex items-center gap-1.5"><Leaf className="h-3.5 w-3.5 text-success" /> EUDR-ready</span>
          </div>
        </div>

        <div className="relative text-xs text-foreground/40">
          © {new Date().getFullYear()} AgroServices Digital — Tous droits réservés
        </div>
      </motion.aside>

      <motion.main
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.6 }}
        className="flex items-center justify-center p-6 sm:p-10"
      >
        <motion.div
          initial={{ opacity: 0, y: 20, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ delay: 0.2, duration: 0.5 }}
          className="w-full max-w-md glass-card p-8 sm:p-10"
        >
          <div className="lg:hidden flex items-center gap-2 mb-6">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-primary shadow-glow">
              <Sprout className="h-5 w-5 text-primary-foreground" />
            </div>
            <div className="font-bold">AgroServices <span className="gradient-text">Digital</span></div>
          </div>

          <h1 className="text-2xl font-bold mb-1">Bienvenue</h1>
          <p className="text-sm text-muted-foreground mb-6">Connectez-vous pour accéder à votre cockpit.</p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email">Adresse e-mail</Label>
              <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="vous@cooperative.ci" required className="h-11" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Mot de passe</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required minLength={6} className="h-11 pr-10"
                />
                <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors" tabIndex={-1} aria-label={showPassword ? "Masquer" : "Afficher"}>
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <Button type="submit" className="w-full h-11 bg-gradient-primary text-primary-foreground font-semibold hover:opacity-90 shadow-glow transition-all" disabled={loading}>
              {loading ? <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Connexion…</> : "Se connecter"}
            </Button>

            <div className="text-center">
              <button
                type="button"
                onClick={() => { setForgotEmail(email); setForgotOpen(true); }}
                className="text-xs font-medium text-primary hover:underline"
              >
                Mot de passe oublié ?
              </button>
            </div>
          </form>

          <div className="mt-8 pt-6 border-t border-border/50">
            <p className="text-xs text-muted-foreground text-center leading-relaxed">
              L'inscription publique est désactivée. Contactez votre super-administrateur pour créer un accès.
            </p>
          </div>
        </motion.div>
      </motion.main>

      <Dialog open={forgotOpen} onOpenChange={setForgotOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Réinitialiser le mot de passe</DialogTitle>
            <DialogDescription>
              Saisissez votre adresse e-mail. Si elle existe, vous recevrez un lien sécurisé pour définir un nouveau mot de passe.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleForgot} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="forgot-email">Adresse e-mail</Label>
              <Input id="forgot-email" type="email" value={forgotEmail} onChange={(e) => setForgotEmail(e.target.value)} placeholder="vous@cooperative.ci" required autoFocus />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setForgotOpen(false)}>Annuler</Button>
              <Button type="submit" disabled={forgotLoading} className="bg-gradient-primary text-primary-foreground">
                {forgotLoading && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                Envoyer le lien
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
