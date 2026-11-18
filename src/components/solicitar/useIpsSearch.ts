import { useCallback, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { DEPARTAMENTOS, haversineKm } from "@/lib/colombia";
import { supabase } from "@/lib/supabase";
import { precioKey, usePreciosServicios } from "@/lib/hooks/usePrecios";
import type { Profile, Servicio, Slot } from "@/lib/database.types";
import { hoyISO } from "@/lib/format";
import { cn } from "@/lib/utils";

export type LatLng = { lat: number; lng: number };

export function formatDistancia(km: number) {
  if (km >= 999) return "Distancia no disponible";
  return km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`;
}

/** Excluye horarios que ya pasaron (fecha anterior a hoy, u hora ya cumplida si es hoy). */
export function esFuturo(s: Pick<Slot, "fecha" | "hora">, hoy = hoyISO()) {
  if (s.fecha > hoy) return true;
  if (s.fecha < hoy) return false;
  const now = new Date();
  const [h, m] = s.hora.split(":").map(Number);
  return h * 60 + m > now.getHours() * 60 + now.getMinutes();
}

export const chipClass = (active: boolean) =>
  cn(
    "inline-flex h-9 shrink-0 items-center gap-1 rounded-full border px-3.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
    active ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card hover:border-primary/40 hover:bg-muted",
  );

export interface Disponibilidad { count: number; primero: Pick<Slot, "fecha" | "hora"> | null }

/** Qué pruebas de la evaluación hace una IPS y cuánto suman (precio + comisión). */
export interface Cobertura {
  hechas: { id: string; nombre: string; total: number }[];
  faltan: string[];
  total: number;
}

/**
 * Búsqueda de IPS compartida por los flujos de particular y empresa: IPS de la
 * ciudad ordenadas por distancia, qué pruebas de la evaluación hace cada una
 * (`pruebas`, ya filtradas a líneas activas) y disponibilidad (cupos libres
 * desde hoy en las IPS que hacen al menos una).
 */
export function useIpsSearch({
  depto, ciudad, userLoc, pruebas,
}: {
  depto: string;
  ciudad: string;
  userLoc: LatLng | null;
  pruebas: Pick<Servicio, "id" | "nombre">[];
}) {
  const { data: ipsEnCiudad = [], isLoading: ipsLoading, isError: ipsError, refetch: refetchIps } = useQuery({
    queryKey: ["ips", ciudad],
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("*").eq("role", "ips").eq("ciudad", ciudad);
      if (error) throw error;
      return data as Profile[];
    },
    enabled: !!ciudad,
  });

  const ipsIds = ipsEnCiudad.map((i) => i.id);
  const hoy = hoyISO();
  const { data: libres = [], isLoading: libresLoading } = useQuery({
    queryKey: ["slots", "resumen", ipsIds, hoy],
    queryFn: async () => {
      if (ipsIds.length === 0) return [];
      const { data, error } = await supabase
        .from("slots")
        .select("ips_id, fecha, hora")
        .in("ips_id", ipsIds)
        .eq("taken", false)
        .gte("fecha", hoy)
        .order("fecha")
        .order("hora");
      if (error) throw error;
      return data as Pick<Slot, "ips_id" | "fecha" | "hora">[];
    },
    enabled: ipsIds.length > 0,
  });

  // Valor final de cada servicio (precio + comisión). Una IPS hace una prueba si
  // la tiene en su perfil y con precio: la misma regla de crear_cita_interna.
  const { data: precios, isLoading: preciosLoading } = usePreciosServicios(ipsIds);
  const coberturas = useMemo(() => {
    const map = new Map<string, Cobertura>();
    ipsEnCiudad.forEach((ips) => {
      const c: Cobertura = { hechas: [], faltan: [], total: 0 };
      pruebas.forEach((p) => {
        const total = (ips.servicios ?? []).includes(p.nombre) ? precios?.get(precioKey(ips.id, p.nombre)) : undefined;
        if (total != null) { c.hechas.push({ id: p.id, nombre: p.nombre, total }); c.total += total; }
        else c.faltan.push(p.nombre);
      });
      map.set(ips.id, c);
    });
    return map;
  }, [ipsEnCiudad, pruebas, precios]);
  const coberturaDe = useCallback((ipsId: string | null) => (ipsId ? coberturas.get(ipsId) ?? null : null), [coberturas]);

  const disponibilidad = useMemo(() => {
    const map = new Map<string, Disponibilidad>();
    libres.filter((s) => esFuturo(s, hoy) && (coberturas.get(s.ips_id)?.hechas.length ?? 0) > 0).forEach((s) => {
      const cur = map.get(s.ips_id) ?? { count: 0, primero: null };
      cur.count += 1;
      if (!cur.primero) cur.primero = s;
      map.set(s.ips_id, cur);
    });
    return map;
  }, [libres, hoy, coberturas]);

  const ciudadObj = DEPARTAMENTOS.find((d) => d.nombre === depto)?.ciudades.find((c) => c.nombre === ciudad);
  const centro = useMemo(
    () => userLoc ?? (ciudadObj ? { lat: ciudadObj.lat, lng: ciudadObj.lng } : { lat: 4.71, lng: -74.07 }),
    [userLoc, ciudadObj],
  );

  const ipsConDistancia = useMemo(
    () => ipsEnCiudad
      .map((ips) => ({ ips, distancia: ips.lat && ips.lng ? haversineKm(centro, { lat: ips.lat, lng: ips.lng }) : 999 }))
      .sort((a, b) => a.distancia - b.distancia),
    [ipsEnCiudad, centro],
  );

  return {
    ipsEnCiudad, ipsLoading, ipsError, refetchIps, disponibilidad, libresLoading: libresLoading || preciosLoading,
    ipsConDistancia, centro, coberturaDe, preciosLoading,
  };
}

export type IpsSearch = ReturnType<typeof useIpsSearch>;
