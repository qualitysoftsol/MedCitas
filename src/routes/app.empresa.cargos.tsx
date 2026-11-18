import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Briefcase, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { Cargo } from "@/lib/database.types";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { PageHeader } from "@/components/app/PageHeader";
import { EmptyState, ErrorState } from "@/components/app/EmptyState";
import { ConfirmarEliminar } from "@/components/catalogos/shared";
import { CargoForm } from "@/components/empresa/CargoForm";
import { useAuth } from "@/lib/auth-context";
import { pruebasDeEnfasis, useEnfasis, useServicios } from "@/lib/hooks/useCatalogos";
import { useCargos, useDeleteCargo, useEmpleados } from "@/lib/hooks/useEmpresa";

export const Route = createFileRoute("/app/empresa/cargos")({
  component: Cargos,
});

function Cargos() {
  const { profile } = useAuth();
  const { data: cargos = [], isLoading, isError, refetch } = useCargos(profile?.id);
  const { data: empleados = [] } = useEmpleados(profile?.id);
  const { data: enfasis = [] } = useEnfasis();
  const { data: servicios = [] } = useServicios();
  const eliminar = useDeleteCargo();
  const [editando, setEditando] = useState<Cargo | "nuevo" | null>(null);
  const [eliminando, setEliminando] = useState<Cargo | null>(null);

  const empleadosDe = (id: string) => empleados.filter((e) => e.cargo_id === id).length;
  const nombreEnfasis = (id: string) => enfasis.find((e) => e.id === id)?.nombre;

  const confirmarEliminar = () => {
    if (!eliminando) return;
    eliminar.mutate(eliminando.id, {
      onSuccess: () => { toast.success("Cargo eliminado"); setEliminando(null); },
      onError: () => toast.error("No se pudo eliminar el cargo"),
    });
  };

  return (
    <div className="space-y-6">
      <PageHeader
        icon={Briefcase}
        title="Cargos"
        description="Cada cargo tiene los énfasis (riesgos) que definen las pruebas de la evaluación de quienes lo ocupan."
        actions={<Button onClick={() => setEditando("nuevo")}><Plus /> Nuevo cargo</Button>}
      />

      <Card>
        <CardContent className="p-0 md:p-0">
          {isLoading ? (
            <p className="py-8 text-center text-sm text-muted-foreground" role="status">Cargando cargos…</p>
          ) : isError ? (
            <ErrorState title="No pudimos cargar tus cargos" onRetry={() => refetch()} />
          ) : cargos.length === 0 ? (
            <EmptyState icon={Briefcase} title="Aún no tienes cargos" description="Crea los cargos de tu empresa y marca sus énfasis." action={<Button onClick={() => setEditando("nuevo")}><Plus /> Nuevo cargo</Button>} />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-surface hover:bg-surface">
                    <TableHead className="pl-5">Cargo</TableHead>
                    <TableHead>Énfasis</TableHead>
                    <TableHead>Pruebas</TableHead>
                    <TableHead className="text-right">Empleados</TableHead>
                    <TableHead className="pr-5 text-right"><span className="sr-only">Acciones</span></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {cargos.map((c) => {
                    const pruebas = pruebasDeEnfasis(c.enfasis_ids, enfasis, servicios);
                    return (
                      <TableRow key={c.id}>
                        <TableCell className="pl-5 font-semibold">{c.nombre}</TableCell>
                        <TableCell>
                          {c.enfasis_ids.length === 0 ? (
                            <span className="text-[13px] text-warning-foreground">Sin énfasis: no se puede agendar</span>
                          ) : (
                            <div className="flex flex-wrap gap-1">
                              {c.enfasis_ids.map((id) => <span key={id} className="rounded-full bg-primary-soft px-2.5 py-0.5 text-xs font-medium text-accent-foreground">{nombreEnfasis(id)}</span>)}
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="text-[13px] text-muted-foreground">{pruebas.map((p) => p.nombre).join(", ") || "—"}</TableCell>
                        <TableCell className="text-right tabular-nums">{empleadosDe(c.id)}</TableCell>
                        <TableCell className="pr-5">
                          <div className="flex justify-end gap-1">
                            <Button size="icon" variant="ghost" onClick={() => setEditando(c)} aria-label={`Editar ${c.nombre}`}><Pencil /></Button>
                            <Button size="icon" variant="ghost" className="text-danger-foreground hover:bg-danger-soft" onClick={() => setEliminando(c)} aria-label={`Eliminar ${c.nombre}`}><Trash2 /></Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!editando} onOpenChange={(o) => !o && setEditando(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          {editando && <CargoForm key={editando === "nuevo" ? "nuevo" : editando.id} cargo={editando === "nuevo" ? null : editando} onClose={() => setEditando(null)} />}
        </DialogContent>
      </Dialog>

      <ConfirmarEliminar
        abierto={!!eliminando}
        titulo={`¿Eliminar el cargo "${eliminando?.nombre ?? ""}"?`}
        pendiente={eliminar.isPending}
        onConfirmar={confirmarEliminar}
        onCerrar={() => setEliminando(null)}
      >
        {eliminando && empleadosDe(eliminando.id) > 0
          ? <p>{empleadosDe(eliminando.id)} {empleadosDe(eliminando.id) === 1 ? "empleado quedará" : "empleados quedarán"} sin cargo. Las citas ya agendadas no cambian.</p>
          : <p>Ningún empleado tiene este cargo.</p>}
      </ConfirmarEliminar>
    </div>
  );
}
