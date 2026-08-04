import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useStore, DEPARTAMENTOS } from "@/lib/store";
import { haversineKm } from "@/lib/colombia";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { IpsMap } from "@/components/IpsMap";
import { AddressInput } from "@/components/AddressInput";

import { toast } from "sonner";
import { MapPin } from "lucide-react";

export const Route = createFileRoute("/app/empresa/solicitar")({
  component: EmpresaSolicitar,
});

function EmpresaSolicitar() {
  const { currentUser, users, slots, bookAppointment } = useStore();

  const [empleadoNombre, setEmpleadoNombre] = useState("");
  const [empleadoCedula, setEmpleadoCedula] = useState("");
  const [tipoExamen, setTipoExamen] = useState<"ingreso" | "anual" | "retiro">("ingreso");
  const [depto, setDepto] = useState("Cundinamarca");
  const [ciudad, setCiudad] = useState("Bogotá");
  const [direccion, setDireccion] = useState("");
  const [userLoc, setUserLoc] = useState<{ lat: number; lng: number } | null>(null);
  const [selectedIps, setSelectedIps] = useState<string | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);

  const ciudadObj = DEPARTAMENTOS.find((d) => d.nombre === depto)?.ciudades.find((c) => c.nombre === ciudad);
  const centro = userLoc ?? (ciudadObj ? { lat: ciudadObj.lat, lng: ciudadObj.lng } : { lat: 4.71, lng: -74.07 });

  const ipsEnCiudad = useMemo(
    () => users.filter((u) => u.role === "ips" && u.ciudad === ciudad),
    [users, ciudad],
  );

  const ipsConDistancia = useMemo(() => {
    return ipsEnCiudad
      .map((ips) => ({
        ips,
        distancia: ips.lat && ips.lng ? haversineKm(centro, { lat: ips.lat, lng: ips.lng }) : 999,
      }))
      .sort((a, b) => a.distancia - b.distancia);
  }, [ipsEnCiudad, centro]);

  const markers = ipsConDistancia.map(({ ips }) => ({
    id: ips.id,
    lat: ips.lat!,
    lng: ips.lng!,
    title: ips.profile.nombre,
    selected: ips.id === selectedIps,
  }));

  const slotsIps = selectedIps
    ? slots.filter((s) => s.ipsId === selectedIps && !s.taken).sort((a, b) => (a.fecha + a.hora).localeCompare(b.fecha + b.hora))
    : [];

  const geolocate = () => {
    if (!("geolocation" in navigator)) return toast.error("Geolocalización no disponible");
    navigator.geolocation.getCurrentPosition(
      (pos) => setUserLoc({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => toast.error("No se pudo obtener tu ubicación"),
    );
  };

  const submit = () => {
    if (!empleadoNombre.trim() || !empleadoCedula.trim())
      return toast.error("Ingresa nombre y cédula del empleado");
    const slot = slots.find((s) => s.id === selectedSlot);
    if (!slot) return toast.error("Selecciona un horario");
    bookAppointment({
      slotId: slot.id,
      ipsId: slot.ipsId,
      empresaId: currentUser!.id,
      empleadoNombre,
      empleadoCedula,
      tipoExamen,
      fecha: slot.fecha,
      hora: slot.hora,
      ciudad: slot.ciudad,
      departamentoMedico: slot.departamentoMedico,
    });
    toast.success("Cita agendada");
    setEmpleadoNombre(""); setEmpleadoCedula(""); setSelectedSlot(null);
  };

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader><CardTitle>Datos del empleado</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Nombre</Label>
              <Input value={empleadoNombre} onChange={(e) => setEmpleadoNombre(e.target.value)} />
            </div>
            <div>
              <Label>Cédula</Label>
              <Input value={empleadoCedula} onChange={(e) => setEmpleadoCedula(e.target.value)} />
            </div>
          </div>
          <div>
            <Label>Tipo de examen</Label>
            <Select value={tipoExamen} onValueChange={(v) => setTipoExamen(v as typeof tipoExamen)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ingreso">Ingreso</SelectItem>
                <SelectItem value="anual">Anual (periódico)</SelectItem>
                <SelectItem value="retiro">Retiro</SelectItem>
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
                  <div>
                    <div className="font-medium">{ips.profile.nombre}</div>
                    <div className="text-xs text-muted-foreground">{ips.profile.direccion} · {distancia.toFixed(1)} km</div>
                  </div>
                  <Button size="sm" variant={selectedIps===ips.id?"default":"outline"} onClick={() => { setSelectedIps(ips.id); setSelectedSlot(null); }}>
                    Elegir
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {selectedIps && (
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Horarios disponibles — {users.find(u=>u.id===selectedIps)?.profile.nombre}</CardTitle>
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
                    <div className="text-xs text-muted-foreground">{s.hora} · {s.departamentoMedico}</div>
                  </button>
                ))}
              </div>
            )}
            <div className="mt-4 flex items-center justify-between">
              <div className="text-sm text-muted-foreground">
                {selectedSlot ? (
                  <>Horario: <Badge>{slots.find(s=>s.id===selectedSlot)?.fecha} {slots.find(s=>s.id===selectedSlot)?.hora}</Badge></>
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
