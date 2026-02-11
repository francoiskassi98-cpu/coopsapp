import { NavLink, Outlet } from "react-router-dom";
import { BarChart3, Upload, Truck, FileSpreadsheet, XCircle, Users } from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  { to: "/", label: "Tableau de bord", icon: BarChart3 },
  { to: "/producteurs", label: "Producteurs", icon: Users },
  { to: "/import", label: "Importation", icon: Upload },
  { to: "/chargements", label: "Chargements", icon: Truck },
  { to: "/export", label: "Export", icon: FileSpreadsheet },
  { to: "/annulations", label: "Annulations", icon: XCircle },
];

export default function AppLayout() {
  return (
    <div className="flex min-h-screen">
      <aside className="w-64 bg-sidebar text-sidebar-foreground flex flex-col border-r border-sidebar-border">
        <div className="p-5 border-b border-sidebar-border">
          <h1 className="text-lg font-bold text-sidebar-primary">🍫 CacaoTrack</h1>
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
      </aside>
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}
