import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { es } from "date-fns/locale";
import { CalendarDays, Pencil, Trash2, Lock, Loader2, Plus, Clock, CalendarX2, History, BadgeDollarSign } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth-context";
import { DEPARTAMENTOS } from "@/lib/colombia";
import { useSlots, useAddSlots, useUpdateSlot, useDeleteSlot, SlotTakenError } from "@/lib/hooks/useSlots";
import { useAppointments } from "@/lib/hooks/useAppointments";
import { useServicios } from "@/lib/hooks/useCatalogos";
import { esErrorSinPrecio, useMisPrecios } from "@/lib/hooks/usePrecios";
import type { Slot } from "@/lib/database.types";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { PageHeader } from "@/components/app/PageHeader";
import { FormField } from "@/components/app/FormField";
import { EmptyState } from "@/components/app/EmptyState";
import { StatusPill } from "@/components/app/StatusBadge";
import { capitalizar, formatFecha, formatHora, formatPesos, hoyISO } from "@/lib/format";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/app/ips/calendario")({
  component: IpsCalendario,
});

/** Fecha local 'YYYY-MM-DD'. `toISOString()` usa UTC y en Colombia (UTC-5) cambia de día desde las 7 p. m. */
function isoLocal(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
const hhmm = (hora: string) => hora.slice(0, 5);

const ESTADO_DISPONIBLE = { label: "Disponible", tone: "success" as const, icon: Clock };
const ESTADO_AGENDADA = { label: "Agendada", tone: "info" as const, icon: Lock };

function IpsCalendario() {
  const { profile } = useAuth();
  const [date, setDate] = useState<Date | undefined>(new Date());
  // "" = aún no elegido: se usa el primer servicio con precio.
  const [depMed, setDepMed] = useState("");
  const [depto, setDepto] = useState(profile?.departamento ?? "");
  const [ciudad, setCiudad] = useState(profile?.ciudad ?? "");
  const [horas, setHoras] = useState("08:00, 09:00, 10:00, 14:00, 15:00");
  const [editando, setEditando] = useState<Slot | null>(null);
  const [eliminando, setEliminando] = useState<Slot | null>(null);

  const { data: slots = [], isLoading } = useSlots(profile?.id);
  const { data: citas = [] } = useAppointments(profile?.id, profile?.role);
  const addSlots = useAddSlots();
  const deleteSlot = useDeleteSlot();

  const servicios = profile?.servicios?.length ? profile.servicios : ["Medicina General"];
  const { data: catalogo = [] } = useServicios();
  const { data: misPrecios, isLoading: preciosLoading } = useMisPrecios(profile?.id);
  /** Precio base del servicio (por nombre) o null si la IPS no lo ha definido. */
  const precioDe = (nombre: string) => {
    const id = catalogo.find((c) => c.nombre === nombre)?.id;
    return (id && misPrecios?.get(id)) || null;
  };
  const servicioSel = depMed || servicios.find((s) => precioDe(s) != null) || servicios[0];
  const precioSel = precioDe(servicioSel);
  const sinPrecio = !preciosLoading && precioSel == null;
  const ciudades = DEPARTAMENTOS.find((d) => d.nombre === depto)?.ciudades ?? [];
  const selectedDate = date ? isoLocal(date) : undefined;
  const misSlots = slots
    .filter((s) => !selectedDate || s.fecha === selectedDate)
    .sort((a, b) => a.hora.localeCompare(b.hora) || a.servicio.localeCompare(b.servicio));

  // Horarios con citas canceladas: se pueden editar, pero no eliminar (la cita conserva la referencia).
  const conHistorial = useMemo(() => new Set(citas.map((c) => c.slot_id)), [citas]);

  const libres = misSlots.filter((s) => !s.taken).length;
  // Solo se registra disponibilidad desde hoy; los días pasados se pueden consultar, no llenar.
  const hoy = hoyISO();
  const fechaPasada = !!selectedDate && selectedDate < hoy;

  const handleAdd = () => {
    if (!date) return toast.error("Selecciona una fecha");
    if (isoLocal(date) < hoyISO()) return toast.error("No puedes agregar horarios en fechas anteriores a hoy");
    if (!ciudad || !depto) return toast.error("Selecciona departamento y ciudad");
    if (precioSel == null) return toast.error(`Define el precio de ${servicioSel} en tu perfil antes de crear horarios`);
    const fecha = isoLocal(date);
    const lista = horas.split(",").map((h) => h.trim()).filter(Boolean);
    addSlots.mutate(
      lista.map((h) => ({
        ips_id: profile!.id,
        fecha,
        hora: h,
        servicio: servicioSel,
        ciudad,
      })),
      {
        onSuccess: () => toast.success(`${lista.length} horarios agregados`),
        onError: (err: unknown) =>
          toast.error(esErrorSinPrecio(err) ? `Define el precio de ${servicioSel} en tu perfil antes de crear horarios` : (err as Error).message),
      }
    );
  };

  const confirmarEliminar = (e: React.MouseEvent) => {
    e.preventDefault();
    if (!eliminando) return;
    deleteSlot.mutate(eliminando.id, {
      onSuccess: () => {
        toast.success("Horario eliminado");
        setEliminando(null);
      },
      onError: (err: any) => {
        if (err instanceof SlotTakenError) toast.error(err.message);
        else if (err?.code === "23503") toast.error("No se puede eliminar", { description: "Este horario tiene citas canceladas en su historial. Puedes editarlo." });
        else toast.error("No se pudo eliminar el horario", { description: "Inténtalo de nuevo." });
        setEliminando(null);
      },
    });
  };

  return (
    <div className="space-y-6">
      <PageHeader
        icon={CalendarDays}
        title="Calendario"
        description="Registra tu disponibilidad y administra los horarios que aún no han sido agendados."
      />

      <div className="grid gap-6 lg:grid-cols-12">
        <Card className="lg:col-span-5">
          <CardHeader>
            <CardTitle className="text-lg">Registrar disponibilidad</CardTitle>
            <CardDescription>Elige un día y agrega varias horas a la vez.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-xl border p-2">
              <Calendar
                mode="single"
                locale={es}
                selected={date}
                onSelect={setDate}
                modifiers={{ pasado: { before: new Date(`${hoy}T00:00:00`) } }}
                modifiersClassNames={{ pasado: "text-muted-foreground/60" }}
                className="mx-auto"
              />
            </div>
            {fechaPasada && (
              <p role="status" className="flex items-start gap-2 rounded-lg bg-warning-soft px-3 py-2 text-[13px] text-warning-foreground">
                <CalendarX2 className="mt-0.5 size-4 shrink-0" aria-hidden />
                Esta fecha ya pasó: puedes consultar sus horarios, pero no agregar nuevos. Elige hoy o una fecha posterior.
              </p>
            )}
            <div className="grid grid-cols-2 gap-3">
              <FormField id="cal-depto" label="Departamento">
                <Select value={depto} onValueChange={(v) => { setDepto(v); setCiudad(""); }}>
                  <SelectTrigger><SelectValue placeholder="Selecciona" /></SelectTrigger>
                  <SelectContent>
                    {DEPARTAMENTOS.map((d) => <SelectItem key={d.nombre} value={d.nombre}>{d.nombre}</SelectItem>)}
                  </SelectContent>
                </Select>
              </FormField>
              <FormField id="cal-ciudad" label="Ciudad">
                <Select value={ciudad} onValueChange={setCiudad} disabled={!depto}>
                  <SelectTrigger><SelectValue placeholder="Selecciona" /></SelectTrigger>
                  <SelectContent>
                    {ciudades.map((c) => <SelectItem key={c.nombre} value={c.nombre}>{c.nombre}</SelectItem>)}
                  </SelectContent>
                </Select>
              </FormField>
            </div>
            <FormField id="cal-servicio" label="Servicio">
              <Select value={servicioSel} onValueChange={setDepMed}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {servicios.map((d) => {
                    const precio = precioDe(d);
                    return (
                      <SelectItem key={d} value={d}>
                        {d} <span className="text-muted-foreground">· {precio != null ? formatPesos(precio) : "sin precio"}</span>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </FormField>
            {sinPrecio && (
              <p role="status" className="flex items-start gap-2 rounded-lg bg-warning-soft px-3 py-2 text-[13px] text-warning-foreground">
                <BadgeDollarSign className="mt-0.5 size-4 shrink-0" aria-hidden />
                <span>
                  {servicioSel} no tiene precio. <Link to="/app/perfil" className="font-semibold underline underline-offset-2">Defínelo en tu perfil</Link> para crear horarios de este servicio.
                </span>
              </p>
            )}
            <FormField id="cal-horas" label="Horas" hint="Formato 24 h, separadas por coma. Ej.: 08:00, 09:30, 14:00">
              <Input value={horas} onChange={(e) => setHoras(e.target.value)} />
            </FormField>
            <Button onClick={handleAdd} disabled={addSlots.isPending || fechaPasada || preciosLoading || sinPrecio} size="lg" className="w-full">
              {addSlots.isPending ? <><Loader2 className="animate-spin" /> Guardando…</> : <><Plus /> Agregar horarios</>}
            </Button>
          </CardContent>
        </Card>

        <Card className="lg:col-span-7">
          <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
            <div>
              <CardTitle className="text-lg">
                {selectedDate ? capitalizar(formatFecha(selectedDate)) : "Horarios"}
              </CardTitle>
              <CardDescription>
                {misSlots.length === 0
                  ? "Sin horarios registrados"
                  : `${misSlots.length} ${misSlots.length === 1 ? "horario" : "horarios"} · ${libres} ${libres === 1 ? "disponible" : "disponibles"}`}
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <p className="py-6 text-center text-sm text-muted-foreground">Cargando horarios…</p>
            ) : misSlots.length === 0 ? (
              <EmptyState
                compact
                icon={CalendarX2}
                title="Sin horarios en esta fecha"
                description="Agrega horas desde el formulario para abrir tu agenda de este día."
              />
            ) : (
              <TooltipProvider delayDuration={200}>
                <ul className="divide-y">
                  {misSlots.map((s) => {
                    const bloqueado = s.taken;
                    const historial = !s.taken && conHistorial.has(s.id);
                    // Precio actual, solo en horarios libres: los agendados conservan el precio del día en que se agendaron.
                    const precio = !s.taken && !preciosLoading ? precioDe(s.servicio) : null;
                    return (
                      <li key={s.id} className="flex flex-wrap items-center gap-3 py-3 sm:flex-nowrap">
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold tabular-nums">
                            {formatHora(s.hora)} <span className="font-normal text-muted-foreground">·</span> {s.servicio}
                          </p>
                          <p className="flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
                            {s.ciudad}
                            {precio != null && <span className="tabular-nums">· {formatPesos(precio)}</span>}
                            {!s.taken && !preciosLoading && precio == null && (
                              <span className="inline-flex items-center gap-1 font-medium text-warning-foreground">
                                <BadgeDollarSign className="size-3" aria-hidden /> Sin precio: no se puede agendar
                              </span>
                            )}
                            {historial && (
                              <span className="inline-flex items-center gap-1"><History className="size-3" aria-hidden /> con citas canceladas</span>
                            )}
                          </p>
                        </div>
                        <StatusPill def={bloqueado ? ESTADO_AGENDADA : ESTADO_DISPONIBLE} />
                        <div className="flex w-full justify-end gap-1 sm:w-auto">
                          {bloqueado ? (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span tabIndex={0} className="inline-flex h-9 items-center gap-1.5 rounded-lg px-2 text-xs text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                                  <Lock className="size-3.5" aria-hidden /> No editable
                                </span>
                              </TooltipTrigger>
                              <TooltipContent>Tiene una cita agendada. Para liberarlo, la cita debe cancelarse.</TooltipContent>
                            </Tooltip>
                          ) : (
                            <>
                              <Button variant="ghost" size="sm" onClick={() => setEditando(s)} aria-label={`Editar horario de ${formatHora(s.hora)}, ${s.servicio}`}>
                                <Pencil /> Editar
                              </Button>
                              {historial ? (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <span tabIndex={0} className="inline-flex">
                                      <Button variant="ghost" size="sm" disabled aria-label="Eliminar (no disponible)">
                                        <Trash2 /> Eliminar
                                      </Button>
                                    </span>
                                  </TooltipTrigger>
                                  <TooltipContent>Tiene citas canceladas en su historial: puedes editarlo, pero no eliminarlo.</TooltipContent>
                                </Tooltip>
                              ) : (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="text-danger-foreground hover:bg-danger-soft"
                                  onClick={() => setEliminando(s)}
                                  aria-label={`Eliminar horario de ${formatHora(s.hora)}, ${s.servicio}`}
                                >
                                  <Trash2 /> Eliminar
                                </Button>
                              )}
                            </>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </TooltipProvider>
            )}
          </CardContent>
        </Card>
      </div>

      <EditarSlotDialog
        slot={editando}
        slots={slots}
        servicios={servicios}
        conPrecio={(s) => precioDe(s) != null}
        onClose={() => setEditando(null)}
        onSaved={(fecha) => {
          // Si se movió a otro día, el calendario lo sigue para que el cambio sea visible.
          if (fecha !== selectedDate) setDate(new Date(`${fecha}T12:00:00`));
        }}
      />

      <AlertDialog open={!!eliminando} onOpenChange={(o) => { if (!o && !deleteSlot.isPending) setEliminando(null); }}>
        <AlertDialogContent>
          {eliminando && (
            <>
              <AlertDialogHeader>
                <AlertDialogTitle>¿Eliminar este horario?</AlertDialogTitle>
                <AlertDialogDescription>
                  Se eliminará el horario de <strong className="text-foreground">{eliminando.servicio}</strong> del{" "}
                  <strong className="text-foreground">{formatFecha(eliminando.fecha)}</strong> a las{" "}
                  <strong className="text-foreground">{formatHora(eliminando.hora)}</strong>. Los pacientes ya no podrán reservarlo.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={deleteSlot.isPending}>Volver</AlertDialogCancel>
                <AlertDialogAction onClick={confirmarEliminar} disabled={deleteSlot.isPending} className={cn(buttonVariants({ variant: "destructive" }))}>
                  {deleteSlot.isPending ? <><Loader2 className="animate-spin" /> Eliminando…</> : "Sí, eliminar"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </>
          )}
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function EditarSlotDialog({
  slot, slots, servicios, conPrecio, onClose, onSaved,
}: {
  slot: Slot | null;
  slots: Slot[];
  servicios: string[];
  conPrecio: (servicio: string) => boolean;
  onClose: () => void;
  onSaved: (fecha: string) => void;
}) {
  return (
    <Dialog open={!!slot} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        {/* key: reinicia el formulario con los datos de cada horario */}
        {slot && <EditarSlotForm key={slot.id} slot={slot} slots={slots} servicios={servicios} conPrecio={conPrecio} onClose={onClose} onSaved={onSaved} />}
      </DialogContent>
    </Dialog>
  );
}

function EditarSlotForm({
  slot, slots, servicios, conPrecio, onClose, onSaved,
}: {
  slot: Slot;
  slots: Slot[];
  servicios: string[];
  conPrecio: (servicio: string) => boolean;
  onClose: () => void;
  onSaved: (fecha: string) => void;
}) {
  const updateSlot = useUpdateSlot();
  const [fecha, setFecha] = useState(slot.fecha);
  const [hora, setHora] = useState(hhmm(slot.hora));
  const [servicio, setServicio] = useState(slot.servicio);
  const [submitted, setSubmitted] = useState(false);
  const opciones = servicios.includes(slot.servicio) ? servicios : [slot.servicio, ...servicios];

  const hoy = hoyISO();
  const errFecha = !fecha ? "Selecciona una fecha." : fecha < hoy ? "La fecha no puede ser anterior a hoy." : null;
  const errHora = !/^\d{2}:\d{2}$/.test(hora) ? "Ingresa una hora válida." : null;
  const duplicado = slots.find(
    (s) => s.id !== slot.id && s.fecha === fecha && hhmm(s.hora) === hora && s.servicio === servicio,
  );
  const errDuplicado = duplicado ? `Ya tienes un horario de ${servicio} el ${formatFecha(fecha)} a las ${formatHora(hora)}.` : null;
  const sinCambios = fecha === slot.fecha && hora === hhmm(slot.hora) && servicio === slot.servicio;

  const guardar = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    if (errFecha || errHora || errDuplicado || sinCambios) return;
    updateSlot.mutate(
      { id: slot.id, patch: { fecha, hora, servicio } },
      {
        onSuccess: () => {
          toast.success("Horario actualizado");
          onSaved(fecha);
          onClose();
        },
        onError: (err: unknown) => {
          if (esErrorSinPrecio(err)) {
            toast.error(`Define el precio de ${servicio} en tu perfil antes de usarlo en un horario`);
            return;
          }
          toast.error(err instanceof SlotTakenError ? err.message : "No se pudo actualizar el horario", {
            description: err instanceof SlotTakenError ? undefined : "Inténtalo de nuevo.",
          });
          if (err instanceof SlotTakenError) onClose();
        },
      },
    );
  };

  return (
    <form onSubmit={guardar} noValidate>
      <DialogHeader>
        <DialogTitle>Editar horario</DialogTitle>
        <DialogDescription>
          Actual: {formatFecha(slot.fecha)}, {formatHora(slot.hora)} · {slot.servicio}
        </DialogDescription>
      </DialogHeader>
      <div className="my-5 space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <FormField id="edit-fecha" label="Fecha" required error={submitted ? errFecha : null}>
            <Input type="date" min={hoy} value={fecha} onChange={(e) => setFecha(e.target.value)} />
          </FormField>
          <FormField id="edit-hora" label="Hora" required error={submitted ? errHora : null}>
            <Input type="time" step={300} value={hora} onChange={(e) => setHora(e.target.value)} />
          </FormField>
        </div>
        <FormField id="edit-servicio" label="Servicio" required>
          <Select value={servicio} onValueChange={setServicio}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {/* Solo se puede cambiar a un servicio con precio; el actual se conserva aunque no lo tenga. */}
              {opciones.map((d) => (
                <SelectItem key={d} value={d} disabled={d !== slot.servicio && !conPrecio(d)}>
                  {d}{!conPrecio(d) && <span className="text-muted-foreground"> · sin precio</span>}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>
        {errDuplicado && (
          <p role="alert" className="rounded-lg bg-warning-soft px-3 py-2 text-[13px] font-medium text-warning-foreground">{errDuplicado}</p>
        )}
      </div>
      <DialogFooter className="gap-2">
        <Button type="button" variant="outline" onClick={onClose} disabled={updateSlot.isPending}>Cancelar</Button>
        <Button type="submit" disabled={updateSlot.isPending || sinCambios || !!errDuplicado}>
          {updateSlot.isPending ? <><Loader2 className="animate-spin" /> Guardando…</> : "Guardar cambios"}
        </Button>
      </DialogFooter>
    </form>
  );
}
