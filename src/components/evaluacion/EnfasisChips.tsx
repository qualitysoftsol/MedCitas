import { Check } from "lucide-react";
import type { Enfasis } from "@/lib/database.types";
import { Skeleton } from "@/components/ui/skeleton";
import { chipClass } from "@/components/solicitar/useIpsSearch";

/**
 * Énfasis (riesgos del cargo) de selección múltiple. Un énfasis excluyente
 * ("Ninguno especial") quita los demás, y elegir otro quita el excluyente.
 */
export function EnfasisChips({
  enfasis, loading, value, onChange, error, legend, description,
}: {
  enfasis: Enfasis[];
  loading: boolean;
  value: string[];
  onChange: (ids: string[]) => void;
  error?: string | null;
  legend: string;
  description: string;
}) {
  const toggle = (e: Enfasis) => {
    if (value.includes(e.id)) return onChange(value.filter((id) => id !== e.id));
    if (e.exclusivo) return onChange([e.id]);
    const excluyentes = new Set(enfasis.filter((x) => x.exclusivo).map((x) => x.id));
    onChange([...value.filter((id) => !excluyentes.has(id)), e.id]);
  };

  return (
    <fieldset>
      <legend className="text-[13px] font-semibold">{legend} <span className="text-danger-foreground" aria-hidden>*</span></legend>
      <p className="mb-2.5 text-[13px] text-muted-foreground">{description}</p>
      {loading ? (
        <div className="flex flex-wrap gap-2">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-9 w-36 rounded-full" />)}</div>
      ) : (
        <div className="flex flex-wrap gap-2" role="group" aria-label={legend}>
          {enfasis.map((e) => {
            const on = value.includes(e.id);
            return (
              <button key={e.id} type="button" aria-pressed={on} onClick={() => toggle(e)} className={chipClass(on)}>
                {on && <Check className="size-3.5" aria-hidden />}
                {e.nombre}
              </button>
            );
          })}
        </div>
      )}
      {error && <p className="mt-1.5 text-[13px] font-medium text-danger-foreground">{error}</p>}
    </fieldset>
  );
}
