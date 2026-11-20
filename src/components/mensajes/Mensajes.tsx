import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft, Check, CheckCheck, Loader2, Lock, LockOpen, MessagesSquare, Search, SendHorizontal,
} from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PageHeader } from "@/components/app/PageHeader";
import { EmptyState, ErrorState } from "@/components/app/EmptyState";
import { IconInput } from "@/components/app/FormField";
import { StatusPill } from "@/components/app/StatusBadge";
import { EnlaceSelector, EnlaceTarjeta } from "./Enlaces";
import { AVISO_DATOS, NuevaConversacionDialog } from "./NuevaConversacionDialog";
import { useAuth } from "@/lib/auth-context";
import {
  useCambiarEstadoConversacion, useConversaciones, useEnviarMensaje, useMarcarConversacionLeida, useMensajes, useNoLeidos,
  type ConversacionConIps, type Enlace, type LadoChat, type MensajeConEnlace,
} from "@/lib/hooks/useMensajes";
import { formatFecha, formatHora, formatTimestamp, hoyISO } from "@/lib/format";
import { cn } from "@/lib/utils";

type Filtro = "abiertas" | "cerradas" | "todas";

const CERRADA = { label: "Cerrada", tone: "neutral" as const, icon: Lock };

/** Fecha local 'YYYY-MM-DD' de una marca de tiempo. */
function diaLocal(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function etiquetaDia(dia: string): string {
  const hoy = hoyISO();
  const ayer = new Date();
  ayer.setDate(ayer.getDate() - 1);
  if (dia === hoy) return "Hoy";
  if (dia === diaLocal(ayer.toISOString())) return "Ayer";
  return formatFecha(dia);
}

function horaLocal(iso: string): string {
  const d = new Date(iso);
  return formatHora(`${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`);
}

/** Pantalla completa de mensajes: encabezado, lista de conversaciones y conversación abierta. */
export function PaginaMensajes({
  lado,
  conversacionId,
  onSeleccionar,
}: {
  lado: LadoChat;
  conversacionId: string | undefined;
  onSeleccionar: (id: string | undefined) => void;
}) {
  const { profile } = useAuth();
  return (
    <div className="space-y-6">
      <PageHeader
        icon={MessagesSquare}
        title="Mensajes"
        description={lado === "admin" ? "Conversaciones con las IPS, organizadas por tema." : "Conversaciones con el administrador de MedCitas, organizadas por tema."}
        actions={<NuevaConversacionDialog lado={lado} ipsId={lado === "ips" ? profile?.id : undefined} onCreada={onSeleccionar} />}
      />
      <Mensajes lado={lado} conversacionId={conversacionId} onSeleccionar={onSeleccionar} />
    </div>
  );
}

function Mensajes({
  lado,
  conversacionId,
  onSeleccionar,
}: {
  lado: LadoChat;
  conversacionId: string | undefined;
  onSeleccionar: (id: string | undefined) => void;
}) {
  const { profile } = useAuth();
  const { data: conversaciones = [], isLoading, isError, refetch } = useConversaciones(profile?.id);
  const { data: noLeidos } = useNoLeidos(profile?.id, lado);
  const [filtro, setFiltro] = useState<Filtro>("abiertas");
  const [busqueda, setBusqueda] = useState("");

  const actual = conversaciones.find((c) => c.id === conversacionId);

  const visibles = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return conversaciones.filter((c) => {
      if (filtro === "abiertas" && c.estado !== "abierta") return false;
      if (filtro === "cerradas" && c.estado !== "cerrada") return false;
      if (!q) return true;
      return c.asunto.toLowerCase().includes(q) || (c.ips?.nombre ?? "").toLowerCase().includes(q);
    });
  }, [conversaciones, filtro, busqueda]);

  return (
    <Card className="overflow-hidden p-0">
      <div className="grid h-[calc(100dvh-15rem)] min-h-[28rem] md:grid-cols-[minmax(17rem,22rem)_1fr]">
        {/* Lista: en móvil se oculta mientras hay una conversación abierta. */}
        <aside className={cn("min-h-0 flex-col border-r", conversacionId ? "hidden md:flex" : "flex")} aria-label="Conversaciones">
          <div className="space-y-2 border-b p-3">
            <IconInput
              icon={Search}
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder={lado === "admin" ? "Buscar por asunto o IPS" : "Buscar por asunto"}
              aria-label="Buscar conversaciones"
            />
            <Select value={filtro} onValueChange={(v) => setFiltro(v as Filtro)}>
              <SelectTrigger aria-label="Filtrar conversaciones"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="abiertas">Abiertas</SelectItem>
                <SelectItem value="cerradas">Cerradas</SelectItem>
                <SelectItem value="todas">Todas</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {isLoading ? (
              <div className="space-y-3 p-4">
                {[0, 1, 2].map((i) => <Skeleton key={i} className="h-14 w-full" />)}
              </div>
            ) : isError ? (
              <ErrorState onRetry={() => refetch()} />
            ) : visibles.length === 0 ? (
              <EmptyState
                compact
                icon={MessagesSquare}
                title={conversaciones.length === 0 ? "Aún no hay conversaciones" : "No hay conversaciones con este filtro"}
                description={conversaciones.length === 0 ? "Usa «Nueva conversación» para escribir sobre un tema." : undefined}
              />
            ) : (
              <ul className="divide-y">
                {visibles.map((c) => (
                  <ItemConversacion
                    key={c.id}
                    conv={c}
                    lado={lado}
                    sinLeer={noLeidos?.get(c.id) ?? 0}
                    activa={c.id === conversacionId}
                    onClick={() => onSeleccionar(c.id)}
                  />
                ))}
              </ul>
            )}
          </div>
        </aside>

        <section className={cn("min-h-0 min-w-0 flex-col", conversacionId ? "flex" : "hidden md:flex")}>
          {actual ? (
            <Hilo key={actual.id} conv={actual} lado={lado} onVolver={() => onSeleccionar(undefined)} />
          ) : conversacionId && isLoading ? (
            <div className="space-y-3 p-6"><Skeleton className="h-6 w-1/2" /><Skeleton className="h-24 w-full" /></div>
          ) : (
            <EmptyState
              className="flex-1"
              icon={MessagesSquare}
              title={conversacionId ? "No encontramos esta conversación" : "Elige una conversación"}
              description={conversacionId ? undefined : "O empieza una nueva con el botón «Nueva conversación»."}
            />
          )}
        </section>
      </div>
    </Card>
  );
}

function ItemConversacion({
  conv, lado, sinLeer, activa, onClick,
}: {
  conv: ConversacionConIps;
  lado: LadoChat;
  sinLeer: number;
  activa: boolean;
  onClick: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        aria-current={activa ? "true" : undefined}
        className={cn(
          "flex w-full flex-col gap-0.5 px-4 py-3 text-left transition-colors hover:bg-muted focus-visible:bg-muted focus-visible:outline-none",
          activa && "bg-primary-soft/60 hover:bg-primary-soft/60",
        )}
      >
        <span className="flex items-start justify-between gap-2">
          <span className={cn("line-clamp-2 text-sm", sinLeer > 0 ? "font-semibold" : "font-medium")}>{conv.asunto}</span>
          <span className="shrink-0 text-xs text-muted-foreground">{formatTimestamp(conv.ultimo_mensaje_at)}</span>
        </span>
        <span className="flex items-center justify-between gap-2">
          <span className="truncate text-xs text-muted-foreground">
            {lado === "admin" ? conv.ips?.nombre : "Administrador MedCitas"}
          </span>
          <span className="flex shrink-0 items-center gap-1.5">
            {conv.estado === "cerrada" && <StatusPill def={CERRADA} className="px-2 py-0.5" />}
            {sinLeer > 0 && (
              <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-danger px-1.5 text-[11px] font-bold text-white">
                {sinLeer > 99 ? "99+" : sinLeer}
                <span className="sr-only"> sin leer</span>
              </span>
            )}
          </span>
        </span>
      </button>
    </li>
  );
}

function Hilo({ conv, lado, onVolver }: { conv: ConversacionConIps; lado: LadoChat; onVolver: () => void }) {
  const { data: mensajes = [], isLoading, isError, refetch } = useMensajes(conv.id);
  const { mutate: marcarLeida } = useMarcarConversacionLeida();
  const cambiarEstado = useCambiarEstadoConversacion();
  const enviar = useEnviarMensaje();
  const [texto, setTexto] = useState("");
  const [enlace, setEnlace] = useState<Enlace | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const esMio = (m: MensajeConEnlace) => m.de_admin === (lado === "admin");
  const pendientes = mensajes.some((m) => !esMio(m) && !m.leido_at);
  const abierta = conv.estado === "abierta";

  // Marca como leída mientras la conversación está en pantalla y la pestaña visible.
  useEffect(() => {
    if (!pendientes) return;
    const marcarSiVisible = () => {
      if (document.visibilityState === "visible") marcarLeida(conv.id);
    };
    marcarSiVisible();
    document.addEventListener("visibilitychange", marcarSiVisible);
    return () => document.removeEventListener("visibilitychange", marcarSiVisible);
  }, [pendientes, conv.id, marcarLeida]);

  // Baja al último mensaje al abrir y cuando llega uno nuevo.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [mensajes.length]);

  const mandar = () => {
    if (!texto.trim() || enviar.isPending) return;
    enviar.mutate(
      { conversacionId: conv.id, cuerpo: texto, enlace },
      {
        onSuccess: () => { setTexto(""); setEnlace(null); },
        onError: (err) => toast.error(err.message),
      },
    );
  };

  const alternarEstado = () =>
    cambiarEstado.mutate(
      { conversacionId: conv.id, estado: abierta ? "cerrada" : "abierta" },
      {
        onSuccess: () => toast.success(abierta ? "Conversación cerrada" : "Conversación reabierta"),
        onError: (err) => toast.error(err.message),
      },
    );

  let diaAnterior = "";

  return (
    <>
      <header className="flex items-center gap-2 border-b px-3 py-3 md:px-5">
        <Button variant="ghost" size="icon-sm" className="md:hidden" onClick={onVolver} aria-label="Volver a las conversaciones">
          <ArrowLeft />
        </Button>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-base font-semibold">{conv.asunto}</h2>
          <p className="truncate text-xs text-muted-foreground">
            {lado === "admin" ? conv.ips?.nombre : "Administrador MedCitas"}
            {!abierta && " · Cerrada"}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={alternarEstado} disabled={cambiarEstado.isPending}>
          {abierta ? <><Lock /> Cerrar tema</> : <><LockOpen /> Reabrir</>}
        </Button>
      </header>

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto bg-surface px-3 py-4 md:px-5" aria-live="polite">
        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-14 w-2/3" />
            <Skeleton className="ml-auto h-14 w-1/2" />
          </div>
        ) : isError ? (
          <ErrorState onRetry={() => refetch()} />
        ) : (
          <ol className="space-y-2">
            {mensajes.map((m) => {
              const dia = diaLocal(m.created_at);
              const nuevoDia = dia !== diaAnterior;
              diaAnterior = dia;
              const mio = esMio(m);
              return (
                <li key={m.id}>
                  {nuevoDia && (
                    <div className="my-3 flex justify-center">
                      <span className="rounded-full bg-muted px-3 py-0.5 text-xs font-medium text-muted-foreground">{etiquetaDia(dia)}</span>
                    </div>
                  )}
                  <div className={cn("flex", mio ? "justify-end" : "justify-start")}>
                    <div
                      className={cn(
                        "max-w-[85%] rounded-2xl px-3.5 py-2 text-sm shadow-xs md:max-w-[70%]",
                        mio ? "rounded-br-md bg-primary text-primary-foreground" : "rounded-bl-md border bg-card text-foreground",
                      )}
                    >
                      <span className="sr-only">{mio ? "Tú: " : lado === "admin" ? `${conv.ips?.nombre ?? "IPS"}: ` : "Administrador: "}</span>
                      <EnlaceTarjeta cita={m.appointment} resultado={m.resultado} className="mb-2" />
                      <p className="whitespace-pre-wrap break-words">{m.cuerpo}</p>
                      <div className={cn("mt-1 flex items-center justify-end gap-1 text-[11px]", mio ? "text-primary-foreground/80" : "text-muted-foreground")}>
                        <time dateTime={m.created_at}>{horaLocal(m.created_at)}</time>
                        {mio && (m.leido_at ? (
                          <span title={`Leído ${formatTimestamp(m.leido_at).toLowerCase()}`} className="inline-flex">
                            <CheckCheck className="size-3.5" aria-hidden />
                            <span className="sr-only">Leído</span>
                          </span>
                        ) : (
                          <span title="Enviado" className="inline-flex">
                            <Check className="size-3.5" aria-hidden />
                            <span className="sr-only">Enviado, sin leer</span>
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </div>

      {abierta ? (
        <form
          className="space-y-2 border-t p-3 md:px-5"
          onSubmit={(e) => { e.preventDefault(); mandar(); }}
        >
          {enlace && (
            <EnlaceTarjeta
              cita={enlace.tipo === "cita" ? enlace.cita : null}
              resultado={enlace.tipo === "resultado" ? enlace.resultado : null}
              onQuitar={() => setEnlace(null)}
              className="max-w-md"
            />
          )}
          <Textarea
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={(e) => {
              // Enter envía; Shift+Enter hace un salto de línea.
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                mandar();
              }
            }}
            rows={2}
            maxLength={4000}
            placeholder="Escribe un mensaje…"
            aria-label="Mensaje"
            aria-describedby={`aviso-${conv.id}`}
            className="min-h-[3.5rem] resize-none"
          />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <EnlaceSelector ipsId={conv.ips_id} onChange={setEnlace} disabled={!!enlace} />
            <p id={`aviso-${conv.id}`} className="order-last w-full text-xs text-muted-foreground sm:order-none sm:w-auto sm:flex-1">
              {AVISO_DATOS}
            </p>
            <Button type="submit" disabled={!texto.trim() || enviar.isPending}>
              {enviar.isPending ? <Loader2 className="animate-spin" /> : <SendHorizontal />} Enviar
            </Button>
          </div>
        </form>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-2 border-t bg-muted/50 px-4 py-3 text-sm text-muted-foreground md:px-5">
          <span className="inline-flex items-center gap-2"><Lock className="size-4" aria-hidden /> Esta conversación está cerrada.</span>
          <Button variant="outline" size="sm" onClick={alternarEstado} disabled={cambiarEstado.isPending}>
            <LockOpen /> Reabrir para escribir
          </Button>
        </div>
      )}
    </>
  );
}
