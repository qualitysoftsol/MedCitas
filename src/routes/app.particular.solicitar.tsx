import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  CalendarPlus, Check, ClipboardList, MapPin, Building2, CalendarClock, CircleCheckBig, Info, Loader2, IdCard, UserRound, House, Navigation,
} from "lucide-react";
import { toast } from "sonner";
import { DEPARTAMENTOS } from "@/lib/colombia";
import { Card, CardContent } from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import { PageHeader } from "@/components/app/PageHeader";
import { FormField, IconInput } from "@/components/app/FormField";
import { useAuth } from "@/lib/auth-context";
import { useAvailableSlots } from "@/lib/hooks/useSlots";
import { useBookAppointment } from "@/lib/hooks/useAppointments";
import { useTiposExamen } from "@/lib/hooks/useCatalogos";
import { capitalizar, fechaPartes, formatFecha, formatFechaCorta, formatHora, hoyISO } from "@/lib/format";
import { ConfirmRow, Resumen, StepHeading, Stepper, SuccessCard, WizardNav, type WizardStep } from "@/components/solicitar/WizardParts";
import { HorarioPicker, IpsStep, TipoExamenPicker, UbicacionStep } from "@/components/solicitar/Steps";
import { esFuturo, soloDigitos, useIpsSearch, type LatLng } from "@/components/solicitar/useIpsSearch";

export const Route = createFileRoute("/app/particular/solicitar")({
  component: ParticularSolicitar,
});

const STEPS: readonly WizardStep[] = [
  { id: 1, title: "Información", short: "Datos", icon: ClipboardList },
  { id: 2, title: "Ubicación", short: "Ubicación", icon: MapPin },
  { id: 3, title: "Selección de IPS", short: "IPS", icon: Building2 },
  { id: 4, title: "Fecha y hora", short: "Horario", icon: CalendarClock },
  { id: 5, title: "Confirmación", short: "Confirmar", icon: CircleCheckBig },
];
const TOTAL = STEPS.length;

interface CitaAgendada { fecha: string; hora: string; ips: string; tipo: string; servicio: string; direccion: string | null; ciudad: string }

function ParticularSolicitar() {
  const { profile } = useAuth();
  const [step, setStep] = useState(1);
  const [maxStep, setMaxStep] = useState(1);
  const [done, setDone] = useState<CitaAgendada | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  const [cedula, setCedula] = useState(profile?.cedula ?? "");
  const [tipoExamen, setTipoExamen] = useState<string>("");
  const [filtro, setFiltro] = useState<string[]>([]);
  const [depto, setDepto] = useState("Cundinamarca");
  const [ciudad, setCiudad] = useState("Bogotá");
  const [direccion, setDireccion] = useState(profile?.direccion ?? "");
  const [userLoc, setUserLoc] = useState<LatLng | null>(null);
  const [selectedIps, setSelectedIps] = useState<string | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  const [selectedFecha, setSelectedFecha] = useState<string | null>(null);
  const [touched1, setTouched1] = useState(false);
  const [bookError, setBookError] = useState<string | null>(null);

  const bookAppointment = useBookAppointment();
  const { data: tiposExamen = [], isLoading: tiposLoading } = useTiposExamen();
  const tiposDisponibles = useMemo(() => tiposExamen.filter((t) => t.roles_permitidos.includes("particular")), [tiposExamen]);

  useEffect(() => {
    if (tiposDisponibles.length > 0 && !tipoExamen) setTipoExamen(tiposDisponibles[0].nombre);
  }, [tiposDisponibles, tipoExamen]);
  useEffect(() => {
    if (profile?.cedula && !cedula) setCedula(profile.cedula);
  }, [profile?.cedula]); // eslint-disable-line react-hooks/exhaustive-deps

  const search = useIpsSearch({ depto, ciudad, userLoc, filtro, selectedIps });
  const hoy = hoyISO();
  const { data: slotsRaw = [], isLoading: slotsLoading, refetch: refetchSlots } = useAvailableSlots(selectedIps);
  const slotsIps = useMemo(() => slotsRaw.filter((s) => esFuturo(s, hoy)), [slotsRaw, hoy]);

  const ipsSel = search.ipsEnCiudad.find((i) => i.id === selectedIps) ?? null;
  const slotSel = slotsIps.find((s) => s.id === selectedSlot) ?? null;

  const cedulaError = !cedula.trim() ? "Ingresa tu número de documento." : !/^\d{5,12}$/.test(cedula) ? "Usa solo números, entre 5 y 12 dígitos." : null;
  const tipoError = !tipoExamen ? "Selecciona el tipo de examen." : null;
  const canNext: Record<number, boolean> = { 1: !cedulaError && !tipoError, 2: !!ciudad, 3: !!selectedIps, 4: !!slotSel, 5: true };

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
      if (step === 4) toast.error("Selecciona un horario para continuar");
      return;
    }
    if (step < TOTAL) goTo(step + 1);
  };

  const resetIps = () => { setSelectedIps(null); setSelectedSlot(null); setMaxStep(2); };
  const selectIps = (id: string) => {
    if (id !== selectedIps) { setSelectedSlot(null); setSelectedFecha(null); }
    setSelectedIps(id);
  };
  const elegirIps = (id: string) => { selectIps(id); setMaxStep(3); goTo(4); };

  const submit = () => {
    setBookError(null);
    if (!slotSel || !profile) return;
    bookAppointment.mutate({
      slot_id: slotSel.id,
      ips_id: slotSel.ips_id,
      solicitante_id: profile.id,
      empleado_nombre: profile.nombre,
      empleado_cedula: cedula,
      tipo_examen: tipoExamen,
      fecha: slotSel.fecha,
      hora: slotSel.hora,
      ciudad: slotSel.ciudad,
      servicio: slotSel.servicio,
    }, {
      onSuccess: () => {
        toast.success("Cita agendada");
        setDone({
          fecha: slotSel.fecha, hora: slotSel.hora, ips: ipsSel?.nombre ?? "", tipo: tipoExamen,
          servicio: slotSel.servicio, direccion: ipsSel?.direccion ?? null, ciudad: slotSel.ciudad,
        });
      },
      onError: (err: any) => {
        const tomado = err?.code === "23505" || /duplicate|unique/i.test(err?.message ?? "");
        const msg = tomado
          ? "Ese horario ya no está disponible. Elige otro, por favor."
          : err?.message?.includes("Failed to fetch")
            ? "Sin conexión. Revisa tu internet e inténtalo de nuevo."
            : "No pudimos agendar la cita. Inténtalo de nuevo.";
        setBookError(msg);
        toast.error(msg);
        if (tomado) { setSelectedSlot(null); void refetchSlots(); setStep(4); }
      },
    });
  };

  const reiniciar = () => {
    setDone(null); setSelectedIps(null); setSelectedSlot(null); setSelectedFecha(null); setStep(1); setMaxStep(1); setTouched1(false);
  };

  if (done) {
    const mapa = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${done.ips}, ${done.direccion ?? ""}, ${done.ciudad}, Colombia`)}`;
    return (
      <SuccessCard headingRef={headingRef} title="¡Tu cita quedó agendada!" subtitle="Te enviamos una notificación con los detalles.">
        <dl className="space-y-3 rounded-xl border p-4 text-sm">
          <div className="flex justify-between gap-4"><dt className="text-muted-foreground">Examen</dt><dd className="text-right font-medium">Examen de {done.tipo.toLowerCase()} · {done.servicio}</dd></div>
          <div className="flex justify-between gap-4"><dt className="text-muted-foreground">Fecha</dt><dd className="text-right font-medium">{capitalizar(formatFecha(done.fecha))}</dd></div>
          <div className="flex justify-between gap-4"><dt className="text-muted-foreground">Hora</dt><dd className="text-right font-medium">{formatHora(done.hora)}</dd></div>
          <div className="flex justify-between gap-4"><dt className="text-muted-foreground">IPS</dt><dd className="text-right font-medium">{done.ips}</dd></div>
        </dl>
        <div className="grid gap-2 sm:grid-cols-2">
          <Link to="/app/particular/citas" className={buttonVariants({ size: "lg" })}><CalendarClock /> Ver mis citas</Link>
          <a href={mapa} target="_blank" rel="noopener noreferrer" className={buttonVariants({ variant: "outline", size: "lg" })}>
            <Navigation /> Ver ubicación<span className="sr-only"> (pestaña nueva)</span>
          </a>
        </div>
        <div className="flex justify-center gap-4 pt-1">
          <Link to="/app/particular" className={buttonVariants({ variant: "link" })}><House className="size-4" /> Ir al inicio</Link>
          <Button variant="link" onClick={reiniciar}><CalendarPlus className="size-4" /> Agendar otra cita</Button>
        </div>
      </SuccessCard>
    );
  }

  const current = STEPS[step - 1];
  const resumenRows = [
    { icon: ClipboardList, label: "Examen", value: tipoExamen ? `Examen de ${tipoExamen.toLowerCase()}` : null },
    { icon: MapPin, label: "Ciudad", value: ciudad || null },
    { icon: Building2, label: "IPS", value: ipsSel?.nombre ?? null },
    { icon: CalendarClock, label: "Fecha y hora", value: slotSel ? `${formatFechaCorta(slotSel.fecha)}, ${formatHora(slotSel.hora)}` : null },
  ];

  return (
    <div className="space-y-6">
      <PageHeader icon={CalendarPlus} title="Solicitar cita" description="Agenda tu examen médico en cinco pasos. Puedes volver atrás cuando quieras." />

      <Stepper steps={STEPS} step={step} maxStep={maxStep} onGo={(s) => s <= maxStep && setStep(s)} />

      <div className="grid gap-6 lg:grid-cols-12">
        {step === 1 && (
          <>
            <Card className="lg:col-span-7 xl:col-span-8">
              <StepHeading refEl={headingRef} step={current} total={TOTAL} description="Confirma tus datos y el tipo de examen que necesitas." />
              <CardContent className="space-y-6">
                <div className="grid gap-5 sm:grid-cols-2">
                  <FormField id="sol-nombre" label="Nombre" hint="Se toma de tu perfil.">
                    <IconInput icon={UserRound} value={profile?.nombre ?? ""} readOnly disabled />
                  </FormField>
                  <FormField id="sol-cedula" label="Número de documento" required error={touched1 ? cedulaError : null}>
                    <IconInput icon={IdCard} inputMode="numeric" autoComplete="off" value={cedula} onChange={(e) => setCedula(soloDigitos(e.target.value))} onBlur={() => setTouched1(true)} />
                  </FormField>
                </div>
                <TipoExamenPicker tipos={tiposDisponibles} loading={tiposLoading} value={tipoExamen} onChange={setTipoExamen} error={touched1 ? tipoError : null} />
              </CardContent>
            </Card>
            <Resumen className="hidden lg:col-span-5 lg:block xl:col-span-4" rows={resumenRows} />
          </>
        )}

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
            onDepto={(v) => { setDepto(v); const first = DEPARTAMENTOS.find((d) => d.nombre === v)?.ciudades[0]; if (first) setCiudad(first.nombre); setUserLoc(null); resetIps(); }}
            onCiudad={(v) => { setCiudad(v); setUserLoc(null); resetIps(); }}
            onDireccion={setDireccion}
            onLocation={(loc, formatted) => { setUserLoc(loc); if (formatted) setDireccion(formatted); resetIps(); }}
            onSelectIps={selectIps}
          />
        )}

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
          />
        )}

        {step === 4 && (
          <>
            <Card className="lg:col-span-7 xl:col-span-8">
              <StepHeading refEl={headingRef} step={current} total={TOTAL} description={<>Horarios disponibles en <strong className="text-foreground">{ipsSel?.nombre}</strong>.</>} />
              <CardContent className="space-y-6">
                <HorarioPicker
                  slots={slotsIps}
                  loading={slotsLoading}
                  selectedSlot={selectedSlot}
                  onSelectSlot={setSelectedSlot}
                  selectedFecha={selectedFecha}
                  onSelectFecha={(f) => { setSelectedFecha(f); setSelectedSlot(null); }}
                  onOtraIps={() => setStep(3)}
                />
              </CardContent>
            </Card>
            <Resumen className="lg:col-span-5 xl:col-span-4" rows={resumenRows} />
          </>
        )}

        {step === 5 && slotSel && (
          <Card className="lg:col-span-8 lg:col-start-3">
            <StepHeading refEl={headingRef} step={current} total={TOTAL} description="Revisa los datos de tu cita antes de confirmarla." />
            <CardContent className="space-y-5">
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
                <ConfirmRow icon={ClipboardList} label="Examen" value={`Examen de ${tipoExamen.toLowerCase()}`} onEdit={() => setStep(1)} />
                <ConfirmRow icon={IdCard} label="Paciente" value={`${profile?.nombre ?? ""} · ${cedula}`} onEdit={() => setStep(1)} />
                <ConfirmRow icon={Building2} label="IPS" value={ipsSel?.nombre ?? ""} sub={[ipsSel?.direccion, slotSel.ciudad].filter(Boolean).join(" · ")} onEdit={() => setStep(3)} />
                <ConfirmRow icon={CalendarClock} label="Fecha y hora" value={`${formatFechaCorta(slotSel.fecha)}, ${formatHora(slotSel.hora)}`} onEdit={() => setStep(4)} />
              </dl>
              <p className="flex items-start gap-2 rounded-lg bg-info-soft px-3 py-2 text-[13px] text-info-foreground">
                <Info className="mt-0.5 size-4 shrink-0" aria-hidden /> Recibirás una notificación de confirmación. Llega 15 minutos antes con tu documento de identidad.
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
        nextDisabled={step === 3 && !selectedIps}
        finalAction={
          <Button onClick={submit} size="lg" disabled={bookAppointment.isPending || !slotSel}>
            {bookAppointment.isPending ? <><Loader2 className="animate-spin" /> Agendando…</> : <><Check /> Confirmar cita</>}
          </Button>
        }
      />
    </div>
  );
}
