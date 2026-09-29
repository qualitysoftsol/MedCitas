import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  CalendarPlus, CalendarDays, FileText, UserRound, CalendarClock, FileCheck2, ArrowRight, Clock, MapPin,
  Building2, Eye, Navigation, BellRing, Hourglass, Info, CalendarCheck, FileX2, Stethoscope,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useAppointments, type AppointmentWithNames } from "@/lib/hooks/useAppointments";
import { useResultados } from "@/lib/hooks/useResultados";
import { useNotifications } from "@/lib/hooks/useNotifications";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { StatCard, toneClasses } from "@/components/app/StatCard";
import { AppointmentStatusBadge } from "@/components/app/StatusBadge";
import { EmptyState } from "@/components/app/EmptyState";
import {
  AppointmentDetailDialog, CancelAppointmentDialog, ubicacionUrl,
} from "@/components/app/AppointmentDialogs";
import { construirResultados, proximaCita } from "@/lib/resultados";
import {
  capitalizar, diasHasta, fechaPartes, formatFecha, formatFechaCorta, formatHora, formatTimestamp, primerNombre, relativoDias,
} from "@/lib/format";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/app/particular/")({
  component: ParticularInicio,
});

const ACCESOS = [
  { to: "/app/particular/solicitar", title: "Solicitar cita", desc: "Agenda un examen en pocos pasos", icon: CalendarPlus, tone: "primary" as const },
  { to: "/app/particular/citas", title: "Mis citas", desc: "Consulta y gestiona tus citas", icon: CalendarDays, tone: "success" as const },
  { to: "/app/particular/resultados", title: "Mis resultados", desc: "Revisa y descarga tus exámenes", icon: FileText, tone: "info" as const },
  { to: "/app/perfil", title: "Mi perfil", desc: "Actualiza tus datos personales", icon: UserRound, tone: "neutral" as const },
];

function ParticularInicio() {
  const { profile } = useAuth();
  const citasQ = useAppointments(profile?.id, profile?.role);
  const resultadosQ = useResultados(profile?.id, profile?.role);
  const { data: notificaciones = [], isLoading: notifLoading } = useNotifications(profile?.id);
  const [detalle, setDetalle] = useState<AppointmentWithNames | null>(null);
  const [cancelar, setCancelar] = useState<AppointmentWithNames | null>(null);

  const citas = useMemo(() => citasQ.data ?? [], [citasQ.data]);
  const resultados = useMemo(() => resultadosQ.data ?? [], [resultadosQ.data]);
  const proxima = useMemo(() => proximaCita(citas), [citas]);
  const items = useMemo(() => construirResultados(resultados, citas), [resultados, citas]);
  const enProceso = items.filter((i) => i.estado === "procesamiento").length;
  const loading = citasQ.isLoading || resultadosQ.isLoading;

  // Avisos derivados de los datos: no requieren backend adicional.
  const avisos: { icon: React.ComponentType<{ className?: string }>; tone: keyof typeof toneClasses; title: string; text: string }[] = [];
  if (proxima && diasHasta(proxima.fecha) <= 1) {
    avisos.push({
      icon: BellRing,
      tone: "warning",
      title: diasHasta(proxima.fecha) === 0 ? "Tu cita es hoy" : "Tu cita es mañana",
      text: `A las ${formatHora(proxima.hora)} en ${proxima.ips?.nombre ?? "la IPS"}. Llega 15 minutos antes con tu documento.`,
    });
  }
  if (enProceso > 0) {
    avisos.push({
      icon: Hourglass,
      tone: "info",
      title: enProceso === 1 ? "1 resultado en procesamiento" : `${enProceso} resultados en procesamiento`,
      text: "La IPS está preparando tus resultados. Te avisaremos cuando estén disponibles.",
    });
  }

  return (
    <div className="space-y-6 lg:space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">
            Hola, {primerNombre(profile?.nombre)} <span aria-hidden>👋</span>
          </h1>
          <p className="mt-1 text-muted-foreground md:text-[15px]">Aquí puedes consultar y gestionar tus citas y resultados.</p>
        </div>
        <Link to="/app/particular/solicitar" className={buttonVariants({ size: "lg" })}>
          <CalendarPlus /> Solicitar cita
        </Link>
      </div>

      <section aria-label="Resumen" className="grid gap-3 sm:grid-cols-3 md:gap-4">
        <StatCard
          label="Próxima cita"
          icon={CalendarClock}
          tone="primary"
          loading={loading}
          value={proxima ? <span className="text-lg">{formatFechaCorta(proxima.fecha)}</span> : <span className="text-lg">Sin citas</span>}
          hint={proxima ? `${relativoDias(proxima.fecha)} · ${formatHora(proxima.hora)}` : "Agenda tu próximo examen"}
        />
        <StatCard label="Total de citas" icon={CalendarDays} tone="success" loading={loading} value={citas.length}
          hint={`${citas.filter((c) => c.estado === "agendada").length} agendadas`} />
        <StatCard label="Resultados disponibles" icon={FileCheck2} tone="info" loading={loading} value={resultados.length}
          hint={enProceso > 0 ? `${enProceso} en procesamiento` : undefined} />
      </section>

      <div className="grid gap-6 lg:grid-cols-12">
        <div className="space-y-6 lg:col-span-8">
          <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0 pb-4">
              <CardTitle className="flex items-center gap-2 text-lg">
                <CalendarCheck className="size-5 text-accent-foreground" aria-hidden /> Próxima cita
              </CardTitle>
              {citas.length > 0 && (
                <Link to="/app/particular/citas" className="inline-flex items-center gap-1 text-sm font-semibold text-accent-foreground hover:underline">
                  Ver todas <ArrowRight className="size-4" aria-hidden />
                </Link>
              )}
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="flex gap-4"><Skeleton className="h-24 w-20" /><div className="flex-1 space-y-2"><Skeleton className="h-5 w-1/2" /><Skeleton className="h-4 w-2/3" /><Skeleton className="h-4 w-1/3" /></div></div>
              ) : citasQ.isError ? (
                <p role="alert" className="text-sm text-danger-foreground">No pudimos cargar tus citas. Recarga la página para intentarlo de nuevo.</p>
              ) : proxima ? (
                <ProximaCita cita={proxima} onDetalle={() => setDetalle(proxima)} />
              ) : (
                <EmptyState
                  compact
                  icon={CalendarDays}
                  title="No tienes citas próximas"
                  description="Solicita una cita y aparecerá aquí con todos sus detalles."
                  action={<Link to="/app/particular/solicitar" className={buttonVariants()}><CalendarPlus /> Solicitar cita</Link>}
                />
              )}
            </CardContent>
          </Card>

          <section aria-labelledby="accesos-rapidos">
            <h2 id="accesos-rapidos" className="mb-3 text-lg font-semibold">Accesos rápidos</h2>
            <div className="grid grid-cols-2 gap-3 md:gap-4 xl:grid-cols-4">
              {ACCESOS.map((a) => (
                <Link
                  key={a.to}
                  to={a.to}
                  className="group flex flex-col gap-3 rounded-xl border bg-card p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:p-5"
                >
                  <span className={cn("flex size-11 items-center justify-center rounded-xl", toneClasses[a.tone])}>
                    <a.icon className="size-5" aria-hidden />
                  </span>
                  <span>
                    <span className="flex items-center justify-between gap-1 font-semibold">
                      {a.title}
                      <ArrowRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-accent-foreground" aria-hidden />
                    </span>
                    <span className="mt-0.5 hidden text-sm text-muted-foreground sm:block">{a.desc}</span>
                  </span>
                </Link>
              ))}
            </div>
          </section>
        </div>

        <aside className="space-y-6 lg:col-span-4" aria-label="Novedades">
          {avisos.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-lg"><Info className="size-5 text-accent-foreground" aria-hidden /> Información importante</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {avisos.map((a) => (
                  <div key={a.title} className={cn("flex gap-3 rounded-lg p-3", toneClasses[a.tone])}>
                    <a.icon className="mt-0.5 size-5 shrink-0" aria-hidden />
                    <div>
                      <p className="text-sm font-semibold">{a.title}</p>
                      <p className="mt-0.5 text-[13px] text-foreground/80">{a.text}</p>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-lg"><BellRing className="size-5 text-accent-foreground" aria-hidden /> Notificaciones recientes</CardTitle>
            </CardHeader>
            <CardContent>
              {notifLoading ? (
                <div className="space-y-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
              ) : notificaciones.length === 0 ? (
                <p className="py-4 text-center text-sm text-muted-foreground">No tienes notificaciones por ahora.</p>
              ) : (
                <ul className="space-y-1">
                  {notificaciones.slice(0, 4).map((n) => {
                    const Icon = n.tipo === "resultado_cargado" ? FileCheck2 : n.tipo === "cita_cancelada" ? FileX2 : CalendarCheck;
                    return (
                      <li key={n.id} className={cn("flex gap-3 rounded-lg p-2.5", !n.read && "bg-primary-soft/60")}>
                        <Icon className={cn("mt-0.5 size-4 shrink-0", n.read ? "text-muted-foreground" : "text-accent-foreground")} aria-hidden />
                        <div className="min-w-0">
                          <p className={cn("text-sm", n.read ? "font-medium" : "font-semibold")}>
                            {n.titulo}
                            {!n.read && <span className="sr-only"> (sin leer)</span>}
                          </p>
                          <p className="truncate text-[13px] text-muted-foreground">{n.mensaje}</p>
                          <p className="mt-0.5 text-xs text-muted-foreground">{formatTimestamp(n.created_at)}</p>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>
        </aside>
      </div>

      <AppointmentDetailDialog
        appointment={detalle}
        onOpenChange={(o) => !o && setDetalle(null)}
        onRequestCancel={(a) => { setDetalle(null); setCancelar(a); }}
      />
      <CancelAppointmentDialog appointment={cancelar} onOpenChange={(o) => !o && setCancelar(null)} />
    </div>
  );
}

function ProximaCita({ cita, onDetalle }: { cita: AppointmentWithNames; onDetalle: () => void }) {
  const p = fechaPartes(cita.fecha);
  const mapa = ubicacionUrl(cita.ips, cita.ciudad);
  return (
    <div className="flex flex-col gap-5 sm:flex-row">
      <div className="flex w-full shrink-0 items-center gap-4 rounded-xl bg-primary p-4 text-primary-foreground sm:w-28 sm:flex-col sm:justify-center sm:gap-0 sm:p-3" aria-hidden>
        <span className="text-sm font-semibold uppercase opacity-90">{p.mes}</span>
        <span className="text-4xl font-bold leading-none">{p.dia}</span>
        <span className="text-sm opacity-90">{p.semana}</span>
        <span className="ml-auto rounded-full bg-white/20 px-2 py-0.5 text-xs font-semibold sm:ml-0 sm:mt-2">{relativoDias(cita.fecha)}</span>
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-lg font-semibold">Examen de {cita.tipo_examen.toLowerCase()}</h3>
          <AppointmentStatusBadge estado={cita.estado} />
        </div>
        <dl className="mt-3 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
          <div className="flex items-center gap-2"><CalendarDays className="size-4 text-muted-foreground" aria-hidden /><dt className="sr-only">Fecha</dt><dd>{capitalizar(formatFecha(cita.fecha))}</dd></div>
          <div className="flex items-center gap-2"><Clock className="size-4 text-muted-foreground" aria-hidden /><dt className="sr-only">Hora</dt><dd>{formatHora(cita.hora)}</dd></div>
          <div className="flex items-center gap-2"><Stethoscope className="size-4 text-muted-foreground" aria-hidden /><dt className="sr-only">Servicio</dt><dd>{cita.servicio}</dd></div>
          <div className="flex items-center gap-2"><MapPin className="size-4 text-muted-foreground" aria-hidden /><dt className="sr-only">Ciudad</dt><dd>{cita.ciudad}</dd></div>
          <div className="flex items-start gap-2 sm:col-span-2"><Building2 className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden /><dt className="sr-only">IPS</dt><dd className="font-medium">{cita.ips?.nombre ?? "—"}</dd></div>
        </dl>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button onClick={onDetalle}><Eye /> Ver detalles</Button>
          {mapa && (
            <a href={mapa} target="_blank" rel="noopener noreferrer" className={buttonVariants({ variant: "outline" })}>
              <Navigation /> Ver ubicación<span className="sr-only"> (se abre en una pestaña nueva)</span>
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
