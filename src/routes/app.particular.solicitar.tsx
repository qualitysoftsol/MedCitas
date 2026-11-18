import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle, CalendarClock, CalendarPlus, Check, ChevronLeft, ChevronRight, ClipboardList, CreditCard, Info, Loader2, Lock,
  MapPin, Navigation,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { Servicio } from "@/lib/database.types";
import { Card, CardContent } from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { PageHeader } from "@/components/app/PageHeader";
import { useAuth } from "@/lib/auth-context";
import { useAvailableSlots } from "@/lib/hooks/useSlots";
import { useAppointments } from "@/lib/hooks/useAppointments";
import { PagoError, useIniciarPago } from "@/lib/hooks/usePagos";
import { useTiposEvaluacion } from "@/lib/hooks/useCatalogos";
import {
  erroresDatos, formatDuracion, indicacionesDe, limpiarDatos, type DatosEvaluacion,
} from "@/lib/datosEvaluacion";
import { capitalizar, fechaPartes, formatFechaLarga, formatHora, formatPesos, hoyISO, iniciales, parseFecha } from "@/lib/format";
import { Stepper, type WizardStep } from "@/components/solicitar/WizardParts";
import { esFuturo, useIpsSearch, type LatLng } from "@/components/solicitar/useIpsSearch";
import { useEvaluacion } from "@/components/solicitar/useEvaluacion";
import { DatosEvaluacionForm, MotivoPicker, type Referencia } from "@/components/evaluacion/MotivoEvaluacion";
import { EnfasisChips } from "@/components/evaluacion/EnfasisChips";
import { IpsEleccion } from "@/components/evaluacion/IpsEleccion";
import { SemanaHorarios } from "@/components/evaluacion/SemanaHorarios";
import { AntesDeTuCita, Dato, Encabezado, FilaRevision, IndicacionesPlegables, PanelResumen, PasoNav } from "@/components/evaluacion/Piezas";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/app/particular/solicitar")({
  component: ParticularSolicitar,
});

const STEPS: readonly WizardStep[] = [
  { id: 1, title: "Evaluación", short: "Evaluación", icon: ClipboardList },
  { id: 2, title: "IPS y ubicación", short: "IPS", icon: MapPin },
  { id: 3, title: "Fecha y hora", short: "Horario", icon: CalendarClock },
  { id: 4, title: "Confirmar y pagar", short: "Pagar", icon: CreditCard },
];
const TOTAL = STEPS.length;
const MESES_CORTOS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

/** "3 mar 2026" */
const fechaCorta = (fecha: string) => {
  const d = parseFecha(fecha);
  return `${d.getDate()} ${MESES_CORTOS[d.getMonth()]} ${d.getFullYear()}`;
};

function ParticularSolicitar() {
  const { profile } = useAuth();
  const qc = useQueryClient();
  const iniciarPago = useIniciarPago();
  const headingRef = useRef<HTMLHeadingElement>(null);

  const [step, setStep] = useState(1);
  const [maxStep, setMaxStep] = useState(1);
  const [codigo, setCodigo] = useState("");
  const [datos, setDatos] = useState<DatosEvaluacion>({});
  const [enfasisIds, setEnfasisIds] = useState<string[]>([]);
  const [touched1, setTouched1] = useState(false);
  const [depto, setDepto] = useState(profile?.departamento || "Cundinamarca");
  const [ciudad, setCiudad] = useState(profile?.ciudad || "Bogotá");
  const [direccion, setDireccion] = useState(profile?.direccion ?? "");
  const [userLoc, setUserLoc] = useState<LatLng | null>(null);
  const [selectedIps, setSelectedIps] = useState<string | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  const [aceptaPolitica, setAceptaPolitica] = useState(false);
  const [aceptaCancelacion, setAceptaCancelacion] = useState(false);
  const [touched4, setTouched4] = useState(false);
  const [bookError, setBookError] = useState<string | null>(null);

  // El perfil puede llegar después del primer render.
  const perfilCargado = useRef(false);
  useEffect(() => {
    if (!profile || perfilCargado.current) return;
    perfilCargado.current = true;
    if (profile.departamento) setDepto(profile.departamento);
    if (profile.ciudad) setCiudad(profile.ciudad);
    if (profile.direccion) setDireccion(profile.direccion);
  }, [profile]);

  // ── Evaluación ──
  const { data: tipos = [], isLoading: tiposLoading } = useTiposEvaluacion();
  const tiposDisponibles = useMemo(() => tipos.filter((t) => t.roles_permitidos.includes("particular")), [tipos]);
  const tipo = tiposDisponibles.find((t) => t.codigo === codigo) ?? null;
  const evaluacion = useEvaluacion(enfasisIds);
  const enfasisSel = evaluacion.enfasis.filter((e) => enfasisIds.includes(e.id));
  const enfasisTexto = enfasisSel.length === 0 ? null : enfasisSel.some((e) => e.exclusivo) ? "sin énfasis especial" : `énfasis en ${enfasisSel.map((e) => e.nombre.toLowerCase()).join(", ")}`;
  const evaluacionTexto = tipo ? [tipo.nombre, enfasisTexto].filter(Boolean).join(" · ") : null;

  const cedula = profile?.cedula ?? "";
  const cedulaOk = /^\d{5,12}$/.test(cedula);
  const { data: misCitas = [] } = useAppointments(profile?.id, profile?.role);
  const referencias: Referencia[] = useMemo(
    () => misCitas
      .filter((a) => a.estado === "atendida" && a.empleado_cedula === cedula)
      .map((a) => ({ id: a.id, label: `${a.tipo_examen} · ${fechaCorta(a.fecha)}` })),
    [misCitas, cedula],
  );

  const errores = tipo ? erroresDatos(tipo.codigo, datos) : {};
  const datosOk = Object.keys(errores).length === 0;
  const enfasisError = enfasisIds.length === 0
    ? "Elige al menos una opción."
    : !evaluacion.loading && evaluacion.pruebas.length === 0 ? "Estas opciones no tienen pruebas disponibles por ahora." : null;
  const paso1Ok = cedulaOk && !!tipo && datosOk && !enfasisError;

  // ── IPS, horario y valor ──
  const search = useIpsSearch({ depto, ciudad, userLoc, pruebas: evaluacion.pruebas });
  const ipsSel = search.ipsEnCiudad.find((i) => i.id === selectedIps) ?? null;
  const cobertura = search.coberturaDe(selectedIps);
  const ipsOk = !!cobertura && cobertura.hechas.length > 0 && !!search.disponibilidad.get(selectedIps ?? "");

  const hoy = hoyISO();
  const { data: slotsRaw = [], isLoading: slotsLoading, refetch: refetchSlots } = useAvailableSlots(selectedIps);
  const slots = useMemo(() => slotsRaw.filter((s) => esFuturo(s, hoy)), [slotsRaw, hoy]);
  const slotSel = slots.find((s) => s.id === selectedSlot) ?? null;

  const hechas: Servicio[] = cobertura ? evaluacion.pruebas.filter((p) => cobertura.hechas.some((h) => h.id === p.id)) : [];
  const duracion = hechas.reduce((t, p) => t + (p.duracion_min ?? 0), 0);
  const indicaciones = indicacionesDe(hechas, tipo);

  const canNext: Record<number, boolean> = { 1: paso1Ok, 2: ipsOk, 3: !!slotSel, 4: aceptaPolitica && aceptaCancelacion };

  const goTo = (s: number) => { setStep(s); setMaxStep((m) => Math.max(m, s)); };
  const primerRender = useRef(true);
  useEffect(() => {
    if (primerRender.current) { primerRender.current = false; return; }
    headingRef.current?.focus({ preventScroll: true });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [step]);

  const continuar = () => {
    if (step === 1) setTouched1(true);
    if (!canNext[step]) {
      if (step === 2) toast.error("Elige una IPS con horarios para continuar");
      if (step === 3) toast.error("Elige el día y la hora para continuar");
      return;
    }
    goTo(step + 1);
  };

  const cambiarTipo = (c: string) => { if (c !== codigo) { setCodigo(c); setDatos({}); } };
  // Otros énfasis cambian las pruebas: hay que volver a elegir IPS y horario.
  const cambiarEnfasis = (ids: string[]) => { setEnfasisIds(ids); setSelectedIps(null); setSelectedSlot(null); setMaxStep(1); };
  const resetIps = () => { setSelectedIps(null); setSelectedSlot(null); setMaxStep(Math.min(maxStep, 2)); };
  const elegirIps = (id: string) => { if (id !== selectedIps) setSelectedSlot(null); setSelectedIps(id); setMaxStep(2); };

  // Aparta el horario 30 minutos y lleva a la página de pago de Rapyd.
  // La confirmación se muestra al volver, en /app/particular/pago.
  const pagar = () => {
    setTouched4(true);
    setBookError(null);
    if (!slotSel || !tipo || !canNext[4]) return;
    iniciarPago.mutate(
      {
        slot_id: slotSel.id,
        empleado_cedula: cedula,
        tipo_evaluacion: tipo.codigo,
        enfasis_ids: enfasisIds,
        datos_evaluacion: limpiarDatos(tipo.codigo, datos),
        acepta_politica: aceptaPolitica,
      },
      {
        onSuccess: ({ redirect_url }) => window.location.assign(redirect_url),
        onError: (err) => {
          const cod = err instanceof PagoError ? err.codigo : undefined;
          const msg = err.message.includes("Failed to fetch") ? "Sin conexión. Revisa tu internet e inténtalo de nuevo." : err.message;
          setBookError(msg);
          toast.error(msg);
          if (cod === "HORARIO_TOMADO") { setSelectedSlot(null); void refetchSlots(); setStep(3); }
          if (cod === "SIN_PRUEBAS") { setSelectedSlot(null); void qc.invalidateQueries({ queryKey: ["precios-servicios"] }); setStep(2); }
          if (cod === "DATOS_INVALIDOS") { setTouched1(true); setStep(1); }
        },
      },
    );
  };

  const navPaso = (siguiente: string) => (
    <PasoNav
      atras={step === 1 ? <Link to="/app/particular" className={buttonVariants({ variant: "ghost" })}>Cancelar</Link> : <Button variant="ghost" onClick={() => setStep(step - 1)}><ChevronLeft /> Atrás</Button>}
      siguiente={<Button size="lg" onClick={continuar} disabled={step === 2 && !ipsOk}>{siguiente} <ChevronRight /></Button>}
    />
  );

  return (
    <div className="space-y-6">
      <PageHeader icon={CalendarPlus} title="Solicitar cita" description="Agenda tu evaluación médica ocupacional en 4 pasos. Puedes volver atrás cuando quieras." />
      <Stepper steps={STEPS} step={step} maxStep={maxStep} onGo={(s) => s <= maxStep && setStep(s)} />

      <div className="grid gap-6 lg:grid-cols-12">
        {/* ── Paso 1 · Evaluación ── */}
        {step === 1 && (
          <>
            <Card className="lg:col-span-8">
              <CardContent className="space-y-6 p-5 md:p-6">
                <Encabezado refEl={headingRef} paso={1} total={TOTAL} titulo="¿Qué evaluación necesitas?" descripcion="Elige el motivo. Con eso sabemos qué pruebas incluir y qué IPS pueden atenderte." />

                <div className="flex items-center gap-3 rounded-xl border bg-surface p-3">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground" aria-hidden>{iniciales(profile?.nombre)}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">{profile?.nombre}{cedulaOk && <span className="font-normal text-muted-foreground"> · Documento {cedula}</span>}</p>
                    <p className="text-xs text-muted-foreground">Datos tomados de tu perfil</p>
                  </div>
                  <Link to="/app/perfil" className="shrink-0 text-[13px] font-semibold text-accent-foreground underline-offset-2 hover:underline">Editar en Mi perfil</Link>
                </div>
                {!cedulaOk && (
                  <p role="alert" className="flex items-start gap-2 rounded-lg bg-warning-soft px-3 py-2 text-[13px] text-warning-foreground">
                    <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
                    <span>Tu perfil no tiene un número de documento válido. <Link to="/app/perfil" className="font-semibold underline">Agrégalo en Mi perfil</Link> para continuar.</span>
                  </p>
                )}

                <MotivoPicker tipos={tiposDisponibles} loading={tiposLoading} value={codigo} onChange={cambiarTipo} error={touched1 && !tipo ? "Elige el motivo de la evaluación." : null} />
                {tipo && <DatosEvaluacionForm tipo={tipo} datos={datos} onChange={setDatos} errores={errores} mostrarErrores={touched1} referencias={referencias} />}

                <EnfasisChips
                  enfasis={evaluacion.enfasis}
                  loading={evaluacion.loading}
                  value={enfasisIds}
                  onChange={cambiarEnfasis}
                  error={touched1 ? enfasisError : null}
                  legend="¿A qué riesgos te expone tu trabajo?"
                  description="Puedes marcar varios. Definen las pruebas complementarias (énfasis). Si no sabes, pregúntale a tu empresa o elige «Ninguno especial»."
                />

                <div className="border-t pt-4">{navPaso("Continuar: elegir IPS")}</div>
              </CardContent>
            </Card>
            <aside className="space-y-4 lg:col-span-4">
              <div className="space-y-4 lg:sticky lg:top-24">
                <PanelResumen titulo="Tu evaluación">
                  <Dato label="Tipo">{tipo?.nombre}</Dato>
                  <Dato label="Énfasis">{enfasisSel.map((e) => e.nombre).join(", ") || null}</Dato>
                  {evaluacion.pruebas.length > 0 && (
                    <div>
                      <p className="text-xs text-muted-foreground">Incluye {evaluacion.pruebas.length} {evaluacion.pruebas.length === 1 ? "prueba" : "pruebas"}</p>
                      <ul className="mt-1 space-y-1">
                        {evaluacion.pruebas.map((p) => (
                          <li key={p.id} className="flex items-center gap-2 text-sm"><Check className="size-3.5 text-success-foreground" aria-hidden /> {p.nombre}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  <Dato label="Valor">Se calcula al elegir la IPS</Dato>
                </PanelResumen>
                <p className="rounded-xl border border-warning/40 bg-warning-soft p-3 text-[13px] text-warning-foreground">
                  Las pruebas finales las define el médico según tu cargo.
                </p>
              </div>
            </aside>
          </>
        )}

        {/* ── Paso 2 · IPS y ubicación ── */}
        {step === 2 && (
          <IpsEleccion
            headingRef={headingRef}
            titulo="Elige dónde hacerte la evaluación"
            descripcion={<>Te mostramos las IPS que hacen {evaluacion.pruebas.length === 1 ? "la prueba" : `las ${evaluacion.pruebas.length} pruebas`} de tu evaluación {tipo?.nombre.toLowerCase()}{enfasisTexto && !enfasisSel.some((e) => e.exclusivo) ? ` con ${enfasisTexto}` : ""}.</>}
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
            resumen={
              <PanelResumen titulo="Tu evaluación">
                <Dato label="Tipo">{evaluacionTexto}</Dato>
                <Dato label="Pruebas">{(cobertura?.hechas.length ? cobertura.hechas.map((h) => h.nombre) : evaluacion.pruebas.map((p) => p.nombre)).join(", ")}</Dato>
                <Dato label="IPS">{ipsSel?.nombre}</Dato>
              </PanelResumen>
            }
            nav={navPaso("Continuar: elegir horario")}
          />
        )}

        {/* ── Paso 3 · Fecha y hora ── */}
        {step === 3 && (
          <>
            <Card className="lg:col-span-8">
              <CardContent className="space-y-6 p-5 md:p-6">
                <Encabezado
                  refEl={headingRef}
                  paso={3}
                  total={TOTAL}
                  titulo="¿Cuándo puedes ir?"
                  descripcion={<>Horarios en <strong className="text-foreground">{ipsSel?.nombre}</strong>. <button type="button" onClick={() => setStep(2)} className="font-medium text-foreground underline underline-offset-2">Cambiar IPS</button></>}
                />
                <SemanaHorarios slots={slots} loading={slotsLoading} selectedSlot={selectedSlot} onSelect={setSelectedSlot} onOtraIps={() => setStep(2)} />
                {duracion > 0 && (
                  <p className="text-[13px] text-muted-foreground">Todas las pruebas se hacen en la misma visita. Duración aproximada: <strong className="text-foreground">{formatDuracion(duracion)}</strong>.</p>
                )}
                {indicaciones.length > 0 && <AntesDeTuCita indicaciones={indicaciones} />}
                <div className="border-t pt-4">{navPaso("Continuar: revisar y pagar")}</div>
              </CardContent>
            </Card>
            <aside className="lg:col-span-4">
              <div className="lg:sticky lg:top-24">
                <PanelResumen titulo="Tu evaluación">
                  <Dato label="Tipo">{evaluacionTexto}</Dato>
                  <Dato label="IPS" sub={ipsSel?.direccion ?? undefined}>{ipsSel?.nombre}</Dato>
                  <Dato label="Fecha y hora">{slotSel ? `${capitalizar(formatFechaLarga(slotSel.fecha))} · ${formatHora(slotSel.hora)}` : null}</Dato>
                  {cobertura && (
                    <div className="flex items-baseline justify-between gap-2 border-t pt-3">
                      <span className="text-[13px] text-muted-foreground">Total ({cobertura.hechas.length} {cobertura.hechas.length === 1 ? "prueba" : "pruebas"})</span>
                      <span className="text-lg font-bold tabular-nums">{formatPesos(cobertura.total)}</span>
                    </div>
                  )}
                </PanelResumen>
              </div>
            </aside>
          </>
        )}

        {/* ── Paso 4 · Confirmar y pagar ── */}
        {step === 4 && slotSel && cobertura && (
          <Card className="lg:col-span-8 lg:col-start-3">
            <CardContent className="space-y-5 p-5 md:p-6">
              <Encabezado refEl={headingRef} paso={4} total={TOTAL} titulo="Revisa y paga tu cita" />

              <div className="flex flex-wrap items-center gap-4 rounded-xl bg-primary p-4 text-primary-foreground">
                <div className="flex w-14 shrink-0 flex-col items-center rounded-lg bg-white/15 py-1.5" aria-hidden>
                  <span className="text-[11px] font-semibold uppercase">{fechaPartes(slotSel.fecha).mes}</span>
                  <span className="text-2xl font-bold leading-none">{fechaPartes(slotSel.fecha).dia}</span>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-lg font-semibold">{capitalizar(formatFechaLarga(slotSel.fecha))} · {formatHora(slotSel.hora)}</p>
                  <p className="text-[13px] opacity-90">{[ipsSel?.nombre, ipsSel?.direccion].filter(Boolean).join(" · ")}</p>
                </div>
                <a
                  href={ipsSel?.lat != null && ipsSel.lng != null
                    ? `https://www.google.com/maps/search/?api=1&query=${ipsSel.lat},${ipsSel.lng}`
                    : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${ipsSel?.nombre ?? ""}, ${ipsSel?.direccion ?? ""}, ${slotSel.ciudad}, Colombia`)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={cn(buttonVariants({ variant: "secondary", size: "sm" }), "shrink-0")}
                >
                  <Navigation /> Cómo llegar<span className="sr-only"> (pestaña nueva)</span>
                </a>
              </div>

              <dl className="divide-y rounded-xl border">
                <FilaRevision label="Evaluación" valor={evaluacionTexto ?? ""} onCambiar={() => setStep(1)} />
                <FilaRevision label="Paciente" valor={`${profile?.nombre ?? ""} · Documento ${cedula}`} nota="De tu perfil" />
                <FilaRevision label="IPS, fecha y hora" valor={`${ipsSel?.nombre ?? ""} · ${capitalizar(formatFechaLarga(slotSel.fecha))}, ${formatHora(slotSel.hora)}`} onCambiar={() => setStep(2)} />
              </dl>

              <section aria-labelledby="incluye">
                <h3 id="incluye" className="mb-2 font-semibold">Qué incluye y cuánto cuesta</h3>
                <ul className="divide-y text-sm">
                  {cobertura.hechas.map((p) => (
                    <li key={p.id} className="flex justify-between gap-3 py-2"><span>{p.nombre}</span><span className="tabular-nums">{formatPesos(p.total)}</span></li>
                  ))}
                </ul>
                <div className="mt-1 flex items-baseline justify-between gap-3 border-t pt-3">
                  <span className="font-semibold">Total</span>
                  <span className="text-2xl font-bold tabular-nums">{formatPesos(cobertura.total)}</span>
                </div>
                {cobertura.faltan.length > 0 && (
                  <p className="mt-2 text-[13px] text-warning-foreground">Esta IPS no hace: {cobertura.faltan.join(", ")}. Tendrías que hacerlas en otra IPS.</p>
                )}
              </section>

              {indicaciones.length > 0 && (
                <IndicacionesPlegables indicaciones={indicaciones} />
              )}

              <div className="space-y-2.5">
                <label className="flex cursor-pointer items-start gap-3 text-sm">
                  <Checkbox checked={aceptaPolitica} onCheckedChange={(c) => setAceptaPolitica(!!c)} className="mt-0.5" aria-invalid={touched4 && !aceptaPolitica} />
                  <span>
                    Acepto la{" "}
                    <a href="/politica-datos" target="_blank" rel="noopener noreferrer" className="font-medium text-accent-foreground underline underline-offset-2">política de tratamiento de datos<span className="sr-only"> (pestaña nueva)</span></a>.
                    Entiendo que mi historia clínica ocupacional es confidencial.
                  </span>
                </label>
                <label className="flex cursor-pointer items-start gap-3 text-sm">
                  <Checkbox checked={aceptaCancelacion} onCheckedChange={(c) => setAceptaCancelacion(!!c)} className="mt-0.5" aria-invalid={touched4 && !aceptaCancelacion} />
                  <span>Entiendo que puedo cancelar con reembolso total hasta 12 horas antes de la cita.</span>
                </label>
                {touched4 && !canNext[4] && <p role="alert" className="text-[13px] font-medium text-danger-foreground">Marca las dos casillas para continuar.</p>}
              </div>

              <p className="flex items-start gap-2 rounded-lg bg-info-soft px-3 py-2 text-[13px] text-info-foreground">
                <Info className="mt-0.5 size-4 shrink-0" aria-hidden /> Al pagar te llevamos a la página segura de pago. Apartamos el horario por 30 minutos; la cita queda confirmada cuando se apruebe el pago.
              </p>
              {bookError && <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm font-medium text-danger-foreground">{bookError}</p>}

              <div className="border-t pt-4">
                <PasoNav
                  atras={<Button variant="ghost" onClick={() => setStep(3)}><ChevronLeft /> Atrás</Button>}
                  siguiente={
                    <Button size="lg" onClick={pagar} disabled={iniciarPago.isPending}>
                      {iniciarPago.isPending ? <><Loader2 className="animate-spin" /> Conectando con la pasarela…</> : <><Lock /> Pagar {formatPesos(cobertura.total)}</>}
                    </Button>
                  }
                />
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
