import { useMemo, useState } from "react";
import { Check, Grid3x3, Loader2, Pencil, Plus, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { Enfasis, Servicio, TipoServicio } from "@/lib/database.types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FormField } from "@/components/app/FormField";
import { EmptyState } from "@/components/app/EmptyState";
import {
  useDeleteEnfasis, useEnfasis, useGuardarEnfasis, useServicios, useToggleEnfasisServicio,
} from "@/lib/hooks/useCatalogos";
import { cn } from "@/lib/utils";
import { CatalogoCard, ConfirmarEliminar } from "./shared";
import { mensajeError } from "./utils";

// Columnas: primero la evaluación médica, luego pruebas, imágenes y terapias.
const ORDEN_TIPO: Record<TipoServicio, number> = { evaluacion_medica: 0, prueba_complementaria: 1, imagen: 2, terapia: 3 };
const ordenTipo = (s: Servicio) => (s.tipo ? ORDEN_TIPO[s.tipo] : 9);

export function EnfasisTab() {
  const { data: enfasis = [], isLoading } = useEnfasis();
  const { data: servicios = [] } = useServicios();
  const toggle = useToggleEnfasisServicio();
  const eliminar = useDeleteEnfasis();
  const [editando, setEditando] = useState<Enfasis | "nuevo" | null>(null);
  const [eliminando, setEliminando] = useState<Enfasis | null>(null);

  const columnas = useMemo(
    () => [...servicios].sort((a, b) => ordenTipo(a) - ordenTipo(b) || a.nombre.localeCompare(b.nombre)),
    [servicios],
  );
  const seOfrece = (s: Servicio) => s.lineas.some((l) => l.activo);

  const marcar = (e: Enfasis, s: Servicio) => {
    const incluir = !e.servicio_ids.includes(s.id);
    toggle.mutate(
      { enfasis_id: e.id, servicio_id: s.id, incluir },
      { onError: () => toast.error(`No se pudo ${incluir ? "agregar" : "quitar"} ${s.nombre} en ${e.nombre}`) },
    );
  };

  const confirmarEliminar = () => {
    if (!eliminando) return;
    eliminar.mutate(eliminando.id, {
      onSuccess: () => { toast.success("Énfasis eliminado"); setEliminando(null); },
      onError: (err) => toast.error(mensajeError(err, "un énfasis", "No se pudo eliminar el énfasis")),
    });
  };

  return (
    <CatalogoCard
      title="Énfasis y pruebas"
      description="Cada énfasis (riesgo del cargo) suma pruebas a la evaluación. Toca una casilla para agregar o quitar la prueba. Las combinaciones iniciales son de ejemplo: defínelas con el médico SST."
      action={<Button onClick={() => setEditando("nuevo")}><Plus /> Nuevo énfasis</Button>}
    >
      {isLoading ? (
        <p className="px-6 pb-6 text-sm text-muted-foreground">Cargando…</p>
      ) : enfasis.length === 0 ? (
        <EmptyState compact icon={Grid3x3} title="Sin énfasis" description="Crea el primer énfasis y marca sus pruebas." />
      ) : (
        <div className="overflow-x-auto border-t">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="bg-surface">
                <th scope="col" className="sticky left-0 z-10 min-w-56 bg-surface px-5 py-3 text-left font-medium text-muted-foreground">Énfasis</th>
                {columnas.map((s) => (
                  <th
                    key={s.id}
                    scope="col"
                    className={cn("min-w-24 px-2 py-3 text-center text-xs font-medium", seOfrece(s) ? "text-muted-foreground" : "text-muted-foreground/50")}
                    title={seOfrece(s) ? undefined : "Sin línea activa: no se ofrece en Solicitar cita"}
                  >
                    {s.nombre}
                  </th>
                ))}
                <th scope="col" className="px-5 py-3"><span className="sr-only">Acciones</span></th>
              </tr>
            </thead>
            <tbody>
              {enfasis.map((e) => (
                <tr key={e.id} className="border-t">
                  <th scope="row" className="sticky left-0 z-10 bg-card px-5 py-3 text-left font-semibold">
                    {e.nombre}
                    {e.exclusivo && <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">Excluyente</span>}
                    {e.servicio_ids.length === 0 && <span className="block text-xs font-normal text-warning-foreground">Sin pruebas</span>}
                  </th>
                  {columnas.map((s) => {
                    const on = e.servicio_ids.includes(s.id);
                    return (
                      <td key={s.id} className="px-2 py-1.5 text-center">
                        <button
                          type="button"
                          aria-pressed={on}
                          aria-label={`${s.nombre} en ${e.nombre}`}
                          onClick={() => marcar(e, s)}
                          className={cn(
                            "inline-flex size-9 items-center justify-center rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                            on ? "text-accent-foreground hover:bg-primary-soft" : "text-transparent hover:bg-muted hover:text-muted-foreground/40",
                          )}
                        >
                          <Check className="size-4" strokeWidth={2.5} aria-hidden />
                        </button>
                      </td>
                    );
                  })}
                  <td className="px-5 py-1.5">
                    <div className="flex justify-end gap-1">
                      <Button size="icon" variant="ghost" onClick={() => setEditando(e)} aria-label={`Editar ${e.nombre}`}><Pencil /></Button>
                      <Button size="icon" variant="ghost" className="text-danger-foreground hover:bg-danger-soft" onClick={() => setEliminando(e)} aria-label={`Eliminar ${e.nombre}`}><Trash2 /></Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={!!editando} onOpenChange={(o) => !o && setEditando(null)}>
        <DialogContent className="sm:max-w-md">
          {editando && <EnfasisForm key={editando === "nuevo" ? "nuevo" : editando.id} enfasis={editando === "nuevo" ? null : editando} onClose={() => setEditando(null)} />}
        </DialogContent>
      </Dialog>

      <ConfirmarEliminar
        abierto={!!eliminando}
        titulo={`¿Eliminar "${eliminando?.nombre ?? ""}"?`}
        pendiente={eliminar.isPending}
        onConfirmar={confirmarEliminar}
        onCerrar={() => setEliminando(null)}
      >
        <p>Dejará de aparecer al solicitar citas. Las citas ya agendadas no cambian.</p>
      </ConfirmarEliminar>
    </CatalogoCard>
  );
}

function EnfasisForm({ enfasis, onClose }: { enfasis: Enfasis | null; onClose: () => void }) {
  const guardar = useGuardarEnfasis();
  const [nombre, setNombre] = useState(enfasis?.nombre ?? "");
  const [exclusivo, setExclusivo] = useState(enfasis?.exclusivo ?? false);
  const [submitted, setSubmitted] = useState(false);
  const nombreError = !nombre.trim() ? "Escribe el nombre del énfasis." : null;

  const enviar = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    if (nombreError) return;
    guardar.mutate(
      { id: enfasis?.id, nombre: nombre.trim(), exclusivo },
      {
        onSuccess: () => { toast.success(enfasis ? "Énfasis actualizado" : "Énfasis creado: marca sus pruebas en la tabla"); onClose(); },
        onError: (err) => toast.error(mensajeError(err, "un énfasis", "No se pudo guardar el énfasis")),
      },
    );
  };

  return (
    <form onSubmit={enviar} noValidate className="space-y-4">
      <DialogHeader>
        <DialogTitle>{enfasis ? "Editar énfasis" : "Nuevo énfasis"}</DialogTitle>
        <DialogDescription>Un énfasis es un riesgo del cargo. Sus pruebas se marcan en la tabla.</DialogDescription>
      </DialogHeader>
      <FormField id="enfasis-nombre" label="Nombre" required error={submitted ? nombreError : null}>
        <Input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej.: Trabajo en alturas" autoFocus />
      </FormField>
      <label className="flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2.5 text-sm">
        <Checkbox checked={exclusivo} onCheckedChange={(c) => setExclusivo(!!c)} className="mt-0.5" />
        <span>
          <span className="block font-medium">Excluyente</span>
          <span className="block text-xs text-muted-foreground">No se combina con otros énfasis, como «Ninguno especial (oficina)».</span>
        </span>
      </label>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose} disabled={guardar.isPending}>Cancelar</Button>
        <Button type="submit" disabled={guardar.isPending}>
          {guardar.isPending ? <><Loader2 className="animate-spin" /> Guardando…</> : <><Save /> Guardar</>}
        </Button>
      </DialogFooter>
    </form>
  );
}
