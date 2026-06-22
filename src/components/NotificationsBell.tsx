import { Bell, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useNotifications } from "@/hooks/useNotifications";
import { cn } from "@/lib/utils";
import { useNavigate } from "react-router-dom";

export default function NotificationsBell() {
  const { items, unread, markAllRead, markRead } = useNotifications();
  const navigate = useNavigate();

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-4 w-4" />
          {unread > 0 && (
            <span className="absolute top-1 right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive text-[9px] font-bold text-destructive-foreground px-1">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between px-3 py-2 border-b">
          <span className="text-sm font-semibold">Notifications</span>
          {unread > 0 && (
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={markAllRead}>
              <Check className="h-3 w-3 mr-1" /> Tout lu
            </Button>
          )}
        </div>
        <div className="max-h-80 overflow-y-auto">
          {items.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-8">Aucune notification</p>
          ) : (
            items.map((n) => (
              <button
                key={n.id}
                onClick={() => {
                  if (!n.read_at) markRead(n.id);
                  if (n.link) navigate(n.link);
                }}
                className={cn(
                  "w-full text-left px-3 py-2.5 border-b last:border-0 hover:bg-accent/40 transition",
                  !n.read_at && "bg-primary/5"
                )}
              >
                <div className="flex items-start gap-2">
                  {!n.read_at && <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-primary shrink-0" />}
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium truncate">{n.title}</div>
                    {n.message && <div className="text-[11px] text-muted-foreground line-clamp-2">{n.message}</div>}
                    <div className="text-[10px] text-muted-foreground/70 mt-0.5">
                      {new Date(n.created_at).toLocaleString("fr-FR")}
                    </div>
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
