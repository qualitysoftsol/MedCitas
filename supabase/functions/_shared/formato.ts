// Formatos compartidos por las Edge Functions. Siguen las mismas reglas que
// src/lib/datosEvaluacion.ts, para que el correo diga lo mismo que la app.

/** Duración en minutos → "45 min", "1 h", "1 h 40 min". */
export function formatDuracion(min: number): string {
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60)
  const m = min % 60
  return m ? `${h} h ${m} min` : `${h} h`
}
