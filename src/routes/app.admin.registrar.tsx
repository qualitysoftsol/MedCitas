import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useAuth, DEPARTAMENTOS } from "@/lib/auth-context";
import { supabase } from "@/lib/supabase";
import { useServicios } from "@/lib/hooks/useCatalogos";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AddressInput } from "@/components/AddressInput";
import { toast } from "sonner";

export const Route = createFileRoute("/app/admin/registrar")({
  component: AdminRegistrar,
});

function AdminRegistrar() {
  useAuth();
  const [role, setRole] = useState<"empresa" | "ips" | "particular">("ips");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [nombre, setNombre] = useState("");
  const [telefono, setTelefono] = useState("");
  const [nit, setNit] = useState("");
  const [cedula, setCedula] = useState("");
  const [depto, setDepto] = useState("");
  const [ciudad, setCiudad] = useState("");
  const [direccion, setDireccion] = useState("");
  const [resolvedLoc, setResolvedLoc] = useState<{ lat: number; lng: number } | null>(null);
  const [selectedServicios, setSelectedServicios] = useState<string[]>([]);

  const { data: servicios = [] } = useServicios();

  const ciudades = DEPARTAMENTOS.find((d) => d.nombre === depto)?.ciudades ?? [];

  const toggleItem = (list: string[], setList: (v: string[]) => void, value: string) => {
    setList(list.includes(value) ? list.filter((x) => x !== value) : [...list, value]);
  };

  const submit = async () => {
    if (!email.trim() || !password || !nombre.trim()) return toast.error("Campos requeridos");
    const c = ciudades.find((x) => x.nombre === ciudad);
    const { data: { session } } = await supabase.auth.getSession();

    const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-user`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session?.access_token}`,
      },
      body: JSON.stringify({
        email: email.trim(),
        password,
        role,
        nombre: nombre.trim(),
        telefono,
        ...(role === "empresa" ? { nit } : {}),
        ...(role === "particular" ? { cedula } : {}),
        ...(role === "ips" ? {
          departamento: depto,
          ciudad,
          direccion: direccion.trim() || undefined,
          lat: resolvedLoc?.lat ?? c?.lat,
          lng: resolvedLoc?.lng ?? c?.lng,
          servicios: selectedServicios,
        } : {}),
      }),
    });

    const data = await res.json();
    if (!res.ok) return toast.error(data.error ?? "Error al crear usuario");

    const label = role === "ips" ? "IPS" : role === "empresa" ? "Empresa" : "Particular";
    toast.success(`${label} creada`);
    setEmail(""); setPassword(""); setNombre(""); setTelefono(""); setNit(""); setCedula("");
    setDepto(""); setCiudad(""); setDireccion(""); setResolvedLoc(null); setSelectedServicios([]);
  };

  const titulo = role === "ips" ? "IPS" : role === "empresa" ? "Empresa" : "Particular";

  return (
    <Card className="max-w-2xl">
      <CardHeader><CardTitle>Registrar {titulo}</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <div>
          <Label>Tipo</Label>
          <Select value={role} onValueChange={(v) => setRole(v as "empresa" | "ips" | "particular")}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ips">IPS</SelectItem>
              <SelectItem value="empresa">Empresa</SelectItem>
              <SelectItem value="particular">Particular</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Correo electrónico</Label><Input type="text" inputMode="email" name="nuevo-usuario-email" autoComplete="off" data-1p-ignore data-lpignore="true" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
          <div><Label>Contraseña</Label><Input type="password" name="nuevo-usuario-password" autoComplete="new-password" data-1p-ignore data-lpignore="true" value={password} onChange={(e) => setPassword(e.target.value)} /></div>
        </div>
        <div><Label>{role === "ips" ? "Nombre IPS" : role === "particular" ? "Nombre completo" : "Razón social"}</Label><Input value={nombre} onChange={(e) => setNombre(e.target.value)} autoComplete="off" /></div>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Teléfono</Label><Input value={telefono} onChange={(e) => setTelefono(e.target.value)} autoComplete="off" /></div>
          {role === "empresa" && <div><Label>NIT</Label><Input value={nit} onChange={(e) => setNit(e.target.value)} autoComplete="off" /></div>}
          {role === "particular" && <div><Label>Cédula</Label><Input value={cedula} onChange={(e) => setCedula(e.target.value)} autoComplete="off" /></div>}
        </div>
        {role === "ips" && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Departamento</Label>
                <Select value={depto} onValueChange={(v) => { setDepto(v); setCiudad(""); }}>
                  <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent>
                    {DEPARTAMENTOS.map((d) => <SelectItem key={d.nombre} value={d.nombre}>{d.nombre}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Ciudad</Label>
                <Select value={ciudad} onValueChange={setCiudad} disabled={!depto}>
                  <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent>
                    {ciudades.map((c) => <SelectItem key={c.nombre} value={c.nombre}>{c.nombre}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Dirección física</Label>
              <AddressInput
                value={direccion}
                city={ciudad || undefined}
                onChange={(v) => { setDireccion(v); setResolvedLoc(null); }}
                onResolved={(loc, formatted) => { setDireccion(formatted); setResolvedLoc(loc); }}
                placeholder="Cra 49 #91-25, Barrios Unidos"
              />
              {resolvedLoc ? (
                <p className="text-xs text-green-600 mt-1">Ubicación geocodificada correctamente.</p>
              ) : (
                <p className="text-xs text-muted-foreground mt-1">Escribe y selecciona una sugerencia para registrar la ubicación exacta en el mapa.</p>
              )}
            </div>
            <div>
              <Label>Servicios</Label>
              <div className="mt-1 flex flex-wrap gap-x-4 gap-y-2">
                {servicios.map((d) => (
                  <label key={d.id} className="flex items-center gap-1.5 text-sm cursor-pointer select-none">
                    <Checkbox
                      checked={selectedServicios.includes(d.nombre)}
                      onCheckedChange={() => toggleItem(selectedServicios, setSelectedServicios, d.nombre)}
                    />
                    {d.nombre}
                  </label>
                ))}
              </div>
            </div>
          </>
        )}
        <Button onClick={submit} className="w-full">Crear</Button>
      </CardContent>
    </Card>
  );
}
