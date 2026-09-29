import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Bell, CalendarCheck, CalendarX, FileCheck2, CheckCheck, Trash2, BellOff, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/lib/auth-context";
import {
  useNotifications, useMarkNotificationsRead, useMarkNotificationRead, useClearNotifications,
} from "@/lib/hooks/useNotifications";
import type { Notification, Profile } from "@/lib/database.types";
import { formatTimestamp } from "@/lib/format";
import { toneClasses } from "@/components/app/StatCard";
import { cn } from "@/lib/utils";

const TIPO_META: Record<Notification["tipo"], { icon: React.ComponentType<{ className?: string }>; tone: keyof typeof toneClasses; accion: string }> = {
  cita_agendada: { icon: CalendarCheck, tone: "success", accion: "Ver cita" },
  cita_cancelada: { icon: CalendarX, tone: "danger", accion: "Ver citas" },
  resultado_cargado: { icon: FileCheck2, tone: "info", accion: "Ver resultado" },
};

/** Ruta relacionada con la notificación según el rol del usuario. */
function destino(role: Profile["role"], tipo: Notification["tipo"]): string | null {
  const esResultado = tipo === "resultado_cargado";
  switch (role) {
    case "particular": return esResultado ? "/app/particular/resultados" : "/app/particular/citas";
    case "empresa": return esResultado ? "/app/empresa/resultados" : "/app/empresa/citas";
    case "ips": return esResultado ? "/app/ips/resultados" : "/app/ips/citas";
    default: return null;
  }
}

export function NotificationBell() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const { data: items = [], isLoading, isError, refetch } = useNotifications(profile?.id);
  const markAll = useMarkNotificationsRead();
  const markOne = useMarkNotificationRead();
  const clear = useClearNotifications();

  if (!profile) return null;
  const unread = items.filter((n) => !n.read).length;

  const openItem = (n: Notification) => {
    if (!n.read) markOne.mutate({ id: n.id, userId: profile.id });
    const to = destino(profile.role, n.tipo);
    if (to) {
      setOpen(false);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      navigate({ to: to as any });
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative rounded-full"
          aria-label={unread > 0 ? `Notificaciones, ${unread} sin leer` : "Notificaciones"}
        >
          <Bell className="size-5!" />
          {unread > 0 && (
            <span
              aria-hidden
              className="absolute right-1 top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-danger px-1 text-[10px] font-bold text-white ring-2 ring-card"
            >
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={8} className="w-[min(24rem,calc(100vw-2rem))] p-0">
        <div className="flex items-center justify-between gap-2 border-b px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold">Notificaciones</h2>
            <p className="text-xs text-muted-foreground">
              {unread > 0 ? `${unread} sin leer` : "Estás al día"}
            </p>
          </div>
          {unread > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => markAll.mutate(profile.id)}
              disabled={markAll.isPending}
              className="text-accent-foreground"
            >
              <CheckCheck /> Marcar todas
            </Button>
          )}
        </div>

        <div className="max-h-[26rem] overflow-y-auto">
          {isLoading ? (
            <div className="space-y-3 p-4">
              {[0, 1, 2].map((i) => (
                <div key={i} className="flex gap-3">
                  <Skeleton className="size-9 rounded-full" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-3.5 w-2/3" />
                    <Skeleton className="h-3 w-full" />
                  </div>
                </div>
              ))}
            </div>
          ) : isError ? (
            <div className="p-6 text-center text-sm">
              <p className="text-muted-foreground">No pudimos cargar tus notificaciones.</p>
              <Button variant="link" onClick={() => refetch()}>Reintentar</Button>
            </div>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-6 py-10 text-center">
              <div className="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
                <BellOff className="size-6" aria-hidden />
              </div>
              <p className="text-sm font-medium">No tienes notificaciones</p>
              <p className="text-xs text-muted-foreground">Aquí verás confirmaciones de citas y resultados nuevos.</p>
            </div>
          ) : (
            <ul className="divide-y">
              {items.map((n) => {
                const meta = TIPO_META[n.tipo];
                const Icon = meta.icon;
                const hasLink = !!destino(profile.role, n.tipo);
                return (
                  <li key={n.id}>
                    <button
                      type="button"
                      onClick={() => openItem(n)}
                      className={cn(
                        "group flex w-full gap-3 px-4 py-3 text-left transition-colors hover:bg-muted focus-visible:bg-muted focus-visible:outline-none",
                        !n.read && "bg-primary-soft/50",
                      )}
                    >
                      <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-full", toneClasses[meta.tone])}>
                        <Icon className="size-4" aria-hidden />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-start justify-between gap-2">
                          <span className={cn("text-sm", n.read ? "font-medium" : "font-semibold")}>{n.titulo}</span>
                          {!n.read && (
                            <span className="mt-1.5 size-2 shrink-0 rounded-full bg-primary">
                              <span className="sr-only">Sin leer</span>
                            </span>
                          )}
                        </span>
                        <span className="mt-0.5 block text-[13px] leading-snug text-muted-foreground">{n.mensaje}</span>
                        <span className="mt-1.5 flex items-center justify-between gap-2 text-xs">
                          <span className="text-muted-foreground">{formatTimestamp(n.created_at)}</span>
                          {hasLink && (
                            <span className="inline-flex items-center font-semibold text-accent-foreground group-hover:underline">
                              {meta.accion} <ChevronRight className="size-3.5" aria-hidden />
                            </span>
                          )}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {items.length > 0 && (
          <div className="border-t px-2 py-2">
            <Button
              variant="ghost"
              size="sm"
              className="w-full text-muted-foreground"
              disabled={clear.isPending}
              onClick={() =>
                clear.mutate(profile.id, {
                  onSuccess: () => toast.success("Notificaciones eliminadas"),
                  onError: () => toast.error("No se pudieron eliminar las notificaciones"),
                })
              }
            >
              <Trash2 /> Limpiar todas
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
