import { Link, useLocation } from "react-router-dom";
import { ChevronRight, Home } from "lucide-react";

const LABELS: Record<string, string> = {
  "": "Tableau de bord",
  producteurs: "Producteurs",
  chargements: "Chargements",
  partenaires: "Partenaires",
  export: "Export",
  campagnes: "Campagnes",
  gestion: "Administration",
  cooperatives: "Coopératives",
  nouvelle: "Nouvelle",
  "modeles-chargement": "Modèles chargement",
  audit: "Journal d'audit",
  connexions: "Journal de connexion",
  corbeille: "Corbeille",
};

export default function Breadcrumb() {
  const { pathname } = useLocation();
  const parts = pathname.split("/").filter(Boolean);

  return (
    <nav aria-label="Fil d'Ariane" className="flex items-center gap-1 text-xs text-muted-foreground min-w-0">
      <Link to="/" className="inline-flex items-center gap-1 hover:text-foreground transition-colors">
        <Home className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">Accueil</span>
      </Link>
      {parts.map((seg, i) => {
        const to = "/" + parts.slice(0, i + 1).join("/");
        const label = LABELS[seg] ?? seg;
        const isLast = i === parts.length - 1;
        return (
          <span key={to} className="inline-flex items-center gap-1 min-w-0">
            <ChevronRight className="h-3 w-3 shrink-0 opacity-50" />
            {isLast ? (
              <span className="text-foreground font-medium truncate">{label}</span>
            ) : (
              <Link to={to} className="hover:text-foreground transition-colors truncate">{label}</Link>
            )}
          </span>
        );
      })}
    </nav>
  );
}
