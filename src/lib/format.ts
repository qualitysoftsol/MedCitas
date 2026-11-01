// Formatos de fecha y hora en español de Colombia.
// Las fechas de la base ('YYYY-MM-DD') se interpretan en hora local para evitar
// el desfase de un día que produce `new Date('2026-08-07')` (UTC) al oeste de Greenwich.

const MESES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];
const MESES_CORTOS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

export function parseFecha(fecha: string): Date {
  const [y, m, d] = fecha.slice(0, 10).split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

/** Hoy en formato 'YYYY-MM-DD' (hora local). */
export function hoyISO(): string {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

/** 2026-08-07 → "7 de agosto de 2026" */
export function formatFecha(fecha: string): string {
  const d = parseFecha(fecha);
  return `${d.getDate()} de ${MESES[d.getMonth()]} de ${d.getFullYear()}`;
}

/** 2026-08-01 → "Agosto de 2026" */
export function formatMes(fecha: string): string {
  const d = parseFecha(fecha);
  return `${MESES[d.getMonth()].charAt(0).toUpperCase()}${MESES[d.getMonth()].slice(1)} de ${d.getFullYear()}`;
}

/** 2026-08-07 → "vie, 7 ago 2026" */
export function formatFechaCorta(fecha: string): string {
  const d = parseFecha(fecha);
  return `${DIAS[d.getDay()].slice(0, 3)}, ${d.getDate()} ${MESES_CORTOS[d.getMonth()]} ${d.getFullYear()}`;
}

/** 2026-08-07 → "viernes 7 de agosto" */
export function formatFechaLarga(fecha: string): string {
  const d = parseFecha(fecha);
  return `${DIAS[d.getDay()]} ${d.getDate()} de ${MESES[d.getMonth()]}`;
}

/** Partes para un "calendario" visual: { dia: "7", mes: "AGO", semana: "vie" } */
export function fechaPartes(fecha: string) {
  const d = parseFecha(fecha);
  return {
    dia: String(d.getDate()),
    mes: MESES_CORTOS[d.getMonth()].toUpperCase(),
    semana: DIAS[d.getDay()].slice(0, 3),
  };
}

/** 08:00:00 → "8:00 a. m." · 14:30 → "2:30 p. m." */
export function formatHora(hora: string): string {
  const [hStr, mStr = "00"] = hora.split(":");
  const h = Number(hStr);
  if (Number.isNaN(h)) return hora;
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${mStr.padStart(2, "0")} ${h < 12 ? "a. m." : "p. m."}`;
}

/** Diferencia en días entre hoy y la fecha (0 = hoy, 1 = mañana, -1 = ayer). */
export function diasHasta(fecha: string): number {
  const hoy = parseFecha(hoyISO());
  return Math.round((parseFecha(fecha).getTime() - hoy.getTime()) / 86_400_000);
}

/** "Hoy", "Mañana", "En 5 días", "Hace 2 días" */
export function relativoDias(fecha: string): string {
  const n = diasHasta(fecha);
  if (n === 0) return "Hoy";
  if (n === 1) return "Mañana";
  if (n === -1) return "Ayer";
  return n > 0 ? `En ${n} días` : `Hace ${-n} días`;
}

/** Marca de tiempo relativa para notificaciones: "hace 5 min", "ayer, 3:10 p. m." */
export function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  const diffMin = Math.round((Date.now() - d.getTime()) / 60_000);
  const hora = formatHora(`${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`);
  if (diffMin < 1) return "Justo ahora";
  if (diffMin < 60) return `Hace ${diffMin} min`;
  if (diffMin < 60 * 12) return `Hace ${Math.round(diffMin / 60)} h`;
  const dias = Math.floor((new Date().setHours(0, 0, 0, 0) - new Date(d).setHours(0, 0, 0, 0)) / 86_400_000);
  if (dias === 0) return `Hoy, ${hora}`;
  if (dias === 1) return `Ayer, ${hora}`;
  return `${d.getDate()} ${MESES_CORTOS[d.getMonth()]}, ${hora}`;
}

/** "María Carreño" → "María" */
export function primerNombre(nombre: string | null | undefined): string {
  return (nombre ?? "").trim().split(/\s+/)[0] ?? "";
}

/** "María Carreño" → "MC" */
export function iniciales(nombre: string | null | undefined): string {
  const partes = (nombre ?? "").trim().split(/\s+/).filter(Boolean);
  return ((partes[0]?.[0] ?? "") + (partes[1]?.[0] ?? "")).toUpperCase() || "?";
}

/** Capitaliza la primera letra: "ingreso" → "Ingreso" */
export function capitalizar(s: string | null | undefined): string {
  if (!s) return "";
  return s.charAt(0).toUpperCase() + s.slice(1);
}

const PESOS = new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });
const MILES = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 });

/** 85000 → "$ 85.000" */
export function formatPesos(valor: number): string {
  return PESOS.format(valor);
}

/** Valor de una cita, o "—" si no tiene (las agendadas antes de existir los precios). */
export function formatValor(valor: number | null | undefined): string {
  return valor != null ? formatPesos(valor) : "—";
}

/** 85000 → "85.000" (para mostrar dentro de un campo de precio) */
export function formatMiles(valor: number): string {
  return MILES.format(valor);
}
