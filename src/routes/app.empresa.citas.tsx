import { createFileRoute } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth-context";
import { useAppointments, useCancelAppointment } from "@/lib/hooks/useAppointments";
import { useValoresCitas } from "@/lib/hooks/usePrecios";
import { formatValor } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";

export const Route = createFileRoute("/app/empresa/citas")({
  component: EmpresaCitas,
});

function EmpresaCitas() {
  const { profile } = useAuth();
  const { data: mine = [] } = useAppointments(profile?.id, profile?.role);
  const { data: valores } = useValoresCitas(!!profile);
  const cancelAppointment = useCancelAppointment();

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
                    <TableHead className="text-right">Valor</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead className="text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {mine.map((a) => (
                    <TableRow key={a.id}>
                      <TableCell>{a.fecha}</TableCell>
                      <TableCell>{a.hora}</TableCell>
                      <TableCell>{a.empleado_nombre}</TableCell>
                      <TableCell className="capitalize">{a.tipo_examen}</TableCell>
                      <TableCell>{a.ips?.nombre ?? "—"}</TableCell>
                      <TableCell>{a.ciudad}</TableCell>
                      <TableCell className="whitespace-nowrap text-right tabular-nums">{formatValor(valores?.get(a.id))}</TableCell>
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
    </div>
  );
}
