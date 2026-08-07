# Spec: Campos documentales para perfil Empresa

**Fecha:** 2026-08-07
**Branch:** feat/servicios

---

## Contexto

El rol `empresa` en MedCitas necesita completar su perfil con documentos legales (RUT, Cámara de Comercio) y datos de contacto de dos áreas internas (Recursos Humanos y Contabilidad). Estos datos son necesarios para que el admin pueda verificar la empresa antes de aprobar su uso de la plataforma.

---

## Alcance

Solo afecta el perfil de usuarios con `role = 'empresa'`. Los demás roles no ven estos campos.

---

## Arquitectura

### Almacenamiento de PDFs

Nuevo bucket privado en Supabase Storage: `empresa-docs`.

- Estructura de rutas: `{empresa_id}/rut.pdf` y `{empresa_id}/camara_comercio.pdf`
- El bucket NO es público. El acceso se controla por políticas RLS en `storage.objects`:
  - **Lectura/escritura propia:** usuario autenticado cuyo `uid()` coincide con el primer segmento de la ruta
  - **Lectura/escritura admin:** usuarios con `role = 'admin'` en `profiles`
- Para mostrar/descargar el PDF, se generan URLs firmadas (signed URLs) con `supabase.storage.from('empresa-docs').createSignedUrl(...)` con un TTL suficiente (ej. 1 hora).

### Base de datos

Nueva migración `011_empresa_docs.sql` que agrega columnas a `profiles`:

```sql
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS rut_url text,
  ADD COLUMN IF NOT EXISTS camara_comercio_url text,
  ADD COLUMN IF NOT EXISTS contacto_rrhh_telefono text,
  ADD COLUMN IF NOT EXISTS contacto_rrhh_email text,
  ADD COLUMN IF NOT EXISTS contacto_contabilidad_telefono text,
  ADD COLUMN IF NOT EXISTS contacto_contabilidad_email text;
```

Las columnas `rut_url` y `camara_comercio_url` almacenan la ruta en storage (no la URL firmada), ej. `{empresa_id}/rut.pdf`. La URL firmada se genera en el cliente al necesitarla.

### Tipos TypeScript

Actualizar `src/lib/database.types.ts` para incluir las 6 columnas nuevas en `profiles.Row` (todas `string | null`).

---

## Componentes UI

### Sección empresa en `app.perfil.tsx`

Condicionada a `profile.role === 'empresa'`. Se agrega dentro del `<Card>` existente "Datos del perfil", debajo del campo Descripción y antes del botón "Guardar cambios".

#### Campo PDF (RUT y Cámara de Comercio)

- Label con nombre del campo
- Si ya existe un archivo: texto "Archivo cargado" con ícono de check verde + enlace "Ver" que abre el PDF en nueva pestaña (usando URL firmada) + botón "Reemplazar"
- Si no existe: botón "Cargar PDF" que abre el file picker (solo `accept=".pdf"`)
- Al seleccionar un archivo: se sube inmediatamente a `empresa-docs/{empresa_id}/{campo}.pdf` usando `supabase.storage.from(...).upload(path, file, { upsert: true })`
- Durante la subida: spinner + texto "Subiendo..."
- Al completar: actualiza `rut_url` o `camara_comercio_url` en `profiles` (llamada a `updateProfile`)
- Error: toast de error con mensaje

#### Campos de contacto (Recursos Humanos y Contabilidad)

- Dos inputs en fila (`grid grid-cols-2 gap-2`): Teléfono y Email
- Se guardan junto al resto del perfil al presionar "Guardar cambios" (no requieren acción separada)

---

## Flujo de datos

1. **Carga de PDF:**
   - Usuario selecciona archivo PDF → `supabase.storage.upload()` → on success → `supabase.from('profiles').update({ rut_url: path })` → toast success
2. **Visualización de PDF existente:**
   - Al cargar el perfil, si `profile.rut_url` existe → generar signed URL → mostrar enlace "Ver"
3. **Campos de contacto:**
   - Se incluyen en el `patch` del `saveProfile()` existente

---

## Políticas de storage (migración SQL)

```sql
-- Bucket privado
INSERT INTO storage.buckets (id, name, public)
VALUES ('empresa-docs', 'empresa-docs', false)
ON CONFLICT (id) DO UPDATE SET public = false;

-- Empresa lee/escribe su propia carpeta
CREATE POLICY "empresa_docs_owner_all" ON storage.objects
  FOR ALL USING (
    bucket_id = 'empresa-docs' AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
    )
  )
  WITH CHECK (
    bucket_id = 'empresa-docs' AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
    )
  );
```

---

## Archivos a modificar/crear

| Archivo | Acción |
|---|---|
| `supabase/migrations/011_empresa_docs.sql` | Crear — columnas DB + bucket + políticas storage |
| `src/lib/database.types.ts` | Modificar — agregar 6 columnas a `profiles.Row` |
| `src/routes/app.perfil.tsx` | Modificar — sección empresa con upload PDFs y contactos |

---

## Fuera del alcance

- Validación de formato/tamaño del PDF (se acepta cualquier PDF)
- Vista del admin para revisar los documentos (se hace fuera de la plataforma por ahora)
- Notificaciones al admin cuando una empresa sube documentos
