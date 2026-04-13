import { NavLink, Outlet, Navigate } from "react-router-dom";
import { BarChart3, Truck, FileSpreadsheet, Users, Settings, LogOut } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";

const allNavItems = [
  { to: "/", label: "Tableau de bord", icon: BarChart3, roles: ["admin", "user"] },
  { to: "/producteurs", label: "Producteurs", icon: Users, roles: ["admin"] },
  { to: "/chargements", label: "Chargements", icon: Truck, roles: ["admin", "user"] },
  { to: "/export", label: "Export", icon: FileSpreadsheet, roles: ["admin"] },
  { to: "/gestion", label: "Gestion du projet", icon: Settings, roles: ["admin"] },
];

export default function AppLayout() {
  const { user, role, loading, signOut } = useAuth();

  if (loading) return <div className="flex h-screen items-center justify-center"><span className="animate-spin text-2xl">⏳</span></div>;
  if (!user) return <Navigate to="/login" replace />;

  const navItems = allNavItems.filter((item) => item.roles.includes(role || "user"));

  return (
    <div className="flex h-screen w-full overflow-hidden">
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
        <div className="border-t border-sidebar-border p-4 space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-xs text-sidebar-foreground/50">Campagne active</span>
            <span className="text-xs font-semibold text-sidebar-primary">2025-2026</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-sidebar-foreground/50 truncate">{user.email}</span>
            <Button variant="ghost" size="icon" className="h-7 w-7 text-sidebar-foreground/50 hover:text-sidebar-foreground" onClick={signOut}>
              <LogOut className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </aside>

      <div className="flex flex-col flex-1 overflow-hidden">
        <main className="flex-1 overflow-y-auto bg-muted/30">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
