import { Building2, User } from "lucide-react";
import type { Solicitante } from "@/lib/hooks/useAppointments";
import { cn } from "@/lib/utils";

/**
 * Quién solicitó la cita, visto por la IPS: nombre de la empresa con su icono,
 * o "Particular" cuando la persona agendó por su cuenta.
 */
export function SolicitanteTag({
  solicitante, loading, className,
}: {
  solicitante: Solicitante | undefined;
  loading?: boolean;
  className?: string;
}) {
  if (loading) return <span className={cn("text-xs text-muted-foreground", className)}>Cargando…</span>;
  if (!solicitante) return <span className={cn("text-xs text-muted-foreground", className)}>No disponible</span>;
  if (solicitante.role === "particular") {
    return (
      <span className={cn("inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground", className)}>
        <User className="size-3" aria-hidden /> Particular
      </span>
    );
  }
  return (
    <span className={cn("inline-flex min-w-0 items-center gap-1.5 font-medium", className)} title={solicitante.nombre}>
      <Building2 className="size-3.5 shrink-0 text-accent-foreground" aria-hidden />
      <span className="truncate">{solicitante.nombre}</span>
      <span className="sr-only"> (empresa)</span>
    </span>
  );
}
