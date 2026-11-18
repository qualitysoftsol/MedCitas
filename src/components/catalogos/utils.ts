import { esErrorNombreRepetido } from "@/lib/hooks/useCatalogos";

/** Mensaje para el usuario a partir de un error de Supabase. */
export function mensajeError(err: unknown, queRepetido: string, porDefecto: string): string {
  if (esErrorNombreRepetido(err)) return `Ya existe ${queRepetido} con ese nombre.`;
  if ((err as Error)?.message?.includes("Failed to fetch")) return "Sin conexión. Revisa tu internet e inténtalo de nuevo.";
  return porDefecto;
}

/** "" → null; recorta espacios. */
export const textoONull = (v: string) => v.trim() || null;
