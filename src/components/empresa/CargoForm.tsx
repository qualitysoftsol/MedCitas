import { useState } from "react";
import { Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import type { Cargo } from "@/lib/database.types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FormField } from "@/components/app/FormField";
import { EnfasisChips } from "@/components/evaluacion/EnfasisChips";
import { pruebasDeEnfasis, useEnfasis, useServicios } from "@/lib/hooks/useCatalogos";
import { useGuardarCargo } from "@/lib/hooks/useEmpresa";

/** Crear o editar un cargo y sus énfasis. Va dentro de un DialogContent. */
export function CargoForm({
  cargo, nombreInicial, onClose, onSaved,
}: {
  cargo: Cargo | null;
  /** Para "Crear cargo «X»" desde el archivo de empleados. */
  nombreInicial?: string;
  onClose: () => void;
  onSaved?: (id: string) => void;
}) {
  const guardar = useGuardarCargo();
  const { data: enfasis = [], isLoading } = useEnfasis();
  const { data: servicios = [] } = useServicios();
  const [nombre, setNombre] = useState(cargo?.nombre ?? nombreInicial ?? "");
  const [enfasisIds, setEnfasisIds] = useState<string[]>(cargo?.enfasis_ids ?? []);
  const [submitted, setSubmitted] = useState(false);
  const pruebas = pruebasDeEnfasis(enfasisIds, enfasis, servicios);
  const errores = {
    nombre: !nombre.trim() ? "Escribe el nombre del cargo." : null,
    enfasis: enfasisIds.length === 0 ? "Elige al menos un énfasis." : null,
  };

  const enviar = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    if (errores.nombre || errores.enfasis) return;
    guardar.mutate(
      { id: cargo?.id, nombre: nombre.trim(), enfasis_ids: enfasisIds },
      {
        onSuccess: (id) => { toast.success(cargo ? "Cargo actualizado" : "Cargo creado"); onSaved?.(id); onClose(); },
        onError: (err) => toast.error((err as { code?: string }).code === "23505" ? "Ya tienes un cargo con ese nombre." : "No se pudo guardar el cargo"),
      },
    );
  };

  return (
    <form onSubmit={enviar} noValidate className="space-y-4">
      <DialogHeader>
        <DialogTitle>{cargo ? "Editar cargo" : "Nuevo cargo"}</DialogTitle>
        <DialogDescription>Los énfasis del cargo definen las pruebas de la evaluación de quienes lo ocupan.</DialogDescription>
      </DialogHeader>
      <FormField id="cargo-nombre" label="Nombre del cargo" required error={submitted ? errores.nombre : null}>
        <Input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej.: Operario de montacargas" autoFocus />
      </FormField>
      <EnfasisChips
        enfasis={enfasis}
        loading={isLoading}
        value={enfasisIds}
        onChange={setEnfasisIds}
        error={submitted ? errores.enfasis : null}
        legend="Énfasis"
        description="Riesgos a los que expone el cargo. Si es un cargo de oficina, elige «Ninguno especial»."
      />
      {pruebas.length > 0 && (
        <p className="rounded-lg bg-muted px-3 py-2 text-[13px] text-muted-foreground">
          Pruebas: <span className="text-foreground">{pruebas.map((p) => p.nombre).join(", ")}</span>
        </p>
      )}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose} disabled={guardar.isPending}>Cancelar</Button>
        <Button type="submit" disabled={guardar.isPending}>
          {guardar.isPending ? <><Loader2 className="animate-spin" /> Guardando…</> : <><Save /> Guardar</>}
        </Button>
      </DialogFooter>
    </form>
  );
}
