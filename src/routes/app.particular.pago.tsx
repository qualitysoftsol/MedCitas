import { createFileRoute, Link } from "@tanstack/react-router";
import { useRef } from "react";
import { CalendarClock, CalendarPlus, CreditCard, Loader2, Navigation, RotateCcw, TimerOff, XCircle, Clock, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import { SuccessCard } from "@/components/solicitar/WizardParts";
import { usePago, useIniciarPago, type PagoConCita } from "@/lib/hooks/usePagos";
import { capitalizar, formatFecha, formatHora, formatPesos } from "@/lib/format";
import { cn } from "@/lib/utils";

// Página de retorno de Rapyd. Solo muestra el estado: la cita la confirma el
// webhook (rapyd-webhook), así que se consulta hasta que el pago se resuelve.
export const Route = createFileRoute("/app/particular/pago")({
  validateSearch: (s: Record<string, unknown>) => ({
    pago: typeof s.pago === "string" ? s.pago : undefined,
    cancelado: s.cancelado === 1 || s.cancelado === "1" ? true : undefined,
  }),
  component: ResultadoPago,
});

/** Hora local en que vence la reserva: "3:45 p. m." */
const horaVence = (iso: string) => {
  const d = new Date(iso);
  return formatHora(`${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`);
};

function ResultadoPago() {
  const { pago: pagoId, cancelado } = Route.useSearch();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const { data: pago, isLoading, isError } = usePago(pagoId);
  const reintentar = useIniciarPago();

  const pagarDeNuevo = (p: PagoConCita) =>
    reintentar.mutate(
      { appointment_id: p.appointment_id },
      { onSuccess: ({ redirect_url }) => window.location.assign(redirect_url), onError: (err) => toast.error(err.message) },
    );

  if (!pagoId || isError || (!isLoading && !pago)) {
    return (
      <Estado icon={AlertTriangle} tone="warning" titulo="No encontramos este pago" texto="Revisa el estado de tus citas o agenda una nueva.">
        <Link to="/app/particular/citas" className={buttonVariants({ size: "lg" })}><CalendarClock /> Ver mis citas</Link>
      </Estado>
    );
  }
  if (isLoading || !pago) {
    return <Estado icon={Loader2} tone="info" girar titulo="Consultando tu pago…" texto="Esto toma unos segundos." />;
  }

  const cita = pago.cita;

  if (cita?.estado === "agendada" || cita?.estado === "atendida") {
    const mapa = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${cita.ips?.nombre ?? ""}, ${cita.ips?.direccion ?? ""}, Colombia`)}`;
    return (
      <SuccessCard headingRef={headingRef} title="¡Pago aprobado, tu cita quedó agendada!" subtitle="Te enviamos una notificación con los detalles.">
        <dl className="space-y-3 rounded-xl border p-4 text-sm">
          <Fila label="Examen">Examen de {cita.tipo_examen.toLowerCase()} · {cita.servicio}</Fila>
          <Fila label="Fecha">{capitalizar(formatFecha(cita.fecha))}</Fila>
          <Fila label="Hora">{formatHora(cita.hora)}</Fila>
          <Fila label="IPS">{cita.ips?.nombre ?? "—"}</Fila>
          <div className="flex justify-between gap-4 border-t pt-3">
            <dt className="font-semibold">Valor pagado</dt>
            <dd className="text-right text-base font-bold tabular-nums">{formatPesos(pago.monto)}</dd>
          </div>
        </dl>
        <div className="grid gap-2 sm:grid-cols-2">
          <Link to="/app/particular/citas" className={buttonVariants({ size: "lg" })}><CalendarClock /> Ver mis citas</Link>
          <a href={mapa} target="_blank" rel="noopener noreferrer" className={buttonVariants({ variant: "outline", size: "lg" })}>
            <Navigation /> Ver ubicación<span className="sr-only"> (pestaña nueva)</span>
          </a>
        </div>
      </SuccessCard>
    );
  }

  if (pago.estado === "aprobado") {
    // Pagó después de vencer la reserva y el horario ya lo había tomado otra persona.
    return (
      <Estado icon={AlertTriangle} tone="warning" titulo="Recibimos tu pago, pero el horario ya no estaba disponible" texto={`Tu reserva venció antes de que se aprobara el pago. Te devolveremos ${formatPesos(pago.monto)} y puedes agendar otro horario.`}>
        <Link to="/app/particular/solicitar" className={buttonVariants({ size: "lg" })}><CalendarPlus /> Elegir otro horario</Link>
      </Estado>
    );
  }

  if (pago.estado === "expirado" || cita?.estado !== "pendiente_pago") {
    return (
      <Estado icon={TimerOff} tone="neutral" titulo="La reserva venció" texto="Pasaron más de 30 minutos sin confirmar el pago y el horario quedó libre. No se hizo ningún cobro.">
        <Link to="/app/particular/solicitar" className={buttonVariants({ size: "lg" })}><CalendarPlus /> Elegir otro horario</Link>
      </Estado>
    );
  }

  // Sigue pendiente: rechazado, cancelado por el usuario o esperando al banco.
  const vence = `Tu horario sigue apartado hasta las ${horaVence(pago.expira_at)}.`;
  const accionReintentar = (
    <Button size="lg" onClick={() => pagarDeNuevo(pago)} disabled={reintentar.isPending}>
      {reintentar.isPending ? <><Loader2 className="animate-spin" /> Conectando…</> : <><RotateCcw /> Intentar de nuevo · {formatPesos(pago.monto)}</>}
    </Button>
  );

  if (pago.estado === "rechazado") {
    return (
      <Estado icon={XCircle} tone="danger" titulo="El pago fue rechazado" texto={`${pago.detalle ? `${pago.detalle}. ` : ""}${vence}`}>
        {accionReintentar}
      </Estado>
    );
  }
  if (cancelado) {
    return (
      <Estado icon={CreditCard} tone="warning" titulo="No completaste el pago" texto={vence}>
        {accionReintentar}
      </Estado>
    );
  }
  return (
    <Estado icon={Clock} tone="info" titulo="Esperando la confirmación del pago" texto={`Algunos medios de pago tardan unos minutos en confirmarse. Esta página se actualiza sola. ${vence}`}>
      <Link to="/app/particular/citas" className={buttonVariants({ variant: "outline", size: "lg" })}><CalendarClock /> Ver mis citas</Link>
      {accionReintentar}
    </Estado>
  );
}

function Fila({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right font-medium">{children}</dd>
    </div>
  );
}

const TONOS = {
  info: "bg-info-soft text-info-foreground",
  warning: "bg-warning-soft text-warning-foreground",
  danger: "bg-danger-soft text-danger-foreground",
  neutral: "bg-muted text-muted-foreground",
} as const;

function Estado({
  icon: Icon, tone, titulo, texto, girar, children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  tone: keyof typeof TONOS;
  titulo: string;
  texto: string;
  girar?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div className="mx-auto max-w-xl py-6">
      <Card className="text-center">
        <CardContent className="space-y-4 px-6 py-8">
          <div className={cn("mx-auto flex size-16 items-center justify-center rounded-full", TONOS[tone])}>
            <Icon className={cn("size-8", girar && "animate-spin")} aria-hidden />
          </div>
          <div role="status" aria-live="polite">
            <h1 className="text-2xl font-bold">{titulo}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{texto}</p>
          </div>
          {children && <div className="flex flex-col justify-center gap-2 pt-2 sm:flex-row">{children}</div>}
        </CardContent>
      </Card>
    </div>
  );
}
