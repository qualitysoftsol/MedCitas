import { useCallback, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { DEPARTAMENTOS, haversineKm } from "@/lib/colombia";
import { supabase } from "@/lib/supabase";
import { useClasificaciones, useServicios, derivarClasificaciones } from "@/lib/hooks/useCatalogos";
import { precioKey, usePreciosServicios } from "@/lib/hooks/usePrecios";
import type { Profile, IpsFoto, Slot } from "@/lib/database.types";
import { hoyISO } from "@/lib/format";
import { cn } from "@/lib/utils";

export type LatLng = { lat: number; lng: number };

export const soloDigitos = (v: string) => v.replace(/\D/g, "");

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

/**
 * Búsqueda de IPS compartida por los flujos de particular y empresa:
 * IPS de la ciudad, fotos de portada, disponibilidad (horarios libres desde hoy),
 * filtro por clasificación y orden por distancia.
 */
export function useIpsSearch({
  depto, ciudad, userLoc, filtro, selectedIps,
}: {
  depto: string;
  ciudad: string;
  userLoc: LatLng | null;
  filtro: string[];
  selectedIps: string | null;
}) {
  const { data: clasificaciones = [] } = useClasificaciones();
  const { data: catalogoServicios = [] } = useServicios();

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
  const { data: portadas = [] } = useQuery({
    queryKey: ["ips-fotos-portadas", ipsIds],
    queryFn: async () => {
      if (ipsIds.length === 0) return [];
      const { data, error } = await supabase.from("ips_fotos").select("*").in("ips_id", ipsIds).eq("orden", 0);
      if (error) throw error;
      return data as IpsFoto[];
    },
    enabled: ipsIds.length > 0,
  });
  const portadaUrl = (ipsId: string) => portadas.find((f) => f.ips_id === ipsId)?.url;

  const hoy = hoyISO();
  const { data: libres = [], isLoading: libresLoading } = useQuery({
    queryKey: ["slots", "resumen", ipsIds, hoy],
    queryFn: async () => {
      if (ipsIds.length === 0) return [];
      const { data, error } = await supabase
        .from("slots")
        .select("ips_id, fecha, hora, servicio")
        .in("ips_id", ipsIds)
        .eq("taken", false)
        .gte("fecha", hoy)
        .order("fecha")
        .order("hora");
      if (error) throw error;
      return data as Pick<Slot, "ips_id" | "fecha" | "hora" | "servicio">[];
    },
    enabled: ipsIds.length > 0,
  });

  // Valor final de cada servicio (precio + comisión). Un horario cuyo servicio no
  // tiene precio no se puede agendar, así que no cuenta como disponible.
  const { data: precios, isLoading: preciosLoading } = usePreciosServicios(ipsIds);
  const precioDe = useCallback(
    (s: Pick<Slot, "ips_id" | "servicio">) => precios?.get(precioKey(s.ips_id, s.servicio)) ?? null,
    [precios],
  );

  const disponibilidad = useMemo(() => {
    const map = new Map<string, Disponibilidad>();
    libres.filter((s) => esFuturo(s, hoy) && precioDe(s) != null).forEach((s) => {
      const cur = map.get(s.ips_id) ?? { count: 0, primero: null };
      cur.count += 1;
      if (!cur.primero) cur.primero = s;
      map.set(s.ips_id, cur);
    });
    return map;
  }, [libres, hoy, precioDe]);

  const ciudadObj = DEPARTAMENTOS.find((d) => d.nombre === depto)?.ciudades.find((c) => c.nombre === ciudad);
  const centro = useMemo(
    () => userLoc ?? (ciudadObj ? { lat: ciudadObj.lat, lng: ciudadObj.lng } : { lat: 4.71, lng: -74.07 }),
    [userLoc, ciudadObj],
  );

  const ipsConDistancia = useMemo(() => {
    return ipsEnCiudad
      .filter((ips) => {
        if (filtro.length === 0) return true;
        return derivarClasificaciones(ips.servicios ?? [], catalogoServicios).some((c) => filtro.includes(c));
      })
      .map((ips) => ({
        ips,
        distancia: ips.lat && ips.lng ? haversineKm(centro, { lat: ips.lat, lng: ips.lng }) : 999,
      }))
      .sort((a, b) => a.distancia - b.distancia);
  }, [ipsEnCiudad, centro, filtro, catalogoServicios]);

  const markers = useMemo(
    () =>
      ipsConDistancia
        .filter(({ ips }) => ips.lat != null && ips.lng != null)
        .map(({ ips }) => ({ id: ips.id, lat: ips.lat!, lng: ips.lng!, title: ips.nombre, selected: ips.id === selectedIps })),
    [ipsConDistancia, selectedIps],
  );

  return {
    clasificaciones, catalogoServicios, ipsEnCiudad, ipsLoading, ipsError, refetchIps, portadaUrl,
    disponibilidad, libresLoading: libresLoading || preciosLoading, ipsConDistancia, markers, centro,
    precioDe, preciosLoading,
  };
}

export type IpsSearch = ReturnType<typeof useIpsSearch>;
