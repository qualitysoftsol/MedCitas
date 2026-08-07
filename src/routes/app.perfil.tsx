import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { useAuth } from "@/lib/auth-context";
import { useUpdateProfile, useChangePassword } from "@/lib/hooks/useProfile";
import { supabase } from "@/lib/supabase";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { IpsFotosSection } from "@/components/IpsFotosSection";
import { AddressInput } from "@/components/AddressInput";
import { useServicios } from "@/lib/hooks/useCatalogos";

export const Route = createFileRoute("/app/perfil")({
  component: Perfil,
});

function Perfil() {
  const { profile } = useAuth();
  const updateProfile = useUpdateProfile();
  const changePassword = useChangePassword();

  const [nombre, setNombre] = useState("");
  const [telefono, setTelefono] = useState("");
  const [direccion, setDireccion] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [email, setEmail] = useState("");
  const [newP, setNewP] = useState("");
  const [confirmP, setConfirmP] = useState("");
  const [selectedServicios, setSelectedServicios] = useState<string[]>([]);
  const [resolvedLoc, setResolvedLoc] = useState<{ lat: number; lng: number } | null>(null);

  const { data: servicios = [] } = useServicios();

  useEffect(() => {
    if (!profile) return;
    setNombre(profile.nombre);
    setTelefono(profile.telefono ?? "");
    setDireccion(profile.direccion ?? "");
    setDescripcion(profile.descripcion ?? "");
    setSelectedServicios(profile.servicios ?? []);
  }, [profile]);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user?.email) setEmail(data.user.email);
    });
  }, []);

  if (!profile) return null;

  const toggleItem = (list: string[], setList: (v: string[]) => void, value: string) => {
    setList(list.includes(value) ? list.filter((x) => x !== value) : [...list, value]);
  };

  const saveProfile = () => {
    const patch: Parameters<typeof updateProfile.mutate>[0]['patch'] = {
      nombre, telefono, direccion, descripcion,
    };
    if (profile.role === 'ips') {
      patch.servicios = selectedServicios;
      if (resolvedLoc) {
        patch.lat = resolvedLoc.lat;
        patch.lng = resolvedLoc.lng;
      }
    }
    updateProfile.mutate(
      { id: profile.id, patch },
      {
        onSuccess: () => toast.success("Perfil actualizado"),
        onError: (err: any) => toast.error(err.message),
      }
    );
  };

  const savePass = () => {
    if (!newP || newP.length < 6) return toast.error("La contraseña debe tener al menos 6 caracteres");
    if (newP !== confirmP) return toast.error("Las contraseñas no coinciden");
    changePassword.mutate(newP, {
      onSuccess: () => {
        toast.success("Contraseña actualizada");
        setNewP(""); setConfirmP("");
      },
      onError: (err: any) => toast.error(err.message),
    });
  };

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card>
        <CardHeader><CardTitle>Datos del perfil</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div><Label>Email</Label><Input value={email} disabled /></div>
          <div><Label>Nombre / Razón social</Label><Input value={nombre} onChange={(e) => setNombre(e.target.value)} /></div>
          <div><Label>Teléfono</Label><Input value={telefono} onChange={(e) => setTelefono(e.target.value)} /></div>
          <div>
            <Label>Dirección</Label>
            {profile.role === 'ips' ? (
              <>
                <AddressInput
                  value={direccion}
                  city={profile.ciudad ?? undefined}
                  onChange={(v) => { setDireccion(v); setResolvedLoc(null); }}
                  onResolved={(loc, formatted) => { setDireccion(formatted); setResolvedLoc(loc); }}
                  placeholder="Cra 49 #91-25, Barrios Unidos"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Selecciona una sugerencia para actualizar tu ubicación en el mapa.
                </p>
              </>
            ) : (
              <Input value={direccion} onChange={(e) => setDireccion(e.target.value)} />
            )}
          </div>
          <div><Label>Descripción</Label><Textarea value={descripcion} onChange={(e) => setDescripcion(e.target.value)} /></div>
          {profile.role === 'ips' && (
            <>
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
          <Button onClick={saveProfile} disabled={updateProfile.isPending} className="w-full">
            {updateProfile.isPending ? "Guardando..." : "Guardar cambios"}
          </Button>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Cambiar contraseña</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div><Label>Nueva contraseña</Label><Input type="password" value={newP} onChange={(e) => setNewP(e.target.value)} /></div>
          <div><Label>Confirmar nueva</Label><Input type="password" value={confirmP} onChange={(e) => setConfirmP(e.target.value)} /></div>
          <Button onClick={savePass} disabled={changePassword.isPending} className="w-full">
            {changePassword.isPending ? "Actualizando..." : "Actualizar contraseña"}
          </Button>
        </CardContent>
      </Card>
      {profile.role === 'ips' && <IpsFotosSection ipsId={profile.id} />}
    </div>
  );
}
