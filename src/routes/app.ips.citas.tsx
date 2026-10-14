import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { ClipboardList } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useAppointments, useCancelAppointment, useSolicitantes } from "@/lib/hooks/useAppointments";
import { useValoresCitas } from "@/lib/hooks/usePrecios";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/app/PageHeader";
import { EmptyState } from "@/components/app/EmptyState";
import { AppointmentStatusBadge } from "@/components/app/StatusBadge";
import { SolicitanteTag } from "@/components/app/SolicitanteTag";
import { capitalizar, formatFechaCorta, formatHora, formatValor } from "@/lib/format";
import { toast } from "sonner";

export const Route = createFileRoute("/app/ips/citas")({
  component: IpsCitas,
});

const TODOS = "__todos__";
const PARTICULARES = "__particulares__";

function IpsCitas() {
  const { profile } = useAuth();
  const { data: mine = [] } = useAppointments(profile?.id, profile?.role);
  const { data: solicitantes, isLoading: solLoading } = useSolicitantes(!!profile);
  // Para la IPS es su precio base (sin la comisión de la plataforma).
  const { data: valores } = useValoresCitas(!!profile);
  const cancelAppointment = useCancelAppointment();
  const [filtro, setFiltro] = useState(TODOS);

  // Empresas con citas en esta IPS, para el filtro.
  const empresas = useMemo(
    () => [...(solicitantes?.values() ?? [])].filter((s) => s.role === "empresa").sort((a, b) => a.nombre.localeCompare(b.nombre)),
    [solicitantes],
  );

  const visibles = mine
    .filter((a) => {
      if (filtro === TODOS) return true;
      const s = solicitantes?.get(a.solicitante_id);
      return filtro === PARTICULARES ? s?.role === "particular" : a.solicitante_id === filtro;
    })
    .sort((a, b) => (a.fecha + a.hora).localeCompare(b.fecha + b.hora));

  return (
    <div className="space-y-6">
      <PageHeader
        icon={ClipboardList}
        title="Citas agendadas"
        description="Pacientes agendados en tu IPS y la empresa que solicitó cada cita."
        actions={
          <div className="w-64">
            <label htmlFor="filtro-solicitante" className="sr-only">Filtrar por solicitante</label>
            <Select value={filtro} onValueChange={setFiltro}>
              <SelectTrigger id="filtro-solicitante"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={TODOS}>Todos los solicitantes</SelectItem>
                <SelectItem value={PARTICULARES}>Solo particulares</SelectItem>
                {empresas.map((e) => <SelectItem key={e.id} value={e.id}>{e.nombre}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        }
      />
      <Card>
        <CardContent className="p-0 md:p-0">
          {visibles.length === 0 ? (
            <EmptyState icon={ClipboardList} title={mine.length === 0 ? "Aún no hay citas agendadas" : "No hay citas para este solicitante"} />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-surface hover:bg-surface">
                    <TableHead className="pl-5">Fecha</TableHead>
                    <TableHead>Hora</TableHead>
                    <TableHead>Solicitante</TableHead>
                    <TableHead>Empleado / paciente</TableHead>
                    <TableHead>Cédula</TableHead>
                    <TableHead>Examen</TableHead>
                    <TableHead>Servicio</TableHead>
                    <TableHead className="text-right">Valor</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead className="pr-5 text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visibles.map((a) => (
                    <TableRow key={a.id}>
                      <TableCell className="whitespace-nowrap pl-5">{formatFechaCorta(a.fecha)}</TableCell>
                      <TableCell className="whitespace-nowrap tabular-nums">{formatHora(a.hora)}</TableCell>
                      <TableCell className="max-w-[14rem]">
                        <SolicitanteTag solicitante={solicitantes?.get(a.solicitante_id)} loading={solLoading} />
                      </TableCell>
                      <TableCell className="font-medium">{a.empleado_nombre}</TableCell>
                      <TableCell className="tabular-nums">{a.empleado_cedula}</TableCell>
                      <TableCell>{capitalizar(a.tipo_examen)}</TableCell>
                      <TableCell>{a.servicio}</TableCell>
                      <TableCell className="whitespace-nowrap text-right tabular-nums">{formatValor(valores?.get(a.id))}</TableCell>
                      <TableCell><AppointmentStatusBadge estado={a.estado} /></TableCell>
                      <TableCell className="pr-5 text-right">
                        {a.estado === "agendada" && (
                          <Button
                            size="sm"
                            variant="destructive-outline"
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
