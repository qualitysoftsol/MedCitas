import { useMemo } from "react";
import { pruebasDeEnfasis, useEnfasis, useServicios } from "@/lib/hooks/useCatalogos";

/**
 * Énfasis y pruebas de la evaluación que se está solicitando.
 * Sin `elegidos`, usa el énfasis excluyente ("Ninguno especial"): así agendan
 * los flujos que todavía no piden énfasis.
 */
export function useEvaluacion(elegidos?: string[]) {
  const { data: enfasis = [], isLoading: enfasisLoading } = useEnfasis();
  const { data: servicios = [], isLoading: serviciosLoading } = useServicios();

  const porDefecto = enfasis.find((e) => e.exclusivo)?.id;
  const enfasisIds = useMemo(() => elegidos ?? (porDefecto ? [porDefecto] : []), [elegidos, porDefecto]);
  const pruebas = useMemo(() => pruebasDeEnfasis(enfasisIds, enfasis, servicios), [enfasisIds, enfasis, servicios]);

  return { enfasis, enfasisIds, pruebas, loading: enfasisLoading || serviciosLoading };
}
