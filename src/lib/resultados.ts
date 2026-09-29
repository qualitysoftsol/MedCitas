import type { AppointmentWithNames } from "@/lib/hooks/useAppointments";
import type { ResultadoConDetalle } from "@/lib/hooks/useResultados";
import type { ResultadoEstado } from "@/components/app/StatusBadge";
import { diasHasta } from "@/lib/format";

/** Elemento de la lista "Mis resultados": un resultado cargado o una cita pendiente de resultado. */
export interface ResultadoItem {
  id: string;
  estado: ResultadoEstado;
  fecha: string;
  tipoExamen: string;
  servicio: string;
  ipsNombre: string;
  ciudad: string;
  empleadoNombre: string;
  empleadoCedula: string;
  resultado: ResultadoConDetalle | null;
}

/**
 * Une los resultados cargados por la IPS con las citas "en procesamiento".
 * Regla acordada: una cita está en procesamiento si su fecha ya pasó,
 * sigue en estado `agendada` y todavía no tiene resultado cargado.
 * (Al cargar un resultado, la IPS marca la cita como `atendida`.)
 */
export function construirResultados(
  resultados: ResultadoConDetalle[],
  citas: AppointmentWithNames[],
): ResultadoItem[] {
  const conResultado = new Set(resultados.map((r) => r.appointment_id));

  const disponibles: ResultadoItem[] = resultados.map((r) => ({
    id: r.id,
    estado: "disponible",
    fecha: r.fecha,
    tipoExamen: r.appointment?.tipo_examen ?? "",
    servicio: r.appointment?.servicio ?? "Otros",
    ipsNombre: r.ips?.nombre ?? "—",
    ciudad: r.appointment?.ciudad ?? "",
    empleadoNombre: r.empleado_nombre,
    empleadoCedula: r.empleado_cedula,
    resultado: r,
  }));

  const enProceso: ResultadoItem[] = citas
    .filter((a) => a.estado === "agendada" && diasHasta(a.fecha) < 0 && !conResultado.has(a.id))
    .map((a) => ({
      id: `cita-${a.id}`,
      estado: "procesamiento",
      fecha: a.fecha,
      tipoExamen: a.tipo_examen,
      servicio: a.servicio || "Otros",
      ipsNombre: a.ips?.nombre ?? "—",
      ciudad: a.ciudad,
      empleadoNombre: a.empleado_nombre,
      empleadoCedula: a.empleado_cedula,
      resultado: null,
    }));

  return [...enProceso, ...disponibles].sort((x, y) => y.fecha.localeCompare(x.fecha));
}

/** Próxima cita agendada (hoy o después), la más cercana primero. */
export function proximaCita(citas: AppointmentWithNames[]): AppointmentWithNames | null {
  return (
    citas
      .filter((a) => a.estado === "agendada" && diasHasta(a.fecha) >= 0)
      .sort((x, y) => `${x.fecha}T${x.hora}`.localeCompare(`${y.fecha}T${y.hora}`))[0] ?? null
  );
}
