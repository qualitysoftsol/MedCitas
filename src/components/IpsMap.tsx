import { useEffect, useRef, useState } from "react";
import { MapPinOff } from "lucide-react";
import { cn } from "@/lib/utils";

const KEY = import.meta.env.VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_BROWSER_KEY as string | undefined;
const CHANNEL = import.meta.env.VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_TRACKING_ID as string | undefined;

// Colores de marca para los marcadores (el SDK de Maps no lee variables CSS).
const BRAND = "#0f7a74";
const BRAND_LIGHT = "#5fb3ad";
const ORIGIN = "#e11d48";

declare global {
  interface Window {
    google?: any;
    __medMapsCbs?: Array<() => void>;
    __medMapsInit?: () => void;
  }
}

let loading: Promise<void> | null = null;

export function loadGoogleMaps(): Promise<void> {
  if (typeof window === "undefined") return Promise.reject(new Error("no window"));
  if (window.google?.maps) return Promise.resolve();
  if (loading) return loading;
  if (!KEY) return Promise.reject(new Error("Google Maps browser key no configurado"));
  loading = new Promise((resolve, reject) => {
    window.__medMapsCbs = window.__medMapsCbs ?? [];
    window.__medMapsCbs.push(() => resolve());
    window.__medMapsInit = () => {
      (window.__medMapsCbs ?? []).forEach((cb) => cb());
      window.__medMapsCbs = [];
    };
    const script = document.createElement("script");
    const channel = CHANNEL ? `&channel=${CHANNEL}` : "";
    script.src = `https://maps.googleapis.com/maps/api/js?key=${KEY}&loading=async&libraries=places&callback=__medMapsInit${channel}`;
    script.async = true;
    script.defer = true;
    script.onerror = () => reject(new Error("Error al cargar Google Maps"));
    document.head.appendChild(script);
  });
  return loading;
}

export interface MapMarker {
  id: string;
  lat: number;
  lng: number;
  title?: string;
  selected?: boolean;
}

function markerIcon(selected: boolean) {
  return {
    path: window.google.maps.SymbolPath.CIRCLE,
    scale: selected ? 12 : 8,
    fillColor: selected ? BRAND : BRAND_LIGHT,
    fillOpacity: 1,
    strokeColor: "#ffffff",
    strokeWeight: selected ? 3 : 2,
  };
}

export function IpsMap({
  center,
  markers,
  onSelect,
  onMapClick,
  origin,
  height = 320,
  className,
  label = "Mapa de IPS",
}: {
  center: { lat: number; lng: number };
  markers: MapMarker[];
  onSelect?: (id: string) => void;
  onMapClick?: (lat: number, lng: number) => void;
  origin?: { lat: number; lng: number } | null;
  height?: number | string;
  className?: string;
  label?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const markersRef = useRef<Map<string, any>>(new Map());
  const originRef = useRef<any>(null);
  const boundsKeyRef = useRef<string>("");
  const [ready, setReady] = useState(false);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadGoogleMaps()
      .then(() => {
        if (cancelled || !ref.current) return;
        mapRef.current = new window.google.maps.Map(ref.current, {
          center,
          zoom: 12,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false,
          clickableIcons: false,
        });
        if (onMapClick) {
          mapRef.current.addListener("click", (e: any) => {
            onMapClick(e.latLng.lat(), e.latLng.lng());
          });
        }
        setReady(true);
      })
      .catch((e) => setError(e.message));
    return () => { cancelled = true; };
  }, []);

  // Marcadores: se recrean cuando cambia el conjunto; la selección solo actualiza el icono.
  useEffect(() => {
    if (!ready || !mapRef.current) return;
    const map = mapRef.current;
    const current = markersRef.current;
    const ids = new Set(markers.map((m) => m.id));

    current.forEach((mk, id) => {
      if (!ids.has(id)) { mk.setMap(null); current.delete(id); }
    });
    markers.forEach((m) => {
      let mk = current.get(m.id);
      if (!mk) {
        mk = new window.google.maps.Marker({ position: { lat: m.lat, lng: m.lng }, map, title: m.title });
        mk.addListener("click", () => onSelectRef.current?.(m.id));
        current.set(m.id, mk);
      }
      mk.setIcon(markerIcon(!!m.selected));
      mk.setZIndex(m.selected ? 1000 : 1);
    });

    if (originRef.current) { originRef.current.setMap(null); originRef.current = null; }
    if (origin) {
      originRef.current = new window.google.maps.Marker({
        position: origin,
        map,
        title: "Tu ubicación",
        zIndex: 999,
        icon: {
          path: window.google.maps.SymbolPath.BACKWARD_CLOSED_ARROW,
          scale: 6,
          fillColor: ORIGIN,
          fillOpacity: 1,
          strokeColor: "#fff",
          strokeWeight: 2,
        },
      });
    }

    // Reencuadra solo si cambió el conjunto de IPS, el centro o el origen (no al seleccionar).
    const boundsKey = `${[...ids].sort().join(",")}|${center.lat},${center.lng}|${origin?.lat ?? ""},${origin?.lng ?? ""}`;
    if (boundsKey !== boundsKeyRef.current) {
      boundsKeyRef.current = boundsKey;
      if (markers.length > 0) {
        const bounds = new window.google.maps.LatLngBounds();
        markers.forEach((m) => bounds.extend({ lat: m.lat, lng: m.lng }));
        bounds.extend(origin ?? center);
        map.fitBounds(bounds, 60);
      } else {
        map.setCenter(origin ?? center);
        map.setZoom(14);
      }
    } else {
      const sel = markers.find((m) => m.selected);
      if (sel) map.panTo({ lat: sel.lat, lng: sel.lng });
    }
  }, [ready, markers, center, origin]);

  if (error) {
    return (
      <div
        className={cn("flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed bg-surface p-6 text-center", className)}
        style={{ height }}
        role="note"
      >
        <MapPinOff className="size-8 text-muted-foreground" aria-hidden />
        <p className="text-sm font-medium">El mapa no está disponible en este momento</p>
        <p className="text-xs text-muted-foreground">Puedes seguir eligiendo tu IPS desde la lista.</p>
      </div>
    );
  }
  return (
    <div
      ref={ref}
      role="region"
      aria-label={label}
      className={cn("overflow-hidden rounded-xl border bg-muted", className)}
      style={{ height, width: "100%" }}
    />
  );
}
