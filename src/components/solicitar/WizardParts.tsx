import type { ReactNode, RefObject } from "react";
import { Check, ChevronLeft, ChevronRight, Pencil } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatPesos } from "@/lib/format";
import { cn } from "@/lib/utils";

export interface WizardStep {
  id: number;
  title: string;
  short: string;
  icon: React.ComponentType<{ className?: string }>;
}

/** Progreso del asistente: barra en móvil, pasos con conectores en tablet y escritorio. */
export function Stepper({
  steps, step, maxStep, onGo,
}: {
  steps: readonly WizardStep[];
  step: number;
  maxStep: number;
  onGo: (s: number) => void;
}) {
  const total = steps.length;
  return (
    <nav aria-label="Progreso de la solicitud">
      <div className="md:hidden">
        <div className="flex items-center justify-between text-sm">
          <span className="font-semibold">{steps[step - 1].title}</span>
          <span className="text-muted-foreground">Paso {step} de {total}</span>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuemin={1} aria-valuemax={total} aria-valuenow={step} aria-label="Progreso">
          <div className="h-full rounded-full bg-primary transition-all duration-300" style={{ width: `${(step / total) * 100}%` }} />
        </div>
      </div>
      <ol className="hidden items-center rounded-xl border bg-card p-3 shadow-sm md:flex">
        {steps.map((s, i) => {
          const complete = s.id < step;
          const current = s.id === step;
          const reachable = s.id <= maxStep && !current;
          return (
            <li key={s.id} className="flex flex-1 items-center last:flex-none">
              <button
                type="button"
                onClick={() => onGo(s.id)}
                disabled={!reachable}
                aria-current={current ? "step" : undefined}
                className={cn(
                  "flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  reachable && "hover:bg-muted",
                  !reachable && !current && "cursor-default",
                )}
              >
                <span
                  className={cn(
                    "flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-bold transition-colors",
                    current && "bg-primary text-primary-foreground ring-4 ring-primary/15",
                    complete && "bg-success text-white",
                    !current && !complete && "bg-muted text-muted-foreground",
                  )}
                >
                  {complete ? <Check className="size-4" strokeWidth={3} aria-hidden /> : s.id}
                </span>
                <span className={cn("hidden text-sm lg:inline", current ? "font-semibold" : complete ? "font-medium" : "text-muted-foreground")}>
                  {s.title}
                </span>
                <span className={cn("text-sm lg:hidden", current ? "font-semibold" : "sr-only")}>{s.short}</span>
                <span className="sr-only">{complete ? " (completado)" : current ? " (paso actual)" : ""}</span>
              </button>
              {i < steps.length - 1 && (
                <span className={cn("mx-2 h-0.5 flex-1 rounded-full", complete ? "bg-success" : "bg-border")} aria-hidden />
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

/** Título de cada paso; recibe el foco al cambiar de paso. */
export function StepHeading({
  refEl, step, total, description, actions,
}: {
  refEl: RefObject<HTMLHeadingElement | null>;
  step: WizardStep;
  total: number;
  description: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <CardHeader>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-accent-foreground">
            <step.icon className="size-5" aria-hidden />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Paso {step.id} de {total}</p>
            <h2 ref={refEl} tabIndex={-1} className="text-lg font-semibold focus:outline-none">{step.title}</h2>
          </div>
        </div>
        {actions}
      </div>
      <p className="text-sm text-muted-foreground">{description}</p>
    </CardHeader>
  );
}

export interface ResumenRow {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string | null;
}

/** Resumen lateral de lo elegido hasta el momento. */
export function Resumen({ className, rows, title = "Resumen de tu cita" }: { className?: string; rows: ResumenRow[]; title?: string }) {
  return (
    <aside className={className} aria-label={title}>
      <Card className="lg:sticky lg:top-24">
        <CardHeader className="pb-3"><CardTitle>{title}</CardTitle></CardHeader>
        <CardContent>
          <ul className="space-y-3">
            {rows.map((r) => (
              <li key={r.label} className="flex gap-3">
                <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-lg", r.value ? "bg-primary-soft text-accent-foreground" : "bg-muted text-muted-foreground")}>
                  <r.icon className="size-4" aria-hidden />
                </span>
                <span className="min-w-0">
                  <span className="block text-xs text-muted-foreground">{r.label}</span>
                  <span className={cn("block text-sm", r.value ? "font-medium" : "text-muted-foreground")}>{r.value ?? "Pendiente"}</span>
                </span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </aside>
  );
}

export function ConfirmRow({
  icon: Icon, label, value, sub, onEdit,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: ReactNode;
  sub?: string;
  onEdit?: () => void;
}) {
  return (
    <div className="flex items-center gap-3 p-4">
      <Icon className="size-5 shrink-0 text-muted-foreground" aria-hidden />
      <div className="min-w-0 flex-1">
        <dt className="text-xs text-muted-foreground">{label}</dt>
        <dd className="font-medium">{value}</dd>
        {sub && <dd className="text-[13px] text-muted-foreground">{sub}</dd>}
      </div>
      {onEdit && (
        <Button variant="ghost" size="sm" onClick={onEdit} aria-label={`Editar ${label.toLowerCase()}`}>
          <Pencil /> <span className="hidden sm:inline">Editar</span>
        </Button>
      )}
    </div>
  );
}

/** Barra Atrás / Continuar: fija abajo en móvil. */
export function WizardNav({
  step, total, onBack, onNext, nextDisabled, finalAction,
}: {
  step: number;
  total: number;
  onBack: () => void;
  onNext: () => void;
  nextDisabled?: boolean;
  finalAction: ReactNode;
}) {
  return (
    <div className="sticky bottom-0 z-10 -mx-4 border-t bg-card/95 px-4 py-3 backdrop-blur md:static md:mx-0 md:rounded-xl md:border md:shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <Button variant="ghost" onClick={onBack} disabled={step === 1} className={cn(step === 1 && "invisible")}>
          <ChevronLeft /> Atrás
        </Button>
        <span className="text-sm text-muted-foreground md:hidden">Paso {step} de {total}</span>
        {step < total ? (
          <Button onClick={onNext} size="lg" disabled={nextDisabled}>
            Continuar <ChevronRight />
          </Button>
        ) : (
          finalAction
        )}
      </div>
    </div>
  );
}

/** Tarjeta de éxito al terminar la solicitud. */
export function SuccessCard({
  headingRef, title, subtitle, children,
}: {
  headingRef: RefObject<HTMLHeadingElement | null>;
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  return (
    <div className="mx-auto max-w-xl py-6">
      <Card className="overflow-hidden text-center">
        <div className="bg-success-soft px-6 pb-6 pt-8">
          <div className="mx-auto flex size-16 items-center justify-center rounded-full bg-success text-white shadow-md animate-in zoom-in-50 duration-300">
            <Check className="size-8" strokeWidth={3} aria-hidden />
          </div>
          <h1 ref={headingRef} tabIndex={-1} className="mt-4 text-2xl font-bold focus:outline-none">{title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
        </div>
        <CardContent className="space-y-4 pt-6 text-left">{children}</CardContent>
      </Card>
    </div>
  );
}

/** Valor a pagar, destacado en la confirmación. */
export function TotalRow({ label = "Valor total", valor, detalle }: { label?: string; valor: number; detalle?: string }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-xl border-2 border-primary/30 bg-primary-soft px-4 py-3">
      <div>
        <p className="font-semibold">{label}</p>
        {detalle && <p className="text-[13px] text-muted-foreground">{detalle}</p>}
      </div>
      <p className="shrink-0 text-2xl font-bold tabular-nums">{formatPesos(valor)}</p>
    </div>
  );
}
