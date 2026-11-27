import { ReactNode } from "react";
import { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface PageHeaderProps {
  icon?: LucideIcon;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
}

/**
 * En-tête de page unifié : chip icône teinté + titre + description + actions.
 * Utilisé sur toutes les pages métier pour homogénéiser le Design System.
 */
export default function PageHeader({ icon: Icon, title, description, actions, className }: PageHeaderProps) {
  return (
    <div
      className={cn(
        "relative overflow-hidden flex flex-col md:flex-row md:items-center md:justify-between gap-3 md:gap-4 rounded-2xl border border-primary/15 bg-gradient-to-br from-primary/10 via-card to-accent/10 p-4 md:p-5 shadow-sm",
        className
      )}
    >
      <div aria-hidden className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-primary/10 blur-2xl" />
      <div className="relative flex items-start gap-3 min-w-0">
        {Icon && (
          <div className="shrink-0 h-10 w-10 md:h-11 md:w-11 rounded-2xl bg-gradient-primary text-primary-foreground flex items-center justify-center shadow-glow">
            <Icon className="h-5 w-5" />
          </div>
        )}
        <div className="min-w-0">
          <h1 className="text-xl md:text-2xl font-bold tracking-tight leading-tight break-words">
            {title}
          </h1>
          {description && (
            <p className="text-sm text-muted-foreground mt-1">{description}</p>
          )}
        </div>
      </div>
      {actions && (
        <div className="relative flex flex-wrap items-center gap-2 md:justify-end w-full md:w-auto [&>*]:flex-1 sm:[&>*]:flex-none">
          {actions}
        </div>
      )}
    </div>
  );
}
