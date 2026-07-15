import { createFileRoute } from "@tanstack/react-router";
import { useStore } from "@/lib/store";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";

export const Route = createFileRoute("/app/ips/citas")({
  component: IpsCitas,
});

function IpsCitas() {
  const { currentUser, appointments, users, cancelAppointment } = useStore();
  const mine = appointments.filter((a) => a.ipsId === currentUser!.id);
  const nombreEmpresa = (id: string) => users.find((u) => u.id === id)?.profile.nombre ?? "—";

  return (
    <Card>
      <CardHeader><CardTitle>Citas agendadas por empresas</CardTitle></CardHeader>
      <CardContent>
        {mine.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aún no hay citas agendadas.</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Hora</TableHead>
                  <TableHead>Empresa</TableHead>
                  <TableHead>Empleado</TableHead>
                  <TableHead>Cédula</TableHead>
                  <TableHead>Examen</TableHead>
                  <TableHead>Depto médico</TableHead>
                  <TableHead>Estado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {mine.sort((a, b) => (a.fecha + a.hora).localeCompare(b.fecha + b.hora)).map((a) => (
                  <TableRow key={a.id}>
                    <TableCell>{a.fecha}</TableCell>
                    <TableCell>{a.hora}</TableCell>
                    <TableCell>{nombreEmpresa(a.empresaId)}</TableCell>
                    <TableCell>{a.empleadoNombre}</TableCell>
                    <TableCell>{a.empleadoCedula}</TableCell>
                    <TableCell className="capitalize">{a.tipoExamen}</TableCell>
                    <TableCell>{a.departamentoMedico}</TableCell>
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
  );
}
