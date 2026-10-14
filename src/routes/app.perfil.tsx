import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect, useMemo } from "react";
import {
  UserRound, IdCard, Phone, Mail, MapPin, Lock, Save, Loader2, CheckCircle2, FileText, Upload, ExternalLink,
  RefreshCw, Building2, Stethoscope, ShieldCheck, Users,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth-context";
import { useUpdateProfile, useChangePassword } from "@/lib/hooks/useProfile";
import { supabase } from "@/lib/supabase";
import type { Profile } from "@/lib/database.types";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { IpsFotosSection } from "@/components/IpsFotosSection";
import { AddressInput } from "@/components/AddressInput";
import { PageHeader } from "@/components/app/PageHeader";
import { FormField, IconInput, PasswordInput, PasswordChecklist, PASSWORD_RULES } from "@/components/app/FormField";
import { useServicios } from "@/lib/hooks/useCatalogos";
import { useGuardarPrecios, useMisPrecios } from "@/lib/hooks/usePrecios";
import { formatMiles, iniciales } from "@/lib/format";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/app/perfil")({
  component: Perfil,
});

// Etiquetas según el tipo de usuario: un particular no ve "Razón social".
const NOMBRE_LABEL: Record<Profile["role"], string> = {
  particular: "Nombre completo",
  empresa: "Razón social",
  ips: "Nombre de la IPS",
  admin: "Nombre",
};
const ROLE_LABEL: Record<Profile["role"], string> = {
  particular: "Particular", empresa: "Empresa", ips: "IPS", admin: "Administrador",
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const soloDigitos = (v: string) => v.replace(/\D/g, "");

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
  const inputId = `pdf-${label.toLowerCase().replace(/\s+/g, "-")}`;
  const pick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) onUpload(f);
    e.target.value = "";
  };
  return (
    <div className="flex items-center gap-3 rounded-lg border bg-surface p-3">
      <div className={cn("flex size-10 shrink-0 items-center justify-center rounded-lg", storedUrl ? "bg-success-soft text-success-foreground" : "bg-muted text-muted-foreground")}>
        <FileText className="size-5" aria-hidden />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">{label}</p>
        <p className="text-xs text-muted-foreground">
          {uploading ? "Subiendo…" : storedUrl ? "Documento cargado" : "Pendiente · solo PDF"}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {storedUrl && signedUrl && !uploading && (
          <a href={signedUrl} target="_blank" rel="noopener noreferrer" className="inline-flex h-9 items-center gap-1 rounded-lg px-2 text-sm font-semibold text-accent-foreground hover:bg-muted">
            <ExternalLink className="size-4" aria-hidden /> Ver<span className="sr-only"> {label} (pestaña nueva)</span>
          </a>
        )}
        <label
          htmlFor={inputId}
          className={cn(
            "inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-lg border border-input bg-card px-3 text-sm font-semibold hover:bg-muted focus-within:ring-2 focus-within:ring-ring",
            uploading && "pointer-events-none opacity-50",
          )}
        >
          {uploading ? <Loader2 className="size-4 animate-spin" aria-hidden /> : storedUrl ? <RefreshCw className="size-4" aria-hidden /> : <Upload className="size-4" aria-hidden />}
          {storedUrl ? "Reemplazar" : "Cargar PDF"}
          <input id={inputId} type="file" accept=".pdf,application/pdf" className="sr-only" onChange={pick} disabled={uploading} />
        </label>
      </div>
    </div>
  );
}

function SuccessNote({ show, children }: { show: boolean; children: React.ReactNode }) {
  return (
    <span
      role="status"
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full bg-success-soft px-2.5 py-1 text-xs font-semibold text-success-foreground transition-opacity duration-300",
        show ? "opacity-100" : "pointer-events-none opacity-0",
      )}
    >
      <CheckCircle2 className="size-3.5" aria-hidden /> {show ? children : null}
    </span>
  );
}

function Perfil() {
  const { profile, email, refreshProfile } = useAuth();
  const updateProfile = useUpdateProfile();
  const changePassword = useChangePassword();

  const [nombre, setNombre] = useState("");
  const [cedula, setCedula] = useState("");
  const [telefono, setTelefono] = useState("");
  const [direccion, setDireccion] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [newP, setNewP] = useState("");
  const [confirmP, setConfirmP] = useState("");
  const [selectedServicios, setSelectedServicios] = useState<string[]>([]);
  // Precio por id de servicio, solo dígitos ("" = sin precio).
  const [precios, setPrecios] = useState<Record<string, string>>({});
  const [resolvedLoc, setResolvedLoc] = useState<{ lat: number; lng: number } | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [passTouched, setPassTouched] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [passSavedAt, setPassSavedAt] = useState<number | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [passError, setPassError] = useState<string | null>(null);

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
  const { data: misPrecios } = useMisPrecios(profile?.role === "ips" ? profile.id : undefined);
  const guardarPrecios = useGuardarPrecios();

  useEffect(() => {
    if (misPrecios) setPrecios(Object.fromEntries([...misPrecios].map(([id, precio]) => [id, String(precio)])));
  }, [misPrecios]);

  useEffect(() => {
    if (!profile) return;
    setNombre(profile.nombre);
    setCedula(profile.cedula ?? "");
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

  // Oculta los avisos de "guardado" tras unos segundos.
  useEffect(() => {
    if (!savedAt) return;
    const t = setTimeout(() => setSavedAt(null), 4000);
    return () => clearTimeout(t);
  }, [savedAt]);
  useEffect(() => {
    if (!passSavedAt) return;
    const t = setTimeout(() => setPassSavedAt(null), 4000);
    return () => clearTimeout(t);
  }, [passSavedAt]);

  const errors = useMemo(() => {
    const e: Record<string, string> = {};
    if (!nombre.trim()) e.nombre = "Este campo es obligatorio.";
    if (profile?.role === "particular") {
      if (!cedula.trim()) e.cedula = "Ingresa tu número de documento.";
      else if (!/^\d{5,12}$/.test(cedula.trim())) e.cedula = "Usa solo números, entre 5 y 12 dígitos.";
    }
    const tel = soloDigitos(telefono);
    if (telefono.trim() && (tel.length < 7 || tel.length > 10)) e.telefono = "Ingresa un teléfono de 7 a 10 dígitos.";
    if (rrhhEmail.trim() && !EMAIL_RE.test(rrhhEmail.trim())) e.rrhhEmail = "Correo inválido. Ejemplo: rrhh@empresa.com";
    if (contabilidadEmail.trim() && !EMAIL_RE.test(contabilidadEmail.trim())) e.contabilidadEmail = "Correo inválido. Ejemplo: pagos@empresa.com";
    return e;
  }, [nombre, cedula, telefono, rrhhEmail, contabilidadEmail, profile?.role]);

  if (!profile) return null;

  const isParticular = profile.role === "particular";
  const showErr = (k: string) => (submitted ? errors[k] ?? null : null);

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
    if (file.type && file.type !== "application/pdf") {
      toast.error("El archivo debe ser un PDF");
      return;
    }
    const storageKey = campo === "rut" ? "rut_url" : "camara_comercio_url";
    const path = `${profile!.id}/${campo}.pdf`;
    setUploading(true);
    const { error: uploadError } = await supabase.storage
      .from("empresa-docs")
      .upload(path, file, { upsert: true, contentType: "application/pdf" });
    if (uploadError) {
      toast.error("No se pudo subir el documento", { description: uploadError.message });
      setUploading(false);
      return;
    }
    const { error: updateError } = await (supabase.from("profiles") as any)
      .update({ [storageKey]: path })
      .eq("id", profile!.id);
    if (updateError) {
      toast.error("No se pudo guardar el documento", { description: updateError.message });
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

  const saveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    setSaveError(null);
    if (Object.keys(errors).length > 0) {
      toast.error("Revisa los campos marcados");
      return;
    }
    const patch: Parameters<typeof updateProfile.mutate>[0]['patch'] = {
      nombre: nombre.trim(), telefono: telefono.trim(), direccion: direccion.trim(),
    };
    // La descripción no aplica a particulares: no se muestra ni se sobrescribe.
    if (!isParticular) patch.descripcion = descripcion;
    if (isParticular) patch.cedula = cedula.trim();
    if (profile.role === 'ips') {
      patch.servicios = selectedServicios;
      if (resolvedLoc) {
        patch.lat = resolvedLoc.lat;
        patch.lng = resolvedLoc.lng;
      }
    }
    if (profile.role === 'empresa') {
      patch.contacto_rrhh_telefono = rrhhTelefono;
      patch.contacto_rrhh_email = rrhhEmail.trim();
      patch.contacto_contabilidad_telefono = contabilidadTelefono;
      patch.contacto_contabilidad_email = contabilidadEmail.trim();
    }
    try {
      await updateProfile.mutateAsync({ id: profile.id, patch });
      if (profile.role === 'ips') {
        // Solo se tocan los precios de los servicios marcados; un precio vacío se borra.
        await guardarPrecios.mutateAsync({
          ipsId: profile.id,
          precios: servicios
            .filter((s) => selectedServicios.includes(s.nombre))
            .map((s) => ({ servicio_id: s.id, precio: precios[s.id] ? Number(precios[s.id]) : null })),
        });
      }
      toast.success("Información actualizada");
      setSavedAt(Date.now());
      setSubmitted(false);
      void refreshProfile();
    } catch (err: any) {
      const msg = err?.message?.includes("Failed to fetch")
        ? "Sin conexión. Revisa tu internet e inténtalo de nuevo."
        : "No pudimos guardar los cambios. Inténtalo de nuevo.";
      setSaveError(msg);
      toast.error(msg);
    }
  };

  const passOk = PASSWORD_RULES.every((r) => r.test(newP));
  const mismatch = confirmP.length > 0 && newP !== confirmP;

  const savePass = (e: React.FormEvent) => {
    e.preventDefault();
    setPassTouched(true);
    setPassError(null);
    if (!passOk) return setPassError("La contraseña no cumple todos los requisitos.");
    if (newP !== confirmP) return;
    changePassword.mutate(newP, {
      onSuccess: () => {
        toast.success("Contraseña actualizada");
        setNewP(""); setConfirmP(""); setPassTouched(false);
        setPassSavedAt(Date.now());
      },
      onError: (err: any) => {
        const msg = err?.message?.toLowerCase().includes("different")
          ? "La nueva contraseña debe ser distinta de la actual."
          : "No pudimos actualizar la contraseña. Inténtalo de nuevo.";
        setPassError(msg);
        toast.error(msg);
      },
    });
  };

  return (
    <div className="space-y-6">
      <PageHeader
        icon={UserRound}
        title="Mi perfil"
        description="Administra tu información personal y mantén tu cuenta segura."
      />

      <div className="grid gap-6 lg:grid-cols-12">
        {/* Información personal · 8 columnas */}
        <Card className="lg:col-span-8">
          <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
            <div className="flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-xl bg-primary-soft text-accent-foreground">
                {profile.role === "empresa" ? <Building2 className="size-5" aria-hidden /> : profile.role === "ips" ? <Stethoscope className="size-5" aria-hidden /> : <UserRound className="size-5" aria-hidden />}
              </div>
              <div>
                <CardTitle className="text-lg">{isParticular ? "Información personal" : "Información de la cuenta"}</CardTitle>
                <CardDescription>Mantén tus datos al día para recibir recordatorios de tus citas.</CardDescription>
              </div>
            </div>
            <SuccessNote show={!!savedAt}>Información actualizada</SuccessNote>
          </CardHeader>
          <CardContent>
            <form onSubmit={saveProfile} noValidate className="space-y-5">
              <div className="grid gap-5 sm:grid-cols-2">
                <FormField id="perfil-nombre" label={NOMBRE_LABEL[profile.role]} required error={showErr("nombre")} className="sm:col-span-2">
                  <IconInput icon={profile.role === "empresa" ? Building2 : UserRound} value={nombre} onChange={(e) => setNombre(e.target.value)} autoComplete="off" />
                </FormField>

                {isParticular && (
                  <FormField id="perfil-cedula" label="Número de documento" required error={showErr("cedula")} hint="Cédula de ciudadanía, sin puntos.">
                    <IconInput icon={IdCard} inputMode="numeric" value={cedula} onChange={(e) => setCedula(soloDigitos(e.target.value))} autoComplete="off" />
                  </FormField>
                )}
                {profile.role === "empresa" && profile.nit && (
                  <FormField id="perfil-nit" label="NIT" hint="Para cambiar el NIT, contacta a soporte.">
                    <IconInput icon={IdCard} value={profile.nit} readOnly disabled />
                  </FormField>
                )}

                <FormField id="perfil-telefono" label="Teléfono" error={showErr("telefono")} hint="Celular o fijo, 7 a 10 dígitos.">
                  <IconInput icon={Phone} type="tel" inputMode="tel" value={telefono} onChange={(e) => setTelefono(e.target.value)} autoComplete="off" />
                </FormField>

                <FormField id="perfil-email" label="Correo electrónico" hint="Es tu usuario de acceso. Para cambiarlo, contacta a soporte." className={cn(isParticular ? "sm:col-span-2" : "")}>
                  <IconInput icon={Mail} value={email ?? ""} readOnly disabled />
                </FormField>

                <FormField
                  id="perfil-direccion"
                  label="Dirección"
                  className="sm:col-span-2"
                  hint={profile.role === "ips" ? "Selecciona una sugerencia para actualizar tu ubicación en el mapa." : undefined}
                >
                  {profile.role === 'ips' ? (
                    <AddressInput
                      value={direccion}
                      city={profile.ciudad ?? undefined}
                      onChange={(v) => { setDireccion(v); setResolvedLoc(null); }}
                      onResolved={(loc, formatted) => { setDireccion(formatted); setResolvedLoc(loc); }}
                      placeholder="Cra 49 #91-25, Barrios Unidos"
                    />
                  ) : (
                    <IconInput icon={MapPin} value={direccion} onChange={(e) => setDireccion(e.target.value)} autoComplete="off" placeholder="Ej.: Carrera 69D # 4 Sur-28" />
                  )}
                </FormField>

                {!isParticular && (
                  <FormField id="perfil-descripcion" label="Descripción" className="sm:col-span-2" hint={`${descripcion.length}/300 caracteres`}>
                    <Textarea value={descripcion} maxLength={300} onChange={(e) => setDescripcion(e.target.value)} />
                  </FormField>
                )}
              </div>

              {profile.role === 'ips' && (
                <fieldset className="space-y-3 border-t pt-5">
                  <legend className="text-sm font-semibold">Servicios y precios</legend>
                  <p className="text-[13px] text-muted-foreground">
                    Marca los servicios que ofreces y escribe el precio de cada uno en pesos. Solo puedes crear horarios de servicios con precio.
                  </p>
                  <ul className="divide-y rounded-xl border">
                    {servicios.map((d) => {
                      const activo = selectedServicios.includes(d.nombre);
                      const sinPrecio = activo && !precios[d.id];
                      return (
                        <li key={d.id} className={cn("flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2.5 sm:flex-nowrap", activo && "bg-primary-soft/40")}>
                          <label className="flex min-w-0 flex-1 cursor-pointer select-none items-center gap-2.5 text-sm">
                            <Checkbox checked={activo} onCheckedChange={() => toggleItem(selectedServicios, setSelectedServicios, d.nombre)} />
                            <span className="min-w-0">
                              <span className="block truncate">{d.nombre}</span>
                              {sinPrecio && <span className="block text-xs text-warning-foreground">Sin precio: no podrás crear horarios</span>}
                            </span>
                          </label>
                          {activo && (
                            <div className="relative w-full sm:w-44">
                              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground" aria-hidden>$</span>
                              <Input
                                id={`precio-${d.id}`}
                                aria-label={`Precio de ${d.nombre} en pesos`}
                                inputMode="numeric"
                                autoComplete="off"
                                placeholder="Precio"
                                value={precios[d.id] ? formatMiles(Number(precios[d.id])) : ""}
                                onChange={(e) => setPrecios((p) => ({ ...p, [d.id]: soloDigitos(e.target.value).replace(/^0+/, "").slice(0, 9) }))}
                                className="bg-card pl-7 text-right tabular-nums"
                              />
                            </div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </fieldset>
              )}

              {profile.role === 'empresa' && (
                <>
                  <fieldset className="space-y-3 border-t pt-5">
                    <legend className="text-sm font-semibold">Documentos de la empresa</legend>
                    <div className="grid gap-3 md:grid-cols-2">
                      <PdfField
                        label="RUT"
                        storedUrl={rutUrl}
                        signedUrl={rutSignedUrl}
                        uploading={uploadingRut}
                        onUpload={(f) => uploadPdf(f, "rut", setUploadingRut, setRutUrl, setRutSignedUrl)}
                      />
                      <PdfField
                        label="Cámara de Comercio"
                        storedUrl={camaraUrl}
                        signedUrl={camaraSignedUrl}
                        uploading={uploadingCamara}
                        onUpload={(f) => uploadPdf(f, "camara_comercio", setUploadingCamara, setCamaraUrl, setCamaraSignedUrl)}
                      />
                    </div>
                  </fieldset>
                  <fieldset className="space-y-4 border-t pt-5">
                    <legend className="flex items-center gap-2 text-sm font-semibold"><Users className="size-4" aria-hidden /> Contactos</legend>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <FormField id="rrhh-tel" label="Recursos Humanos · Teléfono">
                        <IconInput icon={Phone} name="contacto-rrhh-telefono" autoComplete="off" value={rrhhTelefono} onChange={(e) => setRrhhTelefono(e.target.value)} />
                      </FormField>
                      <FormField id="rrhh-email" label="Recursos Humanos · Correo" error={showErr("rrhhEmail")}>
                        <IconInput icon={Mail} type="text" inputMode="email" name="contacto-rrhh-email" autoComplete="off" data-1p-ignore data-lpignore="true" value={rrhhEmail} onChange={(e) => setRrhhEmail(e.target.value)} />
                      </FormField>
                      <FormField id="conta-tel" label="Contabilidad · Teléfono">
                        <IconInput icon={Phone} name="contacto-contabilidad-telefono" autoComplete="off" value={contabilidadTelefono} onChange={(e) => setContabilidadTelefono(e.target.value)} />
                      </FormField>
                      <FormField id="conta-email" label="Contabilidad · Correo" error={showErr("contabilidadEmail")}>
                        <IconInput icon={Mail} type="text" inputMode="email" name="contacto-contabilidad-email" autoComplete="off" data-1p-ignore data-lpignore="true" value={contabilidadEmail} onChange={(e) => setContabilidadEmail(e.target.value)} />
                      </FormField>
                    </div>
                  </fieldset>
                </>
              )}

              {saveError && (
                <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm font-medium text-danger-foreground">{saveError}</p>
              )}

              <div className="flex flex-col-reverse gap-3 border-t pt-5 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs text-muted-foreground"><span className="text-danger-foreground">*</span> Campos obligatorios</p>
                <Button type="submit" size="lg" disabled={updateProfile.isPending || guardarPrecios.isPending} className="w-full sm:w-auto">
                  {updateProfile.isPending || guardarPrecios.isPending ? <><Loader2 className="animate-spin" /> Guardando…</> : <><Save /> Guardar cambios</>}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        {/* Columna derecha · 4 columnas */}
        <div className="space-y-6 lg:col-span-4">
          <Card className="overflow-hidden">
            <div className="h-16" style={{ background: "var(--gradient-primary)" }} aria-hidden />
            <CardContent className="-mt-8 flex flex-col items-center pb-6 text-center">
              <div className="flex size-16 items-center justify-center rounded-full border-4 border-card bg-primary text-xl font-bold text-primary-foreground" aria-hidden>
                {iniciales(profile.nombre)}
              </div>
              <p className="mt-2 font-semibold">{profile.nombre}</p>
              {email && <p className="text-sm text-muted-foreground">{email}</p>}
              <span className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-primary-soft px-2.5 py-1 text-xs font-semibold text-accent-foreground">
                <ShieldCheck className="size-3.5" aria-hidden /> Cuenta {ROLE_LABEL[profile.role].toLowerCase()}
              </span>
            </CardContent>
          </Card>

          <Card id="seguridad" className="scroll-mt-24">
            <CardHeader className="space-y-0">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-3">
                  <div className="flex size-10 items-center justify-center rounded-xl bg-primary-soft text-accent-foreground">
                    <Lock className="size-5" aria-hidden />
                  </div>
                  <div>
                    <CardTitle className="text-lg">Seguridad de la cuenta</CardTitle>
                    <CardDescription>Cambia tu contraseña de acceso.</CardDescription>
                  </div>
                </div>
              </div>
              <SuccessNote show={!!passSavedAt}>Contraseña actualizada</SuccessNote>
            </CardHeader>
            <CardContent>
              <form onSubmit={savePass} noValidate className="space-y-4">
                <FormField id="nueva-password" label="Nueva contraseña" error={passTouched && !passOk && newP ? "Aún no cumple todos los requisitos." : null}>
                  <PasswordInput name="nueva-password" autoComplete="new-password" data-1p-ignore data-lpignore="true" value={newP} onChange={(e) => setNewP(e.target.value)} />
                </FormField>
                <PasswordChecklist password={newP} />
                <FormField id="confirmar-password" label="Confirmar nueva contraseña" error={mismatch ? "Las contraseñas no coinciden." : null}>
                  <PasswordInput name="confirmar-password" autoComplete="new-password" data-1p-ignore data-lpignore="true" value={confirmP} onChange={(e) => setConfirmP(e.target.value)} />
                </FormField>
                {confirmP && !mismatch && passOk && (
                  <p className="flex items-center gap-1.5 text-[13px] font-medium text-success-foreground">
                    <CheckCircle2 className="size-3.5" aria-hidden /> Las contraseñas coinciden
                  </p>
                )}
                {passError && <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm font-medium text-danger-foreground">{passError}</p>}
                <Button type="submit" className="w-full" size="lg" disabled={changePassword.isPending || !newP || !confirmP}>
                  {changePassword.isPending ? <><Loader2 className="animate-spin" /> Actualizando…</> : <><Lock /> Actualizar contraseña</>}
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>

        {profile.role === 'ips' && <IpsFotosSection ipsId={profile.id} />}
      </div>
    </div>
  );
}

