import { useMemo, useState } from "react";
import { Building2, CalendarX2, ChevronLeft, ChevronRight } from "lucide-react";
import type { Slot } from "@/lib/database.types";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/app/EmptyState";
import { capitalizar, fechaPartes, formatHora, hoyISO, parseFecha } from "@/lib/format";
import { cn } from "@/lib/utils";

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** Lunes de la semana de `fecha`. */
function lunesDe(fecha: string) {
  const d = parseFecha(fecha);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return iso(d);
}

function sumarDias(fecha: string, n: number) {
  const d = parseFecha(fecha);
  d.setDate(d.getDate() + n);
  return iso(d);
}

/** "16 – 22 de noviembre de 2026" · "30 de noviembre – 6 de diciembre de 2026" */
function rango(desde: string, hasta: string) {
  const a = parseFecha(desde);
  const b = parseFecha(hasta);
  if (a.getMonth() === b.getMonth()) return `${a.getDate()} – ${b.getDate()} de ${MESES[b.getMonth()]} de ${b.getFullYear()}`;
  return `${a.getDate()} de ${MESES[a.getMonth()]} – ${b.getDate()} de ${MESES[b.getMonth()]} de ${b.getFullYear()}`;
}

/**
 * Semana con los cupos de cada día y las horas libres del día elegido.
 * Varios cupos a la misma hora se muestran como una sola hora; si el cupo que
 * se envía ya se tomó, crear_cita_interna usa otro libre de esa hora (022).
 */
export function SemanaHorarios({
  slots, loading, selectedSlot, onSelect, onOtraIps,
}: {
  /** Cupos libres y futuros de la IPS. */
  slots: Slot[];
  loading: boolean;
  selectedSlot: string | null;
  onSelect: (id: string) => void;
  onOtraIps: () => void;
}) {
  const hoy = hoyISO();
  const porFecha = useMemo(() => {
    const map = new Map<string, Slot[]>();
    [...slots].sort((a, b) => a.fecha.localeCompare(b.fecha) || a.hora.localeCompare(b.hora)).forEach((s) => {
      map.set(s.fecha, [...(map.get(s.fecha) ?? []), s]);
    });
    return map;
  }, [slots]);

  const seleccionado = slots.find((s) => s.id === selectedSlot) ?? null;
  const primera = seleccionado?.fecha ?? [...porFecha.keys()][0] ?? hoy;
  // Hasta que el usuario cambie de semana, se muestra la del cupo elegido o la
  // del primer cupo libre (que puede llegar después del primer render).
  const [semanaElegida, setSemanaElegida] = useState<string | null>(null);
  const lunes = semanaElegida ?? lunesDe(primera);
  const setLunes = setSemanaElegida;
  const [fecha, setFecha] = useState<string | null>(seleccionado?.fecha ?? null);

  const dias = Array.from({ length: 7 }, (_, i) => sumarDias(lunes, i));
  const fechaActiva = fecha && dias.includes(fecha) && porFecha.has(fecha) ? fecha : dias.find((d) => porFecha.has(d)) ?? null;
  const delDia = fechaActiva ? porFecha.get(fechaActiva) ?? [] : [];
  const horas = Array.from(new Map(delDia.map((s) => [s.hora.slice(0, 5), s])).values());
  const manana = horas.filter((s) => Number(s.hora.slice(0, 2)) < 12);
  const tarde = horas.filter((s) => Number(s.hora.slice(0, 2)) >= 12);
  const ultimaFecha = [...porFecha.keys()].pop();

  if (loading) {
    return <div className="space-y-4"><div className="grid grid-cols-7 gap-2">{dias.map((d) => <Skeleton key={d} className="h-20" />)}</div><Skeleton className="h-24 w-full" /></div>;
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

  const grupo = (titulo: string, lista: Slot[]) =>
    lista.length > 0 && (
      <div>
        <h3 className="mb-2 text-[13px] font-semibold">{titulo}</h3>
        <div role="radiogroup" aria-label={`Horas de la ${titulo.toLowerCase()}`} className="flex flex-wrap gap-2">
          {lista.map((s) => {
            const activa = seleccionado?.fecha === s.fecha && seleccionado.hora.slice(0, 5) === s.hora.slice(0, 5);
            return (
              <button
                key={s.id}
                type="button"
                role="radio"
                aria-checked={activa}
                onClick={() => onSelect(s.id)}
                className={cn(
                  "min-w-24 rounded-lg border-2 px-4 py-2 text-sm font-medium tabular-nums transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  activa ? "border-primary bg-primary-soft" : "border-border hover:border-primary/40",
                )}
              >
                {formatHora(s.hora)}
              </button>
            );
          })}
        </div>
      </div>
    );

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold">{rango(dias[0], dias[6])}</p>
        <div className="flex gap-1">
          <Button size="icon" variant="outline" onClick={() => setLunes(sumarDias(lunes, -7))} disabled={lunes <= lunesDe(hoy)} aria-label="Semana anterior"><ChevronLeft /></Button>
          <Button size="icon" variant="outline" onClick={() => setLunes(sumarDias(lunes, 7))} disabled={!ultimaFecha || dias[6] >= ultimaFecha} aria-label="Semana siguiente"><ChevronRight /></Button>
        </div>
      </div>

      <div role="group" aria-label="Días de la semana" className="grid grid-cols-7 gap-1.5 sm:gap-2">
        {dias.map((d) => {
          const n = porFecha.get(d)?.length ?? 0;
          const activa = d === fechaActiva;
          const p = fechaPartes(d);
          return (
            <button
              key={d}
              type="button"
              disabled={n === 0}
              aria-pressed={activa}
              aria-label={`${capitalizar(p.semana)} ${p.dia}: ${n === 0 ? "sin cupos" : `${n} ${n === 1 ? "cupo" : "cupos"}`}`}
              onClick={() => setFecha(d)}
              className={cn(
                "flex flex-col items-center rounded-xl border-2 py-2.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                activa ? "border-primary bg-primary text-primary-foreground" : n > 0 ? "border-border bg-card hover:border-primary/40" : "border-transparent bg-muted text-muted-foreground",
              )}
            >
              <span className="text-xs">{capitalizar(p.semana)}</span>
              <span className="text-lg font-bold leading-tight">{p.dia}</span>
              <span className={cn("text-[11px]", activa ? "opacity-90" : "text-muted-foreground")}>
                {n > 0 ? `${n} ${n === 1 ? "cupo" : "cupos"}` : d === hoy ? "Hoy" : d < hoy ? "—" : "Sin cupos"}
              </span>
            </button>
          );
        })}
      </div>

      {fechaActiva ? (
        <div className="space-y-4">
          {grupo("Mañana", manana)}
          {grupo("Tarde", tarde)}
        </div>
      ) : (
        <p className="rounded-lg bg-muted px-3 py-2 text-[13px] text-muted-foreground">No hay cupos esta semana. Pasa a la semana siguiente.</p>
      )}
    </div>
  );
}
