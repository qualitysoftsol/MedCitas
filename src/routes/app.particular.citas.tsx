import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  CalendarDays, CalendarCheck, CheckCircle2, XCircle, Plus, Search, Eye, ChevronLeft, ChevronRight, MapPin, Clock, SearchX, Wallet,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useAppointments, type AppointmentWithNames } from "@/lib/hooks/useAppointments";
import { useValoresCitas } from "@/lib/hooks/usePrecios";
import { usePagosDeCitas } from "@/lib/hooks/usePagos";
import { Card } from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/app/PageHeader";
import { StatCard } from "@/components/app/StatCard";
import { AppointmentStatusBadge } from "@/components/app/StatusBadge";
import { EmptyState, ErrorState } from "@/components/app/EmptyState";
import { AppointmentDetailDialog, CancelAppointmentDialog, PagarReservaButton, puedeCancelar } from "@/components/app/AppointmentDialogs";
import { capitalizar, diasHasta, fechaPartes, formatFecha, formatHora, formatPesos, formatValor } from "@/lib/format";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/app/particular/citas")({
  component: ParticularCitas,
});

type Filtro = "todas" | "pendiente_pago" | "agendada" | "atendida" | "cancelada";
const PAGE_SIZE = 8;

const FILTROS: { id: Filtro; label: string }[] = [
  { id: "todas", label: "Todas" },
  { id: "pendiente_pago", label: "Por pagar" },
  { id: "agendada", label: "Agendadas" },
  { id: "atendida", label: "Atendidas" },
  { id: "cancelada", label: "Canceladas" },
];

/** Reservas por pagar y próximas citas primero (la más cercana arriba); el resto, de la más reciente a la más antigua. */
function ordenar(list: AppointmentWithNames[]) {
  const key = (a: AppointmentWithNames) => `${a.fecha}T${a.hora}`;
  const proximas = list
    .filter((a) => a.estado === "pendiente_pago" || (a.estado === "agendada" && diasHasta(a.fecha) >= 0))
    .sort((x, y) => key(x).localeCompare(key(y)));
  const resto = list.filter((a) => !proximas.includes(a)).sort((x, y) => key(y).localeCompare(key(x)));
  return [...proximas, ...resto];
}

function ParticularCitas() {
  const { profile } = useAuth();
  const { data: citas = [], isLoading, isError, refetch } = useAppointments(profile?.id, profile?.role);
  const { data: valores } = useValoresCitas(!!profile);
  const [filtro, setFiltro] = useState<Filtro>("todas");
  const [busqueda, setBusqueda] = useState("");
  const [page, setPage] = useState(1);
  const [detalle, setDetalle] = useState<AppointmentWithNames | null>(null);
  const [cancelar, setCancelar] = useState<AppointmentWithNames | null>(null);

  const { data: pagos } = usePagosDeCitas(!!profile);

  const conteo = useMemo(() => ({
    todas: citas.length,
    pendiente_pago: citas.filter((a) => a.estado === "pendiente_pago").length,
    agendada: citas.filter((a) => a.estado === "agendada").length,
    atendida: citas.filter((a) => a.estado === "atendida").length,
    cancelada: citas.filter((a) => a.estado === "cancelada").length,
  }), [citas]);

  const filtradas = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return ordenar(citas).filter((a) => {
      if (filtro !== "todas" && a.estado !== filtro) return false;
      if (!q) return true;
      return [a.ips?.nombre, a.tipo_examen, a.servicio, a.ciudad, formatFecha(a.fecha)]
        .some((v) => v?.toLowerCase().includes(q));
    });
  }, [citas, filtro, busqueda]);

  const totalPages = Math.max(1, Math.ceil(filtradas.length / PAGE_SIZE));
  const current = Math.min(page, totalPages);
  const visibles = filtradas.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);

  // Acción secundaria de cada cita: cancelar (hasta 12 h antes) o pagar la reserva pendiente.
  const accion = (a: AppointmentWithNames) =>
    puedeCancelar(a) ? (
      <Button size="sm" variant="destructive-outline" onClick={() => setCancelar(a)}>Cancelar</Button>
    ) : a.estado === "pendiente_pago" ? (
      <PagarReservaButton appointmentId={a.id} monto={pagos?.get(a.id)?.monto} />
    ) : null;

  const cambiarFiltro = (f: Filtro) => { setFiltro(f); setPage(1); };
  const limpiar = () => { setFiltro("todas"); setBusqueda(""); setPage(1); };

  const nuevaCita = (
    <Link to="/app/particular/solicitar" className={buttonVariants()}>
      <Plus /> Nueva cita
    </Link>
  );

  return (
    <div className="space-y-6">
      <PageHeader
        icon={CalendarDays}
        title="Mis citas"
        description="Consulta, administra y gestiona tus citas médicas."
        actions={nuevaCita}
      />

      <section aria-label="Resumen de citas" className="grid grid-cols-2 gap-3 md:gap-4 xl:grid-cols-4">
        <StatCard label="Total" value={conteo.todas} icon={CalendarDays} tone="primary" loading={isLoading} />
        <StatCard label="Agendadas" value={conteo.agendada} icon={CalendarCheck} tone="success" loading={isLoading} />
        <StatCard label="Atendidas" value={conteo.atendida} icon={CheckCircle2} tone="info" loading={isLoading} />
        <StatCard label="Canceladas" value={conteo.cancelada} icon={XCircle} tone="danger" loading={isLoading} />
      </section>

      <Card className="overflow-hidden">
        <div className="flex flex-col gap-3 border-b p-4 md:p-5 lg:flex-row lg:items-center lg:justify-between">
          <div role="group" aria-label="Filtrar por estado" className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1 lg:pb-0">
            {FILTROS.filter((f) => f.id !== "pendiente_pago" || conteo.pendiente_pago > 0 || filtro === f.id).map((f) => (
              <button
                key={f.id}
                aria-pressed={filtro === f.id}
                onClick={() => cambiarFiltro(f.id)}
                className={cn(
                  "inline-flex h-9 shrink-0 items-center gap-2 rounded-full border px-3.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  filtro === f.id
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-card text-foreground hover:border-primary/40 hover:bg-muted",
                )}
              >
                {f.label}
                <span className={cn("rounded-full px-1.5 text-xs tabular-nums", filtro === f.id ? "bg-white/20" : "bg-muted text-muted-foreground")}>
                  {conteo[f.id]}
                </span>
              </button>
            ))}
          </div>
          <div className="relative w-full lg:max-w-xs">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <label htmlFor="buscar-citas" className="sr-only">Buscar citas</label>
            <Input
              id="buscar-citas"
              type="search"
              placeholder="Buscar por IPS, examen o fecha"
              value={busqueda}
              onChange={(e) => { setBusqueda(e.target.value); setPage(1); }}
              className="pl-9"
            />
          </div>
        </div>

        {isLoading ? (
          <ListSkeleton />
        ) : isError ? (
          <ErrorState title="No pudimos cargar tus citas" onRetry={() => refetch()} />
        ) : citas.length === 0 ? (
          <EmptyState
            icon={CalendarDays}
            title="No tienes citas agendadas"
            description="Solicita una nueva cita para comenzar. Te guiaremos paso a paso."
            action={<Link to="/app/particular/solicitar" className={buttonVariants()}><Plus /> Solicitar cita</Link>}
          />
        ) : filtradas.length === 0 ? (
          <EmptyState
            compact
            icon={SearchX}
            title="No encontramos citas con esos filtros"
            description="Prueba con otra búsqueda o muestra todas tus citas."
            action={<Button variant="outline" onClick={limpiar}>Limpiar filtros</Button>}
          />
        ) : (
          <>
            {/* Escritorio y tablet: tabla */}
            <div className="hidden md:block">
              <Table>
                <TableHeader>
                  <TableRow className="bg-surface hover:bg-surface">
                    <TableHead className="pl-5">Fecha</TableHead>
                    <TableHead>Hora</TableHead>
                    <TableHead>Examen / Servicio</TableHead>
                    <TableHead>IPS</TableHead>
                    <TableHead className="text-right">Valor</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead className="pr-5 text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visibles.map((a) => (
                    <TableRow key={a.id} className="group">
                      <TableCell className="pl-5 font-medium">{formatFecha(a.fecha)}</TableCell>
                      <TableCell className="whitespace-nowrap tabular-nums">{formatHora(a.hora)}</TableCell>
                      <TableCell>
                        <div className="font-medium">{capitalizar(a.tipo_examen)}</div>
                        <div className="text-xs text-muted-foreground">{a.servicio}</div>
                      </TableCell>
                      <TableCell className="max-w-[18rem]">
                        <div className="truncate font-medium" title={a.ips?.nombre}>{a.ips?.nombre ?? "—"}</div>
                        <div className="text-xs text-muted-foreground">{a.ciudad}</div>
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-right tabular-nums">{formatValor(valores?.get(a.id))}</TableCell>
                      <TableCell><AppointmentStatusBadge estado={a.estado} /></TableCell>
                      <TableCell className="pr-5">
                        <div className="flex justify-end gap-2">
                          <Button size="sm" variant="outline" onClick={() => setDetalle(a)}>
                            <Eye /> Ver detalles
                          </Button>
                          {accion(a)}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {/* Móvil: tarjetas */}
            <ul className="divide-y md:hidden">
              {visibles.map((a) => {
                const p = fechaPartes(a.fecha);
                const valor = valores?.get(a.id);
                return (
                  <li key={a.id} className="p-4">
                    <div className="flex gap-3">
                      <div className="flex w-14 shrink-0 flex-col items-center justify-center rounded-xl border bg-surface py-2" aria-hidden>
                        <span className="text-[11px] font-semibold text-accent-foreground">{p.mes}</span>
                        <span className="text-xl font-bold leading-none">{p.dia}</span>
                        <span className="text-[11px] text-muted-foreground">{p.semana}</span>
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <p className="font-semibold">{capitalizar(a.tipo_examen)}</p>
                          <AppointmentStatusBadge estado={a.estado} />
                        </div>
                        <p className="sr-only">{formatFecha(a.fecha)}</p>
                        <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
                          <Clock className="size-3.5" aria-hidden /> {formatHora(a.hora)} · {a.servicio}
                        </p>
                        <p className="mt-0.5 flex items-start gap-1.5 text-sm text-muted-foreground">
                          <MapPin className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                          <span className="min-w-0">{a.ips?.nombre ?? "—"} · {a.ciudad}</span>
                        </p>
                        {valor != null && (
                          <p className="mt-0.5 flex items-center gap-1.5 text-sm font-semibold tabular-nums">
                            <Wallet className="size-3.5 text-muted-foreground" aria-hidden /> {formatPesos(valor)}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <Button variant="outline" size="sm" onClick={() => setDetalle(a)} className={cn(!accion(a) && "col-span-2")}>
                        <Eye /> Ver detalles
                      </Button>
                      {accion(a)}
                    </div>
                  </li>
                );
              })}
            </ul>

            <div className="flex flex-col items-center justify-between gap-3 border-t px-4 py-3 text-sm text-muted-foreground sm:flex-row md:px-5">
              <p aria-live="polite">
                Mostrando {(current - 1) * PAGE_SIZE + 1}–{Math.min(current * PAGE_SIZE, filtradas.length)} de {filtradas.length}{" "}
                {filtradas.length === 1 ? "cita" : "citas"}
              </p>
              {totalPages > 1 && (
                <nav aria-label="Paginación" className="flex items-center gap-1">
                  <Button variant="outline" size="icon-sm" disabled={current === 1} onClick={() => setPage(current - 1)} aria-label="Página anterior">
                    <ChevronLeft />
                  </Button>
                  {Array.from({ length: totalPages }, (_, i) => i + 1).map((n) => (
                    <Button
                      key={n}
                      size="icon-sm"
                      variant={n === current ? "default" : "ghost"}
                      onClick={() => setPage(n)}
                      aria-label={`Página ${n}`}
                      aria-current={n === current ? "page" : undefined}
                    >
                      {n}
                    </Button>
                  ))}
                  <Button variant="outline" size="icon-sm" disabled={current === totalPages} onClick={() => setPage(current + 1)} aria-label="Página siguiente">
                    <ChevronRight />
                  </Button>
                </nav>
              )}
            </div>
          </>
        )}
      </Card>

      <AppointmentDetailDialog
        appointment={detalle}
        onOpenChange={(o) => !o && setDetalle(null)}
        onRequestCancel={(a) => { setDetalle(null); setCancelar(a); }}
      />
      <CancelAppointmentDialog appointment={cancelar} onOpenChange={(o) => !o && setCancelar(null)} />
    </div>
  );
}

function ListSkeleton() {
  return (
    <div className="space-y-4 p-5" role="status" aria-label="Cargando citas">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="flex items-center gap-4">
          <Skeleton className="h-10 w-28" />
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-4 flex-1" />
          <Skeleton className="h-6 w-24 rounded-full" />
        </div>
      ))}
    </div>
  );
}
