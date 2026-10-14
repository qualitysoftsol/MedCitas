import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Percent, Plus, Trash2, Loader2, Save, Info, ListFilter } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import type { Comision, Profile } from "@/lib/database.types";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/app/PageHeader";
import { FormField } from "@/components/app/FormField";
import { EmptyState } from "@/components/app/EmptyState";
import { useServicios } from "@/lib/hooks/useCatalogos";
import { useAddComision, useComisiones, useDeleteComision, useUpdateComision } from "@/lib/hooks/usePrecios";
import { formatPesos } from "@/lib/format";

export const Route = createFileRoute("/app/admin/comisiones")({
  component: AdminComisiones,
});

const TODOS = "__todos__";
const ROL_LABEL: Record<NonNullable<Comision["rol"]>, string> = { empresa: "Empresas", particular: "Particulares" };

/** "12,5" → 12.5. null si no es un porcentaje de 0 a 100 con hasta 2 decimales. */
function parsePorcentaje(v: string): number | null {
  const t = v.trim().replace(",", ".");
  if (!/^\d{1,3}(\.\d{1,2})?$/.test(t)) return null;
  const n = Number(t);
  return n <= 100 ? n : null;
}
const pctTexto = (n: number) => String(n).replace(".", ",");

/** Prioridad de una regla: la misma que usa `comision_aplicable` (migración 016). */
const peso = (c: Comision) => (c.ips_id ? 4 : 0) + (c.servicio_id ? 2 : 0) + (c.rol ? 1 : 0);

const ERROR_PCT = "Escribe un porcentaje entre 0 y 100 (hasta 2 decimales).";

function AdminComisiones() {
  const { data: comisiones = [], isLoading } = useComisiones();
  const { data: servicios = [] } = useServicios();
  const { data: ipsList = [] } = useQuery({
    queryKey: ["admin", "ips-nombres"],
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("id, nombre").eq("role", "ips").order("nombre");
      if (error) throw error;
      return data as Pick<Profile, "id" | "nombre">[];
    },
  });

  const general = comisiones.find((c) => !c.ips_id && !c.servicio_id && !c.rol) ?? null;
  const nombreIps = (id: string | null) => (id ? ipsList.find((i) => i.id === id)?.nombre ?? "IPS eliminada" : "Todas");
  const nombreServicio = (id: string | null) => (id ? servicios.find((s) => s.id === id)?.nombre ?? "Servicio eliminado" : "Todos");
  const reglas = comisiones
    .filter((c) => c !== general)
    .sort((a, b) => peso(b) - peso(a) || nombreIps(a.ips_id).localeCompare(nombreIps(b.ips_id)) || nombreServicio(a.servicio_id).localeCompare(nombreServicio(b.servicio_id)));

  return (
    <div className="space-y-6">
      <PageHeader
        icon={Percent}
        title="Comisiones"
        description="Porcentaje que se suma al precio de cada IPS. Empresas y particulares solo ven el valor final."
      />

      <div className="grid gap-6 lg:grid-cols-12">
        <Card className="lg:col-span-5">
          <CardHeader>
            <CardTitle className="text-lg">Comisión general</CardTitle>
            <CardDescription>Aplica a todas las citas que no tengan una regla específica.</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <p className="py-4 text-sm text-muted-foreground">Cargando…</p>
            ) : (
              <ComisionGeneralForm key={general?.porcentaje ?? "nueva"} general={general} />
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-7">
          <CardHeader>
            <CardTitle className="text-lg">Nueva regla específica</CardTitle>
            <CardDescription>Define otro porcentaje para una IPS, un servicio o un tipo de cliente. Deja en "Todos" lo que no quieras limitar.</CardDescription>
          </CardHeader>
          <CardContent>
            <NuevaReglaForm ipsList={ipsList} servicios={servicios} comisiones={comisiones} />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Reglas específicas</CardTitle>
          <CardDescription>
            Cuando varias reglas aplican a una misma cita, gana la más específica. La IPS pesa más que el servicio, y el servicio más que el tipo de cliente.
            La lista está ordenada de mayor a menor prioridad.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0 md:p-0">
          {reglas.length === 0 ? (
            <EmptyState compact icon={ListFilter} title="Sin reglas específicas" description="Todas las citas usan la comisión general." />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-surface hover:bg-surface">
                    <TableHead className="pl-5">IPS</TableHead>
                    <TableHead>Servicio</TableHead>
                    <TableHead>Tipo de cliente</TableHead>
                    <TableHead className="w-40">Comisión</TableHead>
                    <TableHead className="pr-5 text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {reglas.map((c) => (
                    <ReglaFila key={c.id} regla={c} ips={nombreIps(c.ips_id)} servicio={nombreServicio(c.servicio_id)} />
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

function ComisionGeneralForm({ general }: { general: Comision | null }) {
  const add = useAddComision();
  const update = useUpdateComision();
  const [valor, setValor] = useState(general ? pctTexto(general.porcentaje) : "0");
  const [submitted, setSubmitted] = useState(false);
  const pct = parsePorcentaje(valor);
  const pending = add.isPending || update.isPending;

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    if (pct == null) return;
    try {
      if (general) await update.mutateAsync({ id: general.id, porcentaje: pct });
      else await add.mutateAsync({ ips_id: null, servicio_id: null, rol: null, porcentaje: pct });
      toast.success("Comisión general actualizada");
    } catch {
      toast.error("No se pudo guardar la comisión", { description: "Inténtalo de nuevo." });
    }
  };

  return (
    <form onSubmit={guardar} noValidate className="space-y-4">
      <FormField id="comision-general" label="Porcentaje" required error={submitted && pct == null ? ERROR_PCT : null}>
        <PctInput value={valor} onChange={setValor} />
      </FormField>
      {pct != null && (
        <p className="flex items-start gap-2 rounded-lg bg-info-soft px-3 py-2 text-[13px] text-info-foreground">
          <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
          Un servicio de {formatPesos(100000)} se mostrará en {formatPesos(Math.round(100000 * (1 + pct / 100)))}.
        </p>
      )}
      <Button type="submit" disabled={pending || (general != null && pct === general.porcentaje)}>
        {pending ? <><Loader2 className="animate-spin" /> Guardando…</> : <><Save /> Guardar</>}
      </Button>
    </form>
  );
}

function NuevaReglaForm({
  ipsList, servicios, comisiones,
}: {
  ipsList: Pick<Profile, "id" | "nombre">[];
  servicios: { id: string; nombre: string }[];
  comisiones: Comision[];
}) {
  const add = useAddComision();
  const [ips, setIps] = useState(TODOS);
  const [servicio, setServicio] = useState(TODOS);
  const [rol, setRol] = useState(TODOS);
  const [valor, setValor] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const pct = parsePorcentaje(valor);
  const regla = {
    ips_id: ips === TODOS ? null : ips,
    servicio_id: servicio === TODOS ? null : servicio,
    rol: rol === TODOS ? null : (rol as NonNullable<Comision["rol"]>),
  };
  const esGeneral = !regla.ips_id && !regla.servicio_id && !regla.rol;
  const repetida = comisiones.some((c) => c.ips_id === regla.ips_id && c.servicio_id === regla.servicio_id && c.rol === regla.rol);
  const errorRegla = esGeneral
    ? "Elige al menos una IPS, un servicio o un tipo de cliente. Para todos, usa la comisión general."
    : repetida
      ? "Ya existe una regla para esta combinación. Cambia su porcentaje en la lista."
      : null;

  const agregar = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    if (errorRegla || pct == null) return;
    try {
      await add.mutateAsync({ ...regla, porcentaje: pct });
      toast.success("Regla agregada");
      setIps(TODOS); setServicio(TODOS); setRol(TODOS); setValor(""); setSubmitted(false);
    } catch (err) {
      toast.error((err as { code?: string })?.code === "23505" ? "Ya existe una regla para esta combinación" : "No se pudo agregar la regla");
    }
  };

  return (
    <form onSubmit={agregar} noValidate className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField id="regla-ips" label="IPS">
          <Select value={ips} onValueChange={setIps}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={TODOS}>Todas las IPS</SelectItem>
              {ipsList.map((i) => <SelectItem key={i.id} value={i.id}>{i.nombre}</SelectItem>)}
            </SelectContent>
          </Select>
        </FormField>
        <FormField id="regla-servicio" label="Servicio">
          <Select value={servicio} onValueChange={setServicio}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={TODOS}>Todos los servicios</SelectItem>
              {servicios.map((s) => <SelectItem key={s.id} value={s.id}>{s.nombre}</SelectItem>)}
            </SelectContent>
          </Select>
        </FormField>
        <FormField id="regla-rol" label="Tipo de cliente">
          <Select value={rol} onValueChange={setRol}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={TODOS}>Empresas y particulares</SelectItem>
              <SelectItem value="empresa">Solo empresas</SelectItem>
              <SelectItem value="particular">Solo particulares</SelectItem>
            </SelectContent>
          </Select>
        </FormField>
        <FormField id="regla-pct" label="Porcentaje" required error={submitted && pct == null ? ERROR_PCT : null}>
          <PctInput value={valor} onChange={setValor} />
        </FormField>
      </div>
      {submitted && errorRegla && (
        <p role="alert" className="rounded-lg bg-warning-soft px-3 py-2 text-[13px] font-medium text-warning-foreground">{errorRegla}</p>
      )}
      <Button type="submit" disabled={add.isPending}>
        {add.isPending ? <><Loader2 className="animate-spin" /> Agregando…</> : <><Plus /> Agregar regla</>}
      </Button>
    </form>
  );
}

function ReglaFila({ regla, ips, servicio }: { regla: Comision; ips: string; servicio: string }) {
  const update = useUpdateComision();
  const remove = useDeleteComision();
  const [valor, setValor] = useState(pctTexto(regla.porcentaje));
  const pct = parsePorcentaje(valor);
  const cambiado = pct !== regla.porcentaje;
  const descripcion = `${ips}, ${servicio}, ${regla.rol ? ROL_LABEL[regla.rol] : "todos los clientes"}`;

  const guardar = () => {
    if (pct == null) return toast.error(ERROR_PCT);
    update.mutate(
      { id: regla.id, porcentaje: pct },
      {
        onSuccess: () => toast.success("Comisión actualizada"),
        onError: () => toast.error("No se pudo actualizar la comisión"),
      },
    );
  };

  return (
    <TableRow>
      <TableCell className="pl-5 font-medium">{ips}</TableCell>
      <TableCell>{servicio}</TableCell>
      <TableCell>{regla.rol ? ROL_LABEL[regla.rol] : "Todos"}</TableCell>
      <TableCell>
        <form onSubmit={(e) => { e.preventDefault(); if (cambiado) guardar(); }}>
          <PctInput value={valor} onChange={setValor} aria-label={`Porcentaje para ${descripcion}`} aria-invalid={pct == null || undefined} />
        </form>
      </TableCell>
      <TableCell className="pr-5">
        <div className="flex justify-end gap-1">
          {cambiado && (
            <Button size="sm" onClick={guardar} disabled={update.isPending}>
              {update.isPending ? <Loader2 className="animate-spin" /> : <Save />} Guardar
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            className="text-danger-foreground hover:bg-danger-soft"
            disabled={remove.isPending}
            onClick={() => remove.mutate(regla.id, {
              onSuccess: () => toast.success("Regla eliminada"),
              onError: () => toast.error("No se pudo eliminar la regla"),
            })}
            aria-label={`Eliminar regla de ${descripcion}`}
          >
            <Trash2 /> Eliminar
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}

function PctInput({ value, onChange, ...rest }: { value: string; onChange: (v: string) => void } & Omit<React.ComponentProps<typeof Input>, "value" | "onChange">) {
  return (
    <div className="relative">
      <Input
        inputMode="decimal"
        autoComplete="off"
        placeholder="0"
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/[^\d.,]/g, ""))}
        className="pr-8 text-right tabular-nums"
        {...rest}
      />
      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground" aria-hidden>%</span>
    </div>
  );
}
