import { Stethoscope } from "lucide-react";
import { cn } from "@/lib/utils";

/** Marca MedCitas: estetoscopio sobre turquesa + nombre (mismo isotipo que el inicio de sesión). */
export function Logo({ collapsed, className }: { collapsed?: boolean; className?: string }) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <div
        className="flex size-9 shrink-0 items-center justify-center rounded-xl text-primary-foreground shadow-sm"
        style={{ background: "var(--gradient-primary)" }}
        aria-hidden
      >
        <Stethoscope className="size-5" />
      </div>
      {!collapsed && <span className="text-lg font-bold tracking-tight text-foreground">MedCitas</span>}
    </div>
  );
}
