import { useState } from "react";
import { Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import type { Cargo, Empleado, TipoDoc } from "@/lib/database.types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FormField } from "@/components/app/FormField";
import { TIPOS_DOC, errorCelular, errorCorreo, errorDocumento, useGuardarEmpleado } from "@/lib/hooks/useEmpresa";

const SIN_CARGO = "__sin_cargo__";

/** Crear o editar un empleado del directorio. Va dentro de un DialogContent. */
export function EmpleadoForm({
  empresaId, empleado, cargos, onClose, onSaved,
}: {
  empresaId: string;
  empleado: Empleado | null;
  cargos: Cargo[];
  onClose: () => void;
  onSaved?: (e: Empleado) => void;
}) {
  const guardar = useGuardarEmpleado(empresaId);
  const [tipoDoc, setTipoDoc] = useState<TipoDoc>(empleado?.tipo_doc ?? "CC");
  const [numero, setNumero] = useState(empleado?.numero ?? "");
  const [nombres, setNombres] = useState(empleado?.nombres ?? "");
  const [apellidos, setApellidos] = useState(empleado?.apellidos ?? "");
  const [cargoId, setCargoId] = useState(empleado?.cargo_id ?? "");
  const [celular, setCelular] = useState(empleado?.celular ?? "");
  const [correo, setCorreo] = useState(empleado?.correo ?? "");
  const [submitted, setSubmitted] = useState(false);

  const errores = {
    numero: errorDocumento(tipoDoc, numero),
    nombres: !nombres.trim() ? "Escribe los nombres." : null,
    apellidos: !apellidos.trim() ? "Escribe los apellidos." : null,
    celular: errorCelular(celular),
    correo: errorCorreo(correo),
  };
  const hayErrores = Object.values(errores).some(Boolean);

  const enviar = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    if (hayErrores) return;
    guardar.mutate(
      {
        id: empleado?.id,
        tipo_doc: tipoDoc,
        numero: numero.trim(),
        nombres: nombres.trim(),
        apellidos: apellidos.trim(),
        cargo_id: cargoId || null,
        celular: celular.replace(/\s/g, "") || null,
        correo: correo.trim().toLowerCase() || null,
      },
      {
        onSuccess: (guardado) => { toast.success(empleado ? "Empleado actualizado" : "Empleado agregado"); onSaved?.(guardado); onClose(); },
        onError: (err) => toast.error((err as { code?: string }).code === "23505" ? "Ya tienes un empleado con ese documento." : "No se pudo guardar el empleado"),
      },
    );
  };

  const err = (k: keyof typeof errores) => (submitted ? errores[k] : null);

  return (
    <form onSubmit={enviar} noValidate className="space-y-4">
      <DialogHeader>
        <DialogTitle>{empleado ? "Editar empleado" : "Nuevo empleado"}</DialogTitle>
        <DialogDescription>Queda en Mis empleados para agendarle citas.</DialogDescription>
      </DialogHeader>
      <div className="grid gap-4 sm:grid-cols-[11rem_1fr]">
        <FormField id="emp-tipo-doc" label="Tipo de documento" required>
          <Select value={tipoDoc} onValueChange={(v) => setTipoDoc(v as TipoDoc)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{TIPOS_DOC.map((t) => <SelectItem key={t.value} value={t.value}>{t.value} · {t.label}</SelectItem>)}</SelectContent>
          </Select>
        </FormField>
        <FormField id="emp-numero" label="Número" required error={err("numero")}>
          <Input value={numero} onChange={(e) => setNumero(e.target.value.replace(/\s/g, ""))} inputMode={tipoDoc === "PA" || tipoDoc === "PPT" ? "text" : "numeric"} autoFocus />
        </FormField>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField id="emp-nombres" label="Nombres" required error={err("nombres")}>
          <Input value={nombres} onChange={(e) => setNombres(e.target.value)} />
        </FormField>
        <FormField id="emp-apellidos" label="Apellidos" required error={err("apellidos")}>
          <Input value={apellidos} onChange={(e) => setApellidos(e.target.value)} />
        </FormField>
      </div>
      <FormField id="emp-cargo" label="Cargo" hint={cargos.length === 0 ? "Aún no tienes cargos. Créalos en Cargos." : "Sus énfasis definen las pruebas."}>
        <Select value={cargoId || SIN_CARGO} onValueChange={(v) => setCargoId(v === SIN_CARGO ? "" : v)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value={SIN_CARGO}>Sin cargo</SelectItem>
            {cargos.map((c) => <SelectItem key={c.id} value={c.id}>{c.nombre}</SelectItem>)}
          </SelectContent>
        </Select>
      </FormField>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField id="emp-celular" label="Celular" hint="Opcional." error={err("celular")}>
          <Input value={celular} onChange={(e) => setCelular(e.target.value)} inputMode="tel" placeholder="3001234567" />
        </FormField>
        <FormField id="emp-correo" label="Correo" hint="Opcional. Para avisarle sus citas." error={err("correo")}>
          <Input type="email" value={correo} onChange={(e) => setCorreo(e.target.value)} />
        </FormField>
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose} disabled={guardar.isPending}>Cancelar</Button>
        <Button type="submit" disabled={guardar.isPending}>
          {guardar.isPending ? <><Loader2 className="animate-spin" /> Guardando…</> : <><Save /> Guardar</>}
        </Button>
      </DialogFooter>
    </form>
  );
}
