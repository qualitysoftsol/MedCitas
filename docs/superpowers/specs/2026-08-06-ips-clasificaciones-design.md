# Diseño: Módulo Catálogos y Clasificaciones IPS

**Fecha:** 2026-08-06  
**Estado:** Aprobado

## Resumen

Agregar un módulo "Catálogos" al panel de administración que permite gestionar (crear, editar, eliminar) tres entidades: clasificaciones de IPS, departamentos médicos y tipos de examen. Los tipos de examen incluyen restricción configurable por rol. Estas entidades reemplazan las listas hardcodeadas actuales y se aplican en formularios de IPS, visualización y filtrado en toda la app.

---

## Base de datos

Tres nuevas tablas en Supabase:

```sql
CREATE TABLE clasificaciones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre text NOT NULL UNIQUE,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE departamentos_medicos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre text NOT NULL UNIQUE,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE tipos_examen (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre text NOT NULL UNIQUE,
  roles_permitidos text[] NOT NULL DEFAULT '{empresa,particular}',
  created_at timestamptz DEFAULT now()
);
```

La tabla `profiles` recibe una nueva columna:

```sql
ALTER TABLE profiles ADD COLUMN clasificaciones text[];
```

Los slots y citas continúan referenciando el nombre del departamento médico como texto (sin FK), igual que hoy.

**Datos iniciales (seed):**
- Clasificaciones: Medicina Ocupacional, Invalidez, Rehabilitación, Imágenes Diagnósticas
- Departamentos médicos: los valores actualmente hardcodeados en el frontend
- Tipos de examen: Ingreso `{empresa,particular}`, Egreso `{empresa}`, Periódico `{empresa,particular}`

---

## Admin: Sección Catálogos

**Nueva ruta:** `src/routes/app.admin.catalogos.tsx` → `/app/admin/catalogos`

Interfaz con tres pestañas: **Clasificaciones**, **Departamentos Médicos**, **Tipos de Examen**.

Cada pestaña comparte la misma estructura:
- Lista de ítems existentes, con botón Eliminar por fila
- Campo de texto + botón "Agregar" para crear nuevos
- Edición inline: clic en el nombre lo convierte en input editable, Enter/blur guarda

La pestaña **Tipos de Examen** agrega una columna con checkboxes `empresa` y `particular` por fila para configurar `roles_permitidos`.

La nueva ruta se enlaza en el menú de navegación del admin junto a las opciones existentes.

---

## Formularios de IPS

### Admin — Registro (`src/routes/app.admin.registrar.tsx`)
- Campo `departamentos_medicos` (texto libre) → reemplazado por checkboxes cargados desde tabla `departamentos_medicos`
- Nueva sección de checkboxes para `clasificaciones`, cargada desde tabla `clasificaciones`
- Ambos campos opcionales, dentro del bloque condicional `role === 'ips'`

### IPS — Perfil (`src/routes/app.perfil.tsx`)
- Mismos checkboxes dinámicos para `departamentos_medicos` y `clasificaciones`
- Se inicializan con los valores actuales del perfil
- Al guardar, actualizan las columnas correspondientes en Supabase

---

## Visualización

### Panel de detalle IPS (`src/components/IpsDetailPanel.tsx`)
- Sección "Clasificaciones" con badges dinámicos (no se muestra si está vacío)
- Badges de departamentos médicos ya existentes, sin cambio visual

### Dashboard admin (`src/routes/app.admin.index.tsx`)
- Badges de clasificaciones en la tarjeta de cada IPS, junto a los de departamentos médicos

---

## Filtrado y restricciones por rol

### Solicitar examen — empresa (`src/routes/app.empresa.solicitar.tsx`)
- Filtro de clasificaciones: multi-selección, lógica OR, opcional
- Tipos de examen disponibles: todos los de la tabla `tipos_examen` (sin restricción)

### Solicitar examen — particular (`src/routes/app.particular.solicitar.tsx`)
- Filtro de clasificaciones: igual que empresa
- Tipos de examen: solo los que tengan `'particular'` en `roles_permitidos`

El filtro de clasificaciones aplica antes de mostrar IPS en mapa/lista: si ninguna clasificación está seleccionada, se muestran todas las IPS.

---

## Archivos afectados

| Archivo | Cambio |
|---|---|
| `supabase/` | Migración SQL: 3 tablas nuevas + columna `clasificaciones` en `profiles` |
| `src/lib/database.types.ts` | Tipos `Clasificacion`, `DepartamentoMedico`, `TipoExamen`; campo `clasificaciones` en `Profile` |
| `src/routes/app.admin.catalogos.tsx` | Nueva ruta — CRUD para las tres entidades |
| `src/routes/__root.tsx` / nav del admin | Enlace a la nueva sección Catálogos |
| `src/routes/app.admin.registrar.tsx` | Checkboxes dinámicos para clasificaciones y departamentos |
| `src/routes/app.perfil.tsx` | Checkboxes dinámicos para clasificaciones y departamentos |
| `src/components/IpsDetailPanel.tsx` | Badges de clasificaciones |
| `src/routes/app.admin.index.tsx` | Badges de clasificaciones en tarjeta IPS |
| `src/routes/app.empresa.solicitar.tsx` | Filtro clasificaciones; tipos de examen dinámicos |
| `src/routes/app.particular.solicitar.tsx` | Filtro clasificaciones; tipos de examen filtrados por rol |
