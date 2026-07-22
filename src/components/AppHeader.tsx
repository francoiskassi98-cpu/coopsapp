import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/hooks/useTheme";
import NotificationsBell from "@/components/NotificationsBell";
import GlobalSearch from "@/components/GlobalSearch";
import CooperativeBanner from "@/components/CooperativeBanner";

export default function AppHeader() {
  const { theme, toggle } = useTheme();
  return (
    <header className="h-14 shrink-0 border-b border-border/40 bg-background/60 backdrop-blur-xl flex items-center justify-between px-4 gap-3">
      <div className="flex items-center gap-4 min-w-0 flex-1">
        <CooperativeBanner />
      </div>
      <div className="flex items-center gap-2">
        <GlobalSearch />
        <Button variant="ghost" size="icon" onClick={toggle} aria-label="Changer de thème">
          {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </Button>
        <NotificationsBell />
      </div>
    </header>
  );
}
