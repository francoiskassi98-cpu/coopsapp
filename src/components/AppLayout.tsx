import { NavLink, Outlet, useLocation } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { BarChart3, Truck, FileSpreadsheet, Users, Settings, LogOut, ShieldCheck, Building2, Sprout, Handshake, Trash2, KeyRound, FileCog, BookOpen } from "lucide-react";
import AppHeader from "@/components/AppHeader";
import { cn } from "@/lib/utils";
import { useActiveCampaign } from "@/hooks/useActiveCampaign";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";

type NavItem = { to: string; label: string; icon: typeof BarChart3; adminOnly?: boolean; superAdminOnly?: boolean };
type NavGroup = { label: string; items: NavItem[] };

const groups: NavGroup[] = [
  {
    label: "Pilotage",
    items: [
      { to: "/", label: "Tableau de bord", icon: BarChart3 },
    ],
  },
  {
    label: "Opérations",
    items: [
      { to: "/producteurs", label: "Producteurs", icon: Users },
      { to: "/chargements", label: "Chargements", icon: Truck },
      { to: "/partenaires", label: "Partenaires", icon: Handshake },
      { to: "/export", label: "Export", icon: FileSpreadsheet },
    ],
  },
  {
    label: "Administration",
    items: [
      { to: "/gestion", label: "Gestion du projet", icon: Settings, adminOnly: true },
      { to: "/gestion/registres", label: "Registres", icon: BookOpen, adminOnly: true },
      { to: "/gestion/cooperatives/nouvelle", label: "Nouvelle coopérative", icon: Building2, superAdminOnly: true },
      { to: "/gestion/modeles-chargement", label: "Modèles chargement", icon: FileCog, adminOnly: true },
      { to: "/audit", label: "Journal d'audit", icon: ShieldCheck, adminOnly: true },
      { to: "/audit/connexions", label: "Journal de connexion", icon: KeyRound, adminOnly: true },
      { to: "/corbeille", label: "Corbeille", icon: Trash2, adminOnly: true },
    ],
  },
];

export default function AppLayout() {
  const location = useLocation();
  const { campaign } = useActiveCampaign();
  const { user, role, cooperatives, profile, signOut, isSuperAdmin, isCoopAdmin, isAdmin } = useAuth();
  const displayName = profile?.full_name?.trim() || profile?.username?.trim() || (user?.email ? user.email.split("@")[0] : "Utilisateur");
  const initials = displayName.split(/\s+/).map((s) => s[0]).slice(0, 2).join("").toUpperCase();

  const filterItem = (i: NavItem) => (!i.adminOnly || isAdmin) && (!i.superAdminOnly || isSuperAdmin);

  const roleLabel =
    role === "super_admin" ? "Super administrateur" :
    role === "coop_admin" ? "Admin coopérative" :
    "Agent";

  return (
    <div className="flex h-screen w-full overflow-hidden">
      <aside className="w-64 shrink-0 bg-gradient-sidebar text-sidebar-foreground flex flex-col border-r border-sidebar-border/40 relative">
        <div className="absolute -top-20 -left-10 h-48 w-48 rounded-full bg-primary/10 blur-3xl pointer-events-none" />

        <div className="relative p-5 border-b border-sidebar-border/40">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-primary shadow-glow">
              <Sprout className="h-5 w-5 text-primary-foreground" />
            </div>
            <div>
              <div className="text-sm font-bold leading-tight">AgroServices</div>
              <div className="text-[10px] text-sidebar-foreground/60 tracking-wider uppercase">Digital</div>
            </div>
          </div>
          {cooperatives.length > 0 && !isSuperAdmin && (
            <div className="mt-3 flex items-center gap-1.5">
              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold bg-secondary/20 text-secondary tracking-wider">
                {isCoopAdmin ? "ADMIN" : "AGENT"}
              </span>
              <span className="text-[11px] text-sidebar-foreground/70 truncate">{cooperatives[0]}</span>
            </div>
          )}
        </div>

        <nav className="relative flex-1 overflow-y-auto px-3 py-4 space-y-5">
          {groups.map((group) => {
            const items = group.items.filter(filterItem);
            if (items.length === 0) return null;
            return (
              <div key={group.label}>
                <div className="px-3 mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-sidebar-foreground/40">
                  {group.label}
                </div>
                <div className="space-y-0.5">
                  {items.map((item) => (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      end={item.to === "/"}
                      className={({ isActive }) =>
                        cn(
                          "group flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 relative",
                          isActive
                            ? "bg-sidebar-accent text-sidebar-primary shadow-glass"
                            : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
                        )
                      }
                    >
                      {({ isActive }) => (
                        <>
                          {isActive && <span className="absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-r bg-primary shadow-glow" />}
                          <item.icon className={cn("h-4 w-4 shrink-0 transition-transform group-hover:scale-110", isActive && "text-primary")} />
                          <span className="truncate">{item.label}</span>
                        </>
                      )}
                    </NavLink>
                  ))}
                </div>
              </div>
            );
          })}
        </nav>

        <div className="relative border-t border-sidebar-border/40 p-3 space-y-2">
          <div className="flex items-center justify-between px-2 py-1">
            <span className="text-[10px] text-sidebar-foreground/40 uppercase tracking-wide">Campagne</span>
            <span className="text-xs font-semibold text-primary">{campaign?.nom ?? "—"}</span>
          </div>
          {user && (
            <div className="rounded-lg bg-sidebar-accent/30 p-2.5 space-y-2">
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-primary text-primary-foreground text-xs font-bold shrink-0">
                  {initials || "?"}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-medium truncate">{displayName}</div>
                  <div className="text-[10px] text-sidebar-foreground/50 truncate">{roleLabel}</div>
                </div>
              </div>
              <Button
                variant="ghost" size="sm" onClick={signOut}
                className="w-full justify-start text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/50 h-7 px-2 text-xs"
              >
                <LogOut className="h-3 w-3 mr-1.5" /> Se déconnecter
              </Button>
            </div>
          )}
        </div>
      </aside>

      <div className="flex flex-col flex-1 overflow-hidden">
        <AppHeader />
        <main className="flex-1 overflow-y-auto" style={{ scrollbarGutter: "stable" }}>
          <AnimatePresence mode="wait">
            <motion.div
              key={location.pathname}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25 }}
            >
              <Outlet />
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
    </div>
  );
}
