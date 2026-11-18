import type { Servicio, TipoEvaluacion } from "@/lib/database.types";
import { parseFecha } from "@/lib/format";

// Datos que pide cada tipo de evaluación (appointments.datos_evaluacion).
// Las mismas reglas las aplica validar_datos_evaluacion en la base (migración 020):
// aquí solo sirven para avisar antes de enviar.

export type DatosEvaluacion = {
  empresa?: string;
  cargo?: string;
  motivo?: string;
  fecha_retiro?: string;
  inicio?: string;
  fin?: string;
  regreso?: string;
  referencia_id?: string;
  externa?: { fecha?: string; tipo?: string };
  que_controlar?: string;
};

export const MOTIVOS_PERIODICA = [
  { value: "programada", label: "Control programado" },
  { value: "cambio_ocupacion", label: "Cambio de ocupación" },
] as const;

export const MOTIVOS_RETORNO = [
  { value: "licencia_no_remunerada", label: "Licencia no remunerada" },
  { value: "suspension_contrato", label: "Suspensión del contrato" },
  { value: "comision_estudios", label: "Comisión de estudios" },
  { value: "otro", label: "Otro" },
] as const;

export const DIAS_MIN_INCAPACIDAD = 30;
export const DIAS_MIN_AUSENCIA = 90;

/** Días calendario de `desde` a `hasta` ('YYYY-MM-DD'). null si falta alguna. */
export function diasEntre(desde?: string, hasta?: string): number | null {
  if (!desde || !hasta) return null;
  return Math.round((parseFecha(hasta).getTime() - parseFecha(desde).getTime()) / 86_400_000);
}

/** Días de incapacidad: cuentan el día de inicio y el de fin. */
export const diasIncapacidad = (d: DatosEvaluacion) => {
  const n = diasEntre(d.inicio, d.fin);
  return n == null ? null : n + 1;
};

/** Días de ausencia: del inicio al día del regreso. */
export const diasAusencia = (d: DatosEvaluacion) => diasEntre(d.inicio, d.regreso);

const vacio = (v?: string) => !v || !v.trim();

export type ErroresDatos = Partial<Record<keyof DatosEvaluacion | "externa_fecha" | "externa_tipo" | "general", string>>;

/** Errores por campo; `general` explica por qué la evaluación no aplica. Vacío = todo bien. */
export function erroresDatos(codigo: string, d: DatosEvaluacion): ErroresDatos {
  const e: ErroresDatos = {};
  if ((codigo === "PRE_INGRESO" || codigo === "EGRESO") && vacio(d.empresa)) e.empresa = "Indica la empresa.";
  if ((codigo === "PRE_INGRESO" || codigo === "PERIODICA") && vacio(d.cargo)) e.cargo = "Indica el cargo.";
  if (codigo === "PERIODICA" && !MOTIVOS_PERIODICA.some((m) => m.value === d.motivo)) e.motivo = "Elige el motivo.";
  if (codigo === "EGRESO" && !d.fecha_retiro) e.fecha_retiro = "Indica la fecha de retiro.";

  if (codigo === "POST_INCAPACIDAD") {
    if (!d.inicio) e.inicio = "Indica el inicio.";
    if (!d.fin) e.fin = "Indica el fin.";
    const n = diasIncapacidad(d);
    if (n != null && n < 1) e.fin = "El fin no puede ser antes del inicio.";
    else if (n != null && n < DIAS_MIN_INCAPACIDAD) {
      e.general = `La incapacidad fue de ${n} ${n === 1 ? "día" : "días"}. Esta evaluación aplica desde ${DIAS_MIN_INCAPACIDAD} días calendario, así que no la necesitas.`;
    }
  }

  if (codigo === "RETORNO") {
    if (!MOTIVOS_RETORNO.some((m) => m.value === d.motivo)) e.motivo = "Elige el motivo.";
    if (!d.inicio) e.inicio = "Indica el inicio.";
    if (!d.regreso) e.regreso = "Indica la fecha de regreso.";
    const n = diasAusencia(d);
    if (n != null && n < 0) e.regreso = "El regreso no puede ser antes del inicio.";
    else if (n != null && n < DIAS_MIN_AUSENCIA) {
      e.general = `La ausencia fue de ${n} ${n === 1 ? "día" : "días"}. Esta evaluación aplica desde ${DIAS_MIN_AUSENCIA} días calendario, así que no la necesitas.`;
    }
  }

  if (codigo === "SEGUIMIENTO") {
    if (!d.referencia_id && !d.externa) e.referencia_id = "Elige la evaluación de referencia.";
    if (d.externa && !d.externa.fecha) e.externa_fecha = "Indica la fecha.";
    if (d.externa && vacio(d.externa.tipo)) e.externa_tipo = "Indica el tipo de evaluación.";
    if (vacio(d.que_controlar)) e.que_controlar = "Indica qué se va a controlar.";
  }
  return e;
}

/** Solo los campos que usa el tipo, sin espacios sobrantes: lo que se envía a la base. */
export function limpiarDatos(codigo: string, d: DatosEvaluacion): DatosEvaluacion {
  const t = (v?: string) => v?.trim() || undefined;
  switch (codigo) {
    case "PRE_INGRESO": return { empresa: t(d.empresa), cargo: t(d.cargo) };
    case "PERIODICA": return { motivo: d.motivo, cargo: t(d.cargo) };
    case "EGRESO": return { fecha_retiro: d.fecha_retiro, empresa: t(d.empresa) };
    case "POST_INCAPACIDAD": return { inicio: d.inicio, fin: d.fin };
    case "RETORNO": return { motivo: d.motivo, inicio: d.inicio, regreso: d.regreso };
    case "SEGUIMIENTO":
      return d.referencia_id
        ? { referencia_id: d.referencia_id, que_controlar: t(d.que_controlar) }
        : { externa: { fecha: d.externa?.fecha, tipo: t(d.externa?.tipo) }, que_controlar: t(d.que_controlar) };
    default: return {};
  }
}

export interface Indicacion { texto: string; origen?: string }

/**
 * "Antes de tu cita": las indicaciones de cada prueba (con su nombre, para saber
 * de dónde sale) y luego las del tipo de evaluación. Se configuran en Catálogos.
 */
export function indicacionesDe(pruebas: Pick<Servicio, "nombre" | "indicaciones">[], tipo: Pick<TipoEvaluacion, "indicaciones"> | null): Indicacion[] {
  const lista: Indicacion[] = pruebas
    .filter((p) => p.indicaciones?.trim())
    .map((p) => ({ texto: p.indicaciones!.trim(), origen: p.nombre }));
  if (tipo?.indicaciones?.trim()) lista.push({ texto: tipo.indicaciones.trim() });
  return lista;
}

/** Duración en minutos → "45 min", "1 h", "1 h 40 min". */
export function formatDuracion(min: number): string {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}
