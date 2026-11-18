import { Info } from "lucide-react";
import type { TipoEvaluacion } from "@/lib/database.types";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FormField } from "@/components/app/FormField";
import {
  DIAS_MIN_AUSENCIA, DIAS_MIN_INCAPACIDAD, MOTIVOS_PERIODICA, MOTIVOS_RETORNO, diasAusencia, diasIncapacidad,
  type DatosEvaluacion, type ErroresDatos,
} from "@/lib/datosEvaluacion";
import { hoyISO } from "@/lib/format";
import { cn } from "@/lib/utils";

const EXTERNA = "__externa__";

/** Una evaluación anterior que puede ser la referencia de un seguimiento. */
export interface Referencia { id: string; label: string }

/** Tarjetas para elegir el motivo (tipo de evaluación). */
export function MotivoPicker({
  tipos, loading, value, onChange, error,
}: {
  tipos: TipoEvaluacion[];
  loading: boolean;
  value: string;
  onChange: (codigo: string) => void;
  error?: string | null;
}) {
  return (
    <fieldset>
      <legend className="mb-2 text-[13px] font-semibold">Motivo de la evaluación <span className="text-danger-foreground" aria-hidden>*</span></legend>
      {loading ? (
        <div className="grid gap-3 sm:grid-cols-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-20" />)}</div>
      ) : tipos.length === 0 ? (
        <p className="rounded-lg bg-warning-soft px-3 py-2 text-sm text-warning-foreground">No hay tipos de evaluación habilitados para tu cuenta. Contacta a soporte.</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" role="radiogroup" aria-label="Motivo de la evaluación">
          {tipos.map((t) => {
            const active = value === t.codigo;
            return (
              <label
                key={t.id}
                className={cn(
                  "flex cursor-pointer items-start gap-3 rounded-xl border-2 p-3.5 transition-colors focus-within:ring-2 focus-within:ring-ring",
                  active ? "border-primary bg-primary-soft" : "border-border hover:border-primary/40",
                )}
              >
                <input type="radio" name="motivo-evaluacion" value={t.codigo} checked={active} onChange={() => onChange(t.codigo)} className="sr-only" />
                <span className={cn("mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border-2", active ? "border-primary" : "border-input")} aria-hidden>
                  {active && <span className="size-2.5 rounded-full bg-primary" />}
                </span>
                <span>
                  <span className="block font-semibold leading-snug">{t.nombre}</span>
                  {t.descripcion && <span className="block text-[13px] leading-snug text-muted-foreground">{t.descripcion}</span>}
                </span>
              </label>
            );
          })}
        </div>
      )}
      {error && <p className="mt-1.5 text-[13px] font-medium text-danger-foreground">{error}</p>}
    </fieldset>
  );
}

type Voz = "particular" | "empresa";

// Textos del recuadro de datos de cada tipo: el particular habla de sí mismo; la empresa, del empleado.
const PANEL: Record<Voz, Record<string, string>> = {
  particular: {
    PRE_INGRESO: "Se hace antes de firmar el contrato.",
    PERIODICA: "Indica si es el control de rutina o si cambiaste de ocupación.",
    EGRESO: "Registra cómo está tu salud al momento del retiro.",
    POST_INCAPACIDAD: "Calculamos los días de incapacidad con estas fechas.",
    RETORNO: "Por ejemplo, una licencia no remunerada larga.",
    SEGUIMIENTO: "Elige la evaluación que originó el control.",
  },
  empresa: {
    PRE_INGRESO: "Se hace antes de firmar el contrato. Usamos el nombre de tu empresa y el cargo del empleado.",
    PERIODICA: "Indica si es el control de rutina o si el empleado cambió de ocupación.",
    EGRESO: "Registra cómo está la salud del empleado al momento del retiro.",
    POST_INCAPACIDAD: "Calculamos los días de incapacidad con estas fechas.",
    RETORNO: "Por ejemplo, una licencia no remunerada larga.",
    SEGUIMIENTO: "Elige la evaluación que originó el control.",
  },
};

/** Recuadro con los datos que pide el tipo de evaluación elegido. */
export function DatosEvaluacionForm({
  tipo, datos, onChange, errores, mostrarErrores, referencias, voz = "particular", campoCargo,
}: {
  tipo: TipoEvaluacion;
  datos: DatosEvaluacion;
  onChange: (d: DatosEvaluacion) => void;
  errores: ErroresDatos;
  mostrarErrores: boolean;
  /** Seguimiento: evaluaciones atendidas de esta persona. */
  referencias: Referencia[];
  /**
   * "empresa": la empresa y el cargo salen de quien agenda y del empleado, así
   * que no se piden; en Periódica por cambio de ocupación se muestra `campoCargo`.
   */
  voz?: Voz;
  campoCargo?: React.ReactNode;
}) {
  const empresa = voz === "empresa";
  const set = (campo: keyof DatosEvaluacion, v: string) => onChange({ ...datos, [campo]: v });
  const err = (campo: keyof ErroresDatos) => (mostrarErrores ? errores[campo] ?? null : null);
  const hoy = hoyISO();
  const id = (campo: string) => `datos-${tipo.codigo}-${campo}`;

  const texto = (campo: keyof DatosEvaluacion, label: string, placeholder: string) => (
    <FormField id={id(campo)} label={label} required error={err(campo)}>
      <Input value={(datos[campo] as string) ?? ""} onChange={(e) => set(campo, e.target.value)} placeholder={placeholder} />
    </FormField>
  );
  const fecha = (campo: keyof DatosEvaluacion, label: string, max?: string) => (
    <FormField id={id(campo)} label={label} required error={err(campo)}>
      <Input type="date" max={max} value={(datos[campo] as string) ?? ""} onChange={(e) => set(campo, e.target.value)} />
    </FormField>
  );
  const lista = (campo: keyof DatosEvaluacion, label: string, opciones: readonly { value: string; label: string }[]) => (
    <FormField id={id(campo)} label={label} required error={err(campo)}>
      <Select value={(datos[campo] as string) ?? ""} onValueChange={(v) => set(campo, v)}>
        <SelectTrigger><SelectValue placeholder="Elige una opción" /></SelectTrigger>
        <SelectContent>
          {opciones.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
        </SelectContent>
      </Select>
    </FormField>
  );

  const nota = (children: React.ReactNode, tono: "info" | "danger" = "info") => (
    <p
      role={tono === "danger" ? "alert" : undefined}
      className={cn(
        "flex items-start gap-2 rounded-lg px-3 py-2 text-[13px]",
        tono === "danger" ? "bg-danger-soft font-medium text-danger-foreground" : "bg-info-soft text-info-foreground",
      )}
    >
      <Info className="mt-0.5 size-4 shrink-0" aria-hidden /> <span>{children}</span>
    </p>
  );

  const nInc = diasIncapacidad(datos);
  const nAus = diasAusencia(datos);
  const valorReferencia = datos.externa ? EXTERNA : datos.referencia_id ?? "";

  return (
    <section className="space-y-4 rounded-xl border bg-primary-soft/40 p-4" aria-labelledby={id("titulo")}>
      <div>
        <h3 id={id("titulo")} className="font-semibold">Datos para la evaluación {tipo.nombre.toLowerCase()}</h3>
        <p className="text-[13px] text-muted-foreground">{PANEL[voz][tipo.codigo]}</p>
      </div>

      {tipo.codigo === "PRE_INGRESO" && !empresa && (
        <div className="grid gap-4 sm:grid-cols-2">
          {texto("empresa", "Empresa que te contrata", "Ej.: Constructora Andina S.A.S.")}
          {texto("cargo", "Cargo al que aspiras", "Ej.: Auxiliar de bodega")}
        </div>
      )}

      {tipo.codigo === "PERIODICA" && (
        <div className="grid gap-4 sm:grid-cols-2">
          {lista("motivo", "Motivo", MOTIVOS_PERIODICA)}
          {!empresa
            ? texto("cargo", "Cargo actual o nuevo", "Ej.: Operario de montacargas")
            : datos.motivo === "cambio_ocupacion" && campoCargo}
        </div>
      )}

      {tipo.codigo === "EGRESO" && (
        <div className="grid gap-4 sm:grid-cols-2">
          {fecha("fecha_retiro", "Fecha de retiro")}
          {!empresa && texto("empresa", "Empresa de la que te retiras", "Ej.: Logística del Centro S.A.S.")}
        </div>
      )}

      {tipo.codigo === "POST_INCAPACIDAD" && (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            {fecha("inicio", "Inicio de la incapacidad", hoy)}
            {fecha("fin", "Fin de la incapacidad")}
          </div>
          {errores.general
            ? nota(errores.general, "danger")
            : nota(<>Aplica cuando la incapacidad fue de {DIAS_MIN_INCAPACIDAD} días calendario o más.{nInc != null && nInc > 0 ? <> {empresa ? "Incapacidad" : "Tu incapacidad"}: <strong>{nInc} días</strong>.</> : ` Si fue menor, no ${empresa ? "se necesita" : "necesitas"} esta evaluación y te lo diremos aquí.`}</>)}
        </>
      )}

      {tipo.codigo === "RETORNO" && (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            {lista("motivo", "Motivo de la ausencia", MOTIVOS_RETORNO)}
            {fecha("inicio", "Inicio de la ausencia", hoy)}
            {fecha("regreso", "Fecha de regreso")}
          </div>
          {errores.general
            ? nota(errores.general, "danger")
            : nota(<>Aplica cuando {empresa ? "el empleado estuvo ausente" : "estuviste ausente"} por causas no médicas {DIAS_MIN_AUSENCIA} días calendario o más.{nAus != null && nAus >= 0 ? <> {empresa ? "Ausencia" : "Tu ausencia"}: <strong>{nAus} días</strong>.</> : null}</>)}
        </>
      )}

      {tipo.codigo === "SEGUIMIENTO" && (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField id={id("referencia")} label="Evaluación de referencia" required error={err("referencia_id")}>
              <Select
                value={valorReferencia}
                onValueChange={(v) =>
                  onChange(v === EXTERNA
                    ? { ...datos, referencia_id: undefined, externa: datos.externa ?? {} }
                    : { ...datos, referencia_id: v, externa: undefined })}
              >
                <SelectTrigger><SelectValue placeholder="Elige la evaluación" /></SelectTrigger>
                <SelectContent>
                  {referencias.map((r) => <SelectItem key={r.id} value={r.id}>{r.label}</SelectItem>)}
                  <SelectItem value={EXTERNA}>Evaluación en otra IPS</SelectItem>
                </SelectContent>
              </Select>
            </FormField>
            {texto("que_controlar", "¿Qué se va a controlar?", "Ej.: Repetir audiometría")}
          </div>
          {datos.externa && (
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField id={id("externa-fecha")} label="Fecha de esa evaluación" required error={err("externa_fecha")}>
                <Input type="date" max={hoy} value={datos.externa.fecha ?? ""} onChange={(e) => onChange({ ...datos, externa: { ...datos.externa, fecha: e.target.value } })} />
              </FormField>
              <FormField id={id("externa-tipo")} label="Tipo de evaluación" required error={err("externa_tipo")}>
                <Input value={datos.externa.tipo ?? ""} onChange={(e) => onChange({ ...datos, externa: { ...datos.externa, tipo: e.target.value } })} placeholder="Ej.: Pre-ingreso" />
              </FormField>
            </div>
          )}
          {referencias.length === 0 && !datos.externa && nota(empresa
            ? "Este empleado no tiene evaluaciones atendidas que hayas agendado en MedCitas. Si se la hizo en otra IPS, elige «Evaluación en otra IPS»."
            : "No tienes evaluaciones atendidas en MedCitas. Si te la hiciste en otra IPS, elige «Evaluación en otra IPS».")}
        </>
      )}
    </section>
  );
}
