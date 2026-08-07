import { useIpsFotos } from "@/lib/hooks/useIpsFotos";
import { useState } from "react";
import { ChevronLeft, ChevronRight, Stethoscope } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { Profile } from "@/lib/database.types";
import { useServicios, derivarClasificaciones } from "@/lib/hooks/useCatalogos";

interface Props {
  ips: Profile;
  distancia: number;
  onConfirm: () => void;
}

export function IpsDetailPanel({ ips, distancia, onConfirm }: Props) {
  const { data: fotos = [] } = useIpsFotos(ips.id);
  const { data: catalogoServicios = [] } = useServicios();
  const [current, setCurrent] = useState(0);

  const clasificacionesDerived = derivarClasificaciones(ips.servicios ?? [], catalogoServicios);

  const prev = () => setCurrent((c) => Math.max(0, c - 1));
  const next = () => setCurrent((c) => Math.min(fotos.length - 1, c + 1));

  return (
    <div className="space-y-3">
      {fotos.length > 0 ? (
        <div className="relative rounded-md overflow-hidden border aspect-video">
          <img src={fotos[current].url} alt={`Foto ${current + 1}`} className="w-full h-full object-cover" />
          {fotos.length > 1 && (
            <>
              <button
                onClick={prev}
                disabled={current === 0}
                className="absolute left-2 top-1/2 -translate-y-1/2 bg-background/80 rounded-full p-1 disabled:opacity-30"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={next}
                disabled={current === fotos.length - 1}
                className="absolute right-2 top-1/2 -translate-y-1/2 bg-background/80 rounded-full p-1 disabled:opacity-30"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
              <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1">
                {fotos.map((_, i) => (
                  <button
                    key={i}
                    onClick={() => setCurrent(i)}
                    className={`w-1.5 h-1.5 rounded-full transition-colors ${i === current ? 'bg-white' : 'bg-white/50'}`}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      ) : (
        <div className="rounded-md border aspect-video flex items-center justify-center bg-muted">
          <Stethoscope className="w-10 h-10 text-muted-foreground" />
        </div>
      )}

      <div>
        <div className="font-semibold text-base">{ips.nombre}</div>
        <div className="text-sm text-muted-foreground">{ips.direccion} · {distancia.toFixed(1)} km</div>
      </div>

      {(ips.servicios ?? []).length > 0 && (
        <div className="flex flex-wrap gap-1">
          {ips.servicios!.map((s) => (
            <Badge key={s} variant="secondary" className="text-xs">{s}</Badge>
          ))}
        </div>
      )}

      {clasificacionesDerived.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {clasificacionesDerived.map((c) => (
            <Badge key={c} variant="outline" className="text-xs">{c}</Badge>
          ))}
        </div>
      )}

      <Button className="w-full" onClick={onConfirm}>Confirmar selección y ver horarios</Button>
    </div>
  );
}
