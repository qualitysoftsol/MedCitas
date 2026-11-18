import { useState } from "react";
import { Layers, Loader2, Pencil, Plus, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { LineaServicio } from "@/lib/database.types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FormField } from "@/components/app/FormField";
import { EmptyState } from "@/components/app/EmptyState";
import { useDeleteLinea, useGuardarLinea, useLineas, useServicios } from "@/lib/hooks/useCatalogos";
import { CatalogoCard, ConfirmarEliminar } from "./shared";
import { mensajeError, textoONull } from "./utils";

export function LineasTab() {
  const { data: lineas = [], isLoading } = useLineas();
  const { data: servicios = [] } = useServicios();
  const guardar = useGuardarLinea();
  const eliminar = useDeleteLinea();
  const [editando, setEditando] = useState<LineaServicio | "nueva" | null>(null);
  const [eliminando, setEliminando] = useState<LineaServicio | null>(null);

  const serviciosDe = (id: string) => servicios.filter((s) => s.lineas.some((l) => l.id === id)).length;

  const cambiarActivo = (l: LineaServicio, activo: boolean) =>
    guardar.mutate(
      { id: l.id, activo },
      {
        onSuccess: () => toast.success(activo ? `"${l.nombre}" activada` : `"${l.nombre}" desactivada`),
        onError: (err) => toast.error(mensajeError(err, "una línea", "No se pudo actualizar la línea")),
      },
    );

  const confirmarEliminar = () => {
    if (!eliminando) return;
    eliminar.mutate(eliminando.id, {
      onSuccess: () => { toast.success("Línea eliminada"); setEliminando(null); },
      onError: (err) => toast.error(mensajeError(err, "una línea", "No se pudo eliminar la línea")),
    });
  };

  return (
    <CatalogoCard
      title="Líneas de servicio"
      description="Agrupan los servicios. Un servicio puede estar en varias líneas. Los servicios que solo están en líneas inactivas no se ofrecen en Solicitar cita."
      action={<Button onClick={() => setEditando("nueva")}><Plus /> Nueva línea</Button>}
    >
      {isLoading ? (
        <p className="px-6 pb-6 text-sm text-muted-foreground">Cargando…</p>
      ) : lineas.length === 0 ? (
        <EmptyState compact icon={Layers} title="Sin líneas de servicio" description="Crea la primera línea para agrupar los servicios." />
      ) : (
        <ul className="divide-y border-t">
          {lineas.map((l) => {
            const n = serviciosDe(l.id);
            return (
              <li key={l.id} className="flex items-center gap-4 px-5 py-3.5 md:px-6">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{l.nombre}</p>
                  <p className="text-[13px] text-muted-foreground">
                    {[l.descripcion, `${n} ${n === 1 ? "servicio" : "servicios"}`].filter(Boolean).join(" · ")}
                  </p>
                </div>
                <Switch
                  checked={l.activo}
                  onCheckedChange={(v) => cambiarActivo(l, v)}
                  aria-label={`${l.nombre}: ${l.activo ? "activa" : "inactiva"}`}
                />
                <div className="flex gap-1">
                  <Button size="icon" variant="ghost" onClick={() => setEditando(l)} aria-label={`Editar ${l.nombre}`}><Pencil /></Button>
                  <Button size="icon" variant="ghost" className="text-danger-foreground hover:bg-danger-soft" onClick={() => setEliminando(l)} aria-label={`Eliminar ${l.nombre}`}><Trash2 /></Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <Dialog open={!!editando} onOpenChange={(o) => !o && setEditando(null)}>
        <DialogContent className="sm:max-w-md">
          {editando && <LineaForm key={editando === "nueva" ? "nueva" : editando.id} linea={editando === "nueva" ? null : editando} onClose={() => setEditando(null)} />}
        </DialogContent>
      </Dialog>

      <ConfirmarEliminar
        abierto={!!eliminando}
        titulo={`¿Eliminar "${eliminando?.nombre ?? ""}"?`}
        pendiente={eliminar.isPending}
        onConfirmar={confirmarEliminar}
        onCerrar={() => setEliminando(null)}
      >
        {eliminando && serviciosDe(eliminando.id) > 0 ? (
          <p>Se quitará de {serviciosDe(eliminando.id)} {serviciosDe(eliminando.id) === 1 ? "servicio" : "servicios"}. Los servicios no se eliminan.</p>
        ) : (
          <p>Ningún servicio usa esta línea.</p>
        )}
      </ConfirmarEliminar>
    </CatalogoCard>
  );
}

function LineaForm({ linea, onClose }: { linea: LineaServicio | null; onClose: () => void }) {
  const guardar = useGuardarLinea();
  const [nombre, setNombre] = useState(linea?.nombre ?? "");
  const [descripcion, setDescripcion] = useState(linea?.descripcion ?? "");
  const [submitted, setSubmitted] = useState(false);
  const nombreError = !nombre.trim() ? "Escribe el nombre de la línea." : null;

  const enviar = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    if (nombreError) return;
    guardar.mutate(
      { id: linea?.id, nombre: nombre.trim(), descripcion: textoONull(descripcion) },
      {
        onSuccess: () => { toast.success(linea ? "Línea actualizada" : "Línea creada"); onClose(); },
        onError: (err) => toast.error(mensajeError(err, "una línea", "No se pudo guardar la línea")),
      },
    );
  };

  return (
    <form onSubmit={enviar} noValidate className="space-y-4">
      <DialogHeader>
        <DialogTitle>{linea ? "Editar línea" : "Nueva línea de servicio"}</DialogTitle>
        <DialogDescription>{linea ? "Los servicios de esta línea no cambian." : "Las líneas nuevas quedan activas."}</DialogDescription>
      </DialogHeader>
      <FormField id="linea-nombre" label="Nombre" required error={submitted ? nombreError : null}>
        <Input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej.: Salud ocupacional (SST)" autoFocus />
      </FormField>
      <FormField id="linea-descripcion" label="Descripción" hint="Opcional. Solo la ve el administrador.">
        <Input value={descripcion} onChange={(e) => setDescripcion(e.target.value)} placeholder='Ej.: Antes "Salud y Riesgos Laborales"' />
      </FormField>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose} disabled={guardar.isPending}>Cancelar</Button>
        <Button type="submit" disabled={guardar.isPending}>
          {guardar.isPending ? <><Loader2 className="animate-spin" /> Guardando…</> : <><Save /> Guardar</>}
        </Button>
      </DialogFooter>
    </form>
  );
}
