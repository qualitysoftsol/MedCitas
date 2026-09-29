import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

export type Tone = "primary" | "success" | "warning" | "danger" | "info" | "neutral";

export const toneClasses: Record<Tone, string> = {
  primary: "bg-primary-soft text-accent-foreground",
  success: "bg-success-soft text-success-foreground",
  warning: "bg-warning-soft text-warning-foreground",
  danger: "bg-danger-soft text-danger-foreground",
  info: "bg-info-soft text-info-foreground",
  neutral: "bg-muted text-muted-foreground",
};

interface StatCardProps {
  label: string;
  value: ReactNode;
  icon: React.ComponentType<{ className?: string }>;
  tone?: Tone;
  hint?: ReactNode;
  loading?: boolean;
  className?: string;
}

/** Indicador de resumen: icono con tono semántico, valor y etiqueta. */
export function StatCard({ label, value, icon: Icon, tone = "primary", hint, loading, className }: StatCardProps) {
  return (
    <div className={cn("flex items-center gap-4 rounded-xl border bg-card p-4 shadow-sm md:p-5", className)}>
      <div className={cn("flex size-12 shrink-0 items-center justify-center rounded-xl", toneClasses[tone])}>
        <Icon className="size-6" aria-hidden />
      </div>
      <div className="min-w-0">
        {loading ? (
          <Skeleton className="mb-1 h-7 w-10" />
        ) : (
          <div className="text-2xl font-bold leading-tight text-foreground tabular-nums">{value}</div>
        )}
        <div className="text-sm text-muted-foreground">{label}</div>
        {hint && <div className="mt-0.5 text-xs text-muted-foreground">{hint}</div>}
      </div>
    </div>
  );
}
