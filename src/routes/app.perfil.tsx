import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { useStore } from "@/lib/store";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

export const Route = createFileRoute("/app/perfil")({
  component: Perfil,
});

function Perfil() {
  const { currentUser, updateProfile, changePassword } = useStore();
  const [nombre, setNombre] = useState("");
  const [telefono, setTelefono] = useState("");
  const [direccion, setDireccion] = useState("");
  const [descripcion, setDescripcion] = useState("");

  const [oldP, setOldP] = useState("");
  const [newP, setNewP] = useState("");
  const [confirmP, setConfirmP] = useState("");

  useEffect(() => {
    if (!currentUser) return;
    setNombre(currentUser.profile.nombre);
    setTelefono(currentUser.profile.telefono ?? "");
    setDireccion(currentUser.profile.direccion ?? "");
    setDescripcion(currentUser.profile.descripcion ?? "");
  }, [currentUser]);

  if (!currentUser) return null;

  const saveProfile = () => {
    updateProfile({ profile: { nombre, telefono, direccion, descripcion } });
    toast.success("Perfil actualizado");
  };

  const savePass = () => {
    if (!newP || newP.length < 4) return toast.error("Contraseña muy corta");
    if (newP !== confirmP) return toast.error("Las contraseñas no coinciden");
    const res = changePassword(oldP, newP);
    if (!res.ok) return toast.error(res.error ?? "Error");
    toast.success("Contraseña actualizada");
    setOldP(""); setNewP(""); setConfirmP("");
  };

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card>
        <CardHeader><CardTitle>Datos del perfil</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div><Label>Usuario</Label><Input value={currentUser.usuario} disabled /></div>
          <div><Label>Nombre / Razón social</Label><Input value={nombre} onChange={(e) => setNombre(e.target.value)} /></div>
          <div><Label>Teléfono</Label><Input value={telefono} onChange={(e) => setTelefono(e.target.value)} /></div>
          <div><Label>Dirección</Label><Input value={direccion} onChange={(e) => setDireccion(e.target.value)} /></div>
          <div><Label>Descripción</Label><Textarea value={descripcion} onChange={(e) => setDescripcion(e.target.value)} /></div>
          <Button onClick={saveProfile} className="w-full">Guardar cambios</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Cambiar contraseña</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div><Label>Contraseña actual</Label><Input type="password" value={oldP} onChange={(e) => setOldP(e.target.value)} /></div>
          <div><Label>Nueva contraseña</Label><Input type="password" value={newP} onChange={(e) => setNewP(e.target.value)} /></div>
          <div><Label>Confirmar nueva</Label><Input type="password" value={confirmP} onChange={(e) => setConfirmP(e.target.value)} /></div>
          <Button onClick={savePass} className="w-full">Actualizar contraseña</Button>
        </CardContent>
      </Card>
    </div>
  );
}
