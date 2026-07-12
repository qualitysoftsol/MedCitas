import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useStore, type Role, DEPARTAMENTOS } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Stethoscope } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Ingreso — MedCitas" },
      { name: "description", content: "Inicia sesión o regístrate como IPS o Empresa en MedCitas." },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const { login, register, currentUser } = useStore();
  const navigate = useNavigate();
  const [tab, setTab] = useState("login");

  // login
  const [lUser, setLUser] = useState("");
  const [lPass, setLPass] = useState("");

  // register
  const [role, setRole] = useState<Role>("empresa");
  const [rUser, setRUser] = useState("");
  const [rPass, setRPass] = useState("");
  const [nombre, setNombre] = useState("");
  const [telefono, setTelefono] = useState("");
  const [nit, setNit] = useState("");
  const [depto, setDepto] = useState("");
  const [ciudad, setCiudad] = useState("");
  const [deptosMed, setDeptosMed] = useState("Medicina General, Optometría");

  if (currentUser) {
    if (currentUser.role === "admin") return <div />;
  }

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    const u = login(lUser.trim(), lPass);
    if (!u) return toast.error("Credenciales inválidas");
    toast.success(`Bienvenido ${u.profile.nombre}`);
    navigate({ to: "/" });
  };

  const handleRegister = (e: React.FormEvent) => {
    e.preventDefault();
    if (!rUser.trim() || !rPass || !nombre.trim())
      return toast.error("Completa los campos requeridos");
    if (role === "ips" && (!depto || !ciudad))
      return toast.error("La IPS debe seleccionar departamento y ciudad");
    const ciudadObj = DEPARTAMENTOS.find((d) => d.nombre === depto)?.ciudades.find((c) => c.nombre === ciudad);
    const res = register({
      usuario: rUser.trim(),
      password: rPass,
      role,
      profile: { nombre: nombre.trim(), telefono },
      ...(role === "empresa" ? { nit } : {}),
      ...(role === "ips"
        ? {
            departamento: depto,
            ciudad,
            lat: ciudadObj?.lat,
            lng: ciudadObj?.lng,
            departamentos: deptosMed.split(",").map((s) => s.trim()).filter(Boolean),
          }
        : {}),
    });
    if (!res.ok) return toast.error(res.error ?? "Error al registrar");
    toast.success("Cuenta creada");
    navigate({ to: "/" });
  };

  const ciudades = DEPARTAMENTOS.find((d) => d.nombre === depto)?.ciudades ?? [];

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-8 bg-[color:var(--muted)]">
      <div className="flex items-center gap-2 mb-6">
        <div className="rounded-xl p-2" style={{ background: "var(--gradient-primary)" }}>
          <Stethoscope className="w-6 h-6 text-primary-foreground" />
        </div>
        <span className="text-2xl font-bold">MedCitas</span>
      </div>
      <Card className="w-full max-w-md shadow-lg">
        <CardHeader>
          <CardTitle>Acceso a la plataforma</CardTitle>
          <CardDescription>
            Ingresa o crea una cuenta como IPS o Empresa. Admin de prueba: <b>admin / admin123</b>
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList className="grid grid-cols-2 w-full">
              <TabsTrigger value="login">Iniciar sesión</TabsTrigger>
              <TabsTrigger value="register">Registrarme</TabsTrigger>
            </TabsList>
            <TabsContent value="login">
              <form onSubmit={handleLogin} className="space-y-3 mt-4">
                <div>
                  <Label>Usuario</Label>
                  <Input value={lUser} onChange={(e) => setLUser(e.target.value)} autoComplete="username" />
                </div>
                <div>
                  <Label>Contraseña</Label>
                  <Input type="password" value={lPass} onChange={(e) => setLPass(e.target.value)} autoComplete="current-password" />
                </div>
                <Button type="submit" className="w-full">Entrar</Button>
                <p className="text-xs text-muted-foreground text-center">
                  Prueba: <b>ips_bogota / ips123</b> o <b>empresa_demo / emp123</b>
                </p>
              </form>
            </TabsContent>
            <TabsContent value="register">
              <form onSubmit={handleRegister} className="space-y-3 mt-4">
                <div>
                  <Label>Tipo de cuenta</Label>
                  <Select value={role} onValueChange={(v) => setRole(v as Role)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="empresa">Empresa</SelectItem>
                      <SelectItem value="ips">IPS</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Usuario</Label>
                    <Input value={rUser} onChange={(e) => setRUser(e.target.value)} />
                  </div>
                  <div>
                    <Label>Contraseña</Label>
                    <Input type="password" value={rPass} onChange={(e) => setRPass(e.target.value)} />
                  </div>
                </div>
                <div>
                  <Label>{role === "ips" ? "Nombre de la IPS" : "Razón social"}</Label>
                  <Input value={nombre} onChange={(e) => setNombre(e.target.value)} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Teléfono</Label>
                    <Input value={telefono} onChange={(e) => setTelefono(e.target.value)} />
                  </div>
                  {role === "empresa" && (
                    <div>
                      <Label>NIT</Label>
                      <Input value={nit} onChange={(e) => setNit(e.target.value)} />
                    </div>
                  )}
                </div>
                {role === "ips" && (
                  <>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label>Departamento</Label>
                        <Select value={depto} onValueChange={(v) => { setDepto(v); setCiudad(""); }}>
                          <SelectTrigger><SelectValue placeholder="Seleccione" /></SelectTrigger>
                          <SelectContent>
                            {DEPARTAMENTOS.map((d) => (
                              <SelectItem key={d.nombre} value={d.nombre}>{d.nombre}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label>Ciudad</Label>
                        <Select value={ciudad} onValueChange={setCiudad} disabled={!depto}>
                          <SelectTrigger><SelectValue placeholder="Seleccione" /></SelectTrigger>
                          <SelectContent>
                            {ciudades.map((c) => (
                              <SelectItem key={c.nombre} value={c.nombre}>{c.nombre}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div>
                      <Label>Departamentos médicos (separados por coma)</Label>
                      <Input value={deptosMed} onChange={(e) => setDeptosMed(e.target.value)} />
                    </div>
                  </>
                )}
                <Button type="submit" className="w-full">Crear cuenta</Button>
              </form>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
