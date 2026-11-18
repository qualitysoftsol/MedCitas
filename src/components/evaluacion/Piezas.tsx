import type { ReactNode, RefObject } from "react";
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Indicacion } from "@/lib/datosEvaluacion";
import { cn } from "@/lib/utils";

// Piezas de Solicitar cita compartidas por los flujos de particular y empresa.

/** "PASO 1 DE 4" + título (recibe el foco al cambiar de paso) + descripción. */
export function Encabezado({
  refEl, paso, total, titulo, descripcion,
}: {
  refEl: RefObject<HTMLHeadingElement | null>;
  paso: number;
  total: number;
  titulo: string;
  descripcion?: ReactNode;
}) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Paso {paso} de {total}</p>
      <h2 ref={refEl} tabIndex={-1} className="mt-1 text-xl font-bold focus:outline-none">{titulo}</h2>
      {descripcion && <p className="mt-1 text-sm text-muted-foreground">{descripcion}</p>}
    </div>
  );
}

/** Atrás o Cancelar a la izquierda, la acción principal a la derecha. */
export function PasoNav({ atras, siguiente }: { atras: ReactNode; siguiente: ReactNode }) {
  return <div className="flex items-center justify-between gap-3">{atras}{siguiente}</div>;
}

/** Tarjeta lateral con lo elegido hasta el momento. */
export function PanelResumen({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <section aria-label={titulo} className="rounded-2xl border bg-card p-5 shadow-sm">
      <h2 className="mb-3 font-semibold">{titulo}</h2>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

export function Dato({ label, sub, children }: { label: string; sub?: string; children: ReactNode }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <div className={cn("text-sm", children ? "font-semibold" : "text-muted-foreground")}>{children || "Pendiente"}</div>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

/** Fila de la revisión final, con "Cambiar" o una nota a la derecha. */
export function FilaRevision({ label, valor, nota, onCambiar }: { label: string; valor: ReactNode; nota?: string; onCambiar?: () => void }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <div className="min-w-0 flex-1">
        <dt className="text-xs text-muted-foreground">{label}</dt>
        <dd className="font-medium">{valor}</dd>
      </div>
      {onCambiar ? (
        <Button variant="ghost" size="sm" onClick={onCambiar} aria-label={`Cambiar ${label.toLowerCase()}`}>Cambiar</Button>
      ) : nota ? (
        <span className="text-xs text-muted-foreground">{nota}</span>
      ) : null}
    </div>
  );
}

export function ListaIndicaciones({ indicaciones }: { indicaciones: Indicacion[] }) {
  return (
    <ul className="list-disc space-y-1 pl-5 text-[13px]">
      {indicaciones.map((i, n) => (
        <li key={n}>{i.texto}{i.origen && <span className="text-muted-foreground"> ({i.origen.toLowerCase()})</span>}</li>
      ))}
    </ul>
  );
}

/** Recuadro "Antes de tu cita" con las indicaciones de las pruebas y del tipo. */
export function AntesDeTuCita({ indicaciones, titulo = "Antes de tu cita" }: { indicaciones: Indicacion[]; titulo?: string }) {
  return (
    <section aria-label={titulo} className="rounded-xl border border-warning/40 bg-warning-soft p-4 text-warning-foreground">
      <h3 className="mb-2 font-semibold">{titulo}</h3>
      <ListaIndicaciones indicaciones={indicaciones} />
    </section>
  );
}

/** Las mismas indicaciones, plegadas, para la revisión final. */
export function IndicacionesPlegables({ indicaciones, titulo = "Antes de tu cita" }: { indicaciones: Indicacion[]; titulo?: string }) {
  return (
    <details className="group rounded-xl border border-warning/40 bg-warning-soft">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm font-semibold text-warning-foreground">
        <ChevronDown className="size-4 transition-transform group-open:rotate-180" aria-hidden />
        {titulo} ({indicaciones.length} {indicaciones.length === 1 ? "indicación" : "indicaciones"})
      </summary>
      <div className="px-4 pb-3"><ListaIndicaciones indicaciones={indicaciones} /></div>
    </details>
  );
}
