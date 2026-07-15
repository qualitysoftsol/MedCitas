import { Bell, Check, Trash2, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useStore } from "@/lib/store";

export function NotificationBell() {
  const { currentUser, notifications, markNotificationsRead, clearNotifications } = useStore();
  if (!currentUser) return null;
  const mine = notifications.filter((n) => n.userId === currentUser.id);
  const unread = mine.filter((n) => !n.read).length;

  return (
    <Popover onOpenChange={(o) => { if (o && unread) markNotificationsRead(); }}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className="relative" aria-label="Notificaciones">
          <Bell className="w-4 h-4" />
          {unread > 0 && (
            <span className="absolute -top-0.5 -right-0.5 min-w-4 h-4 px-1 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center">
              {unread}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between px-3 py-2 border-b">
          <div className="font-semibold text-sm">Notificaciones</div>
          {mine.length > 0 && (
            <Button variant="ghost" size="sm" onClick={clearNotifications} className="h-7">
              <Trash2 className="w-3.5 h-3.5 mr-1" /> Limpiar
            </Button>
          )}
        </div>
        <div className="max-h-96 overflow-y-auto">
          {mine.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground text-center">Sin notificaciones.</p>
          ) : (
            <ul className="divide-y">
              {mine.map((n) => (
                <li key={n.id} className="px-3 py-2 text-sm">
                  <div className="flex items-center gap-2 font-medium">
                    <Check className="w-3.5 h-3.5 text-primary" />
                    {n.titulo}
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">{n.mensaje}</div>
                  {n.emailTo && (
                    <div className="text-[10px] text-muted-foreground/80 mt-1 flex items-center gap-1">
                      <Mail className="w-3 h-3" /> enviado a {n.emailTo}
                    </div>
                  )}
                  <div className="text-[10px] text-muted-foreground/60 mt-0.5">
                    {new Date(n.createdAt).toLocaleString("es-CO")}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
