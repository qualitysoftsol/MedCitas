# Spec: PDF adjunto obligatorio en resultados de IPS

**Fecha:** 2026-08-07
**Estado:** Aprobado

## Resumen

Agregar un campo de carga de PDF obligatorio al modal "Nuevo resultado" en la vista de IPS (`/app/ips/resultados`). El archivo se almacena en Supabase Storage y su URL se persiste en la tabla `resultados`. Los resultados cargados muestran un enlace "Ver PDF".

---

## 1. Base de datos

### Migración 012 — `resultados` pdf_url

```sql
ALTER TABLE resultados
  ADD COLUMN IF NOT EXISTS pdf_url text NOT NULL DEFAULT '';
```

El `DEFAULT ''` evita romper filas existentes. La obligatoriedad se impone en la UI.

---

## 2. Supabase Storage

### Bucket: `resultados-pdfs` (privado)

| Propiedad | Valor |
|-----------|-------|
| `id`      | `resultados-pdfs` |
| `public`  | `false` |

### Path de archivos

```
resultados-pdfs/{ips_id}/{appointment_id}.pdf
```

### Políticas RLS (storage.objects)

| Política | Operación | Condición |
|----------|-----------|-----------|
| `resultados_pdf_ips_write` | INSERT, UPDATE, DELETE | `bucket_id = 'resultados-pdfs'` AND carpeta raíz = `auth.uid()` OR admin |
| `resultados_pdf_read` | SELECT | `bucket_id = 'resultados-pdfs'` AND (carpeta raíz = `auth.uid()` OR `solicitante_id` del resultado = `auth.uid()` OR admin) |

Para simplificar la política de lectura del solicitante, se usa signed URLs generados server-side (desde la sesión de la IPS o del solicitante), sin necesidad de una política de lectura cruzada compleja. La política de lectura permite acceso si la carpeta raíz coincide con `auth.uid()` (IPS) o si el usuario es admin. El solicitante accede vía signed URL generado por la IPS al momento de la consulta.

---

## 3. Tipos TypeScript

Actualizar `Resultado` en `src/lib/database.types.ts`:

```ts
// En la sección de resultados
pdf_url: string
```

---

## 4. Hooks

### `useAddResultado` — actualización

La `mutationFn` recibe un `File` adicional y ejecuta en secuencia:

1. `supabase.storage.from('resultados-pdfs').upload(path, file, { upsert: true })`
2. Si falla el upload → lanza error (no inserta fila)
3. Obtiene la URL pública/path: guarda el path relativo (`{ips_id}/{appointment_id}.pdf`)
4. Inserta fila en `resultados` con `pdf_url` = path relativo
5. Actualiza `appointments.estado = 'atendida'`

### `useResultadoPdfUrl(path: string)` — nuevo hook

```ts
// Genera signed URL válida 1 hora para mostrar el PDF
supabase.storage.from('resultados-pdfs').createSignedUrl(path, 3600)
```

Se llama en el componente de lista de resultados para cada fila que tenga `pdf_url`.

---

## 5. UI — Modal "Nuevo resultado"

### Campo nuevo (obligatorio, posición: después de Observaciones, antes del botón Guardar)

```
Label: "Resultado PDF *"
Input: <input type="file" accept=".pdf" />
```

- Muestra nombre del archivo seleccionado
- Si el usuario intenta guardar sin PDF → `toast.error("El PDF del resultado es obligatorio")`
- Durante la operación (upload + insert) → botón "Guardar" deshabilitado con texto "Guardando..."
- Si el upload falla → `toast.error("Error al subir el PDF: " + mensaje)`

### Estado local nuevo

```ts
const [pdfFile, setPdfFile] = useState<File | null>(null)
```

Reset a `null` al cerrar/guardar exitosamente.

---

## 6. UI — Lista "Resultados cargados"

Cada fila con `pdf_url` no vacío muestra:

```
[Ver PDF ↗]  (enlace que abre en nueva pestaña)
```

El enlace usa el signed URL generado por `useResultadoPdfUrl`. Mientras el URL se genera, muestra texto deshabilitado "Cargando...".

---

## 7. Archivos a modificar/crear

| Archivo | Cambio |
|---------|--------|
| `supabase/migrations/012_resultados_pdf.sql` | Nuevo — migración DB + bucket + RLS |
| `src/lib/database.types.ts` | Agregar `pdf_url: string` a tipo Resultado |
| `src/lib/hooks/useResultados.ts` | Actualizar `useAddResultado`, agregar `useResultadoPdfUrl` |
| `src/routes/app.ips.resultados.tsx` | Campo PDF en modal + enlace en lista |

---

## 8. Fuera del alcance

- Visualización de PDF para el rol empresa o particular (se aborda en spec separado si se requiere)
- Reemplazar un PDF ya subido (upsert está habilitado pero no hay UI para ello)
- Validación del tamaño del PDF en el cliente
