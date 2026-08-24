import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "@/hooks/use-toast";
import { Loader2, Eye, EyeOff, AlertTriangle } from "lucide-react";
import { PasswordRequirements, PasswordMatch } from "@/components/PasswordRequirements";
import { isPasswordValid, PASSWORD_MIN_LENGTH, PASSWORD_REJECTED_MESSAGE } from "@/lib/password-policy";


type Status = "checking" | "ready" | "invalid";

export default function ResetPassword() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<Status>("checking");
  const [invalidMsg, setInvalidMsg] = useState(
    "Ce lien de réinitialisation est expiré ou invalide. Veuillez demander un nouveau lien de réinitialisation.",
  );
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const establish = async () => {
      const url = new URL(window.location.href);
      const query = url.searchParams;
      const hash = new URLSearchParams(url.hash.replace(/^#/, ""));

      const errDesc = query.get("error_description") || hash.get("error_description");
      const errCode = query.get("error_code") || hash.get("error_code");
      if (errDesc || errCode) {
        console.error("[ResetPassword.link]", { code: errCode, message: errDesc });
        if (!cancelled) {
          setInvalidMsg(
            /expired/i.test(`${errCode} ${errDesc}`)
              ? "Ce lien de réinitialisation est expiré. Veuillez demander un nouveau lien de réinitialisation."
              : "Ce lien de réinitialisation est invalide. Veuillez demander un nouveau lien de réinitialisation.",
          );
          setStatus("invalid");
        }
        return;
      }

      // 1) Nouveau format: token_hash + type=recovery (non géré automatiquement par le client)
      const tokenHash = query.get("token_hash") || hash.get("token_hash");
      const type = query.get("type") || hash.get("type");
      if (tokenHash && (type === "recovery" || !type)) {
        const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: "recovery" });
        if (error) console.error("[ResetPassword.verifyOtp]", error.status, error.message);
      }

      // 2) Format PKCE: ?code=...
      const code = query.get("code");
      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (error) console.error("[ResetPassword.exchangeCode]", error.status, error.message);
      }

      // 3) Format implicite: #access_token & #refresh_token
      const accessToken = hash.get("access_token");
      const refreshToken = hash.get("refresh_token");
      if (accessToken && refreshToken) {
        const { error } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });
        if (error) console.error("[ResetPassword.setSession]", error.status, error.message);
      }

      const { data } = await supabase.auth.getSession();
      if (cancelled) return;
      if (data.session) {
        // Nettoie l'URL (retire les jetons) sans recharger la page
        window.history.replaceState({}, "", "/reset-password");
        setStatus("ready");
      } else {
        setStatus("invalid");
      }
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if ((event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") && session) {
        setStatus("ready");
      }
    });

    establish();

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!password.trim()) {
      setFormError("Veuillez saisir un nouveau mot de passe.");
      return;
    }
    if (!isPasswordValid(password)) {
      setFormError(PASSWORD_REJECTED_MESSAGE);
      return;
    }
    if (password !== confirm) {
      setFormError("Les mots de passe ne correspondent pas.");
      return;
    }


    setLoading(true);
    try {
      const { data: sess } = await supabase.auth.getSession();
      if (!sess.session) {
        setStatus("invalid");
        return;
      }

      const { error } = await supabase.auth.updateUser({ password });
      if (error) {
        console.error("[ResetPassword.update]", {
          status: error.status,
          code: (error as { code?: string }).code,
          message: error.message,
        });
        const msg = error.message?.toLowerCase() ?? "";
        const code = (error as { code?: string }).code ?? "";
        if (error.status === 401 || error.status === 403 || /jwt|session|token/.test(msg)) {
          setInvalidMsg("Le lien de réinitialisation est expiré ou invalide. Veuillez demander un nouveau lien.");
          setStatus("invalid");
          return;
        }
        if (code === "weak_password" || /password/.test(msg)) {
          setFormError(
            /pwned|compromis|leak/.test(msg)
              ? "Ce mot de passe a été compromis dans une fuite de données. Choisissez-en un autre."
              : PASSWORD_REJECTED_MESSAGE,
          );
          return;
        }

        setFormError("Impossible de mettre à jour le mot de passe. Veuillez réessayer.");
        return;
      }

      toast({ title: "Votre mot de passe a été mis à jour avec succès." });
      await supabase.auth.signOut();
      navigate("/auth", { replace: true });
    } catch (err) {
      console.error("[ResetPassword.update]", err);
      setFormError("Impossible de mettre à jour le mot de passe. Veuillez réessayer.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">Nouveau mot de passe</CardTitle>
          <CardDescription>
            {status === "ready"
              ? "Choisissez un nouveau mot de passe pour votre compte."
              : status === "checking"
                ? "Validation du lien en cours…"
                : "Lien non valide"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {status === "checking" && (
            <div className="flex justify-center py-6"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          )}

          {status === "invalid" && (
            <div className="space-y-4">
              <div className="flex gap-3 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm">
                <AlertTriangle className="h-4 w-4 shrink-0 text-destructive mt-0.5" />
                <p>{invalidMsg}</p>
              </div>
              <Button className="w-full" onClick={() => navigate("/auth", { replace: true })}>
                Demander un nouveau lien
              </Button>
            </div>
          )}

          {status === "ready" && (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="password">Nouveau mot de passe</Label>
                <div className="relative">
                  <Input id="password" type={show ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} required minLength={PASSWORD_MIN_LENGTH} className="pr-10" autoComplete="new-password" />
                  <button type="button" onClick={() => setShow(!show)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" tabIndex={-1}>
                    {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                <PasswordRequirements value={password} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm">Confirmer le nouveau mot de passe</Label>
                <Input id="confirm" type={show ? "text" : "password"} value={confirm} onChange={(e) => setConfirm(e.target.value)} required minLength={PASSWORD_MIN_LENGTH} autoComplete="new-password" />
                <PasswordMatch password={password} confirm={confirm} />
              </div>
              {formError && <p className="text-sm text-destructive">{formError}</p>}
              <Button type="submit" className="w-full" disabled={loading || !isPasswordValid(password) || password !== confirm}>
                {loading && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                Mettre à jour le mot de passe
              </Button>
            </form>

          )}
        </CardContent>
      </Card>
    </div>
  );
}
