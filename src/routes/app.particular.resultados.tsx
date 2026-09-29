import { createFileRoute } from "@tanstack/react-router";
import { ResultadosView } from "@/components/app/ResultadosView";

export const Route = createFileRoute("/app/particular/resultados")({
  component: ParticularResultados,
});

function ParticularResultados() {
  return (
    <ResultadosView
      title="Mis resultados"
      description="Consulta y descarga los resultados de tus exámenes médicos."
      citasHref="/app/particular/citas"
    />
  );
}
