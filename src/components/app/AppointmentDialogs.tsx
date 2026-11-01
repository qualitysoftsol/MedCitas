import { CalendarDays, Clock, Stethoscope, Building2, MapPin, Phone, ClipboardList, Navigation, XCircle, Loader2, Wallet, CreditCard } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button, buttonVariants } from "@/components/ui/button";
import { AppointmentStatusBadge } from "./StatusBadge";
import { useCancelAppointment, type AppointmentWithNames, type AppointmentIps } from "@/lib/hooks/useAppointments";
import { useValoresCitas } from "@/lib/hooks/usePrecios";
import { useIniciarPago, usePagosDeCitas } from "@/lib/hooks/usePagos";
import type { Reembolso } from "@/lib/database.types";
import { capitalizar, diasHasta, formatFecha, formatHora, formatPesos, parseFecha, relativoDias } from "@/lib/format";
import { cn } from "@/lib/utils";

/** Horas que faltan para la cita (negativo si ya pasó). */
export function horasHasta(a: Pick<AppointmentWithNames, "fecha" | "hora">) {
  const d = parseFecha(a.fecha);
  const [h, m] = a.hora.split(":").map(Number);
  d.setHours(h, m);
  return (d.getTime() - Date.now()) / 3_600_000;
}

/** El particular puede cancelar una cita agendada hasta 12 horas antes (la base de datos aplica la misma regla). */
export const HORAS_MIN_CANCELACION = 12;
export function puedeCancelar(a: Pick<AppointmentWithNames, "estado" | "fecha" | "hora">) {
  return a.estado === "agendada" && horasHasta(a) >= HORAS_MIN_CANCELACION;
}

/** Botón para pagar una reserva pendiente: crea una nueva página de pago de Rapyd. */
export function PagarReservaButton({ appointmentId, monto, size = "sm" }: { appointmentId: string; monto?: number; size?: "sm" | "default" }) {
  const iniciar = useIniciarPago();
  return (
    <Button
      size={size}
      disabled={iniciar.isPending}
      onClick={() =>
        iniciar.mutate(
          { appointment_id: appointmentId },
          { onSuccess: ({ redirect_url }) => window.location.assign(redirect_url), onError: (err) => toast.error(err.message) },
        )
      }
    >
      {iniciar.isPending ? <Loader2 className="animate-spin" /> : <CreditCard />} Pagar{monto != null ? ` ${formatPesos(monto)}` : ""}
    </Button>
  );
}

const REEMBOLSO_TEXTO: Record<Reembolso["estado"], string> = {
  solicitado: "Solicitado: el administrador lo está revisando",
  en_proceso: "En proceso: puede tardar unos días hábiles",
  completado: "Completado",
  fallido: "En revisión: hubo un problema y el administrador lo está gestionando",
  denegado: "No aprobado",
};

/** Enlace a Google Maps: coordenadas de la IPS si existen, si no la dirección. */
export function ubicacionUrl(ips: AppointmentIps | null, ciudad?: string): string | null {
  if (ips?.lat != null && ips?.lng != null) {
    return `https://www.google.com/maps/search/?api=1&query=${ips.lat},${ips.lng}`;
  }
  if (ips?.direccion) {
    const q = encodeURIComponent(`${ips.nombre}, ${ips.direccion}${ciudad ? `, ${ciudad}` : ""}, Colombia`);
    return `https://www.google.com/maps/search/?api=1&query=${q}`;
  }
  return null;
}

function InfoRow({ icon: Icon, label, children }: { icon: React.ComponentType<{ className?: string }>; label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
        <Icon className="size-[18px]" aria-hidden />
      </div>
      <div className="min-w-0">
        <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</dt>
        <dd className="mt-0.5 text-sm font-medium text-foreground break-words">{children}</dd>
      </div>
    </div>
  );
}

export function AppointmentDetailDialog({
  appointment: a,
  onOpenChange,
  onRequestCancel,
}: {
  appointment: AppointmentWithNames | null;
  onOpenChange: (open: boolean) => void;
  onRequestCancel: (a: AppointmentWithNames) => void;
}) {
  const mapa = a ? ubicacionUrl(a.ips, a.ciudad) : null;
  const { data: valores } = useValoresCitas(!!a);
  const valor = a ? valores?.get(a.id) : undefined;
  const { data: pagos } = usePagosDeCitas(!!a);
  const pago = a ? pagos?.get(a.id) : undefined;
  const futura = !!a && horasHasta(a) > 0;
  return (
    <Dialog open={!!a} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        {a && (
          <>
            <DialogHeader className="text-left">
              <div className="flex flex-wrap items-center gap-2">
                <AppointmentStatusBadge estado={a.estado} />
                {a.estado === "agendada" && diasHasta(a.fecha) >= 0 && (
                  <span className="text-xs font-medium text-muted-foreground">{relativoDias(a.fecha)}</span>
                )}
              </div>
              <DialogTitle className="pt-1 text-xl">Examen de {a.tipo_examen.toLowerCase()}</DialogTitle>
              <DialogDescription>Detalle de tu cita médica.</DialogDescription>
            </DialogHeader>

            <dl className="grid gap-4 rounded-xl border bg-surface p-4 sm:grid-cols-2">
              <InfoRow icon={CalendarDays} label="Fecha">{capitalizar(formatFecha(a.fecha))}</InfoRow>
              <InfoRow icon={Clock} label="Hora">{formatHora(a.hora)}</InfoRow>
              <InfoRow icon={ClipboardList} label="Tipo de examen">{capitalizar(a.tipo_examen)}</InfoRow>
              <InfoRow icon={Stethoscope} label="Servicio">{a.servicio || "—"}</InfoRow>
              {valor != null && <InfoRow icon={Wallet} label="Valor"><span className="tabular-nums">{formatPesos(valor)}</span></InfoRow>}
              <div className="sm:col-span-2"><InfoRow icon={Building2} label="IPS">{a.ips?.nombre ?? "—"}</InfoRow></div>
              <div className="sm:col-span-2">
                <InfoRow icon={MapPin} label="Dirección">
                  {a.ips?.direccion ? `${a.ips.direccion} · ${a.ciudad}` : a.ciudad}
                </InfoRow>
              </div>
              {a.ips?.telefono && (
                <InfoRow icon={Phone} label="Teléfono IPS">
                  <a href={`tel:${a.ips.telefono}`} className="text-accent-foreground underline-offset-2 hover:underline">{a.ips.telefono}</a>
                </InfoRow>
              )}
            </dl>

            {a.estado === "agendada" && futura && (
              <p className="rounded-lg bg-info-soft px-3 py-2 text-[13px] text-info-foreground">
                Llega 15 minutos antes y lleva tu documento de identidad.
                {!puedeCancelar(a) && pago && ` Ya no se puede cancelar: faltan menos de ${HORAS_MIN_CANCELACION} horas.`}
              </p>
            )}
            {a.estado === "pendiente_pago" && pago && (
              <p className="rounded-lg bg-warning-soft px-3 py-2 text-[13px] text-warning-foreground">
                El horario está apartado hasta las {formatHora(new Date(pago.expira_at).toTimeString().slice(0, 5))}. Si no se paga a tiempo, se libera.
              </p>
            )}
            {pago?.reembolso && (
              <p className="rounded-lg border px-3 py-2 text-[13px]">
                <span className="font-semibold">Reembolso de {formatPesos(pago.monto)}:</span> {REEMBOLSO_TEXTO[pago.reembolso.estado]}
              </p>
            )}

            <DialogFooter className="gap-2 sm:justify-between">
              {puedeCancelar(a) ? (
                <Button variant="destructive-outline" onClick={() => onRequestCancel(a)}>
                  <XCircle /> Cancelar cita
                </Button>
              ) : a.estado === "pendiente_pago" ? (
                <PagarReservaButton appointmentId={a.id} monto={pago?.monto} size="default" />
              ) : <span className="hidden sm:block" />}
              {mapa && (
                <a href={mapa} target="_blank" rel="noopener noreferrer" className={buttonVariants()}>
                  <Navigation /> Ver ubicación
                  <span className="sr-only"> (se abre en una pestaña nueva)</span>
                </a>
              )}
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function CancelAppointmentDialog({
  appointment: a,
  onOpenChange,
  onCancelled,
}: {
  appointment: AppointmentWithNames | null;
  onOpenChange: (open: boolean) => void;
  onCancelled?: () => void;
}) {
  const cancel = useCancelAppointment();
  const { data: pagos } = usePagosDeCitas(!!a);
  const pagado = a ? pagos?.get(a.id)?.estado === "aprobado" : false;

  const confirmar = (e: React.MouseEvent) => {
    e.preventDefault(); // mantener el diálogo abierto mientras se procesa
    if (!a) return;
    cancel.mutate(
      { id: a.id, slotId: a.slot_id },
      {
        onSuccess: () => {
          toast.success("Cita cancelada", { description: "El horario quedó libre para otras personas." });
          onOpenChange(false);
          onCancelled?.();
        },
        onError: (err: unknown) =>
          toast.error("No se pudo cancelar la cita", {
            description: err instanceof Error ? err.message : "Inténtalo de nuevo en unos segundos.",
          }),
      },
    );
  };

  return (
    <AlertDialog open={!!a} onOpenChange={(o) => { if (!cancel.isPending) onOpenChange(o); }}>
      <AlertDialogContent>
        {a && (
          <>
            <AlertDialogHeader>
              <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-danger-soft text-danger-foreground sm:mx-0">
                <XCircle className="size-6" aria-hidden />
              </div>
              <AlertDialogTitle>¿Cancelar esta cita?</AlertDialogTitle>
              <AlertDialogDescription asChild>
                <div className="space-y-3">
                  <p>
                    Vas a cancelar tu examen de <strong className="text-foreground">{a.tipo_examen.toLowerCase()}</strong> del{" "}
                    <strong className="text-foreground">{formatFecha(a.fecha)}</strong> a las{" "}
                    <strong className="text-foreground">{formatHora(a.hora)}</strong> en {a.ips?.nombre ?? "la IPS"}.
                  </p>
                  {pagado && <p>Te devolveremos el valor total pagado. El administrador revisa el reembolso y, una vez aprobado, puede tardar unos días hábiles en verse en tu medio de pago.</p>}
                  <p>Esta acción no se puede deshacer. Si lo necesitas, podrás solicitar una nueva cita.</p>
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={cancel.isPending}>Volver</AlertDialogCancel>
              <AlertDialogAction
                onClick={confirmar}
                disabled={cancel.isPending}
                className={cn(buttonVariants({ variant: "destructive" }))}
              >
                {cancel.isPending ? <><Loader2 className="animate-spin" /> Cancelando…</> : "Sí, cancelar cita"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </>
        )}
      </AlertDialogContent>
    </AlertDialog>
  );
}
