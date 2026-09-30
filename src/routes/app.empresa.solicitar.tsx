import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  CalendarPlus, Check, ClipboardList, MapPin, Building2, CalendarClock, CircleCheckBig, Info, Loader2, IdCard, UserRound,
  Users, Upload, FileText, Download, X, AlertTriangle, UserPlus, ListChecks, Navigation,
} from "lucide-react";
import { toast } from "sonner";
import { DEPARTAMENTOS } from "@/lib/colombia";
import type { Slot } from "@/lib/database.types";
import { Card, CardContent } from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import { PageHeader } from "@/components/app/PageHeader";
import { FormField, IconInput } from "@/components/app/FormField";
import { useAuth } from "@/lib/auth-context";
import { useAvailableSlots } from "@/lib/hooks/useSlots";
import { useBookAppointment, useBookAppointmentsBatch } from "@/lib/hooks/useAppointments";
import { useTiposExamen } from "@/lib/hooks/useCatalogos";
import { capitalizar, fechaPartes, formatFecha, formatFechaCorta, formatHora, hoyISO } from "@/lib/format";
import { ConfirmRow, Resumen, StepHeading, Stepper, SuccessCard, WizardNav, type WizardStep } from "@/components/solicitar/WizardParts";
import { HorarioPicker, IpsStep, TipoExamenPicker, UbicacionStep } from "@/components/solicitar/Steps";
import { esFuturo, useIpsSearch, type LatLng } from "@/components/solicitar/useIpsSearch";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/app/empresa/solicitar")({
  component: EmpresaSolicitar,
});

type Modo = "individual" | "masivo";
interface Empleado { nombre: string; cedula: string }
type Resultado =
  | { modo: "individual"; empleado: Empleado; fecha: string; hora: string; ips: string; tipo: string; servicio: string; direccion: string | null; ciudad: string }
  | { modo: "masivo"; agendadas: number; ips: string; tipo: string; sinHorario: Empleado[] };

const TOTAL = 5;
function pasos(modo: Modo): readonly WizardStep[] {
  return [
    { id: 1, title: "Empleados", short: "Empleados", icon: Users },
    { id: 2, title: "Ubicación", short: "Ubicación", icon: MapPin },
    { id: 3, title: "Selección de IPS", short: "IPS", icon: Building2 },
    modo === "individual"
      ? { id: 4, title: "Fecha y hora", short: "Horario", icon: CalendarClock }
      : { id: 4, title: "Asignación de horarios", short: "Horarios", icon: ListChecks },
    { id: 5, title: "Confirmación", short: "Confirmar", icon: CircleCheckBig },
  ];
}

/**
 * Formato del archivo masivo (sin cambios respecto a la versión anterior):
 * una línea por empleado, "Nombre;Cedula". Se ignora la cabecera que empieza por "nombre".
 */
function parsearArchivo(text: string): { empleados: Empleado[]; ignoradas: number } {
  const lineas = text.split("\n").map((l) => l.trim()).filter(Boolean);
  let ignoradas = 0;
  const empleados: Empleado[] = [];
  for (const linea of lineas) {
    if (linea.toLowerCase().startsWith("nombre")) continue;
    const partes = linea.split(";");
    if (partes.length < 2 || !partes[0].trim() || !partes[1].trim()) {
      ignoradas++;
      continue;
    }
    empleados.push({ nombre: partes[0].trim(), cedula: partes[1].trim() });
  }
  return { empleados, ignoradas };
}

function descargarPlantilla() {
  const blob = new Blob(["Nombre;Cedula\nAna María Pérez;1012345678\nCarlos Rodríguez;79876543\n"], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "plantilla-empleados.txt";
  a.click();
  URL.revokeObjectURL(url);
}

function EmpresaSolicitar() {
  const { profile } = useAuth();
  const [step, setStep] = useState(1);
  const [maxStep, setMaxStep] = useState(1);
  const [done, setDone] = useState<Resultado | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  // ── Estado (misma lógica que la versión anterior) ──
  const [modo, setModo] = useState<Modo>("individual");
  const [empleadoNombre, setEmpleadoNombre] = useState("");
  const [empleadoCedula, setEmpleadoCedula] = useState("");
  const [archivoEmpleados, setArchivoEmpleados] = useState<Empleado[]>([]);
  const [archivoNombre, setArchivoNombre] = useState<string | null>(null);
  const [archivoError, setArchivoError] = useState<string | null>(null);
  const [lineasIgnoradas, setLineasIgnoradas] = useState(0);
  const [fileInputKey, setFileInputKey] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [tipoExamen, setTipoExamen] = useState<string>("");
  const [filtro, setFiltro] = useState<string[]>([]);
  const [depto, setDepto] = useState("Cundinamarca");
  const [ciudad, setCiudad] = useState("Bogotá");
  const [direccion, setDireccion] = useState("");
  const [userLoc, setUserLoc] = useState<LatLng | null>(null);
  const [selectedIps, setSelectedIps] = useState<string | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  const [selectedFecha, setSelectedFecha] = useState<string | null>(null);
  const [touched1, setTouched1] = useState(false);
  const [bookError, setBookError] = useState<string | null>(null);

  const bookAppointment = useBookAppointment();
  const bookAppointmentsBatch = useBookAppointmentsBatch();
  const { data: tiposExamen = [], isLoading: tiposLoading } = useTiposExamen();
  // Solo los tipos habilitados para empresas en el catálogo (p. ej. "Retiro" es exclusivo de empresas).
  const tiposDisponibles = useMemo(() => tiposExamen.filter((t) => t.roles_permitidos.includes("empresa")), [tiposExamen]);

  useEffect(() => {
    if (tiposDisponibles.length > 0 && !tipoExamen) setTipoExamen(tiposDisponibles[0].nombre);
  }, [tiposDisponibles, tipoExamen]);

  const search = useIpsSearch({ depto, ciudad, userLoc, filtro, selectedIps });
  const hoy = hoyISO();
  const { data: slotsRaw = [], isLoading: slotsLoading, refetch: refetchSlots } = useAvailableSlots(selectedIps);
  // Solo horarios futuros: antes la asignación masiva podía tomar horarios ya vencidos.
  const slotsIps = useMemo(() => slotsRaw.filter((s) => esFuturo(s, hoy)), [slotsRaw, hoy]);

  const ipsSel = search.ipsEnCiudad.find((i) => i.id === selectedIps) ?? null;
  const slotSel = slotsIps.find((s) => s.id === selectedSlot) ?? null;

  // Asignación masiva: el empleado i recibe el horario libre i, en orden cronológico.
  const pares = useMemo(
    () => archivoEmpleados.map((empleado, i) => ({ empleado, slot: (slotsIps[i] ?? null) as Slot | null })),
    [archivoEmpleados, slotsIps],
  );
  const conSlot = pares.filter((p) => p.slot).length;
  const sinSlot = pares.length - conSlot;
  const duplicadas = useMemo(() => {
    const vistos = new Set<string>(); const dup = new Set<string>();
    archivoEmpleados.forEach((e) => { if (vistos.has(e.cedula)) dup.add(e.cedula); vistos.add(e.cedula); });
    return dup.size;
  }, [archivoEmpleados]);

  const nombreError = !empleadoNombre.trim() ? "Ingresa el nombre del empleado." : null;
  const cedulaError = !empleadoCedula.trim() ? "Ingresa la cédula del empleado." : null;
  const tipoError = !tipoExamen ? "Selecciona el tipo de examen." : null;
  const archivoFalta = archivoEmpleados.length === 0 ? "Carga un archivo con al menos un empleado." : null;
  const paso1Ok = modo === "individual" ? !nombreError && !cedulaError && !tipoError : !archivoFalta && !tipoError;
  const canNext: Record<number, boolean> = {
    1: paso1Ok,
    2: !!ciudad,
    3: !!selectedIps,
    4: modo === "individual" ? !!slotSel : conSlot > 0,
    5: true,
  };

  const STEPS = pasos(modo);
  const current = STEPS[step - 1];
  const goTo = (s: number) => { setStep(s); setMaxStep((m) => Math.max(m, s)); };
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) { firstRender.current = false; return; }
    headingRef.current?.focus({ preventScroll: true });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [step, done]);

  const next = () => {
    if (step === 1) setTouched1(true);
    if (!canNext[step]) {
      if (step === 3) toast.error("Elige una IPS para continuar");
      if (step === 4) toast.error(modo === "individual" ? "Selecciona un horario para continuar" : "Esta IPS no tiene horarios para asignar");
      return;
    }
    if (step < TOTAL) goTo(step + 1);
  };

  const cambiarModo = (m: Modo) => {
    if (m === modo) return;
    setModo(m);
    setMaxStep(1);
    setTouched1(false);
    // Igual que antes: al cambiar de modo se descartan los datos del otro modo.
    if (m === "individual") { setArchivoEmpleados([]); setArchivoError(null); setArchivoNombre(null); setLineasIgnoradas(0); setFileInputKey((k) => k + 1); }
    else { setEmpleadoNombre(""); setEmpleadoCedula(""); setSelectedSlot(null); }
  };

  const cargarArchivo = (file: File | undefined) => {
    if (!file) return;
    if (!/\.(txt|csv)$/i.test(file.name)) {
      setArchivoError("El archivo debe ser .txt o .csv con el formato Nombre;Cedula.");
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      const { empleados, ignoradas } = parsearArchivo(ev.target?.result as string);
      setLineasIgnoradas(ignoradas);
      setArchivoNombre(file.name);
      if (ignoradas > 0) toast.warning(`${ignoradas} línea(s) ignoradas por formato inválido`);
      if (empleados.length === 0) {
        setArchivoError("El archivo no contiene empleados válidos. Usa el formato: Nombre;Cedula");
        setArchivoEmpleados([]);
      } else {
        setArchivoError(null);
        setArchivoEmpleados(empleados);
        setMaxStep(1);
      }
    };
    reader.onerror = () => setArchivoError("No pudimos leer el archivo. Inténtalo de nuevo.");
    reader.readAsText(file, "UTF-8");
  };

  const quitarArchivo = () => {
    setArchivoEmpleados([]); setArchivoNombre(null); setArchivoError(null); setLineasIgnoradas(0); setFileInputKey((k) => k + 1); setMaxStep(1);
  };

  const resetIps = () => { setSelectedIps(null); setSelectedSlot(null); setMaxStep(Math.min(maxStep, 2)); };
  const selectIps = (id: string) => {
    if (id !== selectedIps) { setSelectedSlot(null); setSelectedFecha(null); }
    setSelectedIps(id);
  };
  const elegirIps = (id: string) => { selectIps(id); setMaxStep(3); goTo(4); };

  const manejarError = (err: any, masivo: boolean) => {
    const tomado = err?.code === "23505" || /duplicate|unique/i.test(err?.message ?? "");
    const msg = tomado
      ? masivo
        ? "Algunos horarios acaban de ser tomados. Actualizamos la disponibilidad: revisa la asignación."
        : "Ese horario ya no está disponible. Elige otro, por favor."
      : err?.message?.includes("Failed to fetch")
        ? "Sin conexión. Revisa tu internet e inténtalo de nuevo."
        : masivo ? "No pudimos agendar las citas. Inténtalo de nuevo." : "No pudimos agendar la cita. Inténtalo de nuevo.";
    setBookError(msg);
    toast.error(msg);
    if (tomado) { setSelectedSlot(null); void refetchSlots(); setStep(4); }
  };

  const submit = () => {
    setBookError(null);
    if (!slotSel || !profile) return;
    const empleado = { nombre: empleadoNombre.trim(), cedula: empleadoCedula.trim() };
    bookAppointment.mutate({
      slot_id: slotSel.id,
      ips_id: slotSel.ips_id,
      solicitante_id: profile.id,
      empleado_nombre: empleado.nombre,
      empleado_cedula: empleado.cedula,
      tipo_examen: tipoExamen,
      fecha: slotSel.fecha,
      hora: slotSel.hora,
      ciudad: slotSel.ciudad,
      servicio: slotSel.servicio,
    }, {
      onSuccess: () => {
        toast.success("Cita agendada");
        setDone({
          modo: "individual", empleado, fecha: slotSel.fecha, hora: slotSel.hora, ips: ipsSel?.nombre ?? "",
          tipo: tipoExamen, servicio: slotSel.servicio, direccion: ipsSel?.direccion ?? null, ciudad: slotSel.ciudad,
        });
      },
      onError: (err) => manejarError(err, false),
    });
  };

  const submitMasivo = () => {
    setBookError(null);
    if (!profile) return;
    const validas = pares.filter((p): p is { empleado: Empleado; slot: Slot } => p.slot !== null);
    if (validas.length === 0) return toast.error("No hay horarios disponibles para esta IPS");
    const citas = validas.map(({ empleado, slot }) => ({
      slot_id: slot.id,
      ips_id: slot.ips_id,
      solicitante_id: profile.id,
      empleado_nombre: empleado.nombre,
      empleado_cedula: empleado.cedula,
      tipo_examen: tipoExamen,
      fecha: slot.fecha,
      hora: slot.hora,
      ciudad: slot.ciudad,
      servicio: slot.servicio,
    }));
    bookAppointmentsBatch.mutate(citas, {
      onSuccess: () => {
        toast.success(`${citas.length} cita(s) agendada(s)`);
        setDone({
          modo: "masivo", agendadas: citas.length, ips: ipsSel?.nombre ?? "", tipo: tipoExamen,
          sinHorario: pares.filter((p) => !p.slot).map((p) => p.empleado),
        });
      },
      onError: (err) => manejarError(err, true),
    });
  };

  const reiniciar = () => {
    setDone(null); setSelectedIps(null); setSelectedSlot(null); setSelectedFecha(null); setStep(1); setMaxStep(1); setTouched1(false);
    setEmpleadoNombre(""); setEmpleadoCedula(""); quitarArchivo();
  };

  if (done) return <Exito resultado={done} headingRef={headingRef} onOtra={reiniciar} />;

  const resumenRows = [
    modo === "individual"
      ? { icon: UserRound, label: "Empleado", value: empleadoNombre.trim() ? `${empleadoNombre.trim()}${empleadoCedula ? ` · ${empleadoCedula}` : ""}` : null }
      : { icon: Users, label: "Empleados", value: archivoEmpleados.length ? `${archivoEmpleados.length} desde ${archivoNombre ?? "archivo"}` : null },
    { icon: ClipboardList, label: "Examen", value: tipoExamen ? `Examen de ${tipoExamen.toLowerCase()}` : null },
    { icon: MapPin, label: "Ciudad", value: ciudad || null },
    { icon: Building2, label: "IPS", value: ipsSel?.nombre ?? null },
    modo === "individual"
      ? { icon: CalendarClock, label: "Fecha y hora", value: slotSel ? `${formatFechaCorta(slotSel.fecha)}, ${formatHora(slotSel.hora)}` : null }
      : { icon: ListChecks, label: "Horarios asignados", value: selectedIps && !slotsLoading ? `${conSlot} de ${pares.length}` : null },
  ];

  const primerAsignado = pares.find((p) => p.slot)?.slot ?? null;
  const ultimoAsignado = [...pares].reverse().find((p) => p.slot)?.slot ?? null;

  return (
    <div className="space-y-6">
      <PageHeader
        icon={CalendarPlus}
        title="Solicitar cita"
        description="Agenda exámenes para uno o varios empleados en cinco pasos."
      />

      <Stepper steps={STEPS} step={step} maxStep={maxStep} onGo={(s) => s <= maxStep && setStep(s)} />

      <div className="grid gap-6 lg:grid-cols-12">
        {/* ── Paso 1 · Empleados ── */}
        {step === 1 && (
          <>
            <Card className="lg:col-span-7 xl:col-span-8">
              <StepHeading refEl={headingRef} step={current} total={TOTAL} description="Elige si agendas para un empleado o para varios a la vez, y el tipo de examen." />
              <CardContent className="space-y-6">
                <fieldset>
                  <legend className="mb-2 text-[13px] font-semibold">Tipo de solicitud</legend>
                  <div className="grid gap-3 sm:grid-cols-2" role="radiogroup" aria-label="Tipo de solicitud">
                    {([
                      { id: "individual", icon: UserPlus, title: "Cita individual", desc: "Un empleado; tú eliges el día y la hora." },
                      { id: "masivo", icon: Upload, title: "Citas masivas", desc: "Varios empleados desde un archivo; los horarios se asignan en orden." },
                    ] as const).map((o) => {
                      const active = modo === o.id;
                      return (
                        <label
                          key={o.id}
                          className={cn(
                            "flex cursor-pointer items-start gap-3 rounded-xl border-2 p-4 transition-colors focus-within:ring-2 focus-within:ring-ring",
                            active ? "border-primary bg-primary-soft" : "border-border hover:border-primary/40",
                          )}
                        >
                          <input type="radio" name="modo" value={o.id} checked={active} onChange={() => cambiarModo(o.id)} className="sr-only" />
                          <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-lg", active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")}>
                            <o.icon className="size-5" aria-hidden />
                          </span>
                          <span>
                            <span className="block font-semibold">{o.title}</span>
                            <span className="block text-[13px] text-muted-foreground">{o.desc}</span>
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </fieldset>

                {modo === "individual" ? (
                  <div className="grid gap-5 sm:grid-cols-2">
                    <FormField id="emp-nombre" label="Nombre del empleado" required error={touched1 ? nombreError : null}>
                      <IconInput icon={UserRound} autoComplete="off" value={empleadoNombre} onChange={(e) => setEmpleadoNombre(e.target.value)} />
                    </FormField>
                    <FormField id="emp-cedula" label="Cédula del empleado" required error={touched1 ? cedulaError : null}>
                      <IconInput icon={IdCard} autoComplete="off" value={empleadoCedula} onChange={(e) => setEmpleadoCedula(e.target.value)} />
                    </FormField>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-[13px] font-semibold">Archivo de empleados <span className="text-danger-foreground" aria-hidden>*</span></p>
                      <Button type="button" variant="link" size="sm" onClick={descargarPlantilla}><Download className="size-4" /> Descargar plantilla</Button>
                    </div>
                    {archivoEmpleados.length === 0 ? (
                      <label
                        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                        onDragLeave={() => setDragging(false)}
                        onDrop={(e) => { e.preventDefault(); setDragging(false); cargarArchivo(e.dataTransfer.files?.[0]); }}
                        className={cn(
                          "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-8 text-center transition-colors focus-within:ring-2 focus-within:ring-ring",
                          dragging ? "border-primary bg-primary-soft" : archivoError ? "border-danger bg-danger-soft/40" : "border-input hover:border-primary/60 hover:bg-muted",
                        )}
                      >
                        <span className="flex size-12 items-center justify-center rounded-full bg-primary-soft text-accent-foreground"><Upload className="size-6" aria-hidden /></span>
                        <span className="font-semibold">Arrastra el archivo aquí o haz clic para cargarlo</span>
                        <span className="text-[13px] text-muted-foreground">.txt o .csv · una línea por empleado con el formato <code className="rounded bg-muted px-1">Nombre;Cedula</code></span>
                        <input key={fileInputKey} type="file" accept=".txt,.csv,text/plain" className="sr-only" onChange={(e) => cargarArchivo(e.target.files?.[0])} aria-describedby="archivo-ayuda" />
                      </label>
                    ) : (
                      <div className="rounded-xl border">
                        <div className="flex items-center gap-3 border-b p-3">
                          <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-success-soft text-success-foreground"><FileText className="size-5" aria-hidden /></span>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-semibold">{archivoNombre}</p>
                            <p className="text-xs text-muted-foreground">{archivoEmpleados.length} {archivoEmpleados.length === 1 ? "empleado cargado" : "empleados cargados"}</p>
                          </div>
                          <Button type="button" variant="ghost" size="sm" onClick={quitarArchivo}><X /> Quitar</Button>
                        </div>
                        <ul className="max-h-56 divide-y overflow-y-auto text-sm" aria-label="Empleados del archivo">
                          {archivoEmpleados.map((e, i) => (
                            <li key={`${e.cedula}-${i}`} className="flex justify-between gap-3 px-3 py-2">
                              <span className="truncate">{e.nombre}</span>
                              <span className="shrink-0 tabular-nums text-muted-foreground">{e.cedula}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    <p id="archivo-ayuda" className="sr-only">Formato: Nombre;Cedula, un empleado por línea.</p>
                    {(archivoError || (touched1 && archivoFalta && !archivoError)) && (
                      <p role="alert" className="text-[13px] font-medium text-danger-foreground">{archivoError ?? archivoFalta}</p>
                    )}
                    {lineasIgnoradas > 0 && archivoEmpleados.length > 0 && (
                      <p className="flex items-start gap-2 rounded-lg bg-warning-soft px-3 py-2 text-[13px] text-warning-foreground">
                        <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden /> Se ignoraron {lineasIgnoradas} {lineasIgnoradas === 1 ? "línea" : "líneas"} sin el formato Nombre;Cedula.
                      </p>
                    )}
                    {duplicadas > 0 && (
                      <p className="flex items-start gap-2 rounded-lg bg-warning-soft px-3 py-2 text-[13px] text-warning-foreground">
                        <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden /> Hay {duplicadas} {duplicadas === 1 ? "cédula repetida" : "cédulas repetidas"} en el archivo; cada línea recibirá su propia cita.
                      </p>
                    )}
                  </div>
                )}

                <TipoExamenPicker tipos={tiposDisponibles} loading={tiposLoading} value={tipoExamen} onChange={setTipoExamen} error={touched1 ? tipoError : null} />
              </CardContent>
            </Card>
            <Resumen className="hidden lg:col-span-5 lg:block xl:col-span-4" rows={resumenRows} title="Resumen de la solicitud" />
          </>
        )}

        {/* ── Paso 2 · Ubicación ── */}
        {step === 2 && (
          <UbicacionStep
            headingRef={headingRef}
            step={current}
            total={TOTAL}
            depto={depto}
            ciudad={ciudad}
            direccion={direccion}
            userLoc={userLoc}
            search={search}
            direccionLabel="Dirección de referencia"
            descripcion="Indica la ciudad y, si quieres, la dirección de la empresa o del empleado para ordenar las IPS por cercanía."
            onDepto={(v) => { setDepto(v); const first = DEPARTAMENTOS.find((d) => d.nombre === v)?.ciudades[0]; if (first) setCiudad(first.nombre); setUserLoc(null); resetIps(); }}
            onCiudad={(v) => { setCiudad(v); setUserLoc(null); resetIps(); }}
            onDireccion={setDireccion}
            onLocation={(loc, formatted) => { setUserLoc(loc); if (formatted) setDireccion(formatted); resetIps(); }}
            onSelectIps={selectIps}
          />
        )}

        {/* ── Paso 3 · IPS ── */}
        {step === 3 && (
          <IpsStep
            headingRef={headingRef}
            step={current}
            total={TOTAL}
            ciudad={ciudad}
            userLoc={userLoc}
            search={search}
            filtro={filtro}
            setFiltro={setFiltro}
            selectedIps={selectedIps}
            onSelect={selectIps}
            onElegir={elegirIps}
            onCambiarCiudad={() => setStep(2)}
            cuposNecesarios={modo === "masivo" ? archivoEmpleados.length : undefined}
          />
        )}

        {/* ── Paso 4 · Horario (individual) o asignación (masivo) ── */}
        {step === 4 && (
          <>
            <Card className="lg:col-span-7 xl:col-span-8">
              <StepHeading
                refEl={headingRef}
                step={current}
                total={TOTAL}
                description={modo === "individual"
                  ? <>Horarios disponibles en <strong className="text-foreground">{ipsSel?.nombre}</strong>.</>
                  : <>Cada empleado recibe el siguiente horario libre de <strong className="text-foreground">{ipsSel?.nombre}</strong>, en orden cronológico.</>}
              />
              <CardContent className="space-y-6">
                {modo === "individual" ? (
                  <HorarioPicker
                    slots={slotsIps}
                    loading={slotsLoading}
                    selectedSlot={selectedSlot}
                    onSelectSlot={setSelectedSlot}
                    selectedFecha={selectedFecha}
                    onSelectFecha={(f) => { setSelectedFecha(f); setSelectedSlot(null); }}
                    onOtraIps={() => setStep(3)}
                  />
                ) : (
                  <AsignacionMasiva pares={pares} loading={slotsLoading} conSlot={conSlot} sinSlot={sinSlot} onOtraIps={() => setStep(3)} />
                )}
              </CardContent>
            </Card>
            <Resumen className="lg:col-span-5 xl:col-span-4" rows={resumenRows} title="Resumen de la solicitud" />
          </>
        )}

        {/* ── Paso 5 · Confirmación ── */}
        {step === 5 && (
          <Card className="lg:col-span-8 lg:col-start-3">
            <StepHeading
              refEl={headingRef}
              step={current}
              total={TOTAL}
              description={modo === "individual" ? "Revisa los datos de la cita antes de confirmarla." : "Revisa la asignación antes de agendar todas las citas."}
            />
            <CardContent className="space-y-5">
              {modo === "individual" && slotSel ? (
                <>
                  <div className="flex items-center gap-4 rounded-xl bg-primary p-4 text-primary-foreground">
                    <div className="flex w-16 shrink-0 flex-col items-center rounded-lg bg-white/15 py-2" aria-hidden>
                      <span className="text-xs font-semibold uppercase">{fechaPartes(slotSel.fecha).mes}</span>
                      <span className="text-2xl font-bold leading-none">{fechaPartes(slotSel.fecha).dia}</span>
                    </div>
                    <div>
                      <p className="text-lg font-semibold">{capitalizar(formatFecha(slotSel.fecha))}</p>
                      <p className="opacity-90">{formatHora(slotSel.hora)} · {slotSel.servicio}</p>
                    </div>
                  </div>
                  <dl className="divide-y rounded-xl border">
                    <ConfirmRow icon={UserRound} label="Empleado" value={`${empleadoNombre.trim()} · ${empleadoCedula.trim()}`} onEdit={() => setStep(1)} />
                    <ConfirmRow icon={ClipboardList} label="Examen" value={`Examen de ${tipoExamen.toLowerCase()}`} onEdit={() => setStep(1)} />
                    <ConfirmRow icon={Building2} label="IPS" value={ipsSel?.nombre ?? ""} sub={[ipsSel?.direccion, slotSel.ciudad].filter(Boolean).join(" · ")} onEdit={() => setStep(3)} />
                    <ConfirmRow icon={CalendarClock} label="Fecha y hora" value={`${formatFechaCorta(slotSel.fecha)}, ${formatHora(slotSel.hora)}`} onEdit={() => setStep(4)} />
                  </dl>
                </>
              ) : (
                <>
                  <div className="flex items-center gap-4 rounded-xl bg-primary p-4 text-primary-foreground">
                    <div className="flex size-14 shrink-0 items-center justify-center rounded-lg bg-white/15 text-2xl font-bold" aria-hidden>{conSlot}</div>
                    <div>
                      <p className="text-lg font-semibold">{conSlot} {conSlot === 1 ? "cita se agendará" : "citas se agendarán"}</p>
                      <p className="opacity-90">
                        {primerAsignado && ultimoAsignado
                          ? primerAsignado.fecha === ultimoAsignado.fecha
                            ? capitalizar(formatFecha(primerAsignado.fecha))
                            : `Del ${formatFechaCorta(primerAsignado.fecha)} al ${formatFechaCorta(ultimoAsignado.fecha)}`
                          : ""}
                      </p>
                    </div>
                  </div>
                  <dl className="divide-y rounded-xl border">
                    <ConfirmRow icon={Users} label="Empleados" value={`${conSlot} de ${pares.length} con horario`} sub={archivoNombre ?? undefined} onEdit={() => setStep(1)} />
                    <ConfirmRow icon={ClipboardList} label="Examen" value={`Examen de ${tipoExamen.toLowerCase()}`} onEdit={() => setStep(1)} />
                    <ConfirmRow icon={Building2} label="IPS" value={ipsSel?.nombre ?? ""} sub={[ipsSel?.direccion, ciudad].filter(Boolean).join(" · ")} onEdit={() => setStep(3)} />
                    <ConfirmRow icon={ListChecks} label="Asignación" value="Horarios en orden cronológico" onEdit={() => setStep(4)} />
                  </dl>
                  {sinSlot > 0 && (
                    <p className="flex items-start gap-2 rounded-lg bg-warning-soft px-3 py-2 text-[13px] text-warning-foreground">
                      <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
                      {sinSlot} {sinSlot === 1 ? "empleado quedará" : "empleados quedarán"} sin cita por falta de horarios. Podrás agendarlos después con otra IPS.
                    </p>
                  )}
                </>
              )}
              <p className="flex items-start gap-2 rounded-lg bg-info-soft px-3 py-2 text-[13px] text-info-foreground">
                <Info className="mt-0.5 size-4 shrink-0" aria-hidden /> Recibirás una notificación de confirmación. Los empleados deben llegar 15 minutos antes con su documento.
              </p>
              {bookError && <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm font-medium text-danger-foreground">{bookError}</p>}
            </CardContent>
          </Card>
        )}
      </div>

      <WizardNav
        step={step}
        total={TOTAL}
        onBack={() => step > 1 && setStep(step - 1)}
        onNext={next}
        nextDisabled={(step === 3 && !selectedIps) || (step === 4 && modo === "masivo" && !slotsLoading && conSlot === 0)}
        finalAction={
          modo === "individual" ? (
            <Button onClick={submit} size="lg" disabled={bookAppointment.isPending || !slotSel}>
              {bookAppointment.isPending ? <><Loader2 className="animate-spin" /> Agendando…</> : <><Check /> Confirmar cita</>}
            </Button>
          ) : (
            <Button onClick={submitMasivo} size="lg" disabled={bookAppointmentsBatch.isPending || conSlot === 0}>
              {bookAppointmentsBatch.isPending ? <><Loader2 className="animate-spin" /> Agendando…</> : <><Check /> Agendar {conSlot} {conSlot === 1 ? "cita" : "citas"}</>}
            </Button>
          )
        }
      />
    </div>
  );
}

function AsignacionMasiva({
  pares, loading, conSlot, sinSlot, onOtraIps,
}: {
  pares: { empleado: Empleado; slot: Slot | null }[];
  loading: boolean;
  conSlot: number;
  sinSlot: number;
  onOtraIps: () => void;
}) {
  if (loading) return <p className="py-6 text-center text-sm text-muted-foreground" role="status">Calculando la asignación…</p>;
  if (conSlot === 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-8 text-center">
        <span className="flex size-12 items-center justify-center rounded-full bg-warning-soft text-warning-foreground"><AlertTriangle className="size-6" aria-hidden /></span>
        <p className="font-semibold">Esta IPS no tiene horarios disponibles</p>
        <Button variant="outline" onClick={onOtraIps}><Building2 /> Elegir otra IPS</Button>
      </div>
    );
  }
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 text-sm" aria-live="polite">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-success-soft px-3 py-1.5 font-medium text-success-foreground">
          <Check className="size-4" aria-hidden /> {conSlot} con horario
        </span>
        {sinSlot > 0 && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-warning-soft px-3 py-1.5 font-medium text-warning-foreground">
            <AlertTriangle className="size-4" aria-hidden /> {sinSlot} sin horario
          </span>
        )}
      </div>
      {sinSlot > 0 && (
        <p className="rounded-lg bg-warning-soft px-3 py-2 text-[13px] text-warning-foreground">
          Solo se agendarán <strong>{conSlot}</strong> de <strong>{pares.length}</strong> empleados: no hay suficientes horarios disponibles en esta IPS.
        </p>
      )}
      {/* Tabla en tablet/escritorio */}
      <div className="hidden max-h-[480px] overflow-auto rounded-xl border md:block">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-surface">
            <tr className="border-b text-left text-muted-foreground">
              <th className="px-4 py-2.5 font-medium">#</th>
              <th className="px-4 py-2.5 font-medium">Empleado</th>
              <th className="px-4 py-2.5 font-medium">Cédula</th>
              <th className="px-4 py-2.5 font-medium">Horario asignado</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {pares.map(({ empleado, slot }, idx) => (
              <tr key={idx} className={cn(!slot && "bg-warning-soft/40")}>
                <td className="px-4 py-2.5 tabular-nums text-muted-foreground">{idx + 1}</td>
                <td className="px-4 py-2.5 font-medium">{empleado.nombre}</td>
                <td className="px-4 py-2.5 tabular-nums text-muted-foreground">{empleado.cedula}</td>
                <td className="px-4 py-2.5">
                  {slot ? (
                    <span className="whitespace-nowrap">{formatFechaCorta(slot.fecha)} · {formatHora(slot.hora)} <span className="text-muted-foreground">· {slot.servicio}</span></span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-[13px] font-medium text-warning-foreground"><AlertTriangle className="size-3.5" aria-hidden /> Sin horario disponible</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {/* Tarjetas en móvil */}
      <ul className="divide-y rounded-xl border md:hidden">
        {pares.map(({ empleado, slot }, idx) => (
          <li key={idx} className={cn("p-3", !slot && "bg-warning-soft/40")}>
            <div className="flex justify-between gap-2">
              <span className="font-medium">{empleado.nombre}</span>
              <span className="tabular-nums text-sm text-muted-foreground">{empleado.cedula}</span>
            </div>
            <p className={cn("mt-0.5 text-[13px]", slot ? "text-muted-foreground" : "font-medium text-warning-foreground")}>
              {slot ? `${formatFechaCorta(slot.fecha)} · ${formatHora(slot.hora)} · ${slot.servicio}` : "Sin horario disponible"}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Exito({ resultado, headingRef, onOtra }: { resultado: Resultado; headingRef: React.RefObject<HTMLHeadingElement | null>; onOtra: () => void }) {
  if (resultado.modo === "individual") {
    const r = resultado;
    const mapa = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${r.ips}, ${r.direccion ?? ""}, ${r.ciudad}, Colombia`)}`;
    return (
      <SuccessCard headingRef={headingRef} title="¡La cita quedó agendada!" subtitle="Te enviamos una notificación con los detalles.">
        <dl className="space-y-3 rounded-xl border p-4 text-sm">
          <div className="flex justify-between gap-4"><dt className="text-muted-foreground">Empleado</dt><dd className="text-right font-medium">{r.empleado.nombre} · {r.empleado.cedula}</dd></div>
          <div className="flex justify-between gap-4"><dt className="text-muted-foreground">Examen</dt><dd className="text-right font-medium">Examen de {r.tipo.toLowerCase()} · {r.servicio}</dd></div>
          <div className="flex justify-between gap-4"><dt className="text-muted-foreground">Fecha</dt><dd className="text-right font-medium">{capitalizar(formatFecha(r.fecha))}, {formatHora(r.hora)}</dd></div>
          <div className="flex justify-between gap-4"><dt className="text-muted-foreground">IPS</dt><dd className="text-right font-medium">{r.ips}</dd></div>
        </dl>
        <div className="grid gap-2 sm:grid-cols-2">
          <Link to="/app/empresa/citas" className={buttonVariants({ size: "lg" })}><CalendarClock /> Ver citas</Link>
          <a href={mapa} target="_blank" rel="noopener noreferrer" className={buttonVariants({ variant: "outline", size: "lg" })}>
            <Navigation /> Ver ubicación<span className="sr-only"> (pestaña nueva)</span>
          </a>
        </div>
        <div className="flex justify-center pt-1">
          <Button variant="link" onClick={onOtra}><CalendarPlus className="size-4" /> Agendar otra cita</Button>
        </div>
      </SuccessCard>
    );
  }
  const r = resultado;
  return (
    <SuccessCard
      headingRef={headingRef}
      title={`¡Se agendaron ${r.agendadas} ${r.agendadas === 1 ? "cita" : "citas"}!`}
      subtitle={`Examen de ${r.tipo.toLowerCase()} en ${r.ips}.`}
    >
      {r.sinHorario.length > 0 && (
        <div className="rounded-xl border border-warning/40 bg-warning-soft p-4 text-sm">
          <p className="flex items-center gap-2 font-semibold text-warning-foreground">
            <AlertTriangle className="size-4" aria-hidden /> {r.sinHorario.length} {r.sinHorario.length === 1 ? "empleado quedó" : "empleados quedaron"} sin cita
          </p>
          <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto">
            {r.sinHorario.map((e, i) => <li key={i} className="flex justify-between gap-3"><span>{e.nombre}</span><span className="tabular-nums text-muted-foreground">{e.cedula}</span></li>)}
          </ul>
          <p className="mt-2 text-[13px] text-muted-foreground">Agéndalos con otra IPS o cuando haya nuevos horarios.</p>
        </div>
      )}
      <div className="grid gap-2 sm:grid-cols-2">
        <Link to="/app/empresa/citas" className={buttonVariants({ size: "lg" })}><CalendarClock /> Ver citas</Link>
        <Button variant="outline" size="lg" onClick={onOtra}><CalendarPlus /> Nueva solicitud</Button>
      </div>
    </SuccessCard>
  );
}
