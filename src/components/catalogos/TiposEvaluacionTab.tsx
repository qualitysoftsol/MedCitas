import { useState } from "react";
import { Check, ClipboardList, Loader2, Minus, Save } from "lucide-react";
import { toast } from "sonner";
import type { TipoEvaluacion } from "@/lib/database.types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FormField } from "@/components/app/FormField";
import { EmptyState } from "@/components/app/EmptyState";
import { useTiposEvaluacion, useUpdateTipoEvaluacion } from "@/lib/hooks/useCatalogos";
import { CatalogoCard } from "./shared";
import { mensajeError, textoONull } from "./utils";

const ROLES = [
  { value: "empresa", label: "Empresa" },
  { value: "particular", label: "Particular" },
] as const;

function Permitido({ si }: { si: boolean }) {
  return (
    <>
      {si
        ? <Check className="mx-auto size-4 text-accent-foreground" aria-hidden />
        : <Minus className="mx-auto size-4 text-muted-foreground" aria-hidden />}
      <span className="sr-only">{si ? "Sí" : "No"}</span>
    </>
  );
}

export function TiposEvaluacionTab() {
  const { data: tipos = [], isLoading } = useTiposEvaluacion();
  const [editando, setEditando] = useState<TipoEvaluacion | null>(null);

  return (
    <CatalogoCard
      title="Tipos de evaluación"
      description="Fijos según la Resolución 1843 de 2025. No se crean ni se borran; puedes editar el nombre visible, los textos y quién puede pedirlos."
    >
      {isLoading ? (
        <p className="px-6 pb-6 text-sm text-muted-foreground">Cargando…</p>
      ) : tipos.length === 0 ? (
        <EmptyState compact icon={ClipboardList} title="Sin tipos de evaluación" description="Ejecuta la migración 019 en Supabase para cargarlos." />
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-surface hover:bg-surface">
                <TableHead className="pl-5">Código</TableHead>
                <TableHead>Nombre visible</TableHead>
                <TableHead>Regla / datos que pide</TableHead>
                <TableHead className="text-center">Empresa</TableHead>
                <TableHead className="text-center">Particular</TableHead>
                <TableHead className="pr-5 text-right"><span className="sr-only">Acciones</span></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tipos.map((t) => (
                <TableRow key={t.id}>
                  <TableCell className="pl-5 font-mono text-xs text-muted-foreground">{t.codigo}</TableCell>
                  <TableCell className="font-semibold">{t.nombre}</TableCell>
                  <TableCell>{t.regla ?? "—"}</TableCell>
                  <TableCell><Permitido si={t.roles_permitidos.includes("empresa")} /></TableCell>
                  <TableCell><Permitido si={t.roles_permitidos.includes("particular")} /></TableCell>
                  <TableCell className="pr-5 text-right">
                    <Button size="sm" variant="outline" onClick={() => setEditando(t)} aria-label={`Editar ${t.nombre}`}>Editar</Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={!!editando} onOpenChange={(o) => !o && setEditando(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          {editando && <TipoForm key={editando.id} tipo={editando} onClose={() => setEditando(null)} />}
        </DialogContent>
      </Dialog>
    </CatalogoCard>
  );
}

function TipoForm({ tipo, onClose }: { tipo: TipoEvaluacion; onClose: () => void }) {
  const update = useUpdateTipoEvaluacion();
  const [nombre, setNombre] = useState(tipo.nombre);
  const [descripcion, setDescripcion] = useState(tipo.descripcion ?? "");
  const [regla, setRegla] = useState(tipo.regla ?? "");
  const [indicaciones, setIndicaciones] = useState(tipo.indicaciones ?? "");
  const [roles, setRoles] = useState<string[]>(tipo.roles_permitidos);
  const [submitted, setSubmitted] = useState(false);
  const nombreError = !nombre.trim() ? "Escribe el nombre visible." : null;

  const toggleRol = (rol: string, on: boolean) => setRoles((r) => (on ? [...r, rol] : r.filter((x) => x !== rol)));

  const enviar = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    if (nombreError) return;
    update.mutate(
      {
        id: tipo.id,
        nombre: nombre.trim(),
        descripcion: textoONull(descripcion),
        regla: textoONull(regla),
        indicaciones: textoONull(indicaciones),
        roles_permitidos: ROLES.map((r) => r.value).filter((r) => roles.includes(r)),
      },
      {
        onSuccess: () => { toast.success("Tipo de evaluación actualizado"); onClose(); },
        onError: (err) => toast.error(mensajeError(err, "un tipo de evaluación", "No se pudo guardar el tipo de evaluación")),
      },
    );
  };

  return (
    <form onSubmit={enviar} noValidate className="space-y-4">
      <DialogHeader>
        <DialogTitle>Editar tipo de evaluación</DialogTitle>
        <DialogDescription>
          Código <span className="font-mono text-foreground">{tipo.codigo}</span>. El código no cambia: las citas lo guardan para que cambiar el nombre visible no las afecte.
        </DialogDescription>
      </DialogHeader>
      <FormField id="tipo-nombre" label="Nombre visible" required error={submitted ? nombreError : null}>
        <Input value={nombre} onChange={(e) => setNombre(e.target.value)} autoFocus />
      </FormField>
      <FormField id="tipo-descripcion" label="Descripción" hint="Aparece bajo el nombre al elegir el motivo, p. ej. «Antes de empezar un trabajo nuevo.».">
        <Input value={descripcion} onChange={(e) => setDescripcion(e.target.value)} />
      </FormField>
      <FormField id="tipo-regla" label="Regla / datos que pide" hint="Referencia para el administrador.">
        <Input value={regla} onChange={(e) => setRegla(e.target.value)} />
      </FormField>
      <FormField id="tipo-indicaciones" label="Indicaciones para el paciente" hint="Se suman a las de cada prueba, p. ej. «Lleva el certificado de incapacidad.».">
        <Textarea value={indicaciones} onChange={(e) => setIndicaciones(e.target.value)} rows={2} />
      </FormField>
      <fieldset className="space-y-2">
        <legend className="text-[13px] font-semibold">Quién puede pedirlo</legend>
        <div className="flex flex-wrap gap-2">
          {ROLES.map((r) => (
            <label key={r.value} className="flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm">
              <Checkbox checked={roles.includes(r.value)} onCheckedChange={(c) => toggleRol(r.value, !!c)} />
              {r.label}
            </label>
          ))}
        </div>
        {roles.length === 0 && <p className="text-xs text-warning-foreground">Nadie podrá pedir este tipo de evaluación.</p>}
      </fieldset>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose} disabled={update.isPending}>Cancelar</Button>
        <Button type="submit" disabled={update.isPending}>
          {update.isPending ? <><Loader2 className="animate-spin" /> Guardando…</> : <><Save /> Guardar</>}
        </Button>
      </DialogFooter>
    </form>
  );
}
