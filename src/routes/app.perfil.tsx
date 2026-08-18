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

function PdfField({
  label,
  storedUrl,
  signedUrl,
  uploading,
  onUpload,
}: {
  label: string;
  storedUrl: string | null;
  signedUrl: string | null;
  uploading: boolean;
  onUpload: (file: File) => void;
}) {
  return (
    <div>
      <Label>{label}</Label>
      <div className="mt-1 flex items-center gap-3 flex-wrap">
        {uploading ? (
          <span className="text-sm text-muted-foreground">Subiendo...</span>
        ) : storedUrl ? (
          <>
            <span className="text-sm text-green-600 font-medium">✓ Archivo cargado</span>
            {signedUrl && (
              <a
                href={signedUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-primary underline"
              >
                Ver
              </a>
            )}
            <label className="cursor-pointer text-sm text-muted-foreground underline">
              Reemplazar
              <input
                type="file"
                accept=".pdf"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) onUpload(f);
                  e.target.value = "";
                }}
              />
            </label>
          </>
        ) : (
          <label className="cursor-pointer inline-flex items-center justify-center rounded-md text-sm font-medium border border-input bg-background hover:bg-accent hover:text-accent-foreground h-9 px-4 py-2">
            Cargar PDF
            <input
              type="file"
              accept=".pdf"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onUpload(f);
                e.target.value = "";
              }}
            />
          </label>
        )}
      </div>
    </div>
  );
}

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

  const [rutUrl, setRutUrl] = useState<string | null>(null);
  const [camaraUrl, setCamaraUrl] = useState<string | null>(null);
  const [rutSignedUrl, setRutSignedUrl] = useState<string | null>(null);
  const [camaraSignedUrl, setCamaraSignedUrl] = useState<string | null>(null);
  const [uploadingRut, setUploadingRut] = useState(false);
  const [uploadingCamara, setUploadingCamara] = useState(false);
  const [rrhhTelefono, setRrhhTelefono] = useState("");
  const [rrhhEmail, setRrhhEmail] = useState("");
  const [contabilidadTelefono, setContabilidadTelefono] = useState("");
  const [contabilidadEmail, setContabilidadEmail] = useState("");

  const { data: servicios = [] } = useServicios();

  useEffect(() => {
    if (!profile) return;
    setNombre(profile.nombre);
    setTelefono(profile.telefono ?? "");
    setDireccion(profile.direccion ?? "");
    setDescripcion(profile.descripcion ?? "");
    setSelectedServicios(profile.servicios ?? []);
    if (profile.role === 'empresa') {
      setRutUrl(profile.rut_url ?? null);
      setCamaraUrl(profile.camara_comercio_url ?? null);
      setRrhhTelefono(profile.contacto_rrhh_telefono ?? "");
      setRrhhEmail(profile.contacto_rrhh_email ?? "");
      setContabilidadTelefono(profile.contacto_contabilidad_telefono ?? "");
      setContabilidadEmail(profile.contacto_contabilidad_email ?? "");
    }
  }, [profile]);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user?.email) setEmail(data.user.email);
    });
  }, []);

  useEffect(() => {
    if (rutUrl) {
      supabase.storage
        .from("empresa-docs")
        .createSignedUrl(rutUrl, 3600)
        .then(({ data }) => { if (data) setRutSignedUrl(data.signedUrl); });
    }
    if (camaraUrl) {
      supabase.storage
        .from("empresa-docs")
        .createSignedUrl(camaraUrl, 3600)
        .then(({ data }) => { if (data) setCamaraSignedUrl(data.signedUrl); });
    }
  }, [rutUrl, camaraUrl]);

  if (!profile) return null;

  const toggleItem = (list: string[], setList: (v: string[]) => void, value: string) => {
    setList(list.includes(value) ? list.filter((x) => x !== value) : [...list, value]);
  };

  const uploadPdf = async (
    file: File,
    campo: "rut" | "camara_comercio",
    setUploading: (v: boolean) => void,
    setStoredUrl: (v: string | null) => void,
    setSignedUrl: (v: string | null) => void,
  ) => {
    const storageKey = campo === "rut" ? "rut_url" : "camara_comercio_url";
    const path = `${profile!.id}/${campo}.pdf`;
    setUploading(true);
    const { error: uploadError } = await supabase.storage
      .from("empresa-docs")
      .upload(path, file, { upsert: true, contentType: "application/pdf" });
    if (uploadError) {
      toast.error(uploadError.message);
      setUploading(false);
      return;
    }
    const { error: updateError } = await (supabase.from("profiles") as any)
      .update({ [storageKey]: path })
      .eq("id", profile!.id);
    if (updateError) {
      toast.error(updateError.message);
    } else {
      setStoredUrl(path);
      const { data } = await supabase.storage
        .from("empresa-docs")
        .createSignedUrl(path, 3600);
      if (data) setSignedUrl(data.signedUrl);
      toast.success("Documento cargado");
    }
    setUploading(false);
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
    if (profile.role === 'empresa') {
      patch.contacto_rrhh_telefono = rrhhTelefono;
      patch.contacto_rrhh_email = rrhhEmail;
      patch.contacto_contabilidad_telefono = contabilidadTelefono;
      patch.contacto_contabilidad_email = contabilidadEmail;
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
          <div><Label>Email</Label><Input value={email} disabled autoComplete="off" /></div>
          <div><Label>Nombre / Razón social</Label><Input value={nombre} onChange={(e) => setNombre(e.target.value)} autoComplete="off" /></div>
          <div><Label>Teléfono</Label><Input value={telefono} onChange={(e) => setTelefono(e.target.value)} autoComplete="off" /></div>
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
              <Input value={direccion} onChange={(e) => setDireccion(e.target.value)} autoComplete="off" />
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
          {profile.role === 'empresa' && (
            <>
              <PdfField
                label="RUT"
                storedUrl={rutUrl}
                signedUrl={rutSignedUrl}
                uploading={uploadingRut}
                onUpload={(f) =>
                  uploadPdf(f, "rut", setUploadingRut, setRutUrl, setRutSignedUrl)
                }
              />
              <PdfField
                label="Cámara de Comercio"
                storedUrl={camaraUrl}
                signedUrl={camaraSignedUrl}
                uploading={uploadingCamara}
                onUpload={(f) =>
                  uploadPdf(f, "camara_comercio", setUploadingCamara, setCamaraUrl, setCamaraSignedUrl)
                }
              />
              <div>
                <Label>Contacto Recursos Humanos</Label>
                <div className="grid grid-cols-2 gap-2 mt-1">
                  <Input
                    placeholder="Teléfono"
                    name="contacto-rrhh-telefono"
                    autoComplete="off"
                    value={rrhhTelefono}
                    onChange={(e) => setRrhhTelefono(e.target.value)}
                  />
                  <Input
                    placeholder="Email"
                    type="text"
                    inputMode="email"
                    name="contacto-rrhh-email"
                    autoComplete="off"
                    data-1p-ignore
                    data-lpignore="true"
                    value={rrhhEmail}
                    onChange={(e) => setRrhhEmail(e.target.value)}
                  />
                </div>
              </div>
              <div>
                <Label>Contacto Contabilidad</Label>
                <div className="grid grid-cols-2 gap-2 mt-1">
                  <Input
                    placeholder="Teléfono"
                    name="contacto-contabilidad-telefono"
                    autoComplete="off"
                    value={contabilidadTelefono}
                    onChange={(e) => setContabilidadTelefono(e.target.value)}
                  />
                  <Input
                    placeholder="Email"
                    type="text"
                    inputMode="email"
                    name="contacto-contabilidad-email"
                    autoComplete="off"
                    data-1p-ignore
                    data-lpignore="true"
                    value={contabilidadEmail}
                    onChange={(e) => setContabilidadEmail(e.target.value)}
                  />
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
          <div><Label>Nueva contraseña</Label><Input type="password" name="nueva-password" autoComplete="new-password" data-1p-ignore data-lpignore="true" value={newP} onChange={(e) => setNewP(e.target.value)} /></div>
          <div><Label>Confirmar nueva</Label><Input type="password" name="confirmar-password" autoComplete="new-password" data-1p-ignore data-lpignore="true" value={confirmP} onChange={(e) => setConfirmP(e.target.value)} /></div>
          <Button onClick={savePass} disabled={changePassword.isPending} className="w-full">
            {changePassword.isPending ? "Actualizando..." : "Actualizar contraseña"}
          </Button>
        </CardContent>
      </Card>
      {profile.role === 'ips' && <IpsFotosSection ipsId={profile.id} />}
    </div>
  );
}
