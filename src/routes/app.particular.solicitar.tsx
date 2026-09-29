import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  CalendarPlus, Check, ChevronLeft, ChevronRight, ClipboardList, MapPin, Building2, CalendarClock, CircleCheckBig,
  LocateFixed, Stethoscope, Clock, Navigation, Info, Loader2, Pencil, CalendarX2, Search, Eye, IdCard, UserRound, House,
} from "lucide-react";
import { toast } from "sonner";
import { DEPARTAMENTOS, haversineKm } from "@/lib/colombia";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { IpsMap } from "@/components/IpsMap";
import { AddressInput } from "@/components/AddressInput";
import { IpsDetailPanel } from "@/components/IpsDetailPanel";
import { PageHeader } from "@/components/app/PageHeader";
import { EmptyState } from "@/components/app/EmptyState";
import { FormField, IconInput } from "@/components/app/FormField";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/lib/supabase";
import { useAvailableSlots } from "@/lib/hooks/useSlots";
import { useBookAppointment } from "@/lib/hooks/useAppointments";
import { useClasificaciones, useTiposExamen, useServicios, derivarClasificaciones } from "@/lib/hooks/useCatalogos";
import type { Profile, IpsFoto, Slot } from "@/lib/database.types";
import { capitalizar, fechaPartes, formatFecha, formatFechaCorta, formatHora, hoyISO } from "@/lib/format";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/app/particular/solicitar")({
  component: ParticularSolicitar,
});

const STEPS = [
  { id: 1, title: "Información", short: "Datos", icon: ClipboardList },
  { id: 2, title: "Ubicación", short: "Ubicación", icon: MapPin },
  { id: 3, title: "Selección de IPS", short: "IPS", icon: Building2 },
  { id: 4, title: "Fecha y hora", short: "Horario", icon: CalendarClock },
  { id: 5, title: "Confirmación", short: "Confirmar", icon: CircleCheckBig },
] as const;
type StepId = (typeof STEPS)[number]["id"];

const soloDigitos = (v: string) => v.replace(/\D/g, "");

function formatDistancia(km: number) {
  if (km >= 999) return "Distancia no disponible";
  return km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`;
}

/** Excluye horarios que ya pasaron (fecha anterior a hoy, u hora ya cumplida si es hoy). */
function esFuturo(s: Pick<Slot, "fecha" | "hora">, hoy: string) {
  if (s.fecha > hoy) return true;
  if (s.fecha < hoy) return false;
  const now = new Date();
  const [h, m] = s.hora.split(":").map(Number);
  return h * 60 + m > now.getHours() * 60 + now.getMinutes();
}

function ParticularSolicitar() {
  const { profile } = useAuth();
  const [step, setStep] = useState<StepId>(1);
  const [maxStep, setMaxStep] = useState<StepId>(1);
  const [done, setDone] = useState<null | { fecha: string; hora: string; ips: string; tipo: string; servicio: string; direccion: string | null; ciudad: string }>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  // ── Estado del formulario (misma lógica y datos que la versión anterior) ──
  const [cedula, setCedula] = useState(profile?.cedula ?? "");
  const [tipoExamen, setTipoExamen] = useState<string>("");
  const [filtroClasificaciones, setFiltroClasificaciones] = useState<string[]>([]);
  const [depto, setDepto] = useState("Cundinamarca");
  const [ciudad, setCiudad] = useState("Bogotá");
  const [direccion, setDireccion] = useState(profile?.direccion ?? "");
  const [userLoc, setUserLoc] = useState<{ lat: number; lng: number } | null>(null);
  const [locating, setLocating] = useState(false);
  const [selectedIps, setSelectedIps] = useState<string | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  const [selectedFecha, setSelectedFecha] = useState<string | null>(null);
  const [detailIps, setDetailIps] = useState<string | null>(null);
  const [touched1, setTouched1] = useState(false);
  const [bookError, setBookError] = useState<string | null>(null);

  const bookAppointment = useBookAppointment();
  const { data: clasificaciones = [] } = useClasificaciones();
  const { data: tiposExamen = [], isLoading: tiposLoading } = useTiposExamen();
  const { data: catalogoServicios = [] } = useServicios();

  const tiposDisponibles = useMemo(
    () => tiposExamen.filter((t) => t.roles_permitidos.includes("particular")),
    [tiposExamen]
  );

  useEffect(() => {
    if (tiposDisponibles.length > 0 && !tipoExamen) setTipoExamen(tiposDisponibles[0].nombre);
  }, [tiposDisponibles, tipoExamen]);

  useEffect(() => {
    if (profile?.cedula && !cedula) setCedula(profile.cedula);
  }, [profile?.cedula]);

  const { data: ipsEnCiudad = [], isLoading: ipsLoading, isError: ipsError, refetch: refetchIps } = useQuery({
    queryKey: ['ips', ciudad],
    queryFn: async () => {
      const { data, error } = await supabase.from('profiles').select('*').eq('role', 'ips').eq('ciudad', ciudad);
      if (error) throw error;
      return data as Profile[];
    },
    enabled: !!ciudad,
  });

  const ipsIds = ipsEnCiudad.map((i) => i.id);
  const { data: portadas = [] } = useQuery({
    queryKey: ['ips-fotos-portadas', ipsIds],
    queryFn: async () => {
      if (ipsIds.length === 0) return [];
      const { data, error } = await supabase.from('ips_fotos').select('*').in('ips_id', ipsIds).eq('orden', 0);
      if (error) throw error;
      return data as IpsFoto[];
    },
    enabled: ipsIds.length > 0,
  });
  const portadaUrl = (ipsId: string) => portadas.find((f) => f.ips_id === ipsId)?.url;

  // Disponibilidad por IPS: horarios libres desde hoy (solo lectura, misma tabla `slots`).
  const hoy = hoyISO();
  const { data: libres = [], isLoading: libresLoading } = useQuery({
    queryKey: ['slots', 'resumen', ipsIds, hoy],
    queryFn: async () => {
      if (ipsIds.length === 0) return [];
      const { data, error } = await supabase
        .from('slots')
        .select('ips_id, fecha, hora')
        .in('ips_id', ipsIds)
        .eq('taken', false)
        .gte('fecha', hoy)
        .order('fecha')
        .order('hora');
      if (error) throw error;
      return data as Pick<Slot, 'ips_id' | 'fecha' | 'hora'>[];
    },
    enabled: ipsIds.length > 0,
  });
  const disponibilidad = useMemo(() => {
    const map = new Map<string, { count: number; primero: Pick<Slot, 'fecha' | 'hora'> | null }>();
    libres.filter((s) => esFuturo(s, hoy)).forEach((s) => {
      const cur = map.get(s.ips_id) ?? { count: 0, primero: null };
      cur.count += 1;
      if (!cur.primero) cur.primero = s;
      map.set(s.ips_id, cur);
    });
    return map;
  }, [libres, hoy]);

  const { data: slotsIpsRaw = [], isLoading: slotsLoading, refetch: refetchSlots } = useAvailableSlots(selectedIps);
  const slotsIps = useMemo(() => slotsIpsRaw.filter((s) => esFuturo(s, hoy)), [slotsIpsRaw, hoy]);
  const fechas = useMemo(() => Array.from(new Set(slotsIps.map((s) => s.fecha))), [slotsIps]);
  const fechaActiva = selectedFecha && fechas.includes(selectedFecha) ? selectedFecha : fechas[0] ?? null;
  const horasDelDia = slotsIps.filter((s) => s.fecha === fechaActiva);

  const ciudadObj = DEPARTAMENTOS.find((d) => d.nombre === depto)?.ciudades.find((c) => c.nombre === ciudad);
  const centro = useMemo(
    () => userLoc ?? (ciudadObj ? { lat: ciudadObj.lat, lng: ciudadObj.lng } : { lat: 4.71, lng: -74.07 }),
    [userLoc, ciudadObj?.lat, ciudadObj?.lng],
  );

  const ipsConDistancia = useMemo(() => {
    return ipsEnCiudad
      .filter((ips) => {
        if (filtroClasificaciones.length === 0) return true;
        return derivarClasificaciones(ips.servicios ?? [], catalogoServicios).some((c) => filtroClasificaciones.includes(c));
      })
      .map((ips) => ({
        ips,
        distancia: ips.lat && ips.lng ? haversineKm(centro, { lat: ips.lat, lng: ips.lng }) : 999,
      }))
      .sort((a, b) => a.distancia - b.distancia);
  }, [ipsEnCiudad, centro, filtroClasificaciones, catalogoServicios]);

  const markers = useMemo(() => ipsConDistancia
    .filter(({ ips }) => ips.lat != null && ips.lng != null)
    .map(({ ips }) => ({ id: ips.id, lat: ips.lat!, lng: ips.lng!, title: ips.nombre, selected: ips.id === selectedIps })),
  [ipsConDistancia, selectedIps]);

  const ipsSel = ipsEnCiudad.find((i) => i.id === selectedIps) ?? null;
  const distSel = ipsConDistancia.find((i) => i.ips.id === selectedIps)?.distancia ?? 999;
  const slotSel = slotsIps.find((s) => s.id === selectedSlot) ?? null;

  // ── Validación por paso ──
  const cedulaError = !cedula.trim() ? "Ingresa tu número de documento." : !/^\d{5,12}$/.test(cedula) ? "Usa solo números, entre 5 y 12 dígitos." : null;
  const tipoError = !tipoExamen ? "Selecciona el tipo de examen." : null;
  const canNext: Record<StepId, boolean> = {
    1: !cedulaError && !tipoError,
    2: !!ciudad,
    3: !!selectedIps,
    4: !!slotSel,
    5: true,
  };

  const goTo = (s: StepId) => {
    setStep(s);
    setMaxStep((m) => (s > m ? s : m));
  };
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) { firstRender.current = false; return; }
    // Lleva el foco al título del paso para lectores de pantalla y teclado.
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
    if (step < 5) goTo((step + 1) as StepId);
  };
  const back = () => { if (step > 1) setStep((step - 1) as StepId); };

  const toggleFiltro = (nombre: string) => {
    setFiltroClasificaciones((prev) => (prev.includes(nombre) ? prev.filter((x) => x !== nombre) : [...prev, nombre]));
  };

  const selectIps = (id: string) => {
    if (id !== selectedIps) { setSelectedSlot(null); setSelectedFecha(null); }
    setSelectedIps(id);
    document.getElementById(`ips-${id}`)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  };
  const elegirIps = (id: string) => {
    selectIps(id);
    setDetailIps(null);
    setMaxStep(3);
    goTo(4);
  };

  const cambiarUbicacion = () => { setSelectedIps(null); setSelectedSlot(null); setMaxStep(2); };

  const geolocate = () => {
    if (!("geolocation" in navigator)) return toast.error("Tu navegador no permite obtener la ubicación");
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setUserLoc({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        cambiarUbicacion();
        setLocating(false);
        toast.success("Ubicación detectada: ordenamos las IPS por cercanía");
      },
      () => {
        setLocating(false);
        toast.error("No pudimos obtener tu ubicación", { description: "Revisa los permisos del navegador o escribe tu dirección." });
      },
      { timeout: 10000 },
    );
  };

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

  if (done) return <Exito cita={done} onOtra={reiniciar} headingRef={headingRef} />;

  const current = STEPS[step - 1];

  return (
    <div className="space-y-6">
      <PageHeader
        icon={CalendarPlus}
        title="Solicitar cita"
        description="Agenda tu examen médico en cinco pasos. Puedes volver atrás cuando quieras."
      />

      <Stepper step={step} maxStep={maxStep} onGo={(s) => s <= maxStep && setStep(s)} />

      <div className="grid gap-6 lg:grid-cols-12">
        {/* ── Paso 1 · Información ── */}
        {step === 1 && (
          <>
            <Card className="lg:col-span-7 xl:col-span-8">
              <StepHeading refEl={headingRef} step={current} description="Confirma tus datos y el tipo de examen que necesitas." />
              <CardContent className="space-y-6">
                <div className="grid gap-5 sm:grid-cols-2">
                  <FormField id="sol-nombre" label="Nombre" hint="Se toma de tu perfil.">
                    <IconInput icon={UserRound} value={profile?.nombre ?? ""} readOnly disabled />
                  </FormField>
                  <FormField id="sol-cedula" label="Número de documento" required error={touched1 ? cedulaError : null}>
                    <IconInput icon={IdCard} inputMode="numeric" autoComplete="off" value={cedula} onChange={(e) => setCedula(soloDigitos(e.target.value))} onBlur={() => setTouched1(true)} />
                  </FormField>
                </div>
                <fieldset>
                  <legend className="mb-2 text-[13px] font-semibold">Tipo de examen <span className="text-danger-foreground" aria-hidden>*</span></legend>
                  {tiposLoading ? (
                    <div className="grid gap-3 sm:grid-cols-2"><Skeleton className="h-20" /><Skeleton className="h-20" /></div>
                  ) : tiposDisponibles.length === 0 ? (
                    <p className="rounded-lg bg-warning-soft px-3 py-2 text-sm text-warning-foreground">No hay tipos de examen habilitados para particulares. Contacta a soporte.</p>
                  ) : (
                    <div className="grid gap-3 sm:grid-cols-2" role="radiogroup" aria-label="Tipo de examen">
                      {tiposDisponibles.map((t) => {
                        const active = tipoExamen === t.nombre;
                        return (
                          <label
                            key={t.id}
                            className={cn(
                              "flex cursor-pointer items-center gap-3 rounded-xl border-2 p-4 transition-colors focus-within:ring-2 focus-within:ring-ring",
                              active ? "border-primary bg-primary-soft" : "border-border hover:border-primary/40",
                            )}
                          >
                            <input type="radio" name="tipo-examen" value={t.nombre} checked={active} onChange={() => setTipoExamen(t.nombre)} className="sr-only" />
                            <span className={cn("flex size-5 shrink-0 items-center justify-center rounded-full border-2", active ? "border-primary bg-primary" : "border-input")} aria-hidden>
                              {active && <span className="size-2 rounded-full bg-white" />}
                            </span>
                            <span>
                              <span className="block font-semibold">Examen de {t.nombre.toLowerCase()}</span>
                              <span className="block text-xs text-muted-foreground">{capitalizar(t.nombre)}</span>
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  )}
                  {touched1 && tipoError && <p className="mt-1.5 text-[13px] font-medium text-danger-foreground">{tipoError}</p>}
                </fieldset>
              </CardContent>
            </Card>
            <Resumen className="hidden lg:col-span-5 lg:block xl:col-span-4" data={{ tipoExamen, ciudad, ips: ipsSel?.nombre, slot: slotSel }} />
          </>
        )}

        {/* ── Paso 2 · Ubicación ── */}
        {step === 2 && (
          <>
            <Card className="lg:col-span-5">
              <StepHeading refEl={headingRef} step={current} description="Indica dónde estás para mostrarte las IPS más cercanas." />
              <CardContent className="space-y-5">
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
                  <FormField id="sol-depto" label="Departamento" required>
                    <Select value={depto} onValueChange={(v) => { setDepto(v); const first = DEPARTAMENTOS.find(d => d.nombre === v)?.ciudades[0]; if (first) setCiudad(first.nombre); setUserLoc(null); cambiarUbicacion(); }}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {DEPARTAMENTOS.map((d) => <SelectItem key={d.nombre} value={d.nombre}>{d.nombre}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </FormField>
                  <FormField id="sol-ciudad" label="Ciudad" required>
                    <Select value={ciudad} onValueChange={(v) => { setCiudad(v); setUserLoc(null); cambiarUbicacion(); }}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {(DEPARTAMENTOS.find((d) => d.nombre === depto)?.ciudades ?? []).map((c) => (
                          <SelectItem key={c.nombre} value={c.nombre}>{c.nombre}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </FormField>
                </div>
                <FormField id="sol-direccion" label="Dirección de residencia" hint="Opcional. Escribe y elige una sugerencia, o toca el mapa para fijarla.">
                  <AddressInput
                    value={direccion}
                    city={ciudad}
                    placeholder="Ej.: Cra 15 #93-40"
                    onChange={setDireccion}
                    onResolved={(loc, formatted) => {
                      setUserLoc(loc);
                      setDireccion(formatted);
                      cambiarUbicacion();
                      toast.success("Dirección ubicada: ordenamos las IPS por cercanía");
                    }}
                  />
                </FormField>
                <div className="flex items-center gap-3">
                  <div className="h-px flex-1 bg-border" />
                  <span className="text-xs text-muted-foreground">o</span>
                  <div className="h-px flex-1 bg-border" />
                </div>
                <Button type="button" variant="outline" className="w-full" onClick={geolocate} disabled={locating}>
                  {locating ? <Loader2 className="animate-spin" /> : <LocateFixed />} Usar mi ubicación actual
                </Button>
                <p className={cn("flex items-start gap-2 rounded-lg px-3 py-2 text-[13px]", userLoc ? "bg-success-soft text-success-foreground" : "bg-muted text-muted-foreground")} aria-live="polite">
                  {userLoc ? <Check className="mt-0.5 size-4 shrink-0" aria-hidden /> : <Info className="mt-0.5 size-4 shrink-0" aria-hidden />}
                  {userLoc ? "Ubicación fijada. Las IPS se ordenarán por distancia a este punto." : `Sin ubicación exacta, ordenaremos las IPS desde el centro de ${ciudad}.`}
                </p>
              </CardContent>
            </Card>
            <div className="lg:col-span-7">
              <IpsMap
                label={`Mapa de ${ciudad}`}
                center={centro}
                markers={markers}
                onSelect={selectIps}
                onMapClick={(lat, lng) => { setUserLoc({ lat, lng }); cambiarUbicacion(); }}
                origin={userLoc}
                height="clamp(260px, 50vh, 460px)"
              />
              <p className="mt-2 text-xs text-muted-foreground">Toca el mapa para fijar tu ubicación. Los puntos turquesa son las IPS de {ciudad}.</p>
            </div>
          </>
        )}

        {/* ── Paso 3 · IPS ── */}
        {step === 3 && (
          <>
            <Card className="flex flex-col lg:col-span-5">
              <StepHeading
                refEl={headingRef}
                step={current}
                description={<>IPS en <strong className="text-foreground">{ciudad}</strong>, ordenadas por cercanía.</>}
              />
              <CardContent className="flex min-h-0 flex-1 flex-col gap-4">
                {clasificaciones.length > 0 && (
                  <div role="group" aria-label="Filtrar por clasificación" className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
                    <button
                      aria-pressed={filtroClasificaciones.length === 0}
                      onClick={() => setFiltroClasificaciones([])}
                      className={chipClass(filtroClasificaciones.length === 0)}
                    >
                      Todas
                    </button>
                    {clasificaciones.map((c) => (
                      <button key={c.id} aria-pressed={filtroClasificaciones.includes(c.nombre)} onClick={() => toggleFiltro(c.nombre)} className={chipClass(filtroClasificaciones.includes(c.nombre))}>
                        {filtroClasificaciones.includes(c.nombre) && <Check className="size-3.5" aria-hidden />}
                        {c.nombre}
                      </button>
                    ))}
                  </div>
                )}

                {ipsLoading ? (
                  <div className="space-y-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-24 w-full" />)}</div>
                ) : ipsError ? (
                  <div role="alert" className="rounded-lg bg-danger-soft p-4 text-sm text-danger-foreground">
                    No pudimos cargar las IPS. <Button variant="link" className="text-danger-foreground underline" onClick={() => refetchIps()}>Reintentar</Button>
                  </div>
                ) : ipsConDistancia.length === 0 ? (
                  <EmptyState
                    compact
                    icon={Search}
                    title={filtroClasificaciones.length ? "Ninguna IPS coincide con los filtros" : `No hay IPS disponibles en ${ciudad}`}
                    description={filtroClasificaciones.length ? "Quita algún filtro para ver más opciones." : "Prueba con otra ciudad cercana."}
                    action={filtroClasificaciones.length
                      ? <Button variant="outline" onClick={() => setFiltroClasificaciones([])}>Quitar filtros</Button>
                      : <Button variant="outline" onClick={() => setStep(2)}><MapPin /> Cambiar ciudad</Button>}
                  />
                ) : (
                  <>
                    <p className="text-xs text-muted-foreground" aria-live="polite">
                      {ipsConDistancia.length} {ipsConDistancia.length === 1 ? "IPS encontrada" : "IPS encontradas"}
                    </p>
                    <ul className="-mr-2 space-y-3 overflow-y-auto pr-2 lg:max-h-[560px]">
                      {ipsConDistancia.map(({ ips, distancia }) => {
                        const active = selectedIps === ips.id;
                        const disp = disponibilidad.get(ips.id);
                        const clasif = derivarClasificaciones(ips.servicios ?? [], catalogoServicios);
                        return (
                          <li key={ips.id} id={`ips-${ips.id}`}>
                            <div
                              className={cn(
                                "rounded-xl border-2 bg-card p-3 transition-all",
                                active ? "border-primary bg-primary-soft/40 shadow-sm" : "border-border hover:border-primary/40",
                              )}
                            >
                              <button
                                type="button"
                                onClick={() => selectIps(ips.id)}
                                aria-pressed={active}
                                className="flex w-full gap-3 rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                              >
                                <span className="size-16 shrink-0 overflow-hidden rounded-lg border bg-muted">
                                  {portadaUrl(ips.id) ? (
                                    <img src={portadaUrl(ips.id)} alt="" className="size-full object-cover" loading="lazy" />
                                  ) : (
                                    <span className="flex size-full items-center justify-center"><Stethoscope className="size-6 text-muted-foreground" aria-hidden /></span>
                                  )}
                                </span>
                                <span className="min-w-0 flex-1">
                                  <span className="flex items-start justify-between gap-2">
                                    <span className="font-semibold leading-snug">{ips.nombre}</span>
                                    <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs font-semibold tabular-nums">{formatDistancia(distancia)}</span>
                                  </span>
                                  {ips.direccion && <span className="mt-0.5 block truncate text-[13px] text-muted-foreground">{ips.direccion}</span>}
                                  <span className="mt-1.5 block text-xs">
                                    {libresLoading ? (
                                      <span className="text-muted-foreground">Consultando disponibilidad…</span>
                                    ) : disp?.primero ? (
                                      <span className="inline-flex items-center gap-1 font-medium text-success-foreground">
                                        <CalendarClock className="size-3.5" aria-hidden />
                                        Próximo: {formatFechaCorta(disp.primero.fecha)}, {formatHora(disp.primero.hora)} · {disp.count} {disp.count === 1 ? "horario" : "horarios"}
                                      </span>
                                    ) : (
                                      <span className="inline-flex items-center gap-1 font-medium text-warning-foreground">
                                        <CalendarX2 className="size-3.5" aria-hidden /> Sin horarios disponibles
                                      </span>
                                    )}
                                  </span>
                                </span>
                              </button>
                              {clasif.length > 0 && (
                                <div className="mt-2 flex flex-wrap gap-1">
                                  {clasif.slice(0, 3).map((c) => (
                                    <span key={c} className="rounded-full bg-secondary px-2 py-0.5 text-[11px] font-medium text-secondary-foreground">{c}</span>
                                  ))}
                                  {clasif.length > 3 && <span className="px-1 text-[11px] text-muted-foreground">+{clasif.length - 3}</span>}
                                </div>
                              )}
                              <div className="mt-3 grid grid-cols-2 gap-2">
                                <Button size="sm" variant="ghost" onClick={() => setDetailIps(ips.id)}>
                                  <Eye /> Ver detalles
                                </Button>
                                <Button size="sm" variant={active ? "default" : "outline"} onClick={() => elegirIps(ips.id)} disabled={!libresLoading && !disp}>
                                  {active ? <Check /> : null} Elegir
                                </Button>
                              </div>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  </>
                )}
              </CardContent>
            </Card>
            <div className="order-first lg:order-none lg:col-span-7">
              <div className="lg:sticky lg:top-24">
                <IpsMap
                  label={`Mapa de IPS en ${ciudad}`}
                  center={centro}
                  markers={markers}
                  onSelect={selectIps}
                  origin={userLoc}
                  height="clamp(240px, 60vh, 640px)"
                />
                {ipsSel && (
                  <div className="mt-3 flex items-center justify-between gap-3 rounded-xl border bg-card p-3 shadow-sm" aria-live="polite">
                    <div className="min-w-0">
                      <p className="text-xs text-muted-foreground">IPS seleccionada</p>
                      <p className="truncate font-semibold">{ipsSel.nombre}</p>
                    </div>
                    <Button onClick={() => elegirIps(ipsSel.id)} disabled={!libresLoading && !disponibilidad.get(ipsSel.id)}>
                      Continuar <ChevronRight />
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </>
        )}

        {/* ── Paso 4 · Fecha y hora ── */}
        {step === 4 && (
          <>
            <Card className="lg:col-span-7 xl:col-span-8">
              <StepHeading
                refEl={headingRef}
                step={current}
                description={<>Horarios disponibles en <strong className="text-foreground">{ipsSel?.nombre}</strong>.</>}
              />
              <CardContent className="space-y-6">
                {slotsLoading ? (
                  <div className="space-y-4"><div className="flex gap-2">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-20 w-16" />)}</div><Skeleton className="h-24 w-full" /></div>
                ) : slotsIps.length === 0 ? (
                  <EmptyState
                    compact
                    icon={CalendarX2}
                    title="No hay horarios disponibles"
                    description="Esta IPS no tiene cupos libres por ahora. Elige otra IPS cercana."
                    action={<Button variant="outline" onClick={() => setStep(3)}><Building2 /> Elegir otra IPS</Button>}
                  />
                ) : (
                  <>
                    <div>
                      <h3 className="mb-2 text-[13px] font-semibold">1. Elige el día</h3>
                      <div role="group" aria-label="Días disponibles" className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-2">
                        {fechas.map((f) => {
                          const p = fechaPartes(f);
                          const active = f === fechaActiva;
                          const n = slotsIps.filter((s) => s.fecha === f).length;
                          return (
                            <button
                              key={f}
                              aria-pressed={active}
                              aria-label={`${formatFecha(f)}, ${n} ${n === 1 ? "horario" : "horarios"}`}
                              onClick={() => { setSelectedFecha(f); setSelectedSlot(null); }}
                              className={cn(
                                "flex w-[72px] shrink-0 flex-col items-center rounded-xl border-2 py-2.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                                active ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card hover:border-primary/40",
                              )}
                            >
                              <span className={cn("text-xs capitalize", active ? "opacity-90" : "text-muted-foreground")}>{p.semana}</span>
                              <span className="text-xl font-bold leading-tight">{p.dia}</span>
                              <span className={cn("text-[11px] font-semibold", active ? "opacity-90" : "text-accent-foreground")}>{p.mes}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                    <div>
                      <h3 className="mb-2 text-[13px] font-semibold">
                        2. Elige la hora {fechaActiva && <span className="font-normal text-muted-foreground">· {capitalizar(formatFecha(fechaActiva))}</span>}
                      </h3>
                      <div role="radiogroup" aria-label="Horas disponibles" className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
                        {horasDelDia.map((s) => {
                          const active = selectedSlot === s.id;
                          return (
                            <button
                              key={s.id}
                              role="radio"
                              aria-checked={active}
                              onClick={() => setSelectedSlot(s.id)}
                              className={cn(
                                "rounded-xl border-2 px-3 py-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                                active ? "border-primary bg-primary-soft" : "border-border hover:border-primary/40",
                              )}
                            >
                              <span className="flex items-center gap-1.5 font-semibold tabular-nums">
                                <Clock className={cn("size-4", active ? "text-accent-foreground" : "text-muted-foreground")} aria-hidden />
                                {formatHora(s.hora)}
                              </span>
                              <span className="mt-0.5 block truncate text-xs text-muted-foreground">{s.servicio}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
            <Resumen className="lg:col-span-5 xl:col-span-4" data={{ tipoExamen, ciudad, ips: ipsSel?.nombre, slot: slotSel }} />
          </>
        )}

        {/* ── Paso 5 · Confirmación ── */}
        {step === 5 && slotSel && (
          <Card className="lg:col-span-8 lg:col-start-3">
            <StepHeading refEl={headingRef} step={current} description="Revisa los datos de tu cita antes de confirmarla." />
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

      {/* Navegación del asistente: fija abajo en móvil */}
      <div className="sticky bottom-0 z-10 -mx-4 border-t bg-card/95 px-4 py-3 backdrop-blur md:static md:mx-0 md:rounded-xl md:border md:shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <Button variant="ghost" onClick={back} disabled={step === 1} className={cn(step === 1 && "invisible")}>
            <ChevronLeft /> Atrás
          </Button>
          <span className="text-sm text-muted-foreground md:hidden">Paso {step} de 5</span>
          {step < 5 ? (
            <Button onClick={next} size="lg" disabled={step === 3 && !selectedIps}>
              Continuar <ChevronRight />
            </Button>
          ) : (
            <Button onClick={submit} size="lg" disabled={bookAppointment.isPending || !slotSel}>
              {bookAppointment.isPending ? <><Loader2 className="animate-spin" /> Agendando…</> : <><Check /> Confirmar cita</>}
            </Button>
          )}
        </div>
      </div>

      <Dialog open={!!detailIps} onOpenChange={(o) => !o && setDetailIps(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Detalle de la IPS</DialogTitle>
            <DialogDescription>Fotos, servicios y ubicación.</DialogDescription>
          </DialogHeader>
          {detailIps && (() => {
            const ips = ipsEnCiudad.find((i) => i.id === detailIps);
            if (!ips) return null;
            const d = ipsConDistancia.find((i) => i.ips.id === detailIps)?.distancia ?? 999;
            return <IpsDetailPanel ips={ips} distancia={d} onConfirm={() => elegirIps(ips.id)} confirmLabel="Elegir esta IPS y ver horarios" />;
          })()}
        </DialogContent>
      </Dialog>
    </div>
  );
}

const chipClass = (active: boolean) =>
  cn(
    "inline-flex h-9 shrink-0 items-center gap-1 rounded-full border px-3.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
    active ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card hover:border-primary/40 hover:bg-muted",
  );

function Stepper({ step, maxStep, onGo }: { step: StepId; maxStep: StepId; onGo: (s: StepId) => void }) {
  return (
    <nav aria-label="Progreso de la solicitud">
      {/* Móvil: barra de progreso compacta */}
      <div className="md:hidden">
        <div className="flex items-center justify-between text-sm">
          <span className="font-semibold">{STEPS[step - 1].title}</span>
          <span className="text-muted-foreground">Paso {step} de {STEPS.length}</span>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuemin={1} aria-valuemax={5} aria-valuenow={step} aria-label="Progreso">
          <div className="h-full rounded-full bg-primary transition-all duration-300" style={{ width: `${(step / STEPS.length) * 100}%` }} />
        </div>
      </div>
      {/* Tablet y escritorio: pasos con conectores */}
      <ol className="hidden items-center rounded-xl border bg-card p-3 shadow-sm md:flex">
        {STEPS.map((s, i) => {
          const complete = s.id < step;
          const current = s.id === step;
          const reachable = s.id <= maxStep && !current;
          return (
            <li key={s.id} className="flex flex-1 items-center last:flex-none">
              <button
                type="button"
                onClick={() => onGo(s.id)}
                disabled={!reachable}
                aria-current={current ? "step" : undefined}
                className={cn(
                  "flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  reachable && "hover:bg-muted",
                  !reachable && !current && "cursor-default",
                )}
              >
                <span
                  className={cn(
                    "flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-bold transition-colors",
                    current && "bg-primary text-primary-foreground ring-4 ring-primary/15",
                    complete && "bg-success text-white",
                    !current && !complete && "bg-muted text-muted-foreground",
                  )}
                >
                  {complete ? <Check className="size-4" strokeWidth={3} aria-hidden /> : s.id}
                </span>
                <span className={cn("hidden text-sm lg:inline", current ? "font-semibold" : complete ? "font-medium" : "text-muted-foreground")}>
                  {s.title}
                </span>
                <span className={cn("text-sm lg:hidden", current ? "font-semibold" : "sr-only")}>{s.short}</span>
                <span className="sr-only">{complete ? " (completado)" : current ? " (paso actual)" : ""}</span>
              </button>
              {i < STEPS.length - 1 && (
                <span className={cn("mx-2 h-0.5 flex-1 rounded-full", complete ? "bg-success" : "bg-border")} aria-hidden />
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

function StepHeading({
  refEl, step, description,
}: {
  refEl: React.RefObject<HTMLHeadingElement | null>;
  step: (typeof STEPS)[number];
  description: React.ReactNode;
}) {
  return (
    <CardHeader>
      <div className="flex items-center gap-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-accent-foreground">
          <step.icon className="size-5" aria-hidden />
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Paso {step.id} de 5</p>
          <h2 ref={refEl} tabIndex={-1} className="text-lg font-semibold focus:outline-none">{step.title}</h2>
        </div>
      </div>
      <p className="text-sm text-muted-foreground">{description}</p>
    </CardHeader>
  );
}

function Resumen({
  className, data,
}: {
  className?: string;
  data: { tipoExamen: string; ciudad: string; ips?: string; slot: Slot | null };
}) {
  const rows = [
    { icon: ClipboardList, label: "Examen", value: data.tipoExamen ? `Examen de ${data.tipoExamen.toLowerCase()}` : null },
    { icon: MapPin, label: "Ciudad", value: data.ciudad || null },
    { icon: Building2, label: "IPS", value: data.ips ?? null },
    { icon: CalendarClock, label: "Fecha y hora", value: data.slot ? `${formatFechaCorta(data.slot.fecha)}, ${formatHora(data.slot.hora)}` : null },
  ];
  return (
    <aside className={className} aria-label="Resumen de tu cita">
      <Card className="lg:sticky lg:top-24">
        <CardHeader className="pb-3"><CardTitle>Resumen de tu cita</CardTitle></CardHeader>
        <CardContent>
          <ul className="space-y-3">
            {rows.map((r) => (
              <li key={r.label} className="flex gap-3">
                <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-lg", r.value ? "bg-primary-soft text-accent-foreground" : "bg-muted text-muted-foreground")}>
                  <r.icon className="size-4" aria-hidden />
                </span>
                <span className="min-w-0">
                  <span className="block text-xs text-muted-foreground">{r.label}</span>
                  <span className={cn("block text-sm", r.value ? "font-medium" : "text-muted-foreground")}>{r.value ?? "Pendiente"}</span>
                </span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </aside>
  );
}

function ConfirmRow({
  icon: Icon, label, value, sub, onEdit,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  sub?: string;
  onEdit: () => void;
}) {
  return (
    <div className="flex items-center gap-3 p-4">
      <Icon className="size-5 shrink-0 text-muted-foreground" aria-hidden />
      <div className="min-w-0 flex-1">
        <dt className="text-xs text-muted-foreground">{label}</dt>
        <dd className="font-medium">{value}</dd>
        {sub && <dd className="text-[13px] text-muted-foreground">{sub}</dd>}
      </div>
      <Button variant="ghost" size="sm" onClick={onEdit} aria-label={`Editar ${label.toLowerCase()}`}>
        <Pencil /> <span className="hidden sm:inline">Editar</span>
      </Button>
    </div>
  );
}

function Exito({
  cita, onOtra, headingRef,
}: {
  cita: { fecha: string; hora: string; ips: string; tipo: string; servicio: string; direccion: string | null; ciudad: string };
  onOtra: () => void;
  headingRef: React.RefObject<HTMLHeadingElement | null>;
}) {
  const mapa = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${cita.ips}, ${cita.direccion ?? ""}, ${cita.ciudad}, Colombia`)}`;
  return (
    <div className="mx-auto max-w-xl py-6">
      <Card className="overflow-hidden text-center">
        <div className="bg-success-soft px-6 pb-6 pt-8">
          <div className="mx-auto flex size-16 items-center justify-center rounded-full bg-success text-white shadow-md animate-in zoom-in-50 duration-300">
            <Check className="size-8" strokeWidth={3} aria-hidden />
          </div>
          <h1 ref={headingRef} tabIndex={-1} className="mt-4 text-2xl font-bold focus:outline-none">¡Tu cita quedó agendada!</h1>
          <p className="mt-1 text-sm text-muted-foreground">Te enviamos una notificación con los detalles.</p>
        </div>
        <CardContent className="space-y-4 pt-6 text-left">
          <dl className="space-y-3 rounded-xl border p-4 text-sm">
            <div className="flex justify-between gap-4"><dt className="text-muted-foreground">Examen</dt><dd className="text-right font-medium">Examen de {cita.tipo.toLowerCase()} · {cita.servicio}</dd></div>
            <div className="flex justify-between gap-4"><dt className="text-muted-foreground">Fecha</dt><dd className="text-right font-medium">{capitalizar(formatFecha(cita.fecha))}</dd></div>
            <div className="flex justify-between gap-4"><dt className="text-muted-foreground">Hora</dt><dd className="text-right font-medium">{formatHora(cita.hora)}</dd></div>
            <div className="flex justify-between gap-4"><dt className="text-muted-foreground">IPS</dt><dd className="text-right font-medium">{cita.ips}</dd></div>
          </dl>
          <div className="grid gap-2 sm:grid-cols-2">
            <Link to="/app/particular/citas" className={buttonVariants({ size: "lg" })}><CalendarClock /> Ver mis citas</Link>
            <a href={mapa} target="_blank" rel="noopener noreferrer" className={buttonVariants({ variant: "outline", size: "lg" })}>
              <Navigation /> Ver ubicación<span className="sr-only"> (pestaña nueva)</span>
            </a>
          </div>
          <div className="flex justify-center gap-4 pt-1">
            <Link to="/app/particular" className={buttonVariants({ variant: "link" })}><House className="size-4" /> Ir al inicio</Link>
            <Button variant="link" onClick={onOtra}><CalendarPlus className="size-4" /> Agendar otra cita</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
