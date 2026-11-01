import {
  CalendarCheck, CheckCircle2, XCircle, FileCheck2, Hourglass, ShieldCheck, ShieldAlert, ShieldX, CreditCard, TimerOff,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { Appointment, Resultado } from "@/lib/database.types";
import { toneClasses, type Tone } from "./StatCard";

interface StatusDef { label: string; tone: Tone; icon: React.ComponentType<{ className?: string }> }

// Cada estado combina color + icono + texto: nunca se comunica solo con color.
export const APPOINTMENT_STATUS: Record<Appointment["estado"], StatusDef> = {
  pendiente_pago: { label: "Pendiente de pago", tone: "warning", icon: CreditCard },
  agendada: { label: "Agendada", tone: "success", icon: CalendarCheck },
  atendida: { label: "Atendida", tone: "info", icon: CheckCircle2 },
  cancelada: { label: "Cancelada", tone: "danger", icon: XCircle },
  expirada: { label: "Reserva vencida", tone: "neutral", icon: TimerOff },
};

export type ResultadoEstado = "disponible" | "procesamiento";

export const RESULTADO_STATUS: Record<ResultadoEstado, StatusDef> = {
  disponible: { label: "Disponible", tone: "success", icon: FileCheck2 },
  procesamiento: { label: "En procesamiento", tone: "warning", icon: Hourglass },
};

export const APTO_STATUS: Record<Resultado["apto"], StatusDef> = {
  apto: { label: "Apto", tone: "success", icon: ShieldCheck },
  apto_restricciones: { label: "Apto con restricciones", tone: "warning", icon: ShieldAlert },
  no_apto: { label: "No apto", tone: "danger", icon: ShieldX },
};

export function StatusPill({ def, className }: { def: StatusDef; className?: string }) {
  const Icon = def.icon;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold",
        toneClasses[def.tone],
        className,
      )}
    >
      <Icon className="size-3.5" aria-hidden />
      {def.label}
    </span>
  );
}

export function AppointmentStatusBadge({ estado, className }: { estado: Appointment["estado"]; className?: string }) {
  return <StatusPill def={APPOINTMENT_STATUS[estado]} className={className} />;
}

export function ResultadoStatusBadge({ estado, className }: { estado: ResultadoEstado; className?: string }) {
  return <StatusPill def={RESULTADO_STATUS[estado]} className={className} />;
}

export function AptoBadge({ apto, className }: { apto: Resultado["apto"]; className?: string }) {
  return <StatusPill def={APTO_STATUS[apto]} className={className} />;
}
