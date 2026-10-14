import { useState, type RefObject } from "react";
import {
  Check, Info, Loader2, LocateFixed, MapPin, Search, Stethoscope, CalendarClock, CalendarX2, Eye, ChevronRight, Building2, Clock,
} from "lucide-react";
import { toast } from "sonner";
import { DEPARTAMENTOS } from "@/lib/colombia";
import type { Slot, TipoExamen } from "@/lib/database.types";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { IpsMap } from "@/components/IpsMap";
import { AddressInput } from "@/components/AddressInput";
import { IpsDetailPanel } from "@/components/IpsDetailPanel";
import { EmptyState } from "@/components/app/EmptyState";
import { FormField } from "@/components/app/FormField";
import { derivarClasificaciones } from "@/lib/hooks/useCatalogos";
import { capitalizar, fechaPartes, formatFecha, formatFechaCorta, formatHora } from "@/lib/format";
import { cn } from "@/lib/utils";
import { StepHeading, type WizardStep } from "./WizardParts";
import { chipClass, formatDistancia, type IpsSearch, type LatLng } from "./useIpsSearch";

// ─── Tipo de examen ───────────────────────────────────────────────────────────

export function TipoExamenPicker({
  tipos, loading, value, onChange, error,
}: {
  tipos: TipoExamen[];
  loading: boolean;
  value: string;
  onChange: (v: string) => void;
  error?: string | null;
}) {
  return (
    <fieldset>
      <legend className="mb-2 text-[13px] font-semibold">Tipo de examen <span className="text-danger-foreground" aria-hidden>*</span></legend>
      {loading ? (
        <div className="grid gap-3 sm:grid-cols-2"><Skeleton className="h-20" /><Skeleton className="h-20" /></div>
      ) : tipos.length === 0 ? (
        <p className="rounded-lg bg-warning-soft px-3 py-2 text-sm text-warning-foreground">No hay tipos de examen habilitados para tu cuenta. Contacta a soporte.</p>
      ) : (
        <div className={cn("grid gap-3", tipos.length > 2 ? "sm:grid-cols-3" : "sm:grid-cols-2")} role="radiogroup" aria-label="Tipo de examen">
          {tipos.map((t) => {
            const active = value === t.nombre;
            return (
              <label
                key={t.id}
                className={cn(
                  "flex cursor-pointer items-center gap-3 rounded-xl border-2 p-4 transition-colors focus-within:ring-2 focus-within:ring-ring",
                  active ? "border-primary bg-primary-soft" : "border-border hover:border-primary/40",
                )}
              >
                <input type="radio" name="tipo-examen" value={t.nombre} checked={active} onChange={() => onChange(t.nombre)} className="sr-only" />
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
      {error && <p className="mt-1.5 text-[13px] font-medium text-danger-foreground">{error}</p>}
    </fieldset>
  );
}

// ─── Paso: Ubicación ──────────────────────────────────────────────────────────

export function UbicacionStep({
  headingRef, step, total, depto, ciudad, direccion, userLoc, search,
  onDepto, onCiudad, onDireccion, onLocation, onSelectIps,
  direccionLabel = "Dirección de residencia",
  descripcion = "Indica dónde estás para mostrarte las IPS más cercanas.",
}: {
  headingRef: RefObject<HTMLHeadingElement | null>;
  step: WizardStep;
  total: number;
  depto: string;
  ciudad: string;
  direccion: string;
  userLoc: LatLng | null;
  search: IpsSearch;
  onDepto: (v: string) => void;
  onCiudad: (v: string) => void;
  onDireccion: (v: string) => void;
  /** Nueva ubicación de referencia (dirección resuelta, geolocalización o clic en el mapa). */
  onLocation: (loc: LatLng, formatted?: string) => void;
  onSelectIps: (id: string) => void;
  direccionLabel?: string;
  descripcion?: string;
}) {
  const [locating, setLocating] = useState(false);

  const geolocate = () => {
    if (!("geolocation" in navigator)) return toast.error("Tu navegador no permite obtener la ubicación");
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        onLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setLocating(false);
        toast.success("Ubicación detectada: ordenamos las IPS por cercanía");
      },
      () => {
        setLocating(false);
        toast.error("No pudimos obtener tu ubicación", { description: "Revisa los permisos del navegador o escribe la dirección." });
      },
      { timeout: 10000 },
    );
  };

  return (
    <>
      <Card className="lg:col-span-5">
        <StepHeading refEl={headingRef} step={step} total={total} description={descripcion} />
        <CardContent className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
            <FormField id="sol-depto" label="Departamento" required>
              <Select value={depto} onValueChange={onDepto}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {DEPARTAMENTOS.map((d) => <SelectItem key={d.nombre} value={d.nombre}>{d.nombre}</SelectItem>)}
                </SelectContent>
              </Select>
            </FormField>
            <FormField id="sol-ciudad" label="Ciudad" required>
              <Select value={ciudad} onValueChange={onCiudad}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(DEPARTAMENTOS.find((d) => d.nombre === depto)?.ciudades ?? []).map((c) => (
                    <SelectItem key={c.nombre} value={c.nombre}>{c.nombre}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>
          </div>
          <FormField id="sol-direccion" label={direccionLabel} hint="Opcional. Escribe y elige una sugerencia, o toca el mapa para fijarla.">
            <AddressInput
              value={direccion}
              city={ciudad}
              placeholder="Ej.: Cra 15 #93-40"
              onChange={onDireccion}
              onResolved={(loc, formatted) => {
                onLocation(loc, formatted);
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
          center={search.centro}
          markers={search.markers}
          onSelect={onSelectIps}
          onMapClick={(lat, lng) => onLocation({ lat, lng })}
          origin={userLoc}
          height="clamp(260px, 50vh, 460px)"
        />
        <p className="mt-2 text-xs text-muted-foreground">Toca el mapa para fijar la ubicación. Los marcadores son las IPS de {ciudad}.</p>
      </div>
    </>
  );
}

// ─── Paso: Selección de IPS ───────────────────────────────────────────────────

export function IpsStep({
  headingRef, step, total, ciudad, userLoc, search, filtro, setFiltro, selectedIps, onSelect, onElegir, onCambiarCiudad, cuposNecesarios,
}: {
  headingRef: RefObject<HTMLHeadingElement | null>;
  step: WizardStep;
  total: number;
  ciudad: string;
  userLoc: LatLng | null;
  search: IpsSearch;
  filtro: string[];
  setFiltro: (f: string[]) => void;
  selectedIps: string | null;
  onSelect: (id: string) => void;
  onElegir: (id: string) => void;
  onCambiarCiudad: () => void;
  /** Citas masivas: cantidad de empleados, para indicar si los horarios de cada IPS alcanzan. */
  cuposNecesarios?: number;
}) {
  const [detailIps, setDetailIps] = useState<string | null>(null);
  const { clasificaciones, catalogoServicios, ipsEnCiudad, ipsLoading, ipsError, refetchIps, portadaUrl, disponibilidad, libresLoading, ipsConDistancia, markers, centro } = search;
  const ipsSel = ipsEnCiudad.find((i) => i.id === selectedIps) ?? null;
  const toggle = (nombre: string) => setFiltro(filtro.includes(nombre) ? filtro.filter((x) => x !== nombre) : [...filtro, nombre]);

  const seleccionar = (id: string) => {
    onSelect(id);
    document.getElementById(`ips-${id}`)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  };

  return (
    <>
      <Card className="flex flex-col lg:col-span-5">
        <StepHeading
          refEl={headingRef}
          step={step}
          total={total}
          description={<>IPS en <strong className="text-foreground">{ciudad}</strong>, ordenadas por cercanía.</>}
        />
        <CardContent className="flex min-h-0 flex-1 flex-col gap-4">
          {clasificaciones.length > 0 && (
            <div role="group" aria-label="Filtrar por clasificación" className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
              <button aria-pressed={filtro.length === 0} onClick={() => setFiltro([])} className={chipClass(filtro.length === 0)}>Todas</button>
              {clasificaciones.map((c) => (
                <button key={c.id} aria-pressed={filtro.includes(c.nombre)} onClick={() => toggle(c.nombre)} className={chipClass(filtro.includes(c.nombre))}>
                  {filtro.includes(c.nombre) && <Check className="size-3.5" aria-hidden />}
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
              title={filtro.length ? "Ninguna IPS coincide con los filtros" : `No hay IPS disponibles en ${ciudad}`}
              description={filtro.length ? "Quita algún filtro para ver más opciones." : "Prueba con otra ciudad cercana."}
              action={filtro.length
                ? <Button variant="outline" onClick={() => setFiltro([])}>Quitar filtros</Button>
                : <Button variant="outline" onClick={onCambiarCiudad}><MapPin /> Cambiar ciudad</Button>}
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
                  const insuficiente = !!cuposNecesarios && !!disp && disp.count < cuposNecesarios;
                  return (
                    <li key={ips.id} id={`ips-${ips.id}`}>
                      <div className={cn("rounded-xl border-2 bg-card p-3 transition-all", active ? "border-primary bg-primary-soft/40 shadow-sm" : "border-border hover:border-primary/40")}>
                        <button
                          type="button"
                          onClick={() => seleccionar(ips.id)}
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
                                <span className={cn("inline-flex items-center gap-1 font-medium", insuficiente ? "text-warning-foreground" : "text-success-foreground")}>
                                  <CalendarClock className="size-3.5" aria-hidden />
                                  {cuposNecesarios
                                    ? `${disp.count} ${disp.count === 1 ? "horario" : "horarios"} para ${cuposNecesarios} ${cuposNecesarios === 1 ? "empleado" : "empleados"}`
                                    : `Próximo: ${formatFechaCorta(disp.primero.fecha)}, ${formatHora(disp.primero.hora)} · ${disp.count} ${disp.count === 1 ? "horario" : "horarios"}`}
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
                          <Button size="sm" variant={active ? "default" : "outline"} onClick={() => onElegir(ips.id)} disabled={!libresLoading && !disp}>
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
          <IpsMap label={`Mapa de IPS en ${ciudad}`} center={centro} markers={markers} onSelect={seleccionar} origin={userLoc} height="clamp(240px, 60vh, 640px)" />
          {ipsSel && (
            <div className="mt-3 flex items-center justify-between gap-3 rounded-xl border bg-card p-3 shadow-sm" aria-live="polite">
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">IPS seleccionada</p>
                <p className="truncate font-semibold">{ipsSel.nombre}</p>
              </div>
              <Button onClick={() => onElegir(ipsSel.id)} disabled={!libresLoading && !disponibilidad.get(ipsSel.id)}>
                Continuar <ChevronRight />
              </Button>
            </div>
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
            return (
              <IpsDetailPanel
                ips={ips}
                distancia={d}
                onConfirm={() => { setDetailIps(null); onElegir(ips.id); }}
                confirmLabel="Elegir esta IPS y ver horarios"
              />
            );
          })()}
        </DialogContent>
      </Dialog>
    </>
  );
}

// ─── Selector de día y hora ───────────────────────────────────────────────────

export function HorarioPicker({
  slots, loading, selectedSlot, onSelectSlot, selectedFecha, onSelectFecha, onOtraIps,
}: {
  slots: Slot[];
  loading: boolean;
  selectedSlot: string | null;
  onSelectSlot: (id: string) => void;
  selectedFecha: string | null;
  onSelectFecha: (f: string) => void;
  onOtraIps: () => void;
}) {
  const fechas = Array.from(new Set(slots.map((s) => s.fecha)));
  const fechaActiva = selectedFecha && fechas.includes(selectedFecha) ? selectedFecha : fechas[0] ?? null;
  const horasDelDia = slots.filter((s) => s.fecha === fechaActiva);

  if (loading) {
    return <div className="space-y-4"><div className="flex gap-2">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-20 w-16" />)}</div><Skeleton className="h-24 w-full" /></div>;
  }
  if (slots.length === 0) {
    return (
      <EmptyState
        compact
        icon={CalendarX2}
        title="No hay horarios disponibles"
        description="Esta IPS no tiene cupos libres por ahora. Elige otra IPS cercana."
        action={<Button variant="outline" onClick={onOtraIps}><Building2 /> Elegir otra IPS</Button>}
      />
    );
  }
  return (
    <>
      <div>
        <h3 className="mb-2 text-[13px] font-semibold">1. Elige el día</h3>
        <div role="group" aria-label="Días disponibles" className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-2">
          {fechas.map((f) => {
            const p = fechaPartes(f);
            const active = f === fechaActiva;
            const n = slots.filter((s) => s.fecha === f).length;
            return (
              <button
                key={f}
                aria-pressed={active}
                aria-label={`${formatFecha(f)}, ${n} ${n === 1 ? "horario" : "horarios"}`}
                onClick={() => onSelectFecha(f)}
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
                onClick={() => onSelectSlot(s.id)}
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
  );
}
