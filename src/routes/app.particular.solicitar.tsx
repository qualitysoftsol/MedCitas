import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { DEPARTAMENTOS } from "@/lib/colombia";
import { haversineKm } from "@/lib/colombia";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { IpsMap } from "@/components/IpsMap";
import { AddressInput } from "@/components/AddressInput";
import { toast } from "sonner";
import { MapPin, Stethoscope } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/lib/supabase";
import { useAvailableSlots } from "@/lib/hooks/useSlots";
import { useBookAppointment } from "@/lib/hooks/useAppointments";
import { useClasificaciones, useTiposExamen, useServicios, derivarClasificaciones } from "@/lib/hooks/useCatalogos";
import type { Profile, IpsFoto } from "@/lib/database.types";
import { IpsDetailPanel } from "@/components/IpsDetailPanel";

export const Route = createFileRoute("/app/particular/solicitar")({
  component: ParticularSolicitar,
});

function ParticularSolicitar() {
  const { profile } = useAuth();

  const [cedula, setCedula] = useState(profile?.cedula ?? "");
  const [tipoExamen, setTipoExamen] = useState<string>("");
  const [filtroClasificaciones, setFiltroClasificaciones] = useState<string[]>([]);
  const [depto, setDepto] = useState("Cundinamarca");
  const [ciudad, setCiudad] = useState("Bogotá");
  const [direccion, setDireccion] = useState(profile?.direccion ?? "");
  const [userLoc, setUserLoc] = useState<{ lat: number; lng: number } | null>(null);
  const [selectedIps, setSelectedIps] = useState<string | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  const [showDetail, setShowDetail] = useState(false);

  const bookAppointment = useBookAppointment();

  const { data: clasificaciones = [] } = useClasificaciones();
  const { data: tiposExamen = [] } = useTiposExamen();
  const { data: catalogoServicios = [] } = useServicios();

  // Memoized to keep stable reference — useEffect depends on this
  const tiposDisponibles = useMemo(
    () => tiposExamen.filter((t) => t.roles_permitidos.includes("particular")),
    [tiposExamen]
  );

  // Initialize tipoExamen with first available tipo when loaded
  useEffect(() => {
    if (tiposDisponibles.length > 0 && !tipoExamen) {
      setTipoExamen(tiposDisponibles[0].nombre);
    }
  }, [tiposDisponibles, tipoExamen]);

  const toggleFiltro = (nombre: string, checked: boolean) => {
    setFiltroClasificaciones((prev) =>
      checked ? [...prev, nombre] : prev.filter((x) => x !== nombre)
    );
  };

  const { data: ipsEnCiudad = [] } = useQuery({
    queryKey: ['ips', ciudad],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('role', 'ips')
        .eq('ciudad', ciudad)
      if (error) throw error
      return data as Profile[]
    },
    enabled: !!ciudad,
  });

  const { data: slotsIps = [] } = useAvailableSlots(selectedIps);

  const ipsIds = ipsEnCiudad.map((i) => i.id);
  const { data: portadas = [] } = useQuery({
    queryKey: ['ips-fotos-portadas', ipsIds],
    queryFn: async () => {
      if (ipsIds.length === 0) return [];
      const { data, error } = await supabase
        .from('ips_fotos')
        .select('*')
        .in('ips_id', ipsIds)
        .eq('orden', 0);
      if (error) throw error;
      return data as IpsFoto[];
    },
    enabled: ipsIds.length > 0,
  });
  const portadaUrl = (ipsId: string) => portadas.find((f) => f.ips_id === ipsId)?.url;

  const ciudadObj = DEPARTAMENTOS.find((d) => d.nombre === depto)?.ciudades.find((c) => c.nombre === ciudad);
  const centro = userLoc ?? (ciudadObj ? { lat: ciudadObj.lat, lng: ciudadObj.lng } : { lat: 4.71, lng: -74.07 });

  const ipsConDistancia = useMemo(() => {
    return ipsEnCiudad
      .filter((ips) => {
        if (filtroClasificaciones.length === 0) return true;
        return derivarClasificaciones(ips.servicios ?? [], catalogoServicios)
          .some((c) => filtroClasificaciones.includes(c));
      })
      .map((ips) => ({
        ips,
        distancia: ips.lat && ips.lng ? haversineKm(centro, { lat: ips.lat, lng: ips.lng }) : 999,
      }))
      .sort((a, b) => a.distancia - b.distancia);
  }, [ipsEnCiudad, centro, filtroClasificaciones, catalogoServicios]);

  const markers = ipsConDistancia.map(({ ips }) => ({
    id: ips.id,
    lat: ips.lat!,
    lng: ips.lng!,
    title: ips.nombre,
    selected: ips.id === selectedIps,
  }));

  const geolocate = () => {
    if (!("geolocation" in navigator)) return toast.error("Geolocalización no disponible");
    navigator.geolocation.getCurrentPosition(
      (pos) => setUserLoc({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => toast.error("No se pudo obtener tu ubicación"),
    );
  };

  const submit = () => {
    if (!cedula.trim()) return toast.error("Ingresa tu cédula");
    const slot = slotsIps.find((s) => s.id === selectedSlot);
    if (!slot) return toast.error("Selecciona un horario");
    bookAppointment.mutate({
      slot_id: slot.id,
      ips_id: slot.ips_id,
      solicitante_id: profile!.id,
      empleado_nombre: profile!.nombre,
      empleado_cedula: cedula,
      tipo_examen: tipoExamen,
      fecha: slot.fecha,
      hora: slot.hora,
      ciudad: slot.ciudad,
      servicio: slot.servicio,
    }, {
      onSuccess: () => {
        toast.success("Cita agendada");
        setSelectedSlot(null);
        setShowDetail(false);
      },
      onError: (err: any) => toast.error(err.message),
    });
  };

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader><CardTitle>Mis datos</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label>Nombre</Label>
            <Input value={profile?.nombre ?? ""} disabled />
          </div>
          <div>
            <Label>Cédula</Label>
            <Input value={cedula} onChange={(e) => setCedula(e.target.value)} />
          </div>
          <div>
            <Label>Tipo de examen</Label>
            <Select value={tipoExamen} onValueChange={setTipoExamen}>
              <SelectTrigger><SelectValue placeholder="Seleccionar tipo" /></SelectTrigger>
              <SelectContent>
                {tiposDisponibles.map((t) => (
                  <SelectItem key={t.id} value={t.nombre}>{t.nombre}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Departamento</Label>
              <Select value={depto} onValueChange={(v) => { setDepto(v); const first = DEPARTAMENTOS.find(d=>d.nombre===v)?.ciudades[0]; if(first) setCiudad(first.nombre); setUserLoc(null); setSelectedIps(null); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {DEPARTAMENTOS.map((d) => <SelectItem key={d.nombre} value={d.nombre}>{d.nombre}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Ciudad</Label>
              <Select value={ciudad} onValueChange={(v) => { setCiudad(v); setUserLoc(null); setSelectedIps(null); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(DEPARTAMENTOS.find((d) => d.nombre === depto)?.ciudades ?? []).map((c) => (
                    <SelectItem key={c.nombre} value={c.nombre}>{c.nombre}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label>Dirección de residencia</Label>
            <div className="flex gap-2">
              <div className="flex-1">
                <AddressInput
                  value={direccion}
                  city={ciudad}
                  placeholder="Cra 15 #93-40"
                  onChange={setDireccion}
                  onResolved={(loc, formatted) => {
                    setUserLoc(loc);
                    setDireccion(formatted);
                    setSelectedIps(null);
                    toast.success("Dirección ubicada: mostrando IPS cercanas");
                  }}
                />
              </div>
              <Button type="button" variant="secondary" onClick={geolocate}>
                <MapPin className="w-4 h-4 mr-1" />Mi ubicación
              </Button>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {userLoc
                ? "Ubicación fijada. Las IPS se ordenan por distancia a esta dirección."
                : "Escribe la dirección y elige una sugerencia, o toca el mapa para fijarla."}
            </p>
          </div>

        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>IPS cercanas en {ciudad}</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {clasificaciones.length > 0 && (
            <div>
              <Label className="text-xs text-muted-foreground">Filtrar por clasificación</Label>
              <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
                {clasificaciones.map((c) => (
                  <label key={c.id} className="flex items-center gap-1.5 text-xs cursor-pointer select-none">
                    <Checkbox
                      checked={filtroClasificaciones.includes(c.nombre)}
                      onCheckedChange={(checked) => toggleFiltro(c.nombre, !!checked)}
                    />
                    {c.nombre}
                  </label>
                ))}
              </div>
            </div>
          )}
          <IpsMap
            center={centro}
            markers={markers}
            onSelect={(id) => { setSelectedIps(id); setSelectedSlot(null); }}
            onMapClick={(lat, lng) => setUserLoc({ lat, lng })}
            origin={userLoc}

          />
          {ipsConDistancia.length === 0 ? (
            <p className="text-sm text-muted-foreground">No hay IPS registradas en {ciudad}.</p>
          ) : (
            <ul className="divide-y">
              {ipsConDistancia.map(({ ips, distancia }) => (
                <li key={ips.id} className={`py-2 flex items-center justify-between gap-2 ${selectedIps===ips.id ? "bg-accent/40 rounded-md px-2" : ""}`}>
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-14 h-14 rounded-md overflow-hidden border bg-muted flex-shrink-0">
                      {portadaUrl(ips.id) ? (
                        <img src={portadaUrl(ips.id)} alt={ips.nombre} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <Stethoscope className="w-5 h-5 text-muted-foreground" />
                        </div>
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="font-medium">{ips.nombre}</div>
                      <div className="text-xs text-muted-foreground">{ips.direccion} · {distancia.toFixed(1)} km</div>
                    </div>
                  </div>
                  <Button size="sm" variant={selectedIps===ips.id?"default":"outline"} onClick={() => { setSelectedIps(ips.id); setSelectedSlot(null); setShowDetail(true); }}>
                    Elegir
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {selectedIps && showDetail && (() => {
        const ipsData = ipsEnCiudad.find(i => i.id === selectedIps);
        const distancia = ipsConDistancia.find(i => i.ips.id === selectedIps)?.distancia ?? 0;
        if (!ipsData) return null;
        return (
          <Card className="lg:col-span-2">
            <CardHeader><CardTitle>Detalle de la IPS</CardTitle></CardHeader>
            <CardContent>
              <IpsDetailPanel
                ips={ipsData}
                distancia={distancia}
                onConfirm={() => setShowDetail(false)}
              />
            </CardContent>
          </Card>
        );
      })()}

      {selectedIps && !showDetail && (
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Horarios disponibles — {ipsEnCiudad.find(u=>u.id===selectedIps)?.nombre}</CardTitle>
          </CardHeader>
          <CardContent>
            {slotsIps.length === 0 ? (
              <p className="text-sm text-muted-foreground">Esta IPS no tiene horarios disponibles.</p>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                {slotsIps.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => setSelectedSlot(s.id)}
                    className={`text-left rounded-md border p-2 hover:border-primary transition ${selectedSlot===s.id ? "border-primary bg-accent/50" : ""}`}
                  >
                    <div className="text-sm font-medium">{s.fecha}</div>
                    <div className="text-xs text-muted-foreground">{s.hora} · {s.servicio}</div>
                  </button>
                ))}
              </div>
            )}
            <div className="mt-4 flex items-center justify-between">
              <div className="text-sm text-muted-foreground">
                {selectedSlot ? (
                  <>Horario: <Badge>{slotsIps.find(s=>s.id===selectedSlot)?.fecha} {slotsIps.find(s=>s.id===selectedSlot)?.hora}</Badge></>
                ) : "Selecciona un horario"}
              </div>
              <Button onClick={submit} disabled={!selectedSlot}>Agendar cita</Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
