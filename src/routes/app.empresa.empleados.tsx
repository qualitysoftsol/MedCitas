import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Pencil, Plus, Search, Trash2, Users } from "lucide-react";
import { toast } from "sonner";
import type { Empleado } from "@/lib/database.types";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { PageHeader } from "@/components/app/PageHeader";
import { IconInput } from "@/components/app/FormField";
import { EmptyState, ErrorState } from "@/components/app/EmptyState";
import { ConfirmarEliminar } from "@/components/catalogos/shared";
import { EmpleadoForm } from "@/components/empresa/EmpleadoForm";
import { useAuth } from "@/lib/auth-context";
import { formatDocumento, nombreCompleto, useCargos, useDeleteEmpleado, useEmpleados } from "@/lib/hooks/useEmpresa";

export const Route = createFileRoute("/app/empresa/empleados")({
  component: MisEmpleados,
});

const normalizar = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

function MisEmpleados() {
  const { profile } = useAuth();
  const { data: empleados = [], isLoading, isError, refetch } = useEmpleados(profile?.id);
  const { data: cargos = [] } = useCargos(profile?.id);
  const eliminar = useDeleteEmpleado();
  const [busqueda, setBusqueda] = useState("");
  const [editando, setEditando] = useState<Empleado | "nuevo" | null>(null);
  const [eliminando, setEliminando] = useState<Empleado | null>(null);

  const cargoDe = (id: string | null) => cargos.find((c) => c.id === id)?.nombre ?? null;
  const filtrados = useMemo(() => {
    const q = normalizar(busqueda.trim());
    if (!q) return empleados;
    return empleados.filter((e) => normalizar(`${nombreCompleto(e)} ${e.numero}`).includes(q));
  }, [empleados, busqueda]);

  const confirmarEliminar = () => {
    if (!eliminando) return;
    eliminar.mutate(eliminando.id, {
      onSuccess: () => { toast.success("Empleado eliminado"); setEliminando(null); },
      onError: () => toast.error("No se pudo eliminar el empleado"),
    });
  };

  return (
    <div className="space-y-6">
      <PageHeader
        icon={Users}
        title="Mis empleados"
        description="Las personas a las que les agendas evaluaciones. También se agregan o actualizan al cargar un archivo en Solicitar cita."
        actions={<Button onClick={() => setEditando("nuevo")}><Plus /> Nuevo empleado</Button>}
      />

      <Card>
        <CardContent className="space-y-4 p-0 md:p-0">
          <div className="px-5 pt-5">
            <IconInput icon={Search} value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar por nombre o documento" aria-label="Buscar empleados" className="max-w-md" />
          </div>
          {isLoading ? (
            <p className="py-8 text-center text-sm text-muted-foreground" role="status">Cargando empleados…</p>
          ) : isError ? (
            <ErrorState title="No pudimos cargar tus empleados" onRetry={() => refetch()} />
          ) : empleados.length === 0 ? (
            <EmptyState icon={Users} title="Aún no tienes empleados" description="Agrégalos uno a uno o carga un archivo al solicitar citas." action={<Button onClick={() => setEditando("nuevo")}><Plus /> Nuevo empleado</Button>} />
          ) : filtrados.length === 0 ? (
            <EmptyState compact icon={Search} title="Ningún empleado coincide" description="Prueba con otro nombre o número de documento." />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-surface hover:bg-surface">
                    <TableHead className="pl-5">Empleado</TableHead>
                    <TableHead>Documento</TableHead>
                    <TableHead>Cargo</TableHead>
                    <TableHead>Contacto</TableHead>
                    <TableHead className="pr-5 text-right"><span className="sr-only">Acciones</span></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtrados.map((e) => (
                    <TableRow key={e.id}>
                      <TableCell className="pl-5 font-semibold">{nombreCompleto(e)}</TableCell>
                      <TableCell className="whitespace-nowrap tabular-nums">{e.tipo_doc} {formatDocumento(e.numero)}</TableCell>
                      <TableCell>{cargoDe(e.cargo_id) ?? <span className="text-warning-foreground">Sin cargo</span>}</TableCell>
                      <TableCell className="text-[13px] text-muted-foreground">{[e.celular, e.correo].filter(Boolean).join(" · ") || "—"}</TableCell>
                      <TableCell className="pr-5">
                        <div className="flex justify-end gap-1">
                          <Button size="icon" variant="ghost" onClick={() => setEditando(e)} aria-label={`Editar ${nombreCompleto(e)}`}><Pencil /></Button>
                          <Button size="icon" variant="ghost" className="text-danger-foreground hover:bg-danger-soft" onClick={() => setEliminando(e)} aria-label={`Eliminar ${nombreCompleto(e)}`}><Trash2 /></Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!editando} onOpenChange={(o) => !o && setEditando(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          {editando && profile && (
            <EmpleadoForm key={editando === "nuevo" ? "nuevo" : editando.id} empresaId={profile.id} empleado={editando === "nuevo" ? null : editando} cargos={cargos} onClose={() => setEditando(null)} />
          )}
        </DialogContent>
      </Dialog>

      <ConfirmarEliminar
        abierto={!!eliminando}
        titulo={`¿Eliminar a ${eliminando ? nombreCompleto(eliminando) : ""}?`}
        pendiente={eliminar.isPending}
        onConfirmar={confirmarEliminar}
        onCerrar={() => setEliminando(null)}
      >
        <p>Sale de Mis empleados. Sus citas y resultados se conservan.</p>
      </ConfirmarEliminar>
    </div>
  );
}
