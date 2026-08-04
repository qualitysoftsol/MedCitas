import { useEffect, useRef, useState } from "react";

const KEY = import.meta.env.VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_BROWSER_KEY as string | undefined;
const CHANNEL = import.meta.env.VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_TRACKING_ID as string | undefined;

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

export function IpsMap({
  center,
  markers,
  onSelect,
  onMapClick,
  origin,
  height = 320,
}: {
  center: { lat: number; lng: number };
  markers: MapMarker[];
  onSelect?: (id: string) => void;
  onMapClick?: (lat: number, lng: number) => void;
  origin?: { lat: number; lng: number } | null;
  height?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);
  const originRef = useRef<any>(null);
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
        });
        if (onMapClick) {
          mapRef.current.addListener("click", (e: any) => {
            onMapClick(e.latLng.lat(), e.latLng.lng());
          });
        }
      })
      .catch((e) => setError(e.message));
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!mapRef.current || !window.google) return;
    markersRef.current.forEach((m) => m.setMap(null));
    markersRef.current = markers.map((m) => {
      const marker = new window.google.maps.Marker({
        position: { lat: m.lat, lng: m.lng },
        map: mapRef.current,
        title: m.title,
        icon: m.selected
          ? {
              path: window.google.maps.SymbolPath.CIRCLE,
              scale: 10,
              fillColor: "#0891b2",
              fillOpacity: 1,
              strokeColor: "#fff",
              strokeWeight: 2,
            }
          : undefined,
      });
      if (onSelect) marker.addListener("click", () => onSelect(m.id));
      return marker;
    });
    if (originRef.current) { originRef.current.setMap(null); originRef.current = null; }
    if (origin) {
      originRef.current = new window.google.maps.Marker({
        position: origin,
        map: mapRef.current,
        title: "Dirección de residencia",
        zIndex: 999,
        icon: {
          path: window.google.maps.SymbolPath.BACKWARD_CLOSED_ARROW,
          scale: 6,
          fillColor: "#e11d48",
          fillOpacity: 1,
          strokeColor: "#fff",
          strokeWeight: 2,
        },
      });
    }
    if (markers.length > 0) {
      const bounds = new window.google.maps.LatLngBounds();
      markers.forEach((m) => bounds.extend({ lat: m.lat, lng: m.lng }));
      bounds.extend(center);
      mapRef.current.fitBounds(bounds, 60);
    } else {
      mapRef.current.setCenter(center);
      mapRef.current.setZoom(14);
    }
  }, [markers, center, origin]);


  if (error) {
    return (
      <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground" style={{ height }}>
        Mapa no disponible: {error}
      </div>
    );
  }
  return <div ref={ref} className="rounded-md border overflow-hidden" style={{ height, width: "100%" }} />;
}
