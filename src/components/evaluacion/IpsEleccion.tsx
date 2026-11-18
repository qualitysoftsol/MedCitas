import { useMemo, useState, type ReactNode, type RefObject } from "react";
import { AlertTriangle, CalendarClock, CalendarX2, Check, Loader2, LocateFixed, Search } from "lucide-react";
import { toast } from "sonner";
import { DEPARTAMENTOS } from "@/lib/colombia";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { IpsMap, type MapMarker } from "@/components/IpsMap";
import { AddressInput } from "@/components/AddressInput";
import { IpsDetailPanel } from "@/components/IpsDetailPanel";
import { EmptyState } from "@/components/app/EmptyState";
import { formatDistancia, type IpsSearch, type LatLng } from "@/components/solicitar/useIpsSearch";
import { fechaPartes, formatHora, formatPesos, hoyISO, parseFecha } from "@/lib/format";
import { cn } from "@/lib/utils";

type Orden = "cercania" | "disponibilidad" | "precio";

/** "mar 17 nov, 8:00 a. m." */
function proxima(fecha: string, hora: string) {
  const p = fechaPartes(fecha);
  return `${p.semana} ${p.dia} ${p.mes.toLowerCase()}, ${formatHora(hora)}`;
}

/** 'YYYY-MM-DD' de hoy + n días (hora local). */
function enDias(n: number) {
  const d = parseFecha(hoyISO());
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * Paso "IPS y ubicación": ubicación de referencia, IPS que hacen las pruebas de
 * la evaluación (numeradas igual que en el mapa) y elección de una.
 * Una IPS que hace parte de las pruebas se puede elegir con esas pruebas,
 * salvo con `requiereTodas`.
 */
export function IpsEleccion({
  headingRef, titulo, descripcion, search, depto, ciudad, direccion, userLoc,
  onDepto, onCiudad, onDireccion, onLocation, selectedIps, onSelect, requiereTodas, resumen, nav,
}: {
  headingRef: RefObject<HTMLHeadingElement | null>;
  titulo: string;
  descripcion: ReactNode;
  search: IpsSearch;
  depto: string;
  ciudad: string;
  direccion: string;
  userLoc: LatLng | null;
  onDepto: (v: string) => void;
  onCiudad: (v: string) => void;
  onDireccion: (v: string) => void;
  onLocation: (loc: LatLng, formatted?: string) => void;
  selectedIps: string | null;
  onSelect: (id: string) => void;
  requiereTodas?: boolean;
  /** Tarjeta "Tu evaluación" debajo del mapa. */
  resumen: ReactNode;
  /** Botones Atrás / Continuar al pie de la tarjeta. */
  nav: ReactNode;
}) {
  const { ipsConDistancia, ipsLoading, ipsError, refetchIps, disponibilidad, libresLoading, coberturaDe, preciosLoading, centro, ipsEnCiudad } = search;
  const [orden, setOrden] = useState<Orden>("cercania");
  const [verSinHorario, setVerSinHorario] = useState(false);
  const [detalle, setDetalle] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);
  const finSemana = enDias(6);

  // Solo las IPS que hacen al menos una prueba de la evaluación.
  const candidatas = useMemo(() => {
    const lista = ipsConDistancia.filter(({ ips }) => (coberturaDe(ips.id)?.hechas.length ?? 0) > 0);
    const clave = (id: string) => {
      const p = disponibilidad.get(id)?.primero;
      return p ? `${p.fecha} ${p.hora}` : "9999";
    };
    if (orden === "disponibilidad") lista.sort((a, b) => clave(a.ips.id).localeCompare(clave(b.ips.id)));
    if (orden === "precio") lista.sort((a, b) => (coberturaDe(a.ips.id)?.total ?? 0) - (coberturaDe(b.ips.id)?.total ?? 0));
    return lista;
  }, [ipsConDistancia, coberturaDe, disponibilidad, orden]);

  const estaSemana = (id: string) => {
    const p = disponibilidad.get(id)?.primero;
    return !!p && p.fecha <= finSemana;
  };
  const visibles = candidatas.filter(({ ips }) => libresLoading || estaSemana(ips.id) || verSinHorario);
  const ocultas = candidatas.length - visibles.length;
  const completas = candidatas.filter(({ ips }) => coberturaDe(ips.id)?.faltan.length === 0).length;
  const parciales = candidatas.length - completas;

  const markers: MapMarker[] = visibles
    .filter(({ ips }) => ips.lat != null && ips.lng != null)
    .map(({ ips }) => ({
      id: ips.id, lat: ips.lat!, lng: ips.lng!, title: ips.nombre, selected: ips.id === selectedIps,
      numero: visibles.findIndex((v) => v.ips.id === ips.id) + 1,
    }));

  const geolocate = () => {
    if (!("geolocation" in navigator)) return toast.error("Tu navegador no permite obtener la ubicación");
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => { onLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }); setLocating(false); },
      () => { setLocating(false); toast.error("No pudimos obtener tu ubicación", { description: "Revisa los permisos del navegador o escribe la dirección." }); },
      { timeout: 10000 },
    );
  };

  const ipsDetalle = ipsEnCiudad.find((i) => i.id === detalle) ?? null;

  return (
    <>
      <section className="rounded-2xl border bg-card p-5 shadow-sm lg:col-span-7 md:p-6">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Paso 2 de 4</p>
        <h2 ref={headingRef} tabIndex={-1} className="mt-1 text-xl font-bold focus:outline-none">{titulo}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{descripcion}</p>

        <div className="mt-5 space-y-3">
          <p className="text-[13px] font-semibold">Te mostramos las más cercanas a</p>
          <div className="grid gap-2 sm:grid-cols-2">
            <Select value={depto} onValueChange={onDepto}>
              <SelectTrigger aria-label="Departamento"><SelectValue placeholder="Departamento" /></SelectTrigger>
              <SelectContent>{DEPARTAMENTOS.map((d) => <SelectItem key={d.nombre} value={d.nombre}>{d.nombre}</SelectItem>)}</SelectContent>
            </Select>
            <Select value={ciudad} onValueChange={onCiudad}>
              <SelectTrigger aria-label="Ciudad"><SelectValue placeholder="Ciudad" /></SelectTrigger>
              <SelectContent>
                {(DEPARTAMENTOS.find((d) => d.nombre === depto)?.ciudades ?? []).map((c) => <SelectItem key={c.nombre} value={c.nombre}>{c.nombre}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="flex-1">
              <AddressInput
                value={direccion}
                city={ciudad}
                placeholder="Tu dirección, p. ej. Cra 15 #93-40"
                onChange={onDireccion}
                onResolved={(loc, formatted) => onLocation(loc, formatted)}
              />
            </div>
            <Button type="button" variant="outline" onClick={geolocate} disabled={locating}>
              {locating ? <Loader2 className="animate-spin" /> : <LocateFixed />} Usar mi ubicación
            </Button>
          </div>
        </div>

        <div className="mt-5 border-t pt-4">
          {ipsLoading || preciosLoading ? (
            <div className="space-y-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-32 w-full" />)}</div>
          ) : ipsError ? (
            <div role="alert" className="rounded-lg bg-danger-soft p-4 text-sm text-danger-foreground">
              No pudimos cargar las IPS. <Button variant="link" className="text-danger-foreground underline" onClick={() => refetchIps()}>Reintentar</Button>
            </div>
          ) : candidatas.length === 0 ? (
            <EmptyState compact icon={Search} title={`Ninguna IPS de ${ciudad} hace estas pruebas`} description="Prueba con otra ciudad cercana." />
          ) : (
            <>
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <p className="text-[13px]" aria-live="polite">
                  <strong>{completas} {completas === 1 ? "IPS cubre" : "IPS cubren"}</strong> todo tu examen
                  {parciales > 0 && <> · {parciales} parcialmente</>}
                </p>
                <label className="flex items-center gap-2 text-[13px] text-muted-foreground">
                  Ordenar por
                  <Select value={orden} onValueChange={(v) => setOrden(v as Orden)}>
                    <SelectTrigger className="h-9 w-48"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="cercania">Cercanía</SelectItem>
                      <SelectItem value="disponibilidad">Próxima disponibilidad</SelectItem>
                      <SelectItem value="precio">Menor precio</SelectItem>
                    </SelectContent>
                  </Select>
                </label>
              </div>

              <ol className="space-y-3">
                {visibles.map(({ ips, distancia }, i) => {
                  const cob = coberturaDe(ips.id)!;
                  const disp = disponibilidad.get(ips.id);
                  const activa = ips.id === selectedIps;
                  const parcial = cob.faltan.length > 0;
                  const elegible = !!disp && !(parcial && requiereTodas);
                  return (
                    <li key={ips.id} className={cn("rounded-xl border-2 p-4 transition-colors", activa ? "border-primary bg-primary-soft/40" : "border-border")}>
                      <div className="flex items-start gap-3">
                        <span className={cn("flex size-7 shrink-0 items-center justify-center rounded-full text-sm font-bold", activa ? "bg-primary text-primary-foreground" : "bg-foreground/80 text-background")} aria-hidden>{i + 1}</span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-2">
                            <p className="font-semibold leading-snug">{ips.nombre}</p>
                            <span className="shrink-0 text-[13px] font-semibold tabular-nums">{formatDistancia(distancia)}</span>
                          </div>
                          {ips.direccion && <p className="text-[13px] text-muted-foreground">{ips.direccion}</p>}
                          {parcial ? (
                            <p className="mt-2 flex items-start gap-2 rounded-lg bg-warning-soft px-3 py-2 text-[13px] text-warning-foreground">
                              <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
                              <span>
                                Hace {cob.hechas.length} de {cob.hechas.length + cob.faltan.length} pruebas. <strong>Falta: {cob.faltan.join(", ")}.</strong>{" "}
                                {requiereTodas ? "Elige una IPS que haga todas." : `Tendrías que ${cob.faltan.length === 1 ? "hacerla" : "hacerlas"} en otra IPS.`}
                              </span>
                            </p>
                          ) : (
                            <p className="mt-1.5 inline-flex items-center gap-1 text-[13px] font-medium text-success-foreground">
                              <Check className="size-3.5" aria-hidden /> Hace {cob.hechas.length === 1 ? "la prueba" : `las ${cob.hechas.length} pruebas`}
                            </p>
                          )}
                          <p className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-[13px]">
                            {libresLoading ? (
                              <span className="text-muted-foreground">Consultando disponibilidad…</span>
                            ) : disp?.primero ? (
                              <span className="inline-flex items-center gap-1 text-muted-foreground"><CalendarClock className="size-3.5" aria-hidden /> Próxima cita: {proxima(disp.primero.fecha, disp.primero.hora)}</span>
                            ) : (
                              <span className="inline-flex items-center gap-1 font-medium text-warning-foreground"><CalendarX2 className="size-3.5" aria-hidden /> Sin horarios disponibles</span>
                            )}
                            <span>Total: <strong className="tabular-nums">{formatPesos(cob.total)}</strong></span>
                          </p>
                        </div>
                      </div>
                      <div className="mt-3 grid gap-2 sm:grid-cols-[auto_1fr]">
                        <Button variant="outline" size="sm" onClick={() => setDetalle(ips.id)}>Ver fotos y detalles</Button>
                        {elegible && (
                          <Button size="sm" variant={activa ? "default" : "outline"} onClick={() => onSelect(ips.id)} aria-pressed={activa}>
                            {activa ? <><Check /> Seleccionada</> : parcial ? `Elegir con ${cob.hechas.length} ${cob.hechas.length === 1 ? "prueba" : "pruebas"}` : "Elegir esta IPS"}
                          </Button>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ol>
              {ocultas > 0 && (
                <Button variant="ghost" className="mt-3 w-full" onClick={() => setVerSinHorario(true)}>
                  Mostrar {ocultas} IPS sin horarios esta semana
                </Button>
              )}
              {parciales > 0 && !requiereTodas && (
                <p className="mt-3 text-xs text-muted-foreground">Las IPS que hacen parte de las pruebas cobran solo las que hacen.</p>
              )}
            </>
          )}
        </div>

        <div className="mt-6 border-t pt-4">{nav}</div>
      </section>

      <div className="space-y-4 lg:col-span-5">
        <div className="lg:sticky lg:top-24 lg:space-y-4">
          <div>
            <IpsMap label={`Mapa de IPS en ${ciudad}`} center={centro} markers={markers} onSelect={onSelect} origin={userLoc} height="clamp(240px, 45vh, 420px)" />
            <p className="mt-2 text-xs text-muted-foreground">Los números coinciden con la lista{userLoc ? "; la flecha roja es tu ubicación" : ""}.</p>
          </div>
          {resumen}
        </div>
      </div>

      <Dialog open={!!ipsDetalle} onOpenChange={(o) => !o && setDetalle(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Detalle de la IPS</DialogTitle>
            <DialogDescription>Fotos, servicios y ubicación.</DialogDescription>
          </DialogHeader>
          {ipsDetalle && (
            <IpsDetailPanel
              ips={ipsDetalle}
              distancia={ipsConDistancia.find((i) => i.ips.id === ipsDetalle.id)?.distancia ?? 999}
              onConfirm={() => { onSelect(ipsDetalle.id); setDetalle(null); }}
              confirmLabel="Elegir esta IPS"
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
