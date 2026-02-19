import { NavLink, Outlet } from "react-router-dom";
import { BarChart3, Truck, FileSpreadsheet, XCircle, Users, LogOut } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";

const navItems = [
  { to: "/", label: "Tableau de bord", icon: BarChart3 },
  { to: "/producteurs", label: "Producteurs", icon: Users },
  { to: "/chargements", label: "Chargements", icon: Truck },
  { to: "/export", label: "Export", icon: FileSpreadsheet },
  { to: "/annulations", label: "Annulations", icon: XCircle },
];

export default function AppLayout() {
  const { user, signOut } = useAuth();

  return (
    <div className="flex h-screen w-full overflow-hidden">
      {/* Sidebar fixe */}
      <aside className="w-64 bg-sidebar text-sidebar-foreground flex flex-col shrink-0">
        <div className="p-5 border-b border-sidebar-border">
          <h1 className="text-lg font-bold text-sidebar-primary">🍫 COOPS APP</h1>
          <p className="text-xs text-sidebar-foreground/60 mt-1">Gestion des chargements</p>
        </div>
        <nav className="flex-1 p-3 space-y-1">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === "/"}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors",
                  isActive
                    ? "bg-sidebar-accent text-sidebar-primary"
                    : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
                )
              }
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="mt-auto border-t border-sidebar-border p-4 space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-xs text-sidebar-foreground/50">Campagne active</span>
            <span className="text-xs font-semibold text-sidebar-primary">2025-2026</span>
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3 min-w-0">
              <div className="h-8 w-8 rounded-full bg-sidebar-accent flex items-center justify-center text-xs font-bold text-sidebar-primary shrink-0">
                {user?.email?.substring(0, 2).toUpperCase() || "KN"}
              </div>
              <div className="text-xs text-sidebar-foreground/80 truncate">{user?.email || "Mon compte"}</div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={signOut}
              className="shrink-0 text-sidebar-foreground/50 hover:text-sidebar-foreground hover:bg-sidebar-accent"
              title="Déconnexion"
            >
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </aside>

      {/* Contenu principal */}
      <div className="flex flex-col flex-1 overflow-hidden">
        <main className="flex-1 overflow-y-auto bg-muted/30">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
