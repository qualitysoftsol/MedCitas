import { cloneElement, forwardRef, isValidElement, useState, type ReactElement, type ReactNode } from "react";
import { AlertCircle, Eye, EyeOff, Check, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

interface FormFieldProps {
  id: string;
  label: string;
  children: ReactElement<Record<string, unknown>>;
  hint?: ReactNode;
  error?: string | null;
  required?: boolean;
  className?: string;
}

/**
 * Etiqueta + control + ayuda/error. Asocia `htmlFor`, `aria-describedby` y
 * `aria-invalid` al control hijo para lectores de pantalla.
 */
export function FormField({ id, label, children, hint, error, required, className }: FormFieldProps) {
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [errorId, hintId].filter(Boolean).join(" ") || undefined;
  const control = isValidElement(children)
    ? cloneElement(children, {
        id,
        "aria-invalid": error ? true : undefined,
        "aria-describedby": describedBy,
        "aria-required": required || undefined,
      })
    : children;

  return (
    <div className={cn("space-y-1.5", className)}>
      <Label htmlFor={id} className="text-[13px] font-semibold text-foreground">
        {label}
        {required && <span className="ml-0.5 text-danger-foreground" aria-hidden>*</span>}
      </Label>
      {control}
      {error ? (
        <p id={errorId} className="flex items-center gap-1.5 text-[13px] font-medium text-danger-foreground">
          <AlertCircle className="size-3.5 shrink-0" aria-hidden /> {error}
        </p>
      ) : hint ? (
        <p id={hintId} className="text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}

/** Input con icono a la izquierda. */
export const IconInput = forwardRef<HTMLInputElement, React.ComponentProps<typeof Input> & { icon: React.ComponentType<{ className?: string }> }>(
  ({ icon: Icon, className, ...props }, ref) => (
    <div className="relative">
      <Icon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
      <Input ref={ref} className={cn("pl-9", className)} {...props} />
    </div>
  ),
);
IconInput.displayName = "IconInput";

/** Contraseña con botón para mostrar u ocultar. */
export const PasswordInput = forwardRef<HTMLInputElement, React.ComponentProps<typeof Input>>(({ className, ...props }, ref) => {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <Input ref={ref} type={visible ? "text" : "password"} className={cn("pr-11", className)} {...props} />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        className="absolute right-1 top-1/2 flex size-8 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label={visible ? "Ocultar contraseña" : "Mostrar contraseña"}
        aria-pressed={visible}
      >
        {visible ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
      </button>
    </div>
  );
});
PasswordInput.displayName = "PasswordInput";

export const PASSWORD_RULES = [
  { id: "len", label: "Mínimo 8 caracteres", test: (p: string) => p.length >= 8 },
  { id: "upper", label: "Al menos una mayúscula", test: (p: string) => /[A-ZÁÉÍÓÚÑ]/.test(p) },
  { id: "num", label: "Al menos un número", test: (p: string) => /\d/.test(p) },
  { id: "special", label: "Al menos un carácter especial", test: (p: string) => /[^A-Za-z0-9ÁÉÍÓÚÑáéíóúñ]/.test(p) },
] as const;

/** Lista de requisitos que se marca en vivo mientras se escribe. */
export function PasswordChecklist({ password, id }: { password: string; id?: string }) {
  return (
    <ul id={id} className="space-y-1.5" aria-label="Requisitos de la contraseña">
      {PASSWORD_RULES.map((r) => {
        const ok = r.test(password);
        return (
          <li key={r.id} className={cn("flex items-center gap-2 text-[13px] transition-colors", ok ? "text-success-foreground" : "text-muted-foreground")}>
            <span className={cn("flex size-4 items-center justify-center rounded-full", ok ? "bg-success text-white" : "border border-input")}>
              {ok ? <Check className="size-3" strokeWidth={3} aria-hidden /> : <X className="size-2.5 opacity-50" aria-hidden />}
            </span>
            {r.label}
            <span className="sr-only">{ok ? ": cumplido" : ": pendiente"}</span>
          </li>
        );
      })}
    </ul>
  );
}
