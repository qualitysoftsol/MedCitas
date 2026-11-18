import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle, ArrowRightLeft, CalendarClock, CalendarPlus, Check, ChevronLeft, ChevronRight, CircleCheckBig, ClipboardList,
  Download, FileSpreadsheet, Info, ListChecks, Loader2, MapPin, Plus, RotateCcw, Search, Upload, UserPlus,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { Cargo, Empleado, Enfasis, Servicio, Slot } from "@/lib/database.types";
import { Card, CardContent } from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PageHeader } from "@/components/app/PageHeader";
import { FormField, IconInput } from "@/components/app/FormField";
import { useAuth } from "@/lib/auth-context";
import { useAvailableSlots, useSlots } from "@/lib/hooks/useSlots";
import { errorAgendar, useAgendarCitaEmpresa, useAgendarLoteEmpresa, useAppointments, type FilaLote } from "@/lib/hooks/useAppointments";
import { pruebasDeEnfasis, useServicios, useTiposEvaluacion } from "@/lib/hooks/useCatalogos";
import { formatDocumento, nombreCompleto, useCargos, useEmpleados } from "@/lib/hooks/useEmpresa";
import {
  erroresDatos, formatDuracion, indicacionesDe, limpiarDatos, type DatosEvaluacion,
} from "@/lib/datosEvaluacion";
import {
  ArchivoError, descargarErrores, descargarPlantilla, leerArchivo, normalizar, validarFilas, type ArchivoLeido, type FilaValidada,
} from "@/lib/archivoEmpleados";
import { intervaloHabitual, repartir } from "@/lib/repartoTurnos";
import { capitalizar, fechaPartes, formatFechaLarga, formatHora, formatPesos, hoyISO, iniciales, parseFecha, primerNombre } from "@/lib/format";
import { Stepper, SuccessCard, type WizardStep } from "@/components/solicitar/WizardParts";
import { esFuturo, useIpsSearch, type LatLng } from "@/components/solicitar/useIpsSearch";
import { useEvaluacion } from "@/components/solicitar/useEvaluacion";
import { DatosEvaluacionForm, MotivoPicker, type Referencia } from "@/components/evaluacion/MotivoEvaluacion";
import { EnfasisChips } from "@/components/evaluacion/EnfasisChips";
import { IpsEleccion } from "@/components/evaluacion/IpsEleccion";
import { SemanaHorarios } from "@/components/evaluacion/SemanaHorarios";
import { AntesDeTuCita, Dato, Encabezado, FilaRevision, IndicacionesPlegables, PanelResumen, PasoNav } from "@/components/evaluacion/Piezas";
import { EmpleadoForm } from "@/components/empresa/EmpleadoForm";
import { CargoForm } from "@/components/empresa/CargoForm";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/app/empresa/solicitar")({
  component: EmpresaSolicitar,
});

type Modo = "individual" | "masivo";
type Orden = "archivo" | "cargo" | "alfabetico";

const TOTAL = 4;
const pasos = (modo: Modo): readonly WizardStep[] => [
  { id: 1, title: "Empleados y evaluación", short: "Evaluación", icon: ClipboardList },
  { id: 2, title: "IPS", short: "IPS", icon: MapPin },
  modo === "individual"
    ? { id: 3, title: "Fecha y hora", short: "Horario", icon: CalendarClock }
    : { id: 3, title: "Asignación de horarios", short: "Horarios", icon: ListChecks },
  { id: 4, title: "Confirmar", short: "Confirmar", icon: CircleCheckBig },
];

/** Tipos que se agendan en lote (agendar_lote_empresa): no dependen de fechas de cada persona. */
const TIPOS_LOTE = ["PRE_INGRESO", "PERIODICA", "EGRESO"];
const NOMBRE_LOTE: Record<string, string> = { PERIODICA: "Periódica · programada" };
const MAX_POR_DIA = [2, 4, 6, 8, 10, 15, 20, 50];
const CREAR = "__crear__";
const FILAS_VISIBLES = 6;

/** "mar 24 nov 2026" */
function fechaCorta(fecha: string) {
  const p = fechaPartes(fecha);
  return `${p.semana} ${p.dia} ${p.mes.toLowerCase()} ${parseFecha(fecha).getFullYear()}`;
}

type Resultado =
  | { modo: "individual"; nombre: string; fecha: string; hora: string; ips: string; tipo: string; pruebas: string; valor: number }
  | { modo: "masivo"; agendadas: number; ips: string; tipo: string; total: number };

function EmpresaSolicitar() {
  const { profile } = useAuth();
  const qc = useQueryClient();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [done, setDone] = useState<Resultado | null>(null);

  const [modo, setModo] = useState<Modo>("individual");
  const [step, setStep] = useState(1);
  const [maxStep, setMaxStep] = useState(1);
  const [touched1, setTouched1] = useState(false);

  // Individual
  const [empleadoId, setEmpleadoId] = useState<string | null>(null);
  const [nuevoEmpleado, setNuevoEmpleado] = useState<Empleado | "nuevo" | null>(null);
  const [codigo, setCodigo] = useState("");
  const [datos, setDatos] = useState<DatosEvaluacion>({});
  const [cargoNuevoId, setCargoNuevoId] = useState("");
  const [enfasisPropios, setEnfasisPropios] = useState<string[] | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);

  // Lote
  const [codigoLote, setCodigoLote] = useState("PRE_INGRESO");
  const [archivo, setArchivo] = useState<ArchivoLeido | null>(null);
  const [archivoError, setArchivoError] = useState<string | null>(null);
  const [leyendo, setLeyendo] = useState(false);
  const [fileKey, setFileKey] = useState(0);
  const [quitadas, setQuitadas] = useState<Set<number>>(new Set());
  const [mapeo, setMapeo] = useState<Record<string, string>>({});
  const [crearCargo, setCrearCargo] = useState<string | null>(null);
  const [soloListos, setSoloListos] = useState(false);
  const [verTodas, setVerTodas] = useState(false);
  const [desde, setDesde] = useState("");
  const [primerTurno, setPrimerTurno] = useState("");
  const [maxDia, setMaxDia] = useState(6);
  const [orden, setOrden] = useState<Orden>("archivo");
  const [manual, setManual] = useState<Record<string, string>>({});
  const [moviendo, setMoviendo] = useState<string | null>(null);

  // Ubicación, IPS y confirmación
  const [depto, setDepto] = useState(profile?.departamento || "Cundinamarca");
  const [ciudad, setCiudad] = useState(profile?.ciudad || "Bogotá");
  const [direccion, setDireccion] = useState(profile?.direccion ?? "");
  const [userLoc, setUserLoc] = useState<LatLng | null>(null);
  const [selectedIps, setSelectedIps] = useState<string | null>(null);
  const [avisar, setAvisar] = useState(true);
  const [bookError, setBookError] = useState<string | null>(null);

  const perfilCargado = useRef(false);
  useEffect(() => {
    if (!profile || perfilCargado.current) return;
    perfilCargado.current = true;
    if (profile.departamento) setDepto(profile.departamento);
    if (profile.ciudad) setCiudad(profile.ciudad);
    if (profile.direccion) setDireccion(profile.direccion);
  }, [profile]);

  const { data: empleados = [], isLoading: empleadosLoading } = useEmpleados(profile?.id);
  const { data: cargos = [] } = useCargos(profile?.id);
  const { data: servicios = [] } = useServicios();
  const { data: tipos = [], isLoading: tiposLoading } = useTiposEvaluacion();
  const tiposEmpresa = useMemo(() => tipos.filter((t) => t.roles_permitidos.includes("empresa")), [tipos]);
  const tiposLote = tiposEmpresa.filter((t) => TIPOS_LOTE.includes(t.codigo));
  const diasCredito = profile?.dias_credito ?? 30;

  // ── Individual: empleado, evaluación y énfasis ──
  const empleado = empleados.find((e) => e.id === empleadoId) ?? null;
  const cargoEmpleado = cargos.find((c) => c.id === empleado?.cargo_id) ?? null;
  const tipo = tiposEmpresa.find((t) => t.codigo === codigo) ?? null;
  const cambioOcupacion = codigo === "PERIODICA" && datos.motivo === "cambio_ocupacion";
  const cargoNuevo = cargos.find((c) => c.id === cargoNuevoId) ?? null;
  const cargoEval = cambioOcupacion ? cargoNuevo : cargoEmpleado;
  const enfasisInd = useMemo(() => enfasisPropios ?? cargoEval?.enfasis_ids ?? [], [enfasisPropios, cargoEval]);
  // La empresa y el cargo no se piden: salen de quien agenda y del empleado.
  const datosCompletos: DatosEvaluacion = useMemo(() => {
    if (codigo === "PRE_INGRESO") return { ...datos, empresa: profile?.nombre, cargo: cargoEmpleado?.nombre };
    if (codigo === "PERIODICA") return { ...datos, cargo: cargoEval?.nombre };
    if (codigo === "EGRESO") return { ...datos, empresa: profile?.nombre };
    return datos;
  }, [codigo, datos, profile?.nombre, cargoEmpleado, cargoEval]);
  const errores = tipo ? erroresDatos(tipo.codigo, datosCompletos) : {};

  const { data: misCitas = [] } = useAppointments(profile?.id, profile?.role);
  const referencias: Referencia[] = useMemo(
    () => (empleado ? misCitas.filter((a) => a.estado === "atendida" && a.empleado_cedula === empleado.numero) : [])
      .map((a) => ({ id: a.id, label: `${a.tipo_examen} · ${fechaCorta(a.fecha)}` })),
    [misCitas, empleado],
  );

  // ── Lote: filas del archivo ──
  const validadas = useMemo(() => (archivo ? validarFilas(archivo.filas, cargos, codigoLote, mapeo) : []), [archivo, cargos, codigoLote, mapeo]);
  const activas = validadas.filter((f) => !quitadas.has(f.fila));
  const listas = activas.filter((f) => f.errores.length === 0);
  const conError = activas.filter((f) => f.errores.length > 0);
  const enfasisLote = useMemo(() => Array.from(new Set(listas.flatMap((f) => f.cargoObj!.enfasis_ids))), [listas]);

  // ── Pruebas, IPS y valor ──
  const evaluacion = useEvaluacion(modo === "individual" ? enfasisInd : enfasisLote);
  const search = useIpsSearch({ depto, ciudad, userLoc, filtro: [], selectedIps, pruebas: evaluacion.pruebas });
  const ipsSel = search.ipsEnCiudad.find((i) => i.id === selectedIps) ?? null;
  const cobertura = search.coberturaDe(selectedIps);
  const precioPrueba = useMemo(() => new Map(cobertura?.hechas.map((h) => [h.id, h.total]) ?? []), [cobertura]);
  const ipsOk = !!cobertura && cobertura.hechas.length > 0 && (modo === "individual" || cobertura.faltan.length === 0) && !!search.disponibilidad.get(selectedIps ?? "");

  const hoy = hoyISO();
  const { data: libresRaw = [], isLoading: slotsLoading, refetch: refetchSlots } = useAvailableSlots(selectedIps);
  const { data: todosSlots = [] } = useSlots(selectedIps ?? undefined);
  const libres = useMemo(() => libresRaw.filter((s) => esFuturo(s, hoy)), [libresRaw, hoy]);
  const slotSel = libres.find((s) => s.id === selectedSlot) ?? null;
  const hechas: Servicio[] = evaluacion.pruebas.filter((p) => precioPrueba.has(p.id));
  const duracion = hechas.reduce((t, p) => t + (p.duracion_min ?? 0), 0);
  const indicaciones = indicacionesDe(hechas, tipo);

  // ── Lote: reparto de turnos ──
  const ordenadas = useMemo(() => {
    const l = [...listas];
    if (orden === "cargo") l.sort((a, b) => a.cargoObj!.nombre.localeCompare(b.cargoObj!.nombre) || a.fila - b.fila);
    if (orden === "alfabetico") l.sort((a, b) => `${a.apellidos} ${a.nombres}`.localeCompare(`${b.apellidos} ${b.nombres}`));
    return l;
  }, [listas, orden]);
  const diasConCupos = useMemo(() => Array.from(new Set(libres.map((s) => s.fecha))).sort(), [libres]);
  const desdeEf = diasConCupos.includes(desde) ? desde : diasConCupos[0] ?? "";
  const horasDesde = Array.from(new Set(libres.filter((s) => s.fecha === desdeEf).map((s) => s.hora.slice(0, 5)))).sort();
  const primerTurnoEf = horasDesde.includes(primerTurno) ? primerTurno : horasDesde[0] ?? "00:00";
  const asignacion = useMemo(
    () => repartir(ordenadas.map((f) => String(f.fila)), libres, { desde: desdeEf, primerTurno: primerTurnoEf, maxDia }, manual),
    [ordenadas, libres, desdeEf, primerTurnoEf, maxDia, manual],
  );
  const conTurno = ordenadas.filter((f) => asignacion.get(String(f.fila)));
  const sinTurno = ordenadas.length - conTurno.length;
  const intervalo = useMemo(() => intervaloHabitual(todosSlots.filter((s) => s.fecha >= hoy)), [todosSlots, hoy]);

  // Valor por cargo: cada cargo tiene sus pruebas, todas en la IPS elegida.
  const porCargo = useMemo(() => {
    const grupos = new Map<string, { cargo: Cargo; n: number; pruebas: Servicio[]; porPersona: number }>();
    conTurno.forEach((f) => {
      const c = f.cargoObj!;
      const g = grupos.get(c.id);
      if (g) { g.n += 1; return; }
      const pruebas = pruebasDeEnfasis(c.enfasis_ids, evaluacion.enfasis, servicios);
      grupos.set(c.id, { cargo: c, n: 1, pruebas, porPersona: pruebas.reduce((t, p) => t + (precioPrueba.get(p.id) ?? 0), 0) });
    });
    return [...grupos.values()];
  }, [conTurno, evaluacion.enfasis, servicios, precioPrueba]);
  const totalLote = porCargo.reduce((t, g) => t + g.n * g.porPersona, 0);
  const nombreTipoLote = NOMBRE_LOTE[codigoLote] ?? tiposLote.find((t) => t.codigo === codigoLote)?.nombre ?? "";
  const fechasLote = Array.from(new Set(conTurno.map((f) => asignacion.get(String(f.fila))!.fecha))).sort();

  // ── Validación por paso ──
  const enfasisError = enfasisInd.length === 0
    ? cargoEval ? "El cargo no tiene énfasis. Elige al menos uno." : "Elige al menos un énfasis."
    : !evaluacion.loading && evaluacion.pruebas.length === 0 ? "Estos énfasis no tienen pruebas disponibles por ahora." : null;
  const paso1Ind = !!empleado && !!tipo && Object.keys(errores).length === 0 && !enfasisError;
  const paso1Lote = listas.length > 0 && (conError.length === 0 || soloListos);
  const canNext: Record<number, boolean> = {
    1: modo === "individual" ? paso1Ind : paso1Lote,
    2: ipsOk,
    3: modo === "individual" ? !!slotSel : conTurno.length > 0,
    4: true,
  };

  const STEPS = pasos(modo);
  const goTo = (s: number) => { setStep(s); setMaxStep((m) => Math.max(m, s)); };
  const primerRender = useRef(true);
  useEffect(() => {
    if (primerRender.current) { primerRender.current = false; return; }
    headingRef.current?.focus({ preventScroll: true });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [step, done]);

  const continuar = () => {
    if (step === 1) setTouched1(true);
    if (!canNext[step]) {
      if (step === 1 && modo === "masivo" && listas.length > 0 && conError.length > 0) toast.error("Corrige o quita las filas con error, o marca «Continuar solo con los listos»");
      if (step === 2) toast.error(modo === "masivo" ? "Elige una IPS que haga todas las pruebas" : "Elige una IPS con horarios para continuar");
      if (step === 3) toast.error(modo === "individual" ? "Elige el día y la hora para continuar" : "No hay cupos para asignar en esta IPS");
      return;
    }
    goTo(step + 1);
  };

  // Lo que cambia las pruebas obliga a elegir de nuevo IPS y horario.
  const reiniciarDesdeIps = () => { setSelectedIps(null); setSelectedSlot(null); setManual({}); setMaxStep(1); };
  const cambiarModo = (m: Modo) => { if (m === modo) return; setModo(m); setTouched1(false); reiniciarDesdeIps(); };
  const elegirEmpleado = (id: string) => { setEmpleadoId(id); setEnfasisPropios(null); setDatos({}); reiniciarDesdeIps(); };
  const cambiarTipo = (c: string) => { if (c !== codigo) { setCodigo(c); setDatos({}); setEnfasisPropios(null); reiniciarDesdeIps(); } };
  const cambiarDatos = (d: DatosEvaluacion) => {
    if (d.motivo !== datos.motivo) { setEnfasisPropios(null); reiniciarDesdeIps(); }
    setDatos(d);
  };
  const elegirIps = (id: string) => { if (id !== selectedIps) { setSelectedSlot(null); setManual({}); } setSelectedIps(id); setMaxStep(2); };
  const resetIps = () => { setSelectedIps(null); setSelectedSlot(null); setManual({}); setMaxStep(Math.min(maxStep, 2)); };

  const cargarArchivo = async (file: File | undefined) => {
    if (!file) return;
    setLeyendo(true);
    setArchivoError(null);
    try {
      const leido = await leerArchivo(file);
      setArchivo(leido); setQuitadas(new Set()); setMapeo({}); setSoloListos(false); setVerTodas(false); reiniciarDesdeIps();
    } catch (e) {
      setArchivoError(e instanceof ArchivoError ? e.message : "No pudimos leer el archivo. Inténtalo de nuevo.");
    } finally {
      setLeyendo(false);
      setFileKey((k) => k + 1);
    }
  };

  const manejarError = (err: unknown) => {
    const { codigo: cod, mensaje, cuposTomados } = errorAgendar(err);
    const msg = cod === "HORARIO_TOMADO"
      ? modo === "masivo" ? "Algunos turnos acaban de ser tomados. Volvimos a repartir con los cupos libres: revisa la asignación." : "Ese horario ya no está disponible. Elige otro, por favor."
      : cod ? mensaje
        : mensaje.includes("Failed to fetch") ? "Sin conexión. Revisa tu internet e inténtalo de nuevo." : "No pudimos agendar. Inténtalo de nuevo.";
    setBookError(msg);
    toast.error(msg);
    if (cod === "HORARIO_TOMADO") {
      setSelectedSlot(null);
      setManual((m) => Object.fromEntries(Object.entries(m).filter(([, s]) => !cuposTomados.includes(s))));
      void refetchSlots();
      setStep(3);
    }
    if (cod === "SIN_PRUEBAS" || cod === "PRUEBAS_INCOMPLETAS") { void qc.invalidateQueries({ queryKey: ["precios-servicios"] }); setStep(2); }
    if (cod === "DATOS_INVALIDOS") { setTouched1(true); setStep(1); }
  };

  const agendarCita = useAgendarCitaEmpresa();
  const agendarLote = useAgendarLoteEmpresa();

  const confirmar = () => {
    setBookError(null);
    if (!selectedIps || !profile) return;
    if (modo === "individual") {
      if (!empleado || !tipo || !slotSel || !cobertura) return;
      agendarCita.mutate(
        {
          ips_id: selectedIps,
          tipo_evaluacion: tipo.codigo,
          avisar,
          cita: { empleado_id: empleado.id, slot_id: slotSel.id, enfasis_ids: enfasisInd, cargo: cargoEval?.nombre ?? null, datos: limpiarDatos(tipo.codigo, datosCompletos) },
        },
        {
          onSuccess: () => setDone({
            modo: "individual", nombre: nombreCompleto(empleado), fecha: slotSel.fecha, hora: slotSel.hora, ips: ipsSel?.nombre ?? "",
            tipo: tipo.nombre, pruebas: cobertura.hechas.map((h) => h.nombre).join(", "), valor: cobertura.total,
          }),
          onError: manejarError,
        },
      );
      return;
    }
    const filas: FilaLote[] = conTurno.map((f) => ({
      slot_id: asignacion.get(String(f.fila))!.id,
      tipo_doc: f.tipoDoc!, numero: f.numero, nombres: f.nombres, apellidos: f.apellidos, cargo_id: f.cargoObj!.id,
      celular: f.celular || null, correo: f.correo || null, fecha_retiro: codigoLote === "EGRESO" ? f.fecha_retiro : null,
    }));
    agendarLote.mutate(
      { ips_id: selectedIps, tipo_evaluacion: codigoLote, avisar, filas },
      {
        onSuccess: (n) => setDone({ modo: "masivo", agendadas: n, ips: ipsSel?.nombre ?? "", tipo: nombreTipoLote, total: totalLote }),
        onError: manejarError,
      },
    );
  };

  const reiniciar = () => {
    setDone(null); setStep(1); setMaxStep(1); setTouched1(false); setEmpleadoId(null); setCodigo(""); setDatos({});
    setEnfasisPropios(null); setArchivo(null); setQuitadas(new Set()); setMapeo({}); reiniciarDesdeIps(); setBookError(null);
  };

  const pendiente = agendarCita.isPending || agendarLote.isPending;

  if (done) return <Exito resultado={done} headingRef={headingRef} onOtra={reiniciar} />;

  const navPaso = (siguiente: string) => (
    <PasoNav
      atras={step === 1 ? <Link to="/app/empresa/citas" className={buttonVariants({ variant: "ghost" })}>Cancelar</Link> : <Button variant="ghost" onClick={() => setStep(step - 1)}><ChevronLeft /> Atrás</Button>}
      siguiente={<Button size="lg" onClick={continuar}>{siguiente} <ChevronRight /></Button>}
    />
  );

  const facturaA = <Dato label="Factura a nombre de">{profile?.nombre}</Dato>;

  return (
    <div className="space-y-6">
      <PageHeader icon={CalendarPlus} title="Solicitar cita" description="Agenda evaluaciones para uno o varios empleados en 4 pasos." />
      <Stepper steps={STEPS} step={step} maxStep={maxStep} onGo={(s) => s <= maxStep && setStep(s)} />

      <div className="grid gap-6 lg:grid-cols-12">
        {/* ── Paso 1 · Empleados y evaluación ── */}
        {step === 1 && (
          <>
            <Card className="lg:col-span-8">
              <CardContent className="space-y-6 p-5 md:p-6">
                <Encabezado refEl={headingRef} paso={1} total={TOTAL} titulo="¿A quién vas a agendar?" />
                <div className="grid gap-3 sm:grid-cols-2" role="radiogroup" aria-label="A quién vas a agendar">
                  {([
                    { id: "individual", titulo: "Un empleado", desc: "Eliges tú la IPS, el día y la hora. Sirve para cualquier tipo de evaluación." },
                    { id: "masivo", titulo: "Varios empleados (archivo)", desc: "Subes un archivo y asignamos horarios seguidos en una misma IPS." },
                  ] as const).map((o) => (
                    <label key={o.id} className={cn("cursor-pointer rounded-xl border-2 p-4 transition-colors focus-within:ring-2 focus-within:ring-ring", modo === o.id ? "border-primary bg-primary-soft" : "border-border hover:border-primary/40")}>
                      <input type="radio" name="modo" className="sr-only" checked={modo === o.id} onChange={() => cambiarModo(o.id)} />
                      <span className="block font-semibold">{o.titulo}</span>
                      <span className="block text-[13px] text-muted-foreground">{o.desc}</span>
                    </label>
                  ))}
                </div>

                {modo === "individual" ? (
                  <>
                    <EmpleadoPicker
                      empleados={empleados}
                      cargos={cargos}
                      loading={empleadosLoading}
                      seleccionado={empleado}
                      onSelect={elegirEmpleado}
                      onCambiar={() => setEmpleadoId(null)}
                      onNuevo={() => setNuevoEmpleado("nuevo")}
                      onEditar={(e) => setNuevoEmpleado(e)}
                      error={touched1 && !empleado ? "Elige el empleado." : null}
                    />
                    <MotivoPicker tipos={tiposEmpresa} loading={tiposLoading} value={codigo} onChange={cambiarTipo} error={touched1 && !tipo ? "Elige el motivo de la evaluación." : null} />
                    {tipo && (
                      <DatosEvaluacionForm
                        tipo={tipo}
                        datos={datos}
                        onChange={cambiarDatos}
                        errores={errores}
                        mostrarErrores={touched1}
                        referencias={referencias}
                        voz="empresa"
                        campoCargo={
                          <FormField id="cargo-nuevo" label="Cargo nuevo" required error={touched1 && !cargoNuevo ? "Elige el cargo nuevo." : null} hint={cargos.length === 0 ? "Crea el cargo en Cargos." : undefined}>
                            <Select value={cargoNuevoId} onValueChange={(v) => { setCargoNuevoId(v); setEnfasisPropios(null); reiniciarDesdeIps(); }}>
                              <SelectTrigger><SelectValue placeholder="Elige el cargo" /></SelectTrigger>
                              <SelectContent>{cargos.map((c) => <SelectItem key={c.id} value={c.id}>{c.nombre}</SelectItem>)}</SelectContent>
                            </Select>
                          </FormField>
                        }
                      />
                    )}
                    {touched1 && empleado && !cargoEmpleado && (codigo === "PRE_INGRESO" || (codigo === "PERIODICA" && !cambioOcupacion)) && (
                      <p role="alert" className="flex items-start gap-2 rounded-lg bg-warning-soft px-3 py-2 text-[13px] text-warning-foreground">
                        <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
                        <span>{empleado.nombres} no tiene cargo, y esta evaluación lo necesita. <button type="button" onClick={() => setNuevoEmpleado(empleado)} className="font-semibold underline">Asígnale uno</button>.</span>
                      </p>
                    )}
                    {empleado && (
                      enfasisPropios === null && cargoEval ? (
                        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3">
                          <div>
                            <p className="text-xs text-muted-foreground">Énfasis tomado del cargo{cambioOcupacion ? " nuevo" : ""}</p>
                            <p className="text-sm font-semibold">{evaluacion.enfasis.filter((e) => enfasisInd.includes(e.id)).map((e) => e.nombre).join(" · ") || "Sin énfasis"}</p>
                          </div>
                          <Button variant="link" size="sm" onClick={() => setEnfasisPropios(enfasisInd)}>Cambiar solo para esta cita</Button>
                        </div>
                      ) : (
                        <EnfasisChips
                          enfasis={evaluacion.enfasis}
                          loading={evaluacion.loading}
                          value={enfasisInd}
                          onChange={(ids) => { setEnfasisPropios(ids); reiniciarDesdeIps(); }}
                          error={touched1 ? enfasisError : null}
                          legend={cargoEval ? "Énfasis solo para esta cita" : "¿A qué riesgos lo expone su trabajo?"}
                          description={cargoEval ? "El cargo del empleado no cambia." : "El empleado no tiene cargo: elige los riesgos para definir las pruebas."}
                        />
                      )
                    )}
                    {touched1 && enfasisError && enfasisPropios === null && cargoEval && (
                      <p className="text-[13px] font-medium text-danger-foreground">{enfasisError}</p>
                    )}
                  </>
                ) : (
                  <PasoArchivo
                    tiposLote={tiposLote}
                    codigo={codigoLote}
                    onCodigo={(c) => { setCodigoLote(c); reiniciarDesdeIps(); }}
                    archivo={archivo}
                    error={archivoError}
                    leyendo={leyendo}
                    fileKey={fileKey}
                    onArchivo={cargarArchivo}
                    validadas={activas}
                    listas={listas.length}
                    conError={conError}
                    cargos={cargos}
                    enfasis={evaluacion.enfasis}
                    verTodas={verTodas}
                    onVerTodas={() => setVerTodas(true)}
                    onQuitar={(fila) => { setQuitadas((q) => new Set(q).add(fila)); reiniciarDesdeIps(); }}
                    onMapear={(cargoArchivo, id) => { if (id === CREAR) setCrearCargo(cargoArchivo); else { setMapeo((m) => ({ ...m, [normalizar(cargoArchivo)]: id })); reiniciarDesdeIps(); } }}
                    soloListos={soloListos}
                    onSoloListos={setSoloListos}
                    touched={touched1}
                  />
                )}

                <div className="border-t pt-4">{navPaso("Continuar: elegir IPS")}</div>
              </CardContent>
            </Card>

            <aside className="lg:col-span-4">
              <div className="lg:sticky lg:top-24">
                <PanelResumen titulo="Resumen de la solicitud">
                  {modo === "individual" ? (
                    <>
                      <Dato label="Empleado">{empleado ? nombreCompleto(empleado) : null}</Dato>
                      <Dato label="Evaluación">{tipo?.nombre}</Dato>
                      <Dato label="Pruebas">{evaluacion.pruebas.map((p) => p.nombre).join(", ") || null}</Dato>
                    </>
                  ) : (
                    <>
                      <Dato label="Empleados">{archivo ? `${listas.length} ${listas.length === 1 ? "listo" : "listos"}${conError.length ? ` · ${conError.length} por corregir` : ""}` : null}</Dato>
                      <Dato label="Evaluación">{nombreTipoLote}</Dato>
                      {listas.length > 0 && (
                        <Dato label="Por cargo">
                          <ul className="space-y-0.5 font-normal">
                            {Object.entries(listas.reduce<Record<string, number>>((m, f) => ({ ...m, [f.cargoObj!.nombre]: (m[f.cargoObj!.nombre] ?? 0) + 1 }), {})).map(([c, n]) => (
                              <li key={c} className="flex justify-between gap-2"><span>{c}</span><span className="font-semibold tabular-nums">{n}</span></li>
                            ))}
                          </ul>
                        </Dato>
                      )}
                    </>
                  )}
                  <div className="border-t pt-3">{facturaA}</div>
                </PanelResumen>
              </div>
            </aside>
          </>
        )}

        {/* ── Paso 2 · IPS ── */}
        {step === 2 && (
          <IpsEleccion
            headingRef={headingRef}
            titulo="Elige la IPS"
            descripcion={modo === "individual"
              ? <>Te mostramos las IPS que hacen las pruebas de la evaluación de <strong className="text-foreground">{empleado ? nombreCompleto(empleado) : ""}</strong>.</>
              : <>Solo puedes elegir IPS que hagan todas las pruebas de {porCargoArchivo(listas)} del lote.</>}
            search={search}
            depto={depto}
            ciudad={ciudad}
            direccion={direccion}
            userLoc={userLoc}
            onDepto={(v) => { setDepto(v); setUserLoc(null); resetIps(); }}
            onCiudad={(v) => { setCiudad(v); setUserLoc(null); resetIps(); }}
            onDireccion={setDireccion}
            onLocation={(loc, formatted) => { setUserLoc(loc); if (formatted) setDireccion(formatted); }}
            selectedIps={selectedIps}
            onSelect={elegirIps}
            requiereTodas={modo === "masivo"}
            resumen={
              <PanelResumen titulo="Resumen de la solicitud">
                <Dato label={modo === "individual" ? "Empleado" : "Empleados"}>{modo === "individual" ? (empleado ? nombreCompleto(empleado) : null) : `${listas.length}`}</Dato>
                <Dato label="Evaluación">{modo === "individual" ? tipo?.nombre : nombreTipoLote}</Dato>
                <Dato label="Pruebas">{evaluacion.pruebas.map((p) => p.nombre).join(", ")}</Dato>
                <Dato label="IPS">{ipsSel?.nombre}</Dato>
              </PanelResumen>
            }
            nav={navPaso(modo === "individual" ? "Continuar: elegir horario" : "Continuar: asignar horarios")}
          />
        )}

        {/* ── Paso 3 · Fecha y hora (individual) ── */}
        {step === 3 && modo === "individual" && (
          <>
            <Card className="lg:col-span-8">
              <CardContent className="space-y-6 p-5 md:p-6">
                <Encabezado
                  refEl={headingRef}
                  paso={3}
                  total={TOTAL}
                  titulo={`¿Cuándo puede ir ${primerNombre(empleado?.nombres)}?`}
                  descripcion={<>Horarios en <strong className="text-foreground">{ipsSel?.nombre}</strong>. <button type="button" onClick={() => setStep(2)} className="font-medium text-foreground underline underline-offset-2">Cambiar IPS</button></>}
                />
                <SemanaHorarios slots={libres} loading={slotsLoading} selectedSlot={selectedSlot} onSelect={setSelectedSlot} onOtraIps={() => setStep(2)} />
                {duracion > 0 && <p className="text-[13px] text-muted-foreground">Todas las pruebas se hacen en la misma visita. Duración aproximada: <strong className="text-foreground">{formatDuracion(duracion)}</strong>.</p>}
                {indicaciones.length > 0 && <AntesDeTuCita indicaciones={indicaciones} titulo="Antes de la cita" />}
                <div className="border-t pt-4">{navPaso("Continuar: confirmar")}</div>
              </CardContent>
            </Card>
            <aside className="lg:col-span-4">
              <div className="lg:sticky lg:top-24">
                <PanelResumen titulo="Resumen de la solicitud">
                  <Dato label="Empleado">{empleado ? nombreCompleto(empleado) : null}</Dato>
                  <Dato label="Evaluación">{tipo?.nombre}</Dato>
                  <Dato label="IPS" sub={ipsSel?.direccion ?? undefined}>{ipsSel?.nombre}</Dato>
                  <Dato label="Fecha y hora">{slotSel ? `${capitalizar(formatFechaLarga(slotSel.fecha))} · ${formatHora(slotSel.hora)}` : null}</Dato>
                  {cobertura && <Total label={`Total (${cobertura.hechas.length} ${cobertura.hechas.length === 1 ? "prueba" : "pruebas"})`} valor={cobertura.total} />}
                </PanelResumen>
              </div>
            </aside>
          </>
        )}

        {/* ── Paso 3 · Asignación de horarios (lote) ── */}
        {step === 3 && modo === "masivo" && (
          <>
            <Card className="lg:col-span-8">
              <CardContent className="space-y-6 p-5 md:p-6">
                <Encabezado
                  refEl={headingRef}
                  paso={3}
                  total={TOTAL}
                  titulo={`Horarios para los ${ordenadas.length} empleados`}
                  descripcion={<>Los asignamos seguidos en <strong className="text-foreground">{ipsSel?.nombre}</strong>, a partir del día y la hora que elijas.</>}
                />
                {slotsLoading ? (
                  <p className="py-6 text-center text-sm text-muted-foreground" role="status">Cargando cupos…</p>
                ) : libres.length === 0 ? (
                  <p className="rounded-lg bg-warning-soft px-3 py-2 text-sm text-warning-foreground">Esta IPS no tiene cupos libres. <button type="button" className="font-semibold underline" onClick={() => setStep(2)}>Elige otra IPS</button>.</p>
                ) : (
                  <>
                    <section className="space-y-4 rounded-xl border bg-surface p-4" aria-label="Cómo repartirlos">
                      <h3 className="font-semibold">Cómo repartirlos</h3>
                      <div className="grid gap-4 sm:grid-cols-3">
                        <FormField id="rep-desde" label="Desde el día">
                          <Select value={desdeEf} onValueChange={(v) => { setDesde(v); setPrimerTurno(""); setManual({}); }}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>{diasConCupos.map((d) => <SelectItem key={d} value={d}>{capitalizar(fechaCorta(d))}</SelectItem>)}</SelectContent>
                          </Select>
                        </FormField>
                        <FormField id="rep-turno" label="Primer turno">
                          <Select value={primerTurnoEf} onValueChange={(v) => { setPrimerTurno(v); setManual({}); }}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>{horasDesde.map((h) => <SelectItem key={h} value={h}>{formatHora(h)}</SelectItem>)}</SelectContent>
                          </Select>
                        </FormField>
                        <FormField id="rep-max" label="Máximo por día">
                          <Select value={String(maxDia)} onValueChange={(v) => { setMaxDia(Number(v)); setManual({}); }}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>{MAX_POR_DIA.map((n) => <SelectItem key={n} value={String(n)}>{n} empleados</SelectItem>)}</SelectContent>
                          </Select>
                        </FormField>
                      </div>
                      <FormField id="rep-orden" label="Orden" className="sm:max-w-xs">
                        <Select value={orden} onValueChange={(v) => { setOrden(v as Orden); setManual({}); }}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="archivo">Como viene en el archivo</SelectItem>
                            <SelectItem value="cargo">Por cargo</SelectItem>
                            <SelectItem value="alfabetico">Alfabético (apellidos)</SelectItem>
                          </SelectContent>
                        </Select>
                      </FormField>
                      <p className="flex items-start gap-2 rounded-lg bg-info-soft px-3 py-2 text-[13px] text-info-foreground">
                        <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
                        <span>
                          {intervalo ? <>Esta IPS recibe un empleado cada <strong>{intervalo} min</strong>. </> : null}
                          Respetamos su horario de atención, saltamos los turnos ya ocupados y pasamos al día siguiente cuando se llena el día.
                        </span>
                      </p>
                    </section>

                    <AsignacionPorDia
                      filas={ordenadas}
                      asignacion={asignacion}
                      todosSlots={todosSlots}
                      sinTurno={sinTurno}
                      onMover={setMoviendo}
                      onRepartir={() => setManual({})}
                    />
                  </>
                )}
                <div className="border-t pt-4">{navPaso("Continuar: confirmar")}</div>
              </CardContent>
            </Card>
            <aside className="lg:col-span-4">
              <div className="lg:sticky lg:top-24">
                <PanelResumen titulo="Resumen de la solicitud">
                  <Dato label="Empleados">{`${conTurno.length}${conError.length ? ` (${conError.length} pendientes por corregir)` : ""}`}</Dato>
                  <Dato label="Evaluación">{nombreTipoLote}</Dato>
                  <Dato label="IPS" sub={`Hace las pruebas de ${porCargoArchivo(listas)}`}>{ipsSel?.nombre}</Dato>
                  <Dato label="Fechas">{fechasLote.length ? listaFechas(fechasLote) : null}</Dato>
                </PanelResumen>
              </div>
            </aside>
          </>
        )}

        {/* ── Paso 4 · Confirmar ── */}
        {step === 4 && cobertura && (
          <Card className="lg:col-span-8 lg:col-start-3">
            <CardContent className="space-y-5 p-5 md:p-6">
              {modo === "individual" && slotSel && empleado && tipo ? (
                <>
                  <Encabezado refEl={headingRef} paso={4} total={TOTAL} titulo="Revisa y confirma la cita" />
                  <div className="flex flex-wrap items-center gap-4 rounded-xl bg-primary p-4 text-primary-foreground">
                    <div className="flex w-14 shrink-0 flex-col items-center rounded-lg bg-white/15 py-1.5" aria-hidden>
                      <span className="text-[11px] font-semibold uppercase">{fechaPartes(slotSel.fecha).mes}</span>
                      <span className="text-2xl font-bold leading-none">{fechaPartes(slotSel.fecha).dia}</span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-lg font-semibold">{capitalizar(formatFechaLarga(slotSel.fecha))} · {formatHora(slotSel.hora)}</p>
                      <p className="text-[13px] opacity-90">{[ipsSel?.nombre, ipsSel?.direccion].filter(Boolean).join(" · ")}</p>
                    </div>
                  </div>
                  <dl className="divide-y rounded-xl border">
                    <FilaRevision label="Empleado" valor={`${nombreCompleto(empleado)} · ${empleado.tipo_doc} ${formatDocumento(empleado.numero)}`} onCambiar={() => setStep(1)} />
                    <FilaRevision label="Evaluación" valor={[tipo.nombre, cargoEval?.nombre].filter(Boolean).join(" · ")} onCambiar={() => setStep(1)} />
                    <FilaRevision label="IPS, fecha y hora" valor={`${ipsSel?.nombre ?? ""} · ${capitalizar(formatFechaLarga(slotSel.fecha))}, ${formatHora(slotSel.hora)}`} onCambiar={() => setStep(2)} />
                  </dl>
                  <section aria-label="Qué incluye y cuánto cuesta">
                    <h3 className="mb-2 font-semibold">Qué incluye y cuánto cuesta</h3>
                    <ul className="divide-y text-sm">
                      {cobertura.hechas.map((p) => <li key={p.id} className="flex justify-between gap-3 py-2"><span>{p.nombre}</span><span className="tabular-nums">{formatPesos(p.total)}</span></li>)}
                    </ul>
                    <Total label="Total" valor={cobertura.total} grande />
                    {cobertura.faltan.length > 0 && <p className="mt-2 text-[13px] text-warning-foreground">Esta IPS no hace: {cobertura.faltan.join(", ")}. Tendría que hacerlas en otra IPS.</p>}
                  </section>
                  {indicaciones.length > 0 && <IndicacionesPlegables indicaciones={indicaciones} titulo="Antes de la cita" />}
                </>
              ) : modo === "masivo" ? (
                <>
                  <Encabezado refEl={headingRef} paso={4} total={TOTAL} titulo={`Revisa y confirma las ${conTurno.length} citas`} />
                  <div className="grid gap-3 rounded-xl bg-primary p-4 text-primary-foreground sm:grid-cols-2">
                    <div><p className="text-xs opacity-80">Evaluación</p><p className="font-semibold">{nombreTipoLote}</p></div>
                    <div><p className="text-xs opacity-80">IPS</p><p className="font-semibold">{ipsSel?.nombre}</p></div>
                    <div className="sm:col-span-2"><p className="text-xs opacity-80">Fechas</p><p className="font-semibold">{listaFechas(fechasLote)}{conTurno[0] && ` · desde ${formatHora(asignacion.get(String(conTurno[0].fila))!.hora)}`}</p></div>
                  </div>
                  <section aria-labelledby="valor-cargo">
                    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                      <h3 id="valor-cargo" className="font-semibold">Valor por cargo</h3>
                      <Button variant="link" size="sm" onClick={() => setStep(3)}>Ver horario de cada empleado</Button>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b text-left text-xs text-muted-foreground">
                            <th className="py-2 pr-3 font-medium">Cargo</th>
                            <th className="py-2 pr-3 font-medium">Pruebas</th>
                            <th className="py-2 pr-3 text-right font-medium">Empleados</th>
                            <th className="py-2 pr-3 text-right font-medium">Por persona</th>
                            <th className="py-2 text-right font-medium">Subtotal</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y">
                          {porCargo.map((g) => (
                            <tr key={g.cargo.id}>
                              <td className="py-2 pr-3 font-medium">{g.cargo.nombre}</td>
                              <td className="py-2 pr-3 text-[13px] text-muted-foreground">{g.pruebas.map((p) => p.nombre).join(", ")}</td>
                              <td className="py-2 pr-3 text-right tabular-nums">{g.n}</td>
                              <td className="whitespace-nowrap py-2 pr-3 text-right tabular-nums">{formatPesos(g.porPersona)}</td>
                              <td className="whitespace-nowrap py-2 text-right font-semibold tabular-nums">{formatPesos(g.n * g.porPersona)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <Total label={`Total · ${conTurno.length} ${conTurno.length === 1 ? "empleado" : "empleados"}`} valor={totalLote} grande />
                  </section>
                </>
              ) : null}

              <section aria-labelledby="forma-pago" className="space-y-2">
                <h3 id="forma-pago" className="font-semibold">Forma de pago</h3>
                <div className="max-w-sm rounded-xl border-2 border-primary bg-primary-soft p-3">
                  <p className="font-semibold">Factura a crédito</p>
                  <p className="text-[13px] text-muted-foreground">A nombre de {profile?.nombre} · vence en {diasCredito} días</p>
                </div>
              </section>

              <AvisoEmpleados
                avisar={avisar}
                onAvisar={setAvisar}
                conCorreo={modo === "individual" ? (empleado?.correo ? 1 : 0) : conTurno.filter((f) => f.correo || empleados.find((e) => e.numero === f.numero)?.correo).length}
                total={modo === "individual" ? 1 : conTurno.length}
              />

              {modo === "masivo" && (conError.length > 0 || sinTurno > 0) && (
                <p className="flex items-start gap-2 rounded-lg bg-warning-soft px-3 py-2 text-[13px] text-warning-foreground">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
                  <span>
                    {conError.length > 0 && <>{conError.length} {conError.length === 1 ? "empleado no entra" : "empleados no entran"} en este lote por errores en el archivo. <button type="button" className="font-semibold underline" onClick={() => void descargarErrores(conError, archivo?.nombre ?? "empleados")}>Descargar filas con error</button> para corregirlas y agendarlas después. </>}
                    {sinTurno > 0 && <>{sinTurno} {sinTurno === 1 ? "empleado se queda" : "empleados se quedan"} sin turno: no alcanzan los cupos de esta IPS.</>}
                  </span>
                </p>
              )}
              <p className="flex items-start gap-2 rounded-lg bg-info-soft px-3 py-2 text-[13px] text-info-foreground">
                <Info className="mt-0.5 size-4 shrink-0" aria-hidden /> En Resultados verás los resultados de {modo === "individual" ? "la evaluación" : "cada empleado"}. La historia clínica ocupacional queda en la IPS y es confidencial.
              </p>
              {bookError && <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm font-medium text-danger-foreground">{bookError}</p>}

              <div className="border-t pt-4">
                <PasoNav
                  atras={<Button variant="ghost" onClick={() => setStep(3)}><ChevronLeft /> Atrás</Button>}
                  siguiente={
                    <Button size="lg" onClick={confirmar} disabled={pendiente}>
                      {pendiente ? <><Loader2 className="animate-spin" /> Agendando…</> : modo === "individual" ? <><Check /> Confirmar cita</> : <><Check /> Confirmar {conTurno.length} {conTurno.length === 1 ? "cita" : "citas"}</>}
                    </Button>
                  }
                />
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      <Dialog open={!!nuevoEmpleado} onOpenChange={(o) => !o && setNuevoEmpleado(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          {nuevoEmpleado && profile && (
            <EmpleadoForm
              empresaId={profile.id}
              empleado={nuevoEmpleado === "nuevo" ? null : nuevoEmpleado}
              cargos={cargos}
              onClose={() => setNuevoEmpleado(null)}
              onSaved={(e) => elegirEmpleado(e.id)}
            />
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!crearCargo} onOpenChange={(o) => !o && setCrearCargo(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          {crearCargo && (
            <CargoForm
              cargo={null}
              nombreInicial={crearCargo}
              onClose={() => setCrearCargo(null)}
              onSaved={(id) => { setMapeo((m) => ({ ...m, [normalizar(crearCargo)]: id })); reiniciarDesdeIps(); }}
            />
          )}
        </DialogContent>
      </Dialog>

      <MoverDialog
        fila={ordenadas.find((f) => String(f.fila) === moviendo) ?? null}
        libres={libres}
        asignacion={asignacion}
        onClose={() => setMoviendo(null)}
        onMover={(clave, slotId) => { setManual((m) => ({ ...m, [clave]: slotId })); setMoviendo(null); }}
      />
    </div>
  );
}

/** "los 3 cargos" · "el cargo" */
function porCargoArchivo(listas: FilaValidada[]) {
  const n = new Set(listas.map((f) => f.cargoObj?.id)).size;
  return n === 1 ? "el cargo" : `los ${n} cargos`;
}

/** "24 y 25 de noviembre" · "24 nov, 2 y 3 dic" */
function listaFechas(fechas: string[]) {
  if (fechas.length === 0) return "";
  const partes = fechas.map((f) => fechaPartes(f));
  const mismoMes = partes.every((p) => p.mes === partes[0].mes);
  if (mismoMes) {
    const dias = partes.map((p) => p.dia);
    const mes = formatFechaLarga(fechas[0]).split(" de ")[1];
    return `${dias.length > 1 ? `${dias.slice(0, -1).join(", ")} y ${dias[dias.length - 1]}` : dias[0]} de ${mes}`;
  }
  return partes.map((p) => `${p.dia} ${p.mes.toLowerCase()}`).join(", ");
}

function Total({ label, valor, grande }: { label: string; valor: number; grande?: boolean }) {
  return (
    <div className={cn("flex items-baseline justify-between gap-3 border-t pt-3", grande && "mt-1")}>
      <span className={grande ? "font-semibold" : "text-[13px] text-muted-foreground"}>{label}</span>
      <span className={cn("font-bold tabular-nums", grande ? "text-2xl" : "text-lg")}>{formatPesos(valor)}</span>
    </div>
  );
}

// ─── Individual: elegir empleado ──────────────────────────────────────────────

function EmpleadoPicker({
  empleados, cargos, loading, seleccionado, onSelect, onCambiar, onNuevo, onEditar, error,
}: {
  empleados: Empleado[];
  cargos: Cargo[];
  loading: boolean;
  seleccionado: Empleado | null;
  onSelect: (id: string) => void;
  onCambiar: () => void;
  onNuevo: () => void;
  onEditar: (e: Empleado) => void;
  error: string | null;
}) {
  const [q, setQ] = useState("");
  const cargoDe = (e: Empleado) => cargos.find((c) => c.id === e.cargo_id)?.nombre;
  const n = normalizar(q);
  const resultados = n ? empleados.filter((e) => normalizar(`${nombreCompleto(e)} ${e.numero}`).includes(n)).slice(0, 8) : [];

  return (
    <div className="space-y-2">
      <p className="text-[13px] font-semibold">Empleado <span className="text-danger-foreground" aria-hidden>*</span></p>
      {seleccionado ? (
        <div className="flex items-center gap-3 rounded-xl border bg-surface p-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground" aria-hidden>{iniciales(nombreCompleto(seleccionado))}</span>
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold">{nombreCompleto(seleccionado)} <span className="font-normal text-muted-foreground">· {seleccionado.tipo_doc} {formatDocumento(seleccionado.numero)}</span></p>
            <p className="text-xs text-muted-foreground">Cargo: {cargoDe(seleccionado) ?? <button type="button" className="font-medium text-warning-foreground underline" onClick={() => onEditar(seleccionado)}>sin cargo, asígnale uno</button>}</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => { setQ(""); onCambiar(); }}>Cambiar</Button>
        </div>
      ) : (
        <div className="relative">
          <IconInput icon={Search} value={q} onChange={(e) => setQ(e.target.value)} placeholder={loading ? "Cargando empleados…" : "Busca por nombre o cédula en Mis empleados"} aria-label="Buscar empleado" aria-invalid={!!error || undefined} />
          {n && (
            <ul className="absolute z-20 mt-1 max-h-72 w-full overflow-y-auto rounded-xl border bg-popover p-1 shadow-md" role="listbox" aria-label="Empleados encontrados">
              {resultados.length === 0 ? (
                <li className="px-3 py-2 text-sm text-muted-foreground">Ningún empleado coincide.</li>
              ) : resultados.map((e) => (
                <li key={e.id}>
                  <button type="button" role="option" aria-selected={false} onClick={() => { onSelect(e.id); setQ(""); }} className="flex w-full flex-col items-start rounded-lg px-3 py-2 text-left hover:bg-muted focus-visible:bg-muted focus-visible:outline-none">
                    <span className="text-sm font-medium">{nombreCompleto(e)}</span>
                    <span className="text-xs text-muted-foreground">{e.tipo_doc} {formatDocumento(e.numero)}{cargoDe(e) ? ` · ${cargoDe(e)}` : ""}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {error && <p className="text-[13px] font-medium text-danger-foreground">{error}</p>}
      {!seleccionado && (
        <Button variant="link" size="sm" className="h-auto px-0" onClick={onNuevo}><UserPlus className="size-4" /> Agregar un empleado nuevo</Button>
      )}
    </div>
  );
}

// ─── Lote: archivo ────────────────────────────────────────────────────────────

function PasoArchivo({
  tiposLote, codigo, onCodigo, archivo, error, leyendo, fileKey, onArchivo, validadas, listas, conError, cargos, enfasis,
  verTodas, onVerTodas, onQuitar, onMapear, soloListos, onSoloListos, touched,
}: {
  tiposLote: { codigo: string; nombre: string; descripcion: string | null }[];
  enfasis: Enfasis[];
  codigo: string;
  onCodigo: (c: string) => void;
  archivo: ArchivoLeido | null;
  error: string | null;
  leyendo: boolean;
  fileKey: number;
  onArchivo: (f: File | undefined) => void;
  validadas: FilaValidada[];
  listas: number;
  conError: FilaValidada[];
  cargos: Cargo[];
  verTodas: boolean;
  onVerTodas: () => void;
  onQuitar: (fila: number) => void;
  onMapear: (cargoArchivo: string, id: string) => void;
  soloListos: boolean;
  onSoloListos: (v: boolean) => void;
  touched: boolean;
}) {
  const [arrastrando, setArrastrando] = useState(false);
  const visibles = verTodas ? validadas : validadas.slice(0, FILAS_VISIBLES);

  const zona = (
    <label
      onDragOver={(e) => { e.preventDefault(); setArrastrando(true); }}
      onDragLeave={() => setArrastrando(false)}
      onDrop={(e) => { e.preventDefault(); setArrastrando(false); onArchivo(e.dataTransfer.files?.[0]); }}
      className={cn(
        "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-8 text-center transition-colors focus-within:ring-2 focus-within:ring-ring",
        arrastrando ? "border-primary bg-primary-soft" : error ? "border-danger bg-danger-soft/40" : "border-input hover:border-primary/60 hover:bg-muted",
      )}
    >
      {leyendo ? <Loader2 className="size-6 animate-spin text-muted-foreground" aria-hidden /> : <Upload className="size-6 text-accent-foreground" aria-hidden />}
      <span className="font-semibold">{leyendo ? "Leyendo el archivo…" : "Arrastra el archivo aquí o haz clic para cargarlo"}</span>
      <span className="text-[13px] text-muted-foreground">.xlsx o .csv · una fila por empleado</span>
      <input key={fileKey} type="file" accept=".xlsx,.csv" className="sr-only" onChange={(e) => onArchivo(e.target.files?.[0])} />
    </label>
  );

  return (
    <div className="space-y-5">
      <fieldset>
        <legend className="mb-2 text-[13px] font-semibold">Evaluación para todo el grupo <span className="text-danger-foreground" aria-hidden>*</span></legend>
        <div className="grid gap-3 sm:grid-cols-3" role="radiogroup" aria-label="Evaluación para todo el grupo">
          {tiposLote.map((t) => (
            <label key={t.codigo} className={cn("cursor-pointer rounded-xl border-2 p-3 transition-colors focus-within:ring-2 focus-within:ring-ring", codigo === t.codigo ? "border-primary bg-primary-soft" : "border-border hover:border-primary/40")}>
              <input type="radio" name="tipo-lote" className="sr-only" checked={codigo === t.codigo} onChange={() => onCodigo(t.codigo)} />
              <span className="block font-semibold">{NOMBRE_LOTE[t.codigo] ?? t.nombre}</span>
              <span className="block text-[13px] text-muted-foreground">{t.codigo === "PERIODICA" ? "Control de rutina." : t.descripcion}</span>
            </label>
          ))}
        </div>
        <p className="mt-2 text-xs text-muted-foreground">Post-incapacidad, retorno laboral y seguimiento dependen de las fechas de cada persona: agéndalos como cita individual.</p>
      </fieldset>

      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-[13px] font-semibold">Archivo de empleados <span className="text-danger-foreground" aria-hidden>*</span></p>
          <Button type="button" variant="link" size="sm" onClick={() => void descargarPlantilla(codigo === "EGRESO")}><Download className="size-4" /> Descargar plantilla (.xlsx)</Button>
        </div>
        {!archivo ? zona : (
          <div className="flex items-center gap-3 rounded-xl border p-3">
            <FileSpreadsheet className="size-8 shrink-0 text-success-foreground" aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{archivo.nombre}</p>
              <p className="text-xs text-muted-foreground">{archivo.filas.length} filas · Columnas: {archivo.columnas.join(", ")}</p>
            </div>
            <label className={cn(buttonVariants({ variant: "outline", size: "sm" }), "cursor-pointer")}>
              Reemplazar
              <input key={fileKey} type="file" accept=".xlsx,.csv" className="sr-only" onChange={(e) => onArchivo(e.target.files?.[0])} />
            </label>
          </div>
        )}
        {error && <p role="alert" className="text-[13px] font-medium text-danger-foreground">{error}</p>}
        {touched && !archivo && !error && <p role="alert" className="text-[13px] font-medium text-danger-foreground">Carga el archivo de empleados.</p>}
        {codigo === "EGRESO" && <p className="text-xs text-muted-foreground">Para egreso, la columna «Fecha de retiro» es obligatoria.</p>}
      </div>

      {archivo && (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2 text-sm" aria-live="polite">
            <span className="rounded-full bg-success-soft px-3 py-1 font-medium text-success-foreground">{listas} {listas === 1 ? "listo" : "listos"}</span>
            {conError.length > 0 && <span className="rounded-full bg-danger-soft px-3 py-1 font-medium text-danger-foreground">{conError.length} con errores</span>}
          </div>
          <div className="overflow-x-auto rounded-xl border">
            <table className="w-full text-sm">
              <thead className="bg-surface">
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className="px-3 py-2 font-medium">Fila</th>
                  <th className="px-3 py-2 font-medium">Empleado</th>
                  <th className="px-3 py-2 font-medium">Documento</th>
                  <th className="px-3 py-2 font-medium">Cargo → énfasis</th>
                  <th className="px-3 py-2 font-medium">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {visibles.map((f) => (
                  <FilaTabla key={f.fila} f={f} cargos={cargos} enfasis={enfasis} onQuitar={onQuitar} onMapear={onMapear} />
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            {!verTodas && validadas.length > FILAS_VISIBLES ? <Button variant="link" size="sm" className="px-0" onClick={onVerTodas}>Ver las {validadas.length} filas</Button> : <span />}
            {conError.length > 0 && listas > 0 && (
              <label className="flex cursor-pointer items-center gap-2 text-[13px]">
                <Checkbox checked={soloListos} onCheckedChange={(c) => onSoloListos(!!c)} />
                Continuar solo con los {listas} listos (los otros quedan pendientes)
              </label>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function FilaTabla({ f, cargos, enfasis, onQuitar, onMapear }: { f: FilaValidada; cargos: Cargo[]; enfasis: Enfasis[]; onQuitar: (fila: number) => void; onMapear: (cargoArchivo: string, id: string) => void }) {
  const nombresEnfasis = f.cargoObj ? f.cargoObj.enfasis_ids.map((id) => enfasis.find((e) => e.id === id)?.nombre).filter(Boolean).join(", ") : "";
  const ok = f.errores.length === 0;
  return (
    <tr className={cn(!ok && "bg-danger-soft/30")}>
      <td className="px-3 py-2 tabular-nums text-muted-foreground">{f.fila}</td>
      <td className="px-3 py-2 font-medium">{[f.nombres, f.apellidos].filter(Boolean).join(" ") || "—"}</td>
      <td className="whitespace-nowrap px-3 py-2 tabular-nums">{f.tipoDoc ?? f.tipo_doc} {formatDocumento(f.numero)}</td>
      <td className="px-3 py-2">
        {f.cargoDesconocido ? (
          <Select onValueChange={(v) => onMapear(f.cargo, v)}>
            <SelectTrigger className="h-8 min-w-48 text-xs" aria-label={`Cargo para ${f.nombres}`}><SelectValue placeholder={`«${f.cargo}» no existe: elige cargo`} /></SelectTrigger>
            <SelectContent>
              <SelectItem value={CREAR}><Plus className="mr-1 inline size-3.5" /> Crear cargo «{f.cargo}»</SelectItem>
              {cargos.map((c) => <SelectItem key={c.id} value={c.id}>{c.nombre}</SelectItem>)}
            </SelectContent>
          </Select>
        ) : (
          <span className="text-[13px]">{f.cargo || "—"}{nombresEnfasis && <span className="text-muted-foreground"> → {nombresEnfasis}</span>}</span>
        )}
      </td>
      <td className="px-3 py-2 text-[13px]">
        {ok ? (
          <span className="font-medium text-success-foreground">Listo</span>
        ) : (
          <span className="font-medium text-danger-foreground">
            {f.errores.join(" ")}
            {f.repetidaDe != null && <> · <button type="button" className="underline" onClick={() => onQuitar(f.fila)}>Quitar</button></>}
          </span>
        )}
      </td>
    </tr>
  );
}

// ─── Lote: asignación ─────────────────────────────────────────────────────────

function AsignacionPorDia({
  filas, asignacion, todosSlots, sinTurno, onMover, onRepartir,
}: {
  filas: FilaValidada[];
  asignacion: Map<string, Slot | null>;
  todosSlots: Slot[];
  sinTurno: number;
  onMover: (clave: string) => void;
  onRepartir: () => void;
}) {
  const asignadas = filas
    .map((f) => ({ f, s: asignacion.get(String(f.fila)) ?? null }))
    .filter((x): x is { f: FilaValidada; s: Slot } => !!x.s)
    .sort((a, b) => a.s.fecha.localeCompare(b.s.fecha) || a.s.hora.localeCompare(b.s.hora));
  const dias = Array.from(new Set(asignadas.map((x) => x.s.fecha)));
  const ultimo = asignadas[asignadas.length - 1]?.s;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm">
          <strong>{asignadas.length} {asignadas.length === 1 ? "empleado" : "empleados"}</strong> en {dias.length} {dias.length === 1 ? "día" : "días"}
          {ultimo && <span className="text-muted-foreground"> · último turno {fechaCorta(ultimo.fecha).replace(/ \d{4}$/, "")}, {formatHora(ultimo.hora)}</span>}
        </p>
        <Button variant="outline" size="sm" onClick={onRepartir}><RotateCcw /> Volver a repartir</Button>
      </div>
      {sinTurno > 0 && (
        <p className="flex items-start gap-2 rounded-lg bg-warning-soft px-3 py-2 text-[13px] text-warning-foreground">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden /> {sinTurno} {sinTurno === 1 ? "empleado no alcanza" : "empleados no alcanzan"} turno con estos cupos. Sube el máximo por día, cambia el primer día o agéndalos después.
        </p>
      )}
      {dias.map((d) => {
        const delDia = asignadas.filter((x) => x.s.fecha === d);
        const desde = delDia[0].s.hora;
        const hasta = delDia[delDia.length - 1].s.hora;
        // Turnos ocupados entre el primero y el último del día: se saltan.
        const ocupados = todosSlots.filter((s) => s.fecha === d && s.taken && s.hora > desde && s.hora < hasta);
        const filasDia = [...delDia.map((x) => ({ hora: x.s.hora, x })), ...ocupados.map((s) => ({ hora: s.hora, x: null }))]
          .sort((a, b) => a.hora.localeCompare(b.hora));
        return (
          <section key={d} aria-label={capitalizar(formatFechaLarga(d))}>
            <h3 className="mb-2 text-sm font-semibold">{capitalizar(formatFechaLarga(d))} · {delDia.length} {delDia.length === 1 ? "empleado" : "empleados"}</h3>
            <div className="overflow-x-auto rounded-xl border">
              <table className="w-full text-sm">
                <thead className="bg-surface">
                  <tr className="border-b text-left text-xs text-muted-foreground">
                    <th className="px-3 py-2 font-medium">Hora</th>
                    <th className="px-3 py-2 font-medium">Empleado</th>
                    <th className="px-3 py-2 font-medium">Cargo</th>
                    <th className="px-3 py-2"><span className="sr-only">Acciones</span></th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {filasDia.map(({ hora, x }, i) => x ? (
                    <tr key={x.f.fila}>
                      <td className="whitespace-nowrap px-3 py-2 font-medium tabular-nums">{formatHora(hora)}</td>
                      <td className="px-3 py-2 font-medium">{x.f.nombres} {x.f.apellidos}</td>
                      <td className="px-3 py-2 text-muted-foreground">{x.f.cargoObj?.nombre}</td>
                      <td className="px-3 py-2 text-right"><Button variant="outline" size="sm" onClick={() => onMover(String(x.f.fila))}><ArrowRightLeft /> Mover</Button></td>
                    </tr>
                  ) : (
                    <tr key={`ocupado-${i}`} className="bg-muted/50 text-[13px] text-muted-foreground">
                      <td className="whitespace-nowrap px-3 py-1.5 tabular-nums">{formatHora(hora)}</td>
                      <td className="px-3 py-1.5" colSpan={3}>Turno ya ocupado en la IPS · se salta</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        );
      })}
    </div>
  );
}

function MoverDialog({
  fila, libres, asignacion, onClose, onMover,
}: {
  fila: FilaValidada | null;
  libres: Slot[];
  asignacion: Map<string, Slot | null>;
  onClose: () => void;
  onMover: (clave: string, slotId: string) => void;
}) {
  const ocupados = new Set([...asignacion.values()].filter((s): s is Slot => !!s).map((s) => s.id));
  const actual = fila ? asignacion.get(String(fila.fila)) ?? null : null;
  const opciones = libres.filter((s) => !ocupados.has(s.id)).sort((a, b) => a.fecha.localeCompare(b.fecha) || a.hora.localeCompare(b.hora));
  const dias = Array.from(new Set(opciones.map((s) => s.fecha)));
  return (
    <Dialog open={!!fila} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Mover a {fila?.nombres} {fila?.apellidos}</DialogTitle>
          <DialogDescription>{actual ? `Ahora: ${capitalizar(formatFechaLarga(actual.fecha))}, ${formatHora(actual.hora)}. ` : ""}Elige otro cupo libre.</DialogDescription>
        </DialogHeader>
        {opciones.length === 0 ? (
          <p className="text-sm text-muted-foreground">No quedan cupos libres sin asignar en esta IPS.</p>
        ) : (
          <div className="space-y-3">
            {dias.map((d) => (
              <div key={d}>
                <p className="mb-1.5 text-[13px] font-semibold">{capitalizar(formatFechaLarga(d))}</p>
                <div className="flex flex-wrap gap-2">
                  {opciones.filter((s) => s.fecha === d).map((s) => (
                    <Button key={s.id} variant="outline" size="sm" onClick={() => fila && onMover(String(fila.fila), s.id)}>{formatHora(s.hora)}</Button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─── Confirmación ─────────────────────────────────────────────────────────────

function AvisoEmpleados({ avisar, onAvisar, conCorreo, total }: { avisar: boolean; onAvisar: (v: boolean) => void; conCorreo: number; total: number }) {
  return (
    <section aria-label="Aviso a los empleados" className="space-y-3 rounded-xl border p-4">
      <label className="flex cursor-pointer items-start gap-3 text-sm font-semibold">
        <Checkbox checked={avisar} onCheckedChange={(c) => onAvisar(!!c)} className="mt-0.5" />
        Avisar {total === 1 ? "al empleado" : "a cada empleado"} su cita, dirección y preparación
      </label>
      <div className="flex flex-wrap gap-2 pl-7">
        <span className={cn("rounded-full px-3 py-1 text-xs font-semibold", avisar ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")}>Correo</span>
        <span className="rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground" title="Próximamente">WhatsApp · Próximamente</span>
        <span className="rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground" title="Próximamente">SMS · Próximamente</span>
      </div>
      <p className="pl-7 text-xs text-muted-foreground">
        {conCorreo === total
          ? "Usamos el correo de Mis empleados. A ti también te llega la confirmación."
          : total === 1
            ? "Este empleado no tiene correo en Mis empleados: no le llegará el aviso. A ti sí te llega la confirmación."
            : `${conCorreo} de ${total} empleados tienen correo; los demás no recibirán el aviso. A ti sí te llega la confirmación.`}
      </p>
    </section>
  );
}

function Exito({ resultado: r, headingRef, onOtra }: { resultado: Resultado; headingRef: React.RefObject<HTMLHeadingElement | null>; onOtra: () => void }) {
  return (
    <SuccessCard
      headingRef={headingRef}
      title={r.modo === "individual" ? "¡La cita quedó agendada!" : `¡Se agendaron ${r.agendadas} ${r.agendadas === 1 ? "cita" : "citas"}!`}
      subtitle={r.modo === "individual" ? "Te enviamos la confirmación." : `${r.tipo} en ${r.ips}.`}
    >
      <dl className="space-y-3 rounded-xl border p-4 text-sm">
        {r.modo === "individual" ? (
          <>
            <div className="flex justify-between gap-4"><dt className="text-muted-foreground">Empleado</dt><dd className="text-right font-medium">{r.nombre}</dd></div>
            <div className="flex justify-between gap-4"><dt className="text-muted-foreground">Evaluación</dt><dd className="text-right font-medium">{r.tipo}</dd></div>
            <div className="flex justify-between gap-4"><dt className="text-muted-foreground">Pruebas</dt><dd className="text-right font-medium">{r.pruebas}</dd></div>
            <div className="flex justify-between gap-4"><dt className="text-muted-foreground">Fecha</dt><dd className="text-right font-medium">{capitalizar(formatFechaLarga(r.fecha))}, {formatHora(r.hora)}</dd></div>
            <div className="flex justify-between gap-4"><dt className="text-muted-foreground">IPS</dt><dd className="text-right font-medium">{r.ips}</dd></div>
            <div className="flex justify-between gap-4 border-t pt-3"><dt className="font-semibold">Valor</dt><dd className="text-right text-base font-bold tabular-nums">{formatPesos(r.valor)}</dd></div>
          </>
        ) : (
          <div className="flex justify-between gap-4"><dt className="font-semibold">Valor total</dt><dd className="text-right text-base font-bold tabular-nums">{formatPesos(r.total)}</dd></div>
        )}
      </dl>
      <p className="text-center text-[13px] text-muted-foreground">Se suma a la factura de este mes.</p>
      <div className="grid gap-2 sm:grid-cols-2">
        <Link to="/app/empresa/citas" className={buttonVariants({ size: "lg" })}><CalendarClock /> Ver citas</Link>
        <Button variant="outline" size="lg" onClick={onOtra}><CalendarPlus /> Nueva solicitud</Button>
      </div>
      <div className="flex justify-center">
        <Link to="/app/empresa/empleados" className={buttonVariants({ variant: "link", size: "sm" })}>Ir a Mis empleados</Link>
      </div>
    </SuccessCard>
  );
}
