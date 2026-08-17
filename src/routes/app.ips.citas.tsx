import { createFileRoute } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth-context";
import { useAppointments, useCancelAppointment } from "@/lib/hooks/useAppointments";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";

export const Route = createFileRoute("/app/ips/citas")({
  component: IpsCitas,
});

function IpsCitas() {
  const { profile } = useAuth();
  const { data: mine = [] } = useAppointments(profile?.id, profile?.role);
  const cancelAppointment = useCancelAppointment();

  return (
    <Card>
      <CardHeader><CardTitle>Citas agendadas</CardTitle></CardHeader>
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
                  <TableHead>Servicio</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {mine.sort((a, b) => (a.fecha + a.hora).localeCompare(b.fecha + b.hora)).map((a) => (
                  <TableRow key={a.id}>
                    <TableCell>{a.fecha}</TableCell>
                    <TableCell>{a.hora}</TableCell>
                    <TableCell>{a.solicitante?.nombre ?? "—"}</TableCell>
                    <TableCell>{a.empleado_nombre}</TableCell>
                    <TableCell>{a.empleado_cedula}</TableCell>
                    <TableCell className="capitalize">{a.tipo_examen}</TableCell>
                    <TableCell>{a.servicio}</TableCell>
                    <TableCell>
                      <Badge variant={a.estado === "atendida" ? "default" : "secondary"} className="capitalize">
                        {a.estado}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      {a.estado === "agendada" && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            cancelAppointment.mutate({ id: a.id, slotId: a.slot_id }, {
                              onSuccess: () => toast.success("Cita cancelada"),
                              onError: (err: any) => toast.error(err.message),
                            });
                          }}
                        >
                          Cancelar
                        </Button>
                      )}
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
