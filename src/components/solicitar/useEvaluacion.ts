import { useMemo } from "react";
import { pruebasDeEnfasis, useEnfasis, useServicios } from "@/lib/hooks/useCatalogos";

/** Catálogo de énfasis y pruebas de la evaluación con los énfasis `elegidos`. */
export function useEvaluacion(elegidos: string[]) {
  const { data: enfasis = [], isLoading: enfasisLoading } = useEnfasis();
  const { data: servicios = [], isLoading: serviciosLoading } = useServicios();
  const pruebas = useMemo(() => pruebasDeEnfasis(elegidos, enfasis, servicios), [elegidos, enfasis, servicios]);
  return { enfasis, pruebas, loading: enfasisLoading || serviciosLoading };
}
