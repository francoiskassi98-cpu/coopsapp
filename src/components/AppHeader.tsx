import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/hooks/useTheme";
import NotificationsBell from "@/components/NotificationsBell";
import GlobalSearch from "@/components/GlobalSearch";

export default function AppHeader() {
  const { theme, toggle } = useTheme();
  return (
    <header className="h-14 shrink-0 border-b border-border/40 bg-background/60 backdrop-blur-xl flex items-center justify-between px-4 gap-3">
      <GlobalSearch />
      <div className="flex items-center gap-1">
        <Button variant="ghost" size="icon" onClick={toggle} aria-label="Changer de thème">
          {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </Button>
        <NotificationsBell />
      </div>
    </header>
  );
}
