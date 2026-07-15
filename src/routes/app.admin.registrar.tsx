import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useStore, DEPARTAMENTOS, type Role } from "@/lib/store";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

export const Route = createFileRoute("/app/admin/registrar")({
  component: AdminRegistrar,
});

function AdminRegistrar() {
  const { register } = useStore();
  const [role, setRole] = useState<Role>("ips");
  const [usuario, setUsuario] = useState("");
  const [password, setPassword] = useState("");
  const [nombre, setNombre] = useState("");
  const [telefono, setTelefono] = useState("");
  const [nit, setNit] = useState("");
  const [cedula, setCedula] = useState("");
  const [depto, setDepto] = useState("");
  const [ciudad, setCiudad] = useState("");
  const [deptosMed, setDeptosMed] = useState("Medicina General");

  const ciudades = DEPARTAMENTOS.find((d) => d.nombre === depto)?.ciudades ?? [];

  const submit = () => {
    if (!usuario.trim() || !password || !nombre.trim()) return toast.error("Campos requeridos");
    const c = ciudades.find((x) => x.nombre === ciudad);
    const res = register({
      usuario: usuario.trim(),
      password,
      role,
      profile: { nombre: nombre.trim(), telefono },
      ...(role === "empresa" ? { nit } : {}),
      ...(role === "particular" ? { cedula } : {}),
      ...(role === "ips" ? {
        departamento: depto, ciudad, lat: c?.lat, lng: c?.lng,
        departamentos: deptosMed.split(",").map((s) => s.trim()).filter(Boolean),
      } : {}),
    });
    if (!res.ok) return toast.error(res.error ?? "Error");
    const label = role === "ips" ? "IPS" : role === "empresa" ? "Empresa" : "Particular";
    toast.success(`${label} creada`);
    setUsuario(""); setPassword(""); setNombre(""); setTelefono(""); setNit(""); setCedula(""); setDepto(""); setCiudad("");
  };

  const titulo = role === "ips" ? "IPS" : role === "empresa" ? "Empresa" : "Particular";

  return (
    <Card className="max-w-2xl">
      <CardHeader><CardTitle>Registrar {titulo}</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <div>
          <Label>Tipo</Label>
          <Select value={role} onValueChange={(v) => setRole(v as Role)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ips">IPS</SelectItem>
              <SelectItem value="empresa">Empresa</SelectItem>
              <SelectItem value="particular">Particular</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Usuario</Label><Input value={usuario} onChange={(e) => setUsuario(e.target.value)} /></div>
          <div><Label>Contraseña</Label><Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} /></div>
        </div>
        <div><Label>{role === "ips" ? "Nombre IPS" : role === "particular" ? "Nombre completo" : "Razón social"}</Label><Input value={nombre} onChange={(e) => setNombre(e.target.value)} /></div>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Teléfono</Label><Input value={telefono} onChange={(e) => setTelefono(e.target.value)} /></div>
          {role === "empresa" && <div><Label>NIT</Label><Input value={nit} onChange={(e) => setNit(e.target.value)} /></div>}
          {role === "particular" && <div><Label>Cédula</Label><Input value={cedula} onChange={(e) => setCedula(e.target.value)} /></div>}
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
            <div><Label>Departamentos médicos (coma)</Label><Input value={deptosMed} onChange={(e) => setDeptosMed(e.target.value)} /></div>
          </>
        )}
        <Button onClick={submit} className="w-full">Crear</Button>
      </CardContent>
    </Card>
  );
}
