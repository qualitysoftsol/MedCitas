import { useState } from "react";
import { CalendarDays, FileText, Link2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { AppointmentStatusBadge, AptoBadge } from "@/components/app/StatusBadge";
import { useEnlacesIps, type Enlace, type EnlaceCita, type EnlaceResultado } from "@/lib/hooks/useMensajes";
import { formatFechaCorta, formatHora } from "@/lib/format";
import { cn } from "@/lib/utils";

const detalleCita = (c: EnlaceCita) => `${c.empleado_cedula} · ${formatFechaCorta(c.fecha)}, ${formatHora(c.hora)}`;
const detalleResultado = (r: EnlaceResultado) => `${r.empleado_cedula} · ${formatFechaCorta(r.fecha)}`;

/** Botón "Enlazar" que abre un buscador de citas y resultados de la IPS. */
export function EnlaceSelector({
  ipsId,
  onChange,
  disabled,
}: {
  ipsId: string | undefined;
  onChange: (enlace: Enlace) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const { data, isLoading, isError } = useEnlacesIps(open ? ipsId : undefined);

  const elegir = (enlace: Enlace) => {
    onChange(enlace);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" size="sm" disabled={disabled || !ipsId}>
          <Link2 /> Enlazar cita o resultado
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[min(26rem,calc(100vw-2rem))] p-0">
        <Command>
          <CommandInput placeholder="Buscar por paciente o documento…" />
          <CommandList className="max-h-72">
            {isLoading ? (
              <div className="p-4 text-center text-sm text-muted-foreground">Cargando…</div>
            ) : isError ? (
              <div className="p-4 text-center text-sm text-muted-foreground">No pudimos cargar las citas y resultados.</div>
            ) : (
              <>
                <CommandEmpty>No hay coincidencias.</CommandEmpty>
                {!!data?.citas.length && (
                  <CommandGroup heading="Citas">
                    {data.citas.map((c) => (
                      <CommandItem
                        key={c.id}
                        value={`cita ${c.id} ${c.empleado_nombre} ${c.empleado_cedula} ${c.fecha}`}
                        onSelect={() => elegir({ tipo: "cita", id: c.id, cita: c })}
                        className="flex-col items-start gap-0.5"
                      >
                        <span className="font-medium">{c.empleado_nombre}</span>
                        <span className="text-xs text-muted-foreground">{detalleCita(c)} · {c.servicio}</span>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                )}
                {!!data?.resultados.length && (
                  <CommandGroup heading="Resultados">
                    {data.resultados.map((r) => (
                      <CommandItem
                        key={r.id}
                        value={`resultado ${r.id} ${r.empleado_nombre} ${r.empleado_cedula} ${r.fecha}`}
                        onSelect={() => elegir({ tipo: "resultado", id: r.id, resultado: r })}
                        className="flex-col items-start gap-0.5"
                      >
                        <span className="font-medium">{r.empleado_nombre}</span>
                        <span className="text-xs text-muted-foreground">{detalleResultado(r)}</span>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                )}
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

/** Tarjeta de la cita o el resultado enlazado (en un mensaje o antes de enviarlo). */
export function EnlaceTarjeta({
  cita,
  resultado,
  onQuitar,
  className,
}: {
  cita?: EnlaceCita | null;
  resultado?: EnlaceResultado | null;
  onQuitar?: () => void;
  className?: string;
}) {
  if (!cita && !resultado) return null;
  const Icon = cita ? CalendarDays : FileText;
  return (
    <div className={cn("flex items-start gap-2.5 rounded-lg border bg-card p-2.5 text-left text-foreground", className)}>
      <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary-soft text-accent-foreground">
        <Icon className="size-4" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-xs font-medium text-muted-foreground">{cita ? "Cita" : "Resultado"}</div>
        <div className="truncate text-sm font-semibold">{(cita ?? resultado)!.empleado_nombre}</div>
        <div className="text-xs text-muted-foreground">
          {cita ? `${detalleCita(cita)} · ${cita.servicio}` : detalleResultado(resultado!)}
        </div>
        <div className="mt-1.5">
          {cita ? <AppointmentStatusBadge estado={cita.estado} /> : <AptoBadge apto={resultado!.apto} />}
        </div>
      </div>
      {onQuitar && (
        <Button type="button" variant="ghost" size="icon-sm" onClick={onQuitar} aria-label="Quitar enlace">
          <X />
        </Button>
      )}
    </div>
  );
}
