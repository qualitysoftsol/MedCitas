import type { Slot } from "@/lib/database.types";

// Reparto de los cupos libres de una IPS entre los empleados de un lote.

export interface ParamsReparto {
  /** Primer día 'YYYY-MM-DD'. */
  desde: string;
  /** Primer turno de ese día 'HH:MM'. Los días siguientes empiezan a primera hora. */
  primerTurno: string;
  /** Máximo de empleados por día. */
  maxDia: number;
}

const hhmm = (hora: string) => hora.slice(0, 5);
const orden = (a: Pick<Slot, "fecha" | "hora">, b: Pick<Slot, "fecha" | "hora">) => a.fecha.localeCompare(b.fecha) || a.hora.localeCompare(b.hora);

/**
 * Asigna a cada empleado (en el orden dado) el siguiente cupo libre desde el
 * día y turno elegidos, sin pasar del máximo por día. `manual` son los cupos
 * que el usuario movió a mano: se respetan y cuentan en el máximo de su día.
 * Devuelve el cupo de cada empleado, o null si no alcanzaron.
 */
export function repartir(claves: string[], libres: Slot[], p: ParamsReparto, manual: Record<string, string>): Map<string, Slot | null> {
  const resultado = new Map<string, Slot | null>();
  const porId = new Map(libres.map((s) => [s.id, s]));
  const usados = new Set<string>();
  const porDia = new Map<string, number>();
  const sumar = (fecha: string) => porDia.set(fecha, (porDia.get(fecha) ?? 0) + 1);

  claves.forEach((k) => {
    const s = manual[k] ? porId.get(manual[k]) : undefined;
    if (s) { resultado.set(k, s); usados.add(s.id); sumar(s.fecha); }
  });

  const candidatos = libres
    .filter((s) => !usados.has(s.id) && (s.fecha > p.desde || (s.fecha === p.desde && hhmm(s.hora) >= p.primerTurno)))
    .sort(orden);
  let i = 0;
  claves.forEach((k) => {
    if (resultado.has(k)) return;
    while (i < candidatos.length && (porDia.get(candidatos[i].fecha) ?? 0) >= p.maxDia) i++;
    const s = candidatos[i];
    if (!s) return resultado.set(k, null);
    resultado.set(k, s);
    sumar(s.fecha);
    i++;
  });
  return resultado;
}

/** Minutos más frecuentes entre turnos seguidos del mismo día ("recibe un empleado cada N min"). */
export function intervaloHabitual(slots: Pick<Slot, "fecha" | "hora">[]): number | null {
  const porDia = new Map<string, number[]>();
  slots.forEach((s) => {
    const [h, m] = s.hora.split(":").map(Number);
    porDia.set(s.fecha, [...(porDia.get(s.fecha) ?? []), h * 60 + m]);
  });
  const conteo = new Map<number, number>();
  porDia.forEach((mins) => {
    const unicos = Array.from(new Set(mins)).sort((a, b) => a - b);
    for (let i = 1; i < unicos.length; i++) {
      const d = unicos[i] - unicos[i - 1];
      conteo.set(d, (conteo.get(d) ?? 0) + 1);
    }
  });
  let mejor: number | null = null;
  conteo.forEach((n, d) => { if (mejor == null || n > (conteo.get(mejor) ?? 0)) mejor = d; });
  return mejor;
}
