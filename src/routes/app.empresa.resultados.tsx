import { createFileRoute } from "@tanstack/react-router";
import { ResultadosView } from "@/components/app/ResultadosView";

export const Route = createFileRoute("/app/empresa/resultados")({
  component: EmpresaResultados,
});

function EmpresaResultados() {
  return (
    <ResultadosView
      title="Resultados de exámenes"
      description="Consulta y descarga los resultados de los exámenes de tus empleados."
      citasHref="/app/empresa/citas"
      mostrarEmpleado
    />
  );
}
