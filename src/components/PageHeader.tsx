import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface PageHeaderProps {
  icon?: LucideIcon;
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
}

/**
 * Bandeau de titre de page unifié — style aligné sur Créer un chargement.
 * Utilisé sur toutes les pages pour une identité visuelle cohérente.
 */
export default function PageHeader({ icon: Icon, title, description, actions, className }: PageHeaderProps) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-[var(--radius)] border border-white/5 bg-gradient-card p-5 shadow-glass",
        "flex flex-wrap items-start justify-between gap-4",
        className
      )}
    >
      <div className="absolute -top-16 -left-10 h-40 w-40 rounded-full bg-primary/10 blur-3xl pointer-events-none" />
      <div className="relative min-w-0 flex items-start gap-3">
        {Icon && (
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-primary shadow-glow">
            <Icon className="h-5 w-5 text-primary-foreground" />
          </div>
        )}
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight truncate">{title}</h1>
          {description && (
            <p className="text-sm text-muted-foreground mt-1 max-w-3xl">{description}</p>
          )}
        </div>
      </div>
      {actions && <div className="relative flex flex-wrap items-center gap-2 shrink-0">{actions}</div>}
    </div>
  );
}
