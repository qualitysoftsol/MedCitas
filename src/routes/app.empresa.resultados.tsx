import { createFileRoute } from "@tanstack/react-router";
import { useStore } from "@/lib/store";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/app/empresa/resultados")({
  component: EmpresaResultados,
});

function EmpresaResultados() {
  const { currentUser, resultados, users } = useStore();
  const mine = resultados.filter((r) => r.empresaId === currentUser!.id);
  const ipsNombre = (id: string) => users.find((u) => u.id === id)?.profile.nombre ?? "—";

  return (
    <Card>
      <CardHeader><CardTitle>Resultados de exámenes</CardTitle></CardHeader>
      <CardContent>
        {mine.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aún no hay resultados cargados.</p>
        ) : (
          <ul className="divide-y">
            {mine.map((r) => (
              <li key={r.id} className="py-3">
                <div className="flex items-center justify-between">
                  <div className="font-medium">{r.empleadoNombre} · {r.empleadoCedula}</div>
                  <Badge variant={r.apto === "apto" ? "default" : r.apto === "no_apto" ? "destructive" : "secondary"} className="capitalize">
                    {r.apto.replace("_", " ")}
                  </Badge>
                </div>
                <div className="text-xs text-muted-foreground">{r.fecha} · {ipsNombre(r.ipsId)}</div>
                <div className="text-sm mt-1">{r.diagnostico}</div>
                {r.observaciones && <div className="text-xs text-muted-foreground mt-1">Obs: {r.observaciones}</div>}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
