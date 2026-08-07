# Diseño: Renombrar Departamentos Médicos a Servicios + Vinculación a Clasificación

**Fecha:** 2026-08-06  
**Estado:** Aprobado

## Resumen

Renombrar "departamentos médicos" a "servicios" en toda la app (DB, tipos, hooks, UI). Cada servicio se vincula a una clasificación mediante FK. Las clasificaciones de una IPS se derivan automáticamente de los servicios que ofrece — la columna `clasificaciones text[]` en `profiles` se elimina.

---

## Base de datos

Nueva migración `supabase/migrations/008_servicios.sql`:

```sql
-- Renombrar tabla y agregar FK a clasificaciones
ALTER TABLE departamentos_medicos RENAME TO servicios;
ALTER TABLE servicios ADD COLUMN clasificacion_id uuid REFERENCES clasificaciones(id) ON DELETE SET NULL;

-- Renombrar columna en profiles, eliminar clasificaciones
ALTER TABLE profiles RENAME COLUMN departamentos_medicos TO servicios;
ALTER TABLE profiles DROP COLUMN clasificaciones;

-- Renombrar columna en slots y appointments
ALTER TABLE slots RENAME COLUMN departamento_medico TO servicio;
ALTER TABLE appointments RENAME COLUMN departamento_medico TO servicio;

-- Actualizar RLS (renombrar políticas si es necesario)
-- Las políticas de la tabla servicios heredan las de departamentos_medicos automáticamente al renombrar la tabla.
-- Si se usaron nombres de política explícitos, recrearlos sobre la tabla servicios.

-- Actualizar trigger handle_new_user para leer 'servicios' en vez de 'departamentos_medicos'
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (
    id, role, nombre, telefono, nit, cedula,
    departamento, ciudad, lat, lng, servicios
  ) VALUES (
    NEW.id,
    (NEW.raw_user_meta_data->>'role')::user_role,
    COALESCE(NEW.raw_user_meta_data->>'nombre', 'Sin nombre'),
    NEW.raw_user_meta_data->>'telefono',
    NEW.raw_user_meta_data->>'nit',
    NEW.raw_user_meta_data->>'cedula',
    NEW.raw_user_meta_data->>'departamento',
    NEW.raw_user_meta_data->>'ciudad',
    NULLIF(NEW.raw_user_meta_data->>'lat', '')::float8,
    NULLIF(NEW.raw_user_meta_data->>'lng', '')::float8,
    CASE
      WHEN NEW.raw_user_meta_data->'servicios' IS NOT NULL
      THEN ARRAY(SELECT jsonb_array_elements_text(NEW.raw_user_meta_data->'servicios'))
      ELSE NULL
    END
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

---

## Tipos TypeScript (`src/lib/database.types.ts`)

### Profile
```typescript
// Antes:
departamentos_medicos: string[] | null
clasificaciones: string[] | null

// Después:
servicios: string[] | null
// clasificaciones eliminado
```

### Slot
```typescript
// Antes: departamento_medico: string
// Después: servicio: string
```

### Appointment
```typescript
// Antes: departamento_medico: string
// Después: servicio: string
```

### Tipo Servicio (nuevo, reemplaza DepartamentoMedico)
```typescript
type Servicio = {
  id: string
  nombre: string
  clasificacion_id: string | null
  clasificacion: { id: string; nombre: string } | null
  created_at: string
}
```

La tabla `clasificaciones` y su tipo `Clasificacion` no cambian.  
El tipo `DepartamentoMedico` se elimina.

---

## Hooks (`src/lib/hooks/useCatalogos.ts`)

Eliminar los 4 hooks de `departamentos_medicos` y reemplazar con:

```typescript
useServicios()           // select('*, clasificaciones(id, nombre)') para traer la clasificación anidada
useAddServicio()         // insert({ nombre }) — sin clasificacion_id inicial
useUpdateServicio()      // update({ nombre, clasificacion_id }) por id
useDeleteServicio()      // delete por id
```

QueryKey: `['catalogos', 'servicios']`

Función auxiliar exportada desde el mismo archivo:
```typescript
export function derivarClasificaciones(
  nombresServicios: string[],
  catalogo: Servicio[]
): string[] {
  const set = new Set<string>();
  nombresServicios.forEach((n) => {
    const s = catalogo.find((c) => c.nombre === n);
    if (s?.clasificacion?.nombre) set.add(s.clasificacion.nombre);
  });
  return Array.from(set);
}
```

---

## Admin Catálogos (`src/routes/app.admin.catalogos.tsx`)

- Pestaña "Departamentos Médicos" → renombrar a **"Servicios"**
- Reemplazar `SimplePanel` para servicios con `ServiciosPanel`:
  - Lista de servicios: nombre (editable inline) + dropdown `Select` de clasificación + botón eliminar
  - Cuando el admin cambia la clasificación en el dropdown, llama `useUpdateServicio` inmediatamente (sin botón guardar separado)
  - Campo "Nuevo servicio" + botón "Agregar" (sin clasificación inicial — queda `null`)
  - Opciones del dropdown: todas las clasificaciones del catálogo + opción "Sin clasificación"

---

## Formularios IPS

### Admin registrar (`src/routes/app.admin.registrar.tsx`)
- Label "Departamentos médicos" → "Servicios"
- Estado `selectedDeptosMed` → `selectedServicios`
- Hook `useDepartamentosMedicos()` → `useServicios()`
- Campo enviado al edge function: `servicios` (en vez de `departamentos_medicos`)

### IPS Perfil (`src/routes/app.perfil.tsx`)
- Mismos cambios de label, estado y hook
- `saveProfile` parchea `servicios` (en vez de `departamentos_medicos` y `clasificaciones`)

### Edge function `create-user`
- Destructura `servicios` en vez de `departamentos_medicos`
- Pasa `servicios` en `user_metadata`

---

## Visualización

### IpsDetailPanel (`src/components/IpsDetailPanel.tsx`)
- Agrega `useServicios()` para cargar el catálogo
- Muestra badges de servicios (igual que antes, `variant="secondary"`)
- Deriva y muestra badges de clasificaciones con `derivarClasificaciones(ips.servicios, catalogo)` (`variant="outline"`) — solo si hay clasificaciones derivadas

### Dashboard admin (`src/routes/app.admin.index.tsx`)
- Igual: agrega `useServicios()`, muestra badges de servicios y clasificaciones derivadas

---

## Filtrado en solicitar

### Empresa y Particular (`app.empresa.solicitar.tsx`, `app.particular.solicitar.tsx`)
- Ya cargan `useServicios()` (reemplaza `useClasificaciones` como fuente para el filtro)
- Filtro OR actualizado:

```typescript
.filter(ips =>
  filtroClasificaciones.length === 0 ||
  derivarClasificaciones(ips.servicios ?? [], catalogoServicios)
    .some(c => filtroClasificaciones.includes(c))
)
```

- El filtro sigue mostrando clasificaciones (no servicios) al usuario — se cargan con `useClasificaciones()` (sin cambios)

---

## Archivos afectados

| Archivo | Cambio |
|---|---|
| `supabase/migrations/008_servicios.sql` | Nuevo — rename tabla/columnas, add FK, update trigger |
| `src/lib/database.types.ts` | Rename campos, nuevo tipo `Servicio`, eliminar `DepartamentoMedico` |
| `src/lib/hooks/useCatalogos.ts` | Reemplazar hooks de departamentos con hooks de servicios + `derivarClasificaciones` |
| `supabase/functions/create-user/index.ts` | `departamentos_medicos` → `servicios` |
| `src/routes/app.admin.catalogos.tsx` | Pestaña "Servicios" con dropdown de clasificación |
| `src/routes/app.admin.registrar.tsx` | Label + estado + hook renombrados |
| `src/routes/app.perfil.tsx` | Label + estado + hook renombrados; eliminar clasificaciones |
| `src/components/IpsDetailPanel.tsx` | Usar `useServicios()` + `derivarClasificaciones` |
| `src/routes/app.admin.index.tsx` | Usar `useServicios()` + `derivarClasificaciones` |
| `src/routes/app.empresa.solicitar.tsx` | Filtro usando `derivarClasificaciones` |
| `src/routes/app.particular.solicitar.tsx` | Filtro usando `derivarClasificaciones` |
| `src/routes/app.ips.calendario.tsx` | Renombrar campo `departamento_medico` → `servicio` en slots |
| `src/routes/app.ips.citas.tsx` | Renombrar campo `departamento_medico` → `servicio` en display |
| `src/routes/app.ips.resultados.tsx` | Renombrar campo si referencia `departamento_medico` |
| `src/routes/app.empresa.citas.tsx` | Renombrar campo en display de citas |
| `src/routes/app.particular.citas.tsx` | Renombrar campo en display de citas |
