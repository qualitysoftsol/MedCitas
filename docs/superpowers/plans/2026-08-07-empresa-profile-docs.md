# Empresa Profile Docs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Agregar al perfil de empresa: carga de PDF para RUT y Cámara de Comercio (bucket privado Supabase Storage), y campos de contacto para Recursos Humanos y Contabilidad.

**Architecture:** Nueva migración SQL crea 6 columnas en `profiles` y configura un bucket privado `empresa-docs` con políticas RLS. Los PDFs se suben inmediatamente al seleccionarlos vía Supabase Storage; las URLs firmadas se generan en cliente. Los campos de contacto se guardan junto al resto del perfil al presionar "Guardar cambios".

**Tech Stack:** Supabase (Storage + PostgreSQL), React, TanStack Router, TypeScript, Tailwind CSS, shadcn/ui.

## Global Constraints

- Solo usuarios con `role = 'empresa'` ven los nuevos campos.
- Los PDFs solo son accesibles por la empresa dueña y el admin.
- Bucket `empresa-docs` es privado (no público).
- Rutas de almacenamiento: `{profile.id}/rut.pdf` y `{profile.id}/camara_comercio.pdf`.
- No hay tests automatizados — verificación es manual en el navegador.

---

## File Map

| Archivo | Acción | Responsabilidad |
|---|---|---|
| `supabase/migrations/011_empresa_docs.sql` | Crear | Columnas DB + bucket storage + políticas RLS |
| `src/lib/database.types.ts` | Modificar | Tipos TS para las 6 columnas nuevas |
| `src/routes/app.perfil.tsx` | Modificar | Estado, lógica upload, UI empresa |

---

## Task 1: Migración SQL — columnas DB y storage

**Files:**
- Create: `supabase/migrations/011_empresa_docs.sql`

**Interfaces:**
- Produces: columnas `rut_url`, `camara_comercio_url`, `contacto_rrhh_telefono`, `contacto_rrhh_email`, `contacto_contabilidad_telefono`, `contacto_contabilidad_email` en `profiles`; bucket `empresa-docs`; política `empresa_docs_owner_all`

- [ ] **Step 1: Crear el archivo de migración**

Crear `supabase/migrations/011_empresa_docs.sql` con este contenido exacto:

```sql
-- ============================================================
-- MedCitas — Migration 011: Empresa document fields
-- Run in: Supabase Dashboard → SQL Editor → New query
-- ============================================================

-- 1. New columns on profiles
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS rut_url text,
  ADD COLUMN IF NOT EXISTS camara_comercio_url text,
  ADD COLUMN IF NOT EXISTS contacto_rrhh_telefono text,
  ADD COLUMN IF NOT EXISTS contacto_rrhh_email text,
  ADD COLUMN IF NOT EXISTS contacto_contabilidad_telefono text,
  ADD COLUMN IF NOT EXISTS contacto_contabilidad_email text;

-- 2. Private storage bucket for empresa documents
INSERT INTO storage.buckets (id, name, public)
VALUES ('empresa-docs', 'empresa-docs', false)
ON CONFLICT (id) DO UPDATE SET public = false;

-- 3. RLS policy: empresa owner + admin can read/write
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
    AND policyname = 'empresa_docs_owner_all'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY "empresa_docs_owner_all" ON storage.objects
        FOR ALL
        USING (
          bucket_id = 'empresa-docs' AND (
            (storage.foldername(name))[1] = auth.uid()::text
            OR EXISTS (
              SELECT 1 FROM public.profiles
              WHERE id = auth.uid() AND role = 'admin'
            )
          )
        )
        WITH CHECK (
          bucket_id = 'empresa-docs' AND (
            (storage.foldername(name))[1] = auth.uid()::text
            OR EXISTS (
              SELECT 1 FROM public.profiles
              WHERE id = auth.uid() AND role = 'admin'
            )
          )
        );
    $policy$;
  END IF;
END;
$$;
```

- [ ] **Step 2: Aplicar la migración en Supabase**

Abrir Supabase Dashboard → SQL Editor → New query. Pegar el contenido del archivo y ejecutar. El resultado esperado es: `Success. No rows returned.`

- [ ] **Step 3: Verificar columnas y bucket**

En Supabase Dashboard:
- Table Editor → `profiles` → confirmar que existen las 6 columnas nuevas
- Storage → confirmar bucket `empresa-docs` existe y tiene Public = false

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/011_empresa_docs.sql
git commit -m "feat: migration 011 - empresa doc columns and private storage bucket"
```

---

## Task 2: Actualizar tipos TypeScript

**Files:**
- Modify: `src/lib/database.types.ts`

**Interfaces:**
- Consumes: columnas creadas en Task 1
- Produces: tipo `Profile` actualizado con `rut_url`, `camara_comercio_url`, `contacto_rrhh_telefono`, `contacto_rrhh_email`, `contacto_contabilidad_telefono`, `contacto_contabilidad_email` (todos `string | null`)

- [ ] **Step 1: Agregar las 6 columnas al Row de profiles**

En `src/lib/database.types.ts`, dentro del bloque `profiles.Row`, agregar después de `lng: number | null`:

```typescript
          rut_url: string | null
          camara_comercio_url: string | null
          contacto_rrhh_telefono: string | null
          contacto_rrhh_email: string | null
          contacto_contabilidad_telefono: string | null
          contacto_contabilidad_email: string | null
```

El bloque completo de `profiles.Row` quedará:

```typescript
        Row: {
          id: string
          role: 'admin' | 'ips' | 'empresa' | 'particular'
          nombre: string
          telefono: string | null
          direccion: string | null
          descripcion: string | null
          nit: string | null
          cedula: string | null
          departamento: string | null
          ciudad: string | null
          lat: number | null
          lng: number | null
          rut_url: string | null
          camara_comercio_url: string | null
          contacto_rrhh_telefono: string | null
          contacto_rrhh_email: string | null
          contacto_contabilidad_telefono: string | null
          contacto_contabilidad_email: string | null
          servicios: string[] | null
          created_at: string
        }
```

- [ ] **Step 2: Verificar que TypeScript no reporta errores**

```bash
npx tsc --noEmit
```

Esperado: sin errores.

- [ ] **Step 3: Commit**

```bash
git add src/lib/database.types.ts
git commit -m "feat: add empresa document columns to Profile type"
```

---

## Task 3: Actualizar perfil — sección empresa

**Files:**
- Modify: `src/routes/app.perfil.tsx`

**Interfaces:**
- Consumes: `Profile.rut_url`, `Profile.camara_comercio_url`, `Profile.contacto_rrhh_telefono`, `Profile.contacto_rrhh_email`, `Profile.contacto_contabilidad_telefono`, `Profile.contacto_contabilidad_email` (Task 2); bucket `empresa-docs` (Task 1)
- Produces: UI de empresa visible en `/app/perfil` para el rol `empresa`

- [ ] **Step 1: Agregar el componente `PdfField` en el módulo**

Justo antes de `export const Route = ...`, agregar el componente auxiliar:

```tsx
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
```

- [ ] **Step 2: Agregar el estado empresa dentro de `Perfil`**

Debajo de los `useState` existentes (después de `const [resolvedLoc, ...]`), agregar:

```tsx
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
```

- [ ] **Step 3: Cargar datos empresa en el `useEffect` de profile**

Dentro del `useEffect` que depende de `[profile]`, al final del bloque, agregar:

```tsx
    if (profile.role === 'empresa') {
      setRutUrl(profile.rut_url ?? null);
      setCamaraUrl(profile.camara_comercio_url ?? null);
      setRrhhTelefono(profile.contacto_rrhh_telefono ?? "");
      setRrhhEmail(profile.contacto_rrhh_email ?? "");
      setContabilidadTelefono(profile.contacto_contabilidad_telefono ?? "");
      setContabilidadEmail(profile.contacto_contabilidad_email ?? "");
    }
```

- [ ] **Step 4: Agregar `useEffect` para generar signed URLs**

Después del `useEffect` que carga el email (`supabase.auth.getUser`), agregar:

```tsx
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
```

- [ ] **Step 5: Agregar función `uploadPdf` dentro de `Perfil`**

Después de la función `toggleItem`, agregar:

```tsx
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
```

- [ ] **Step 6: Incluir campos de contacto en `saveProfile`**

Dentro de `saveProfile`, después del bloque `if (profile.role === 'ips')`, agregar:

```tsx
    if (profile.role === 'empresa') {
      patch.contacto_rrhh_telefono = rrhhTelefono;
      patch.contacto_rrhh_email = rrhhEmail;
      patch.contacto_contabilidad_telefono = contabilidadTelefono;
      patch.contacto_contabilidad_email = contabilidadEmail;
    }
```

- [ ] **Step 7: Agregar sección empresa en el JSX**

Dentro del `<CardContent>`, justo antes del `<Button onClick={saveProfile}>`, reemplazar el bloque de cierre para agregar la sección empresa:

```tsx
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
                    value={rrhhTelefono}
                    onChange={(e) => setRrhhTelefono(e.target.value)}
                  />
                  <Input
                    placeholder="Email"
                    type="email"
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
                    value={contabilidadTelefono}
                    onChange={(e) => setContabilidadTelefono(e.target.value)}
                  />
                  <Input
                    placeholder="Email"
                    type="email"
                    value={contabilidadEmail}
                    onChange={(e) => setContabilidadEmail(e.target.value)}
                  />
                </div>
              </div>
            </>
          )}
```

- [ ] **Step 8: Verificar TypeScript**

```bash
npx tsc --noEmit
```

Esperado: sin errores.

- [ ] **Step 9: Verificación manual en el navegador**

1. Iniciar el servidor de desarrollo: `npm run dev`
2. Iniciar sesión como usuario empresa (ej. `postobonemp1@yopmail.com`)
3. Ir a `/app/perfil`
4. Confirmar que aparecen los campos: RUT, Cámara de Comercio, Contacto Recursos Humanos, Contacto Contabilidad
5. Subir un PDF de prueba en RUT → esperar spinner → confirmar toast "Documento cargado" → confirmar que aparece "✓ Archivo cargado" con enlace "Ver"
6. Hacer clic en "Ver" → el PDF debe abrirse en nueva pestaña
7. Hacer clic en "Reemplazar" → subir otro PDF → confirmar que reemplaza correctamente
8. Llenar los campos de teléfono y email de RRHH y Contabilidad → "Guardar cambios" → recargar → confirmar que los valores persisten
9. Iniciar sesión como otro rol (ej. IPS) → ir a `/app/perfil` → confirmar que NO aparecen los campos empresa

- [ ] **Step 10: Commit**

```bash
git add src/routes/app.perfil.tsx
git commit -m "feat: empresa profile fields - RUT/Camara PDF upload and contact info"
```
