import { createFileRoute, useNavigate, Navigate } from "@tanstack/react-router";
import { useState } from "react";
import { useAuth, DEPARTAMENTOS } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Stethoscope } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Ingreso — MedCitas" },
      { name: "description", content: "Inicia sesión o regístrate en MedCitas." },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const { login, register, profile, requestPasswordReset } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState("login");

  // login
  const [lEmail, setLEmail] = useState("");
  const [lPass, setLPass] = useState("");

  // recuperar contraseña
  const [forgotOpen, setForgotOpen] = useState(false);
  const [fEmail, setFEmail] = useState("");
  const [fSending, setFSending] = useState(false);

  // register
  const [role, setRole] = useState<"empresa" | "ips" | "particular">("empresa");
  const [rEmail, setREmail] = useState("");
  const [rPass, setRPass] = useState("");
  const [nombre, setNombre] = useState("");
  const [telefono, setTelefono] = useState("");
  const [nit, setNit] = useState("");
  const [cedula, setCedula] = useState("");
  const [depto, setDepto] = useState("");
  const [ciudad, setCiudad] = useState("");
  const [serviciosStr, setServiciosStr] = useState("Medicina General, Optometría");

  if (profile) return <Navigate to="/" />;

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await login(lEmail.trim(), lPass);
      navigate({ to: "/" });
    } catch (err: any) {
      toast.error(err.message ?? "Credenciales inválidas");
    }
  };

  const handleForgot = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fEmail.trim()) return toast.error("Ingresa tu correo electrónico");
    setFSending(true);
    try {
      await requestPasswordReset(fEmail.trim());
      // Mismo mensaje exista o no la cuenta, para que el formulario no sirva para
      // averiguar qué correos están registrados.
      toast.success("Si el correo está registrado, te enviamos un enlace para cambiar la contraseña.");
      setForgotOpen(false);
      setFEmail("");
    } catch (err) {
      // El usuario final no gana nada con el detalle, pero sin esto un fallo de
      // despliegue o de red es indistinguible de un problema del servidor de correo.
      console.error("[reset-password] fallo al solicitar el enlace:", err);
      toast.error("No se pudo enviar el correo. Intenta de nuevo en unos minutos.");
    } finally {
      setFSending(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rEmail.trim() || !rPass || !nombre.trim()) return toast.error("Completa los campos requeridos");
    if (role === "ips" && (!depto || !ciudad)) return toast.error("La IPS debe seleccionar departamento y ciudad");
    const ciudadObj = DEPARTAMENTOS.find((d) => d.nombre === depto)?.ciudades.find((c) => c.nombre === ciudad);
    try {
      await register({
        email: rEmail.trim(),
        password: rPass,
        role,
        nombre: nombre.trim(),
        telefono: telefono || undefined,
        ...(role === "empresa" ? { nit } : {}),
        ...(role === "particular" ? { cedula } : {}),
        ...(role === "ips" ? {
          departamento: depto,
          ciudad,
          lat: ciudadObj?.lat,
          lng: ciudadObj?.lng,
          servicios: serviciosStr.split(",").map((s) => s.trim()).filter(Boolean),
        } : {}),
      });
      toast.success("Cuenta creada. Revisa tu email para confirmar.");
    } catch (err: any) {
      toast.error(err.message ?? "Error al registrar");
    }
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
          <CardDescription>Ingresa o crea una cuenta como IPS, Empresa o Particular.</CardDescription>
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
                  <Label>Correo electrónico</Label>
                  <Input type="email" name="email" value={lEmail} onChange={(e) => setLEmail(e.target.value)} autoComplete="email" />
                </div>
                <div>
                  <Label>Contraseña</Label>
                  <Input type="password" name="password" value={lPass} onChange={(e) => setLPass(e.target.value)} autoComplete="current-password" />
                </div>
                <Button type="submit" className="w-full">Entrar</Button>
                <button
                  type="button"
                  onClick={() => { setFEmail(lEmail.trim()); setForgotOpen(true); }}
                  className="w-full text-sm text-muted-foreground hover:text-primary underline underline-offset-4"
                >
                  ¿Olvidaste tu contraseña?
                </button>
              </form>
            </TabsContent>
            <TabsContent value="register">
              <form onSubmit={handleRegister} className="space-y-3 mt-4" autoComplete="off">
                <div>
                  <Label>Tipo de cuenta</Label>
                  <Select value={role} onValueChange={(v) => setRole(v as typeof role)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="empresa">Empresa</SelectItem>
                      <SelectItem value="ips">IPS</SelectItem>
                      <SelectItem value="particular">Particular</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Correo electrónico</Label>
                  <Input type="email" name="registro-email" value={rEmail} onChange={(e) => setREmail(e.target.value)} autoComplete="off" data-1p-ignore data-lpignore="true" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Contraseña</Label>
                    <Input type="password" name="registro-password" value={rPass} onChange={(e) => setRPass(e.target.value)} autoComplete="new-password" data-1p-ignore data-lpignore="true" />
                  </div>
                  <div>
                    <Label>{role === "ips" ? "Nombre IPS" : role === "particular" ? "Nombre completo" : "Razón social"}</Label>
                    <Input value={nombre} onChange={(e) => setNombre(e.target.value)} autoComplete="off" />
                  </div>
                </div>
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
                          <SelectTrigger><SelectValue placeholder="Seleccione" /></SelectTrigger>
                          <SelectContent>
                            {DEPARTAMENTOS.map((d) => <SelectItem key={d.nombre} value={d.nombre}>{d.nombre}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label>Ciudad</Label>
                        <Select value={ciudad} onValueChange={setCiudad} disabled={!depto}>
                          <SelectTrigger><SelectValue placeholder="Seleccione" /></SelectTrigger>
                          <SelectContent>
                            {ciudades.map((c) => <SelectItem key={c.nombre} value={c.nombre}>{c.nombre}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div>
                      <Label>Servicios (separados por coma)</Label>
                      <Input value={serviciosStr} onChange={(e) => setServiciosStr(e.target.value)} />
                    </div>
                  </>
                )}
                <Button type="submit" className="w-full">Crear cuenta</Button>
              </form>
            </TabsContent>
          </Tabs>

          <Dialog open={forgotOpen} onOpenChange={setForgotOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Recuperar contraseña</DialogTitle>
                <DialogDescription>
                  Ingresa tu correo y te enviaremos un enlace para crear una contraseña nueva.
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleForgot} className="space-y-3">
                <div>
                  <Label>Correo electrónico</Label>
                  <Input type="email" value={fEmail} onChange={(e) => setFEmail(e.target.value)} autoComplete="email" />
                </div>
                <DialogFooter>
                  <Button type="submit" className="w-full" disabled={fSending}>
                    {fSending ? "Enviando…" : "Enviar enlace"}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </CardContent>
      </Card>
    </div>
  );
}
