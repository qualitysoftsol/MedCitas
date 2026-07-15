import { createFileRoute } from "@tanstack/react-router";
import { useStore } from "@/lib/store";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";

export const Route = createFileRoute("/app/empresa/citas")({
  component: EmpresaCitas,
});

function EmpresaCitas() {
  const { currentUser, appointments, users, cancelAppointment } = useStore();
  const mine = appointments.filter((a) => a.empresaId === currentUser!.id);
  const nombreIps = (id: string) => users.find((u) => u.id === id)?.profile.nombre ?? "—";

  const stats = {
    total: mine.length,
    agendadas: mine.filter((a) => a.estado === "agendada").length,
    atendidas: mine.filter((a) => a.estado === "atendida").length,
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Total", value: stats.total },
          { label: "Agendadas", value: stats.agendadas },
          { label: "Atendidas", value: stats.atendidas },
        ].map((s) => (
          <Card key={s.label}>
            <CardContent className="pt-6">
              <div className="text-3xl font-bold text-primary">{s.value}</div>
              <div className="text-sm text-muted-foreground">{s.label}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader><CardTitle>Citas de mis empleados</CardTitle></CardHeader>
        <CardContent>
          {mine.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aún no has solicitado citas.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Hora</TableHead>
                    <TableHead>Empleado</TableHead>
                    <TableHead>Examen</TableHead>
                    <TableHead>IPS</TableHead>
                    <TableHead>Ciudad</TableHead>
                    <TableHead>Estado</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {mine.map((a) => (
                    <TableRow key={a.id}>
                      <TableCell>{a.fecha}</TableCell>
                      <TableCell>{a.hora}</TableCell>
                      <TableCell>{a.empleadoNombre}</TableCell>
                      <TableCell className="capitalize">{a.tipoExamen}</TableCell>
                      <TableCell>{nombreIps(a.ipsId)}</TableCell>
                      <TableCell>{a.ciudad}</TableCell>
                      <TableCell>
                        <Badge variant={a.estado === "atendida" ? "default" : "secondary"} className="capitalize">
                          {a.estado}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
