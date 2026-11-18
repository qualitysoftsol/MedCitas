import { useState } from "react";
import { Loader2, Pencil, Plus, Save, Stethoscope, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { LineaServicio, Servicio, TipoServicio } from "@/lib/database.types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FormField } from "@/components/app/FormField";
import { EmptyState } from "@/components/app/EmptyState";
import {
  TIPOS_SERVICIO, esErrorServicioEnUso, useDeleteServicio, useGuardarServicio, useLineas, useServicios,
} from "@/lib/hooks/useCatalogos";
import { CatalogoCard, ConfirmarEliminar, LineaTag } from "./shared";
import { mensajeError, textoONull } from "./utils";

const tipoLabel = (t: TipoServicio | null) => TIPOS_SERVICIO.find((x) => x.value === t)?.label ?? "—";

export function ServiciosTab() {
  const { data: servicios = [], isLoading } = useServicios();
  const { data: lineas = [] } = useLineas();
  const eliminar = useDeleteServicio();
  const [editando, setEditando] = useState<Servicio | "nuevo" | null>(null);
  const [eliminando, setEliminando] = useState<Servicio | null>(null);

  const indiceLinea = (id: string) => lineas.findIndex((l) => l.id === id);

  const confirmarEliminar = () => {
    if (!eliminando) return;
    eliminar.mutate(eliminando.id, {
      onSuccess: () => { toast.success("Servicio eliminado"); setEliminando(null); },
      onError: (err) => {
        if (esErrorServicioEnUso(err)) {
          toast.error(`No se puede eliminar "${eliminando.nombre}"`, { description: "Tiene horarios o citas. Puedes quitarlo de sus líneas para que no se ofrezca." });
          setEliminando(null);
        } else {
          toast.error(mensajeError(err, "un servicio", "No se pudo eliminar el servicio"));
        }
      },
    });
  };

  return (
    <CatalogoCard
      title="Servicios"
      description="Cada servicio es una prueba que puede incluir una evaluación. Las indicaciones se le muestran al paciente antes de su cita."
      action={<Button onClick={() => setEditando("nuevo")}><Plus /> Nuevo servicio</Button>}
    >
      {isLoading ? (
        <p className="px-6 pb-6 text-sm text-muted-foreground">Cargando…</p>
      ) : servicios.length === 0 ? (
        <EmptyState compact icon={Stethoscope} title="Sin servicios" description="Crea el primer servicio." />
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-surface hover:bg-surface">
                <TableHead className="pl-5">Servicio</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Líneas</TableHead>
                <TableHead>Preparación</TableHead>
                <TableHead className="text-right">Duración</TableHead>
                <TableHead className="pr-5 text-right"><span className="sr-only">Acciones</span></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {servicios.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="pl-5 font-semibold">{s.nombre}</TableCell>
                  <TableCell>{tipoLabel(s.tipo)}</TableCell>
                  <TableCell>
                    {s.lineas.length === 0 ? (
                      <span className="text-[13px] text-warning-foreground">Sin línea: no se ofrece</span>
                    ) : (
                      <div className="flex flex-wrap gap-1">
                        {s.lineas.map((l) => <LineaTag key={l.id} nombre={l.nombre} indice={indiceLinea(l.id)} activa={l.activo} />)}
                      </div>
                    )}
                  </TableCell>
                  <TableCell>{s.preparacion ?? "—"}</TableCell>
                  <TableCell className="text-right tabular-nums">{s.duracion_min ? `${s.duracion_min} min` : "—"}</TableCell>
                  <TableCell className="pr-5">
                    <div className="flex justify-end gap-1">
                      <Button size="icon" variant="ghost" onClick={() => setEditando(s)} aria-label={`Editar ${s.nombre}`}><Pencil /></Button>
                      <Button size="icon" variant="ghost" className="text-danger-foreground hover:bg-danger-soft" onClick={() => setEliminando(s)} aria-label={`Eliminar ${s.nombre}`}><Trash2 /></Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={!!editando} onOpenChange={(o) => !o && setEditando(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          {editando && (
            <ServicioForm
              key={editando === "nuevo" ? "nuevo" : editando.id}
              servicio={editando === "nuevo" ? null : editando}
              lineas={lineas}
              onClose={() => setEditando(null)}
            />
          )}
        </DialogContent>
      </Dialog>

      <ConfirmarEliminar
        abierto={!!eliminando}
        titulo={`¿Eliminar "${eliminando?.nombre ?? ""}"?`}
        pendiente={eliminar.isPending}
        onConfirmar={confirmarEliminar}
        onCerrar={() => setEliminando(null)}
      >
        <p>También se borran los precios que las IPS le pusieron, sus comisiones y su lugar en los énfasis. Las IPS dejan de ofrecerlo.</p>
        <p>Si tiene horarios o citas no se podrá eliminar.</p>
      </ConfirmarEliminar>
    </CatalogoCard>
  );
}

function ServicioForm({ servicio, lineas, onClose }: { servicio: Servicio | null; lineas: LineaServicio[]; onClose: () => void }) {
  const guardar = useGuardarServicio();
  const [nombre, setNombre] = useState(servicio?.nombre ?? "");
  const [tipo, setTipo] = useState<TipoServicio | "">(servicio?.tipo ?? "");
  const [lineasSel, setLineasSel] = useState<string[]>(servicio?.lineas.map((l) => l.id) ?? []);
  const [preparacion, setPreparacion] = useState(servicio?.preparacion ?? "");
  const [indicaciones, setIndicaciones] = useState(servicio?.indicaciones ?? "");
  const [duracion, setDuracion] = useState(servicio?.duracion_min ? String(servicio.duracion_min) : "");
  const [submitted, setSubmitted] = useState(false);

  const duracionNum = duracion ? Number(duracion) : null;
  const errores = {
    nombre: !nombre.trim() ? "Escribe el nombre del servicio." : null,
    tipo: !tipo ? "Elige el tipo de servicio." : null,
    duracion: duracionNum == null ? "Escribe la duración en minutos." : duracionNum < 1 || duracionNum > 600 ? "Usa un número entre 1 y 600." : null,
  };
  const renombrado = servicio && nombre.trim() !== servicio.nombre;

  const toggleLinea = (id: string, on: boolean) => setLineasSel((sel) => (on ? [...sel, id] : sel.filter((x) => x !== id)));

  const enviar = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    if (errores.nombre || errores.tipo || errores.duracion) return;
    guardar.mutate(
      {
        id: servicio?.id,
        nombre: nombre.trim(),
        tipo: tipo as TipoServicio,
        preparacion: textoONull(preparacion),
        indicaciones: textoONull(indicaciones),
        duracion_min: duracionNum,
        lineas: lineasSel,
      },
      {
        onSuccess: () => { toast.success(servicio ? "Servicio actualizado" : "Servicio creado"); onClose(); },
        onError: (err) => toast.error(mensajeError(err, "un servicio", "No se pudo guardar el servicio")),
      },
    );
  };

  return (
    <form onSubmit={enviar} noValidate className="space-y-4">
      <DialogHeader>
        <DialogTitle>{servicio ? "Editar servicio" : "Nuevo servicio"}</DialogTitle>
        <DialogDescription>Las IPS ponen su propio precio a cada servicio desde su perfil.</DialogDescription>
      </DialogHeader>

      <FormField
        id="servicio-nombre"
        label="Nombre"
        required
        error={submitted ? errores.nombre : null}
        hint={renombrado ? "El nombre nuevo se actualiza en los perfiles de las IPS, sus horarios y las citas." : undefined}
      >
        <Input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej.: Audiometría" autoFocus />
      </FormField>

      <div className="grid gap-4 sm:grid-cols-2">
        <FormField id="servicio-tipo" label="Tipo" required error={submitted ? errores.tipo : null}>
          <Select value={tipo} onValueChange={(v) => setTipo(v as TipoServicio)}>
            <SelectTrigger><SelectValue placeholder="Elige el tipo" /></SelectTrigger>
            <SelectContent>
              {TIPOS_SERVICIO.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </FormField>
        <FormField id="servicio-duracion" label="Duración (minutos)" required error={submitted ? errores.duracion : null}>
          <Input inputMode="numeric" value={duracion} onChange={(e) => setDuracion(e.target.value.replace(/\D/g, "").slice(0, 3))} placeholder="Ej.: 20" />
        </FormField>
      </div>

      <fieldset className="space-y-2">
        <legend className="text-[13px] font-semibold">Líneas</legend>
        {lineas.length === 0 ? (
          <p className="text-[13px] text-muted-foreground">Primero crea una línea de servicio.</p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            {lineas.map((l) => (
              <label key={l.id} className="flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm">
                <Checkbox checked={lineasSel.includes(l.id)} onCheckedChange={(c) => toggleLinea(l.id, !!c)} />
                <span className={l.activo ? undefined : "text-muted-foreground"}>{l.nombre}{!l.activo && " (inactiva)"}</span>
              </label>
            ))}
          </div>
        )}
        {lineasSel.length === 0 && <p className="text-xs text-warning-foreground">Sin línea, el servicio no se ofrece en Solicitar cita.</p>}
      </fieldset>

      <FormField id="servicio-preparacion" label="Preparación" hint="Opcional. Etiqueta corta para esta tabla, p. ej. «Ayuno».">
        <Input value={preparacion} onChange={(e) => setPreparacion(e.target.value)} placeholder="Ej.: Ayuno" />
      </FormField>
      <FormField id="servicio-indicaciones" label="Indicaciones para el paciente" hint="Opcional. Se muestran antes de la cita, p. ej. «Ven en ayunas de 8 horas.».">
        <Textarea value={indicaciones} onChange={(e) => setIndicaciones(e.target.value)} rows={3} />
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
