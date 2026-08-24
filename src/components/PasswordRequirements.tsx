import { Check, X, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import { evaluatePassword } from "@/lib/password-policy";

interface PasswordRequirementsProps {
  value: string;
  className?: string;
}

/** Affiche l'état en temps réel des règles de mot de passe (source unique : lib/password-policy). */
export function PasswordRequirements({ value, className }: PasswordRequirementsProps) {
  const rules = evaluatePassword(value);

  return (
    <div className={cn("rounded-lg border border-border bg-muted/40 p-3 space-y-1.5", className)}>
      <p className="text-xs font-medium text-muted-foreground">Le mot de passe doit contenir :</p>
      <ul className="space-y-1">
        {rules.map((rule) => (
          <li
            key={rule.id}
            className={cn(
              "flex items-start gap-2 text-xs",
              rule.valid === null
                ? "text-muted-foreground"
                : rule.valid
                  ? "text-success"
                  : "text-destructive",
            )}
          >
            {rule.valid === null ? (
              <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" aria-hidden />
            ) : rule.valid ? (
              <Check className="h-3.5 w-3.5 shrink-0 mt-0.5" aria-hidden />
            ) : (
              <X className="h-3.5 w-3.5 shrink-0 mt-0.5" aria-hidden />
            )}
            <span>{rule.label}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

interface PasswordMatchProps {
  password: string;
  confirm: string;
  className?: string;
}

export function PasswordMatch({ password, confirm, className }: PasswordMatchProps) {
  if (!confirm) return null;
  const ok = password === confirm;
  return (
    <p
      className={cn(
        "flex items-center gap-1.5 text-xs",
        ok ? "text-success" : "text-destructive",
        className,
      )}
    >
      {ok ? <Check className="h-3.5 w-3.5" aria-hidden /> : <X className="h-3.5 w-3.5" aria-hidden />}
      {ok ? "Les mots de passe correspondent" : "Les mots de passe ne correspondent pas"}
    </p>
  );
}
