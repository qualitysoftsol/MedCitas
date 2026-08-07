# Catálogos y Clasificaciones IPS — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Agregar módulo Catálogos al admin con CRUD para clasificaciones, departamentos médicos y tipos de examen, aplicar clasificaciones a IPS en formularios/visualización/filtrado, y restringir tipos de examen por rol.

**Architecture:** Tres nuevas tablas Supabase (`clasificaciones`, `departamentos_medicos`, `tipos_examen`) más columna `clasificaciones text[]` en `profiles`. El campo `tipo_examen` en `appointments` pasa de enum Postgres a `text`. El frontend consulta los catálogos dinámicamente via TanStack Query. El filtrado usa lógica OR sobre las clasificaciones seleccionadas.

**Tech Stack:** React 19, TanStack Router v1, TanStack Query v5, Supabase JS v2, Tailwind CSS v4, shadcn/ui (Checkbox, Tabs ya instalados)

## Global Constraints

- Imports de UI desde `@/components/ui/...`, hooks desde `@/lib/hooks/...`, supabase desde `@/lib/supabase`
- TanStack Router: crear archivo de ruta → el dev server regenera `routeTree.gen.ts` automáticamente
- No hay framework de tests — verificar con `bun run build` al final de cada tarea
- Rutas de admin siguen el patrón `createFileRoute("/app/admin/nombre")`
- Todas las mutaciones invalidan su queryKey después de ejecutarse

---

### Task 1: Migración SQL

**Files:**
- Create: `supabase/migrations/007_catalogos.sql`

**Interfaces:**
- Produces: tablas `clasificaciones`, `departamentos_medicos`, `tipos_examen`; columna `clasificaciones text[]` en `profiles`; `tipo_examen` como `text` en `appointments`; trigger actualizado

- [ ] **Step 1: Crear archivo de migración**

Crear `supabase/migrations/007_catalogos.sql` con el siguiente contenido completo:

```sql
-- ============================================================
-- MedCitas — Catálogos + Clasificaciones IPS
-- Run in: Supabase Dashboard → SQL Editor → New query
-- ============================================================

-- 1. Nuevas tablas de catálogos
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
  roles_permitidos text[] NOT NULL DEFAULT ARRAY['empresa'::text, 'particular'::text],
  created_at timestamptz DEFAULT now()
);

-- 2. Columna clasificaciones en profiles
ALTER TABLE profiles ADD COLUMN clasificaciones text[];

-- 3. Cambiar tipo_examen de enum a text (para hacerlo dinámico)
ALTER TABLE appointments ALTER COLUMN tipo_examen TYPE text USING tipo_examen::text;
DROP TYPE tipo_examen_enum;

-- 4. RLS en nuevas tablas
ALTER TABLE clasificaciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE departamentos_medicos ENABLE ROW LEVEL SECURITY;
ALTER TABLE tipos_examen ENABLE ROW LEVEL SECURITY;

CREATE POLICY "catalogos_public_read" ON clasificaciones FOR SELECT USING (true);
CREATE POLICY "catalogos_admin_write" ON clasificaciones FOR ALL USING (is_admin());

CREATE POLICY "deptos_public_read" ON departamentos_medicos FOR SELECT USING (true);
CREATE POLICY "deptos_admin_write" ON departamentos_medicos FOR ALL USING (is_admin());

CREATE POLICY "tipos_public_read" ON tipos_examen FOR SELECT USING (true);
CREATE POLICY "tipos_admin_write" ON tipos_examen FOR ALL USING (is_admin());

-- 5. Seed: clasificaciones
INSERT INTO clasificaciones (nombre) VALUES
  ('Medicina Ocupacional'),
  ('Invalidez'),
  ('Rehabilitación'),
  ('Imágenes Diagnósticas');

-- 6. Seed: departamentos médicos comunes en medicina ocupacional colombiana
INSERT INTO departamentos_medicos (nombre) VALUES
  ('Medicina General'),
  ('Optometría'),
  ('Audiometría'),
  ('Psicología'),
  ('Medicina Ocupacional');

-- 7. Seed: tipos de examen con restricciones
INSERT INTO tipos_examen (nombre, roles_permitidos) VALUES
  ('Ingreso',   ARRAY['empresa'::text, 'particular'::text]),
  ('Anual',     ARRAY['empresa'::text, 'particular'::text]),
  ('Retiro',    ARRAY['empresa'::text]);

-- 8. Actualizar trigger para incluir clasificaciones
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (
    id, role, nombre, telefono, nit, cedula,
    departamento, ciudad, lat, lng, departamentos_medicos, clasificaciones
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
      WHEN NEW.raw_user_meta_data->'departamentos_medicos' IS NOT NULL
      THEN ARRAY(SELECT jsonb_array_elements_text(NEW.raw_user_meta_data->'departamentos_medicos'))
      ELSE NULL
    END,
    CASE
      WHEN NEW.raw_user_meta_data->'clasificaciones' IS NOT NULL
      THEN ARRAY(SELECT jsonb_array_elements_text(NEW.raw_user_meta_data->'clasificaciones'))
      ELSE NULL
    END
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

- [ ] **Step 2: Ejecutar en Supabase**

Ir a Supabase Dashboard → SQL Editor → pegar el contenido del archivo y ejecutar. Verificar que no hay errores.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/007_catalogos.sql
git commit -m "feat: add catalogos migration with clasificaciones, departamentos_medicos, tipos_examen tables"
```

---

### Task 2: Tipos TypeScript

**Files:**
- Modify: `src/lib/database.types.ts`

**Interfaces:**
- Produces: tipos `Clasificacion`, `DepartamentoMedico`, `TipoExamen`; campo `clasificaciones` en `Profile`; `tipo_examen: string` en `Appointment`

- [ ] **Step 1: Actualizar database.types.ts**

Reemplazar el contenido completo de `src/lib/database.types.ts`:

```typescript
export type Database = {
  public: {
    Tables: {
      profiles: {
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
          departamentos_medicos: string[] | null
          clasificaciones: string[] | null
          created_at: string
        }
        Insert: Omit<Database['public']['Tables']['profiles']['Row'], 'created_at'>
        Update: Partial<Database['public']['Tables']['profiles']['Insert']>
      }
      ips_fotos: {
        Row: {
          id: string
          ips_id: string
          url: string
          orden: number
          created_at: string
        }
        Insert: Omit<Database['public']['Tables']['ips_fotos']['Row'], 'id' | 'created_at'>
        Update: Partial<Database['public']['Tables']['ips_fotos']['Insert']>
      }
      slots: {
        Row: {
          id: string
          ips_id: string
          fecha: string
          hora: string
          departamento_medico: string
          ciudad: string
          taken: boolean
          created_at: string
        }
        Insert: Omit<Database['public']['Tables']['slots']['Row'], 'id' | 'created_at' | 'taken'>
        Update: Partial<Database['public']['Tables']['slots']['Row']>
      }
      appointments: {
        Row: {
          id: string
          slot_id: string
          ips_id: string
          solicitante_id: string
          empleado_nombre: string
          empleado_cedula: string
          tipo_examen: string
          fecha: string
          hora: string
          ciudad: string
          departamento_medico: string
          estado: 'agendada' | 'atendida' | 'cancelada'
          created_at: string
        }
        Insert: Omit<Database['public']['Tables']['appointments']['Row'], 'id' | 'created_at' | 'estado'>
        Update: Partial<Database['public']['Tables']['appointments']['Row']>
      }
      resultados: {
        Row: {
          id: string
          appointment_id: string
          solicitante_id: string
          ips_id: string
          empleado_nombre: string
          empleado_cedula: string
          fecha: string
          diagnostico: string
          apto: 'apto' | 'apto_restricciones' | 'no_apto'
          observaciones: string
          created_at: string
        }
        Insert: Omit<Database['public']['Tables']['resultados']['Row'], 'id' | 'created_at'>
        Update: Partial<Database['public']['Tables']['resultados']['Row']>
      }
      notifications: {
        Row: {
          id: string
          user_id: string
          tipo: 'cita_agendada' | 'cita_cancelada' | 'resultado_cargado'
          titulo: string
          mensaje: string
          read: boolean
          created_at: string
        }
        Insert: Omit<Database['public']['Tables']['notifications']['Row'], 'id' | 'created_at' | 'read'>
        Update: Partial<Database['public']['Tables']['notifications']['Row']>
      }
      clasificaciones: {
        Row: { id: string; nombre: string; created_at: string }
        Insert: { nombre: string }
        Update: Partial<{ nombre: string }>
      }
      departamentos_medicos: {
        Row: { id: string; nombre: string; created_at: string }
        Insert: { nombre: string }
        Update: Partial<{ nombre: string }>
      }
      tipos_examen: {
        Row: { id: string; nombre: string; roles_permitidos: string[]; created_at: string }
        Insert: { nombre: string; roles_permitidos?: string[] }
        Update: Partial<{ nombre: string; roles_permitidos: string[] }>
      }
    }
  }
}

export type Profile = Database['public']['Tables']['profiles']['Row']
export type IpsFoto = Database['public']['Tables']['ips_fotos']['Row']
export type Slot = Database['public']['Tables']['slots']['Row']
export type Appointment = Database['public']['Tables']['appointments']['Row']
export type Resultado = Database['public']['Tables']['resultados']['Row']
export type Notification = Database['public']['Tables']['notifications']['Row']
export type Clasificacion = Database['public']['Tables']['clasificaciones']['Row']
export type DepartamentoMedico = Database['public']['Tables']['departamentos_medicos']['Row']
export type TipoExamen = Database['public']['Tables']['tipos_examen']['Row']
```

- [ ] **Step 2: Verificar build**

```bash
bun run build
```

Resolver cualquier error de TypeScript antes de continuar.

- [ ] **Step 3: Commit**

```bash
git add src/lib/database.types.ts
git commit -m "feat: add clasificaciones, departamentos_medicos, tipos_examen types to database.types"
```

---

### Task 3: Hooks de catálogos

**Files:**
- Create: `src/lib/hooks/useCatalogos.ts`

**Interfaces:**
- Produces:
  - `useClasificaciones()` → `{ data: Clasificacion[] }`
  - `useAddClasificacion()` → `useMutation<void, Error, string>`
  - `useUpdateClasificacion()` → `useMutation<void, Error, { id: string; nombre: string }>`
  - `useDeleteClasificacion()` → `useMutation<void, Error, string>`
  - `useDepartamentosMedicos()` → `{ data: DepartamentoMedico[] }`
  - `useAddDepartamentoMedico()` → `useMutation<void, Error, string>`
  - `useUpdateDepartamentoMedico()` → `useMutation<void, Error, { id: string; nombre: string }>`
  - `useDeleteDepartamentoMedico()` → `useMutation<void, Error, string>`
  - `useTiposExamen()` → `{ data: TipoExamen[] }`
  - `useAddTipoExamen()` → `useMutation<void, Error, string>`
  - `useUpdateTipoExamen()` → `useMutation<void, Error, { id: string; nombre: string; roles_permitidos: string[] }>`
  - `useDeleteTipoExamen()` → `useMutation<void, Error, string>`

- [ ] **Step 1: Crear src/lib/hooks/useCatalogos.ts**

```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Clasificacion, DepartamentoMedico, TipoExamen } from '@/lib/database.types'

// ─── Clasificaciones ─────────────────────────────────────────────────────────

export function useClasificaciones() {
  return useQuery({
    queryKey: ['catalogos', 'clasificaciones'],
    queryFn: async () => {
      const { data, error } = await supabase.from('clasificaciones').select('*').order('nombre')
      if (error) throw error
      return data as Clasificacion[]
    },
  })
}

export function useAddClasificacion() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (nombre: string) => {
      const { error } = await supabase.from('clasificaciones').insert({ nombre })
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['catalogos', 'clasificaciones'] }),
  })
}

export function useUpdateClasificacion() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, nombre }: { id: string; nombre: string }) => {
      const { error } = await supabase.from('clasificaciones').update({ nombre }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['catalogos', 'clasificaciones'] }),
  })
}

export function useDeleteClasificacion() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('clasificaciones').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['catalogos', 'clasificaciones'] }),
  })
}

// ─── Departamentos Médicos ────────────────────────────────────────────────────

export function useDepartamentosMedicos() {
  return useQuery({
    queryKey: ['catalogos', 'departamentos_medicos'],
    queryFn: async () => {
      const { data, error } = await supabase.from('departamentos_medicos').select('*').order('nombre')
      if (error) throw error
      return data as DepartamentoMedico[]
    },
  })
}

export function useAddDepartamentoMedico() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (nombre: string) => {
      const { error } = await supabase.from('departamentos_medicos').insert({ nombre })
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['catalogos', 'departamentos_medicos'] }),
  })
}

export function useUpdateDepartamentoMedico() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, nombre }: { id: string; nombre: string }) => {
      const { error } = await supabase.from('departamentos_medicos').update({ nombre }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['catalogos', 'departamentos_medicos'] }),
  })
}

export function useDeleteDepartamentoMedico() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('departamentos_medicos').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['catalogos', 'departamentos_medicos'] }),
  })
}

// ─── Tipos de Examen ──────────────────────────────────────────────────────────

export function useTiposExamen() {
  return useQuery({
    queryKey: ['catalogos', 'tipos_examen'],
    queryFn: async () => {
      const { data, error } = await supabase.from('tipos_examen').select('*').order('nombre')
      if (error) throw error
      return data as TipoExamen[]
    },
  })
}

export function useAddTipoExamen() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (nombre: string) => {
      const { error } = await supabase.from('tipos_examen').insert({ nombre })
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['catalogos', 'tipos_examen'] }),
  })
}

export function useUpdateTipoExamen() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, nombre, roles_permitidos }: { id: string; nombre: string; roles_permitidos: string[] }) => {
      const { error } = await supabase.from('tipos_examen').update({ nombre, roles_permitidos }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['catalogos', 'tipos_examen'] }),
  })
}

export function useDeleteTipoExamen() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('tipos_examen').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['catalogos', 'tipos_examen'] }),
  })
}
```

- [ ] **Step 2: Verificar build**

```bash
bun run build
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/hooks/useCatalogos.ts
git commit -m "feat: add useCatalogos hooks for clasificaciones, departamentos_medicos, tipos_examen"
```

---

### Task 4: Edge function create-user — soporte clasificaciones

**Files:**
- Modify: `supabase/functions/create-user/index.ts`

**Interfaces:**
- Consumes: body JSON con campo opcional `clasificaciones: string[]`
- Produces: edge function pasa `clasificaciones` en `user_metadata`

- [ ] **Step 1: Actualizar la destructuración del body y los user_metadata**

En `supabase/functions/create-user/index.ts`, linea 26, cambiar:

```typescript
// Antes (línea 26):
const { email, password, role, nombre, telefono, nit, cedula, departamento, ciudad, lat, lng, departamentos_medicos } = body

// Después:
const { email, password, role, nombre, telefono, nit, cedula, departamento, ciudad, lat, lng, departamentos_medicos, clasificaciones } = body
```

En la llamada a `supabase.auth.admin.createUser` (línea 41), cambiar `user_metadata`:

```typescript
// Antes (línea 41):
user_metadata: { role, nombre, telefono, nit, cedula, departamento, ciudad, lat, lng, departamentos_medicos },

// Después:
user_metadata: { role, nombre, telefono, nit, cedula, departamento, ciudad, lat, lng, departamentos_medicos, clasificaciones },
```

- [ ] **Step 2: Desplegar la edge function**

```bash
npx supabase functions deploy create-user
```

Si no tienes Supabase CLI o el proyecto enlazado, hacer el cambio desde el Supabase Dashboard → Edge Functions → create-user → Edit.

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/create-user/index.ts
git commit -m "feat: pass clasificaciones through create-user edge function"
```

---

### Task 5: Ruta Admin Catálogos

**Files:**
- Create: `src/routes/app.admin.catalogos.tsx`

**Interfaces:**
- Consumes: `useClasificaciones`, `useAddClasificacion`, `useUpdateClasificacion`, `useDeleteClasificacion`, `useDepartamentosMedicos`, `useAddDepartamentoMedico`, `useUpdateDepartamentoMedico`, `useDeleteDepartamentoMedico`, `useTiposExamen`, `useAddTipoExamen`, `useUpdateTipoExamen`, `useDeleteTipoExamen` de `@/lib/hooks/useCatalogos`
- Produces: ruta `/app/admin/catalogos` con UI de gestión de catálogos

- [ ] **Step 1: Crear src/routes/app.admin.catalogos.tsx**

```typescript
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Trash2, Pencil, Check, X } from "lucide-react";
import { toast } from "sonner";
import {
  useClasificaciones, useAddClasificacion, useUpdateClasificacion, useDeleteClasificacion,
  useDepartamentosMedicos, useAddDepartamentoMedico, useUpdateDepartamentoMedico, useDeleteDepartamentoMedico,
  useTiposExamen, useAddTipoExamen, useUpdateTipoExamen, useDeleteTipoExamen,
} from "@/lib/hooks/useCatalogos";
import type { TipoExamen } from "@/lib/database.types";

export const Route = createFileRoute("/app/admin/catalogos")({
  component: AdminCatalogos,
});

// ─── Panel genérico para clasificaciones y departamentos ───────────────────────

interface SimplePanelProps {
  items: { id: string; nombre: string }[];
  onAdd: (nombre: string) => Promise<void>;
  onUpdate: (args: { id: string; nombre: string }) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  placeholder: string;
}

function SimplePanel({ items, onAdd, onUpdate, onDelete, placeholder }: SimplePanelProps) {
  const [newName, setNewName] = useState("");
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  const handleAdd = async () => {
    const name = newName.trim();
    if (!name) return;
    try {
      await onAdd(name);
      setNewName("");
    } catch (e: any) {
      toast.error(e.message ?? "Error al agregar");
    }
  };

  const startEdit = (id: string, nombre: string) => {
    setEditId(id);
    setEditName(nombre);
  };

  const saveEdit = async () => {
    if (!editId) return;
    try {
      await onUpdate({ id: editId, nombre: editName.trim() });
      setEditId(null);
    } catch (e: any) {
      toast.error(e.message ?? "Error al actualizar");
    }
  };

  const cancelEdit = () => setEditId(null);

  const handleDelete = async (id: string) => {
    try {
      await onDelete(id);
    } catch (e: any) {
      toast.error(e.message ?? "Error al eliminar");
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <Input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder={placeholder}
          onKeyDown={(e) => e.key === "Enter" && handleAdd()}
        />
        <Button onClick={handleAdd}>Agregar</Button>
      </div>
      <ul className="divide-y">
        {items.map((item) => (
          <li key={item.id} className="flex items-center gap-2 py-2">
            {editId === item.id ? (
              <>
                <Input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="h-7 text-sm"
                  onKeyDown={(e) => { if (e.key === "Enter") saveEdit(); if (e.key === "Escape") cancelEdit(); }}
                  autoFocus
                />
                <Button size="icon" variant="ghost" onClick={saveEdit} className="h-7 w-7">
                  <Check className="w-3 h-3" />
                </Button>
                <Button size="icon" variant="ghost" onClick={cancelEdit} className="h-7 w-7">
                  <X className="w-3 h-3" />
                </Button>
              </>
            ) : (
              <>
                <span className="flex-1 text-sm">{item.nombre}</span>
                <Button size="icon" variant="ghost" onClick={() => startEdit(item.id, item.nombre)} className="h-7 w-7">
                  <Pencil className="w-3 h-3" />
                </Button>
                <Button size="icon" variant="ghost" onClick={() => handleDelete(item.id)} className="h-7 w-7 text-destructive hover:text-destructive">
                  <Trash2 className="w-3 h-3" />
                </Button>
              </>
            )}
          </li>
        ))}
        {items.length === 0 && <li className="py-2 text-sm text-muted-foreground">Sin elementos.</li>}
      </ul>
    </div>
  );
}

// ─── Panel de tipos de examen ──────────────────────────────────────────────────

function TiposExamenPanel() {
  const { data: tipos = [] } = useTiposExamen();
  const addTipo = useAddTipoExamen();
  const updateTipo = useUpdateTipoExamen();
  const deleteTipo = useDeleteTipoExamen();

  const [newName, setNewName] = useState("");
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  const handleAdd = async () => {
    const name = newName.trim();
    if (!name) return;
    try {
      await addTipo.mutateAsync(name);
      setNewName("");
    } catch (e: any) {
      toast.error(e.message ?? "Error al agregar");
    }
  };

  const startEdit = (t: TipoExamen) => { setEditId(t.id); setEditName(t.nombre); };
  const cancelEdit = () => setEditId(null);

  const saveEdit = async (t: TipoExamen) => {
    try {
      await updateTipo.mutateAsync({ id: t.id, nombre: editName.trim(), roles_permitidos: t.roles_permitidos });
      setEditId(null);
    } catch (e: any) {
      toast.error(e.message ?? "Error al actualizar");
    }
  };

  const toggleRole = async (t: TipoExamen, role: string, checked: boolean) => {
    const roles = checked
      ? [...t.roles_permitidos, role]
      : t.roles_permitidos.filter((r) => r !== role);
    try {
      await updateTipo.mutateAsync({ id: t.id, nombre: t.nombre, roles_permitidos: roles });
    } catch (e: any) {
      toast.error(e.message ?? "Error al actualizar");
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteTipo.mutateAsync(id);
    } catch (e: any) {
      toast.error(e.message ?? "Error al eliminar");
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <Input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="Nuevo tipo de examen"
          onKeyDown={(e) => e.key === "Enter" && handleAdd()}
        />
        <Button onClick={handleAdd}>Agregar</Button>
      </div>
      <div className="text-xs text-muted-foreground mb-1">Marca los roles que pueden solicitar cada tipo de examen:</div>
      <ul className="divide-y">
        {tipos.map((t) => (
          <li key={t.id} className="flex items-center gap-3 py-2">
            {editId === t.id ? (
              <Input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="h-7 text-sm flex-1"
                onKeyDown={(e) => { if (e.key === "Enter") saveEdit(t); if (e.key === "Escape") cancelEdit(); }}
                autoFocus
              />
            ) : (
              <span className="flex-1 text-sm">{t.nombre}</span>
            )}
            <label className="flex items-center gap-1 text-xs cursor-pointer select-none">
              <Checkbox
                checked={t.roles_permitidos.includes("empresa")}
                onCheckedChange={(c) => toggleRole(t, "empresa", !!c)}
              />
              Empresa
            </label>
            <label className="flex items-center gap-1 text-xs cursor-pointer select-none">
              <Checkbox
                checked={t.roles_permitidos.includes("particular")}
                onCheckedChange={(c) => toggleRole(t, "particular", !!c)}
              />
              Particular
            </label>
            {editId === t.id ? (
              <>
                <Button size="icon" variant="ghost" onClick={() => saveEdit(t)} className="h-7 w-7"><Check className="w-3 h-3" /></Button>
                <Button size="icon" variant="ghost" onClick={cancelEdit} className="h-7 w-7"><X className="w-3 h-3" /></Button>
              </>
            ) : (
              <>
                <Button size="icon" variant="ghost" onClick={() => startEdit(t)} className="h-7 w-7"><Pencil className="w-3 h-3" /></Button>
                <Button size="icon" variant="ghost" onClick={() => handleDelete(t.id)} className="h-7 w-7 text-destructive hover:text-destructive"><Trash2 className="w-3 h-3" /></Button>
              </>
            )}
          </li>
        ))}
        {tipos.length === 0 && <li className="py-2 text-sm text-muted-foreground">Sin tipos de examen.</li>}
      </ul>
    </div>
  );
}

// ─── Componente principal ──────────────────────────────────────────────────────

function AdminCatalogos() {
  const { data: clasificaciones = [] } = useClasificaciones();
  const addC = useAddClasificacion();
  const updateC = useUpdateClasificacion();
  const deleteC = useDeleteClasificacion();

  const { data: deptos = [] } = useDepartamentosMedicos();
  const addD = useAddDepartamentoMedico();
  const updateD = useUpdateDepartamentoMedico();
  const deleteD = useDeleteDepartamentoMedico();

  return (
    <Card className="max-w-2xl">
      <CardHeader><CardTitle>Catálogos</CardTitle></CardHeader>
      <CardContent>
        <Tabs defaultValue="clasificaciones">
          <TabsList className="mb-4">
            <TabsTrigger value="clasificaciones">Clasificaciones IPS</TabsTrigger>
            <TabsTrigger value="departamentos">Departamentos Médicos</TabsTrigger>
            <TabsTrigger value="tipos_examen">Tipos de Examen</TabsTrigger>
          </TabsList>

          <TabsContent value="clasificaciones">
            <SimplePanel
              items={clasificaciones}
              onAdd={(n) => addC.mutateAsync(n)}
              onUpdate={(a) => updateC.mutateAsync(a)}
              onDelete={(id) => deleteC.mutateAsync(id)}
              placeholder="Nueva clasificación"
            />
          </TabsContent>

          <TabsContent value="departamentos">
            <SimplePanel
              items={deptos}
              onAdd={(n) => addD.mutateAsync(n)}
              onUpdate={(a) => updateD.mutateAsync(a)}
              onDelete={(id) => deleteD.mutateAsync(id)}
              placeholder="Nuevo departamento médico"
            />
          </TabsContent>

          <TabsContent value="tipos_examen">
            <TiposExamenPanel />
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: Verificar build**

```bash
bun run build
```

- [ ] **Step 3: Commit**

```bash
git add src/routes/app.admin.catalogos.tsx
git commit -m "feat: add admin catalogos route with CRUD for clasificaciones, departamentos, tipos_examen"
```

---

### Task 6: Agregar Catálogos al nav del admin

**Files:**
- Modify: `src/routes/app.tsx` (líneas 39-44, bloque `admin` del objeto `NAV`)

**Interfaces:**
- Consumes: ruta `/app/admin/catalogos` creada en Task 5
- Produces: enlace "Catálogos" visible en el sidebar del admin

- [ ] **Step 1: Agregar ítem al nav del admin**

En `src/routes/app.tsx`, en la línea 9 agregar `BookOpen` a los imports de lucide-react:

```typescript
// Antes:
import {
  CalendarDays, ClipboardList, FileUp, MapPin, Users, Building2, ShieldCheck,
  UserCircle, LogOut, LayoutDashboard, Stethoscope, FilePlus2, User,
} from "lucide-react";

// Después:
import {
  CalendarDays, ClipboardList, FileUp, MapPin, Users, Building2, ShieldCheck,
  UserCircle, LogOut, LayoutDashboard, Stethoscope, FilePlus2, User, BookOpen,
} from "lucide-react";
```

En el bloque `admin` del objeto `NAV` (alrededor de la línea 39), agregar el nuevo ítem:

```typescript
// Antes:
admin: [
  { to: "/app/admin", title: "Panel", icon: LayoutDashboard },
  { to: "/app/admin/registrar", title: "Registrar IPS/Empresa", icon: Users },
  { to: "/app/admin/menus", title: "Menús por rol", icon: ShieldCheck },
],

// Después:
admin: [
  { to: "/app/admin", title: "Panel", icon: LayoutDashboard },
  { to: "/app/admin/registrar", title: "Registrar IPS/Empresa", icon: Users },
  { to: "/app/admin/catalogos", title: "Catálogos", icon: BookOpen },
  { to: "/app/admin/menus", title: "Menús por rol", icon: ShieldCheck },
],
```

- [ ] **Step 2: Verificar build**

```bash
bun run build
```

- [ ] **Step 3: Commit**

```bash
git add src/routes/app.tsx
git commit -m "feat: add Catalogos link to admin sidebar nav"
```

---

### Task 7: Formulario de registro admin — checkboxes dinámicos

**Files:**
- Modify: `src/routes/app.admin.registrar.tsx`

**Interfaces:**
- Consumes: `useDepartamentosMedicos()` y `useClasificaciones()` de `@/lib/hooks/useCatalogos`
- Produces: checkboxes de departamentos médicos y clasificaciones para IPS en el formulario de registro

- [ ] **Step 1: Reemplazar el contenido de app.admin.registrar.tsx**

```typescript
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useAuth, DEPARTAMENTOS } from "@/lib/auth-context";
import { supabase } from "@/lib/supabase";
import { useDepartamentosMedicos, useClasificaciones } from "@/lib/hooks/useCatalogos";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

export const Route = createFileRoute("/app/admin/registrar")({
  component: AdminRegistrar,
});

function AdminRegistrar() {
  useAuth();
  const [role, setRole] = useState<"empresa" | "ips" | "particular">("ips");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [nombre, setNombre] = useState("");
  const [telefono, setTelefono] = useState("");
  const [nit, setNit] = useState("");
  const [cedula, setCedula] = useState("");
  const [depto, setDepto] = useState("");
  const [ciudad, setCiudad] = useState("");
  const [selectedDeptosMed, setSelectedDeptosMed] = useState<string[]>([]);
  const [selectedClasificaciones, setSelectedClasificaciones] = useState<string[]>([]);

  const { data: departamentosMedicos = [] } = useDepartamentosMedicos();
  const { data: clasificaciones = [] } = useClasificaciones();

  const ciudades = DEPARTAMENTOS.find((d) => d.nombre === depto)?.ciudades ?? [];

  const toggleItem = (list: string[], setList: (v: string[]) => void, value: string) => {
    setList(list.includes(value) ? list.filter((x) => x !== value) : [...list, value]);
  };

  const submit = async () => {
    if (!email.trim() || !password || !nombre.trim()) return toast.error("Campos requeridos");
    const c = ciudades.find((x) => x.nombre === ciudad);
    const { data: { session } } = await supabase.auth.getSession();

    const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-user`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session?.access_token}`,
      },
      body: JSON.stringify({
        email: email.trim(),
        password,
        role,
        nombre: nombre.trim(),
        telefono,
        ...(role === "empresa" ? { nit } : {}),
        ...(role === "particular" ? { cedula } : {}),
        ...(role === "ips" ? {
          departamento: depto,
          ciudad,
          lat: c?.lat,
          lng: c?.lng,
          departamentos_medicos: selectedDeptosMed,
          clasificaciones: selectedClasificaciones,
        } : {}),
      }),
    });

    const data = await res.json();
    if (!res.ok) return toast.error(data.error ?? "Error al crear usuario");

    const label = role === "ips" ? "IPS" : role === "empresa" ? "Empresa" : "Particular";
    toast.success(`${label} creada`);
    setEmail(""); setPassword(""); setNombre(""); setTelefono(""); setNit(""); setCedula("");
    setDepto(""); setCiudad(""); setSelectedDeptosMed([]); setSelectedClasificaciones([]);
  };

  const titulo = role === "ips" ? "IPS" : role === "empresa" ? "Empresa" : "Particular";

  return (
    <Card className="max-w-2xl">
      <CardHeader><CardTitle>Registrar {titulo}</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <div>
          <Label>Tipo</Label>
          <Select value={role} onValueChange={(v) => setRole(v as "empresa" | "ips" | "particular")}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ips">IPS</SelectItem>
              <SelectItem value="empresa">Empresa</SelectItem>
              <SelectItem value="particular">Particular</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Correo electrónico</Label><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
          <div><Label>Contraseña</Label><Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} /></div>
        </div>
        <div><Label>{role === "ips" ? "Nombre IPS" : role === "particular" ? "Nombre completo" : "Razón social"}</Label><Input value={nombre} onChange={(e) => setNombre(e.target.value)} /></div>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Teléfono</Label><Input value={telefono} onChange={(e) => setTelefono(e.target.value)} /></div>
          {role === "empresa" && <div><Label>NIT</Label><Input value={nit} onChange={(e) => setNit(e.target.value)} /></div>}
          {role === "particular" && <div><Label>Cédula</Label><Input value={cedula} onChange={(e) => setCedula(e.target.value)} /></div>}
        </div>
        {role === "ips" && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Departamento</Label>
                <Select value={depto} onValueChange={(v) => { setDepto(v); setCiudad(""); }}>
                  <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent>
                    {DEPARTAMENTOS.map((d) => <SelectItem key={d.nombre} value={d.nombre}>{d.nombre}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Ciudad</Label>
                <Select value={ciudad} onValueChange={setCiudad} disabled={!depto}>
                  <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent>
                    {ciudades.map((c) => <SelectItem key={c.nombre} value={c.nombre}>{c.nombre}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Departamentos médicos</Label>
              <div className="mt-1 flex flex-wrap gap-x-4 gap-y-2">
                {departamentosMedicos.map((d) => (
                  <label key={d.id} className="flex items-center gap-1.5 text-sm cursor-pointer select-none">
                    <Checkbox
                      checked={selectedDeptosMed.includes(d.nombre)}
                      onCheckedChange={() => toggleItem(selectedDeptosMed, setSelectedDeptosMed, d.nombre)}
                    />
                    {d.nombre}
                  </label>
                ))}
              </div>
            </div>
            <div>
              <Label>Clasificaciones</Label>
              <div className="mt-1 flex flex-wrap gap-x-4 gap-y-2">
                {clasificaciones.map((c) => (
                  <label key={c.id} className="flex items-center gap-1.5 text-sm cursor-pointer select-none">
                    <Checkbox
                      checked={selectedClasificaciones.includes(c.nombre)}
                      onCheckedChange={() => toggleItem(selectedClasificaciones, setSelectedClasificaciones, c.nombre)}
                    />
                    {c.nombre}
                  </label>
                ))}
              </div>
            </div>
          </>
        )}
        <Button onClick={submit} className="w-full">Crear</Button>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: Verificar build**

```bash
bun run build
```

- [ ] **Step 3: Commit**

```bash
git add src/routes/app.admin.registrar.tsx
git commit -m "feat: replace text input with dynamic checkboxes for deptos and clasificaciones in admin registrar"
```

---

### Task 8: Perfil IPS — checkboxes de clasificaciones y departamentos

**Files:**
- Modify: `src/routes/app.perfil.tsx`

**Interfaces:**
- Consumes: `useDepartamentosMedicos()`, `useClasificaciones()` de `@/lib/hooks/useCatalogos`; `useUpdateProfile()` ya existente
- Produces: sección de checkboxes para clasificaciones y departamentos médicos visible solo cuando `profile.role === 'ips'`

- [ ] **Step 1: Actualizar app.perfil.tsx**

Agregar imports al inicio del archivo (después de los existentes):

```typescript
import { Checkbox } from "@/components/ui/checkbox";
import { useDepartamentosMedicos, useClasificaciones } from "@/lib/hooks/useCatalogos";
```

Agregar estado para clasificaciones y departamentos médicos en el componente `Perfil`, después del estado existente de `descripcion`:

```typescript
const [selectedDeptosMed, setSelectedDeptosMed] = useState<string[]>([]);
const [selectedClasificaciones, setSelectedClasificaciones] = useState<string[]>([]);

const { data: departamentosMedicos = [] } = useDepartamentosMedicos();
const { data: catalogoClasificaciones = [] } = useClasificaciones();
```

Actualizar el primer `useEffect` para inicializar los nuevos estados:

```typescript
// Reemplazar el useEffect existente (líneas 31-37) con:
useEffect(() => {
  if (!profile) return;
  setNombre(profile.nombre);
  setTelefono(profile.telefono ?? "");
  setDireccion(profile.direccion ?? "");
  setDescripcion(profile.descripcion ?? "");
  setSelectedDeptosMed(profile.departamentos_medicos ?? []);
  setSelectedClasificaciones(profile.clasificaciones ?? []);
}, [profile]);
```

Actualizar la función `saveProfile` para incluir los nuevos campos:

```typescript
// Reemplazar saveProfile (líneas 47-55) con:
const saveProfile = () => {
  const patch: Parameters<typeof updateProfile.mutate>[0]['patch'] = {
    nombre, telefono, direccion, descripcion,
  };
  if (profile.role === 'ips') {
    patch.departamentos_medicos = selectedDeptosMed;
    patch.clasificaciones = selectedClasificaciones;
  }
  updateProfile.mutate(
    { id: profile.id, patch },
    {
      onSuccess: () => toast.success("Perfil actualizado"),
      onError: (err: any) => toast.error(err.message),
    }
  );
};
```

Agregar helper `toggleItem` antes del return:

```typescript
const toggleItem = (list: string[], setList: (v: string[]) => void, value: string) => {
  setList(list.includes(value) ? list.filter((x) => x !== value) : [...list, value]);
};
```

Agregar sección de checkboxes dentro del primer `Card` (después del campo Descripción y antes del Button), condicionada a `profile.role === 'ips'`:

```typescript
{profile.role === 'ips' && (
  <>
    <div>
      <Label>Departamentos médicos</Label>
      <div className="mt-1 flex flex-wrap gap-x-4 gap-y-2">
        {departamentosMedicos.map((d) => (
          <label key={d.id} className="flex items-center gap-1.5 text-sm cursor-pointer select-none">
            <Checkbox
              checked={selectedDeptosMed.includes(d.nombre)}
              onCheckedChange={() => toggleItem(selectedDeptosMed, setSelectedDeptosMed, d.nombre)}
            />
            {d.nombre}
          </label>
        ))}
      </div>
    </div>
    <div>
      <Label>Clasificaciones</Label>
      <div className="mt-1 flex flex-wrap gap-x-4 gap-y-2">
        {catalogoClasificaciones.map((c) => (
          <label key={c.id} className="flex items-center gap-1.5 text-sm cursor-pointer select-none">
            <Checkbox
              checked={selectedClasificaciones.includes(c.nombre)}
              onCheckedChange={() => toggleItem(selectedClasificaciones, setSelectedClasificaciones, c.nombre)}
            />
            {c.nombre}
          </label>
        ))}
      </div>
    </div>
  </>
)}
```

- [ ] **Step 2: Verificar build**

```bash
bun run build
```

- [ ] **Step 3: Commit**

```bash
git add src/routes/app.perfil.tsx
git commit -m "feat: add clasificaciones and departamentos_medicos checkboxes to IPS profile"
```

---

### Task 9: IpsDetailPanel — badges de clasificaciones

**Files:**
- Modify: `src/components/IpsDetailPanel.tsx` (líneas 65-71, sección de departamentos médicos)

**Interfaces:**
- Consumes: `ips.clasificaciones: string[] | null` del tipo `Profile` actualizado
- Produces: sección de badges de clasificaciones debajo del nombre de la IPS

- [ ] **Step 1: Agregar badges de clasificaciones**

En `src/components/IpsDetailPanel.tsx`, después del bloque de `departamentos_medicos` (líneas 65-71), agregar:

```typescript
// Añadir después de la sección de departamentos_medicos existente:
{(ips.clasificaciones ?? []).length > 0 && (
  <div className="flex flex-wrap gap-1">
    {ips.clasificaciones!.map((c) => (
      <Badge key={c} variant="outline" className="text-xs">{c}</Badge>
    ))}
  </div>
)}
```

El bloque completo de nombre + badges quedará así:

```typescript
<div>
  <div className="font-semibold text-base">{ips.nombre}</div>
  <div className="text-sm text-muted-foreground">{ips.direccion} · {distancia.toFixed(1)} km</div>
</div>

{(ips.departamentos_medicos ?? []).length > 0 && (
  <div className="flex flex-wrap gap-1">
    {ips.departamentos_medicos!.map((d) => (
      <Badge key={d} variant="secondary" className="text-xs">{d}</Badge>
    ))}
  </div>
)}

{(ips.clasificaciones ?? []).length > 0 && (
  <div className="flex flex-wrap gap-1">
    {ips.clasificaciones!.map((c) => (
      <Badge key={c} variant="outline" className="text-xs">{c}</Badge>
    ))}
  </div>
)}
```

- [ ] **Step 2: Verificar build**

```bash
bun run build
```

- [ ] **Step 3: Commit**

```bash
git add src/components/IpsDetailPanel.tsx
git commit -m "feat: add clasificaciones badges to IpsDetailPanel"
```

---

### Task 10: Dashboard admin — badges de clasificaciones en IPS cards

**Files:**
- Modify: `src/routes/app.admin.index.tsx` (líneas 87-89, sección de badges por IPS)

**Interfaces:**
- Consumes: `u.clasificaciones: string[] | null` del tipo `Profile` actualizado

- [ ] **Step 1: Agregar badges de clasificaciones**

En `src/routes/app.admin.index.tsx`, dentro del `<li>` de cada IPS (después del bloque de `departamentos_medicos`, alrededor de la línea 89), agregar:

```typescript
// El bloque de badges actual:
<div className="mt-1 flex flex-wrap gap-1">
  {(u.departamentos_medicos ?? []).map((d) => <Badge key={d} variant="secondary" className="text-xs">{d}</Badge>)}
</div>

// Agregar inmediatamente después:
{(u.clasificaciones ?? []).length > 0 && (
  <div className="mt-1 flex flex-wrap gap-1">
    {u.clasificaciones!.map((c) => <Badge key={c} variant="outline" className="text-xs">{c}</Badge>)}
  </div>
)}
```

- [ ] **Step 2: Verificar build**

```bash
bun run build
```

- [ ] **Step 3: Commit**

```bash
git add src/routes/app.admin.index.tsx
git commit -m "feat: add clasificaciones badges to IPS cards in admin dashboard"
```

---

### Task 11: Empresa solicitar — filtro clasificaciones + tipos dinámicos

**Files:**
- Modify: `src/routes/app.empresa.solicitar.tsx`

**Interfaces:**
- Consumes: `useClasificaciones()`, `useTiposExamen()` de `@/lib/hooks/useCatalogos`
- Produces: filtro de clasificaciones sobre la lista de IPS; selector de tipo de examen cargado dinámicamente

- [ ] **Step 1: Agregar imports y estado**

Al inicio de `src/routes/app.empresa.solicitar.tsx`, agregar al bloque de imports existentes:

```typescript
import { Checkbox } from "@/components/ui/checkbox";
import { useClasificaciones, useTiposExamen } from "@/lib/hooks/useCatalogos";
import type { TipoExamen } from "@/lib/database.types";
```

Dentro de `function EmpresaSolicitar()`, cambiar el tipo del estado `tipoExamen` de union literal a `string`, y agregar el estado para el filtro de clasificaciones:

```typescript
// Antes (línea 32):
const [tipoExamen, setTipoExamen] = useState<"ingreso" | "anual" | "retiro">("ingreso");

// Después:
const [tipoExamen, setTipoExamen] = useState<string>("");
const [filtroClasificaciones, setFiltroClasificaciones] = useState<string[]>([]);
```

Agregar las queries de catálogos después del estado existente:

```typescript
const { data: clasificaciones = [] } = useClasificaciones();
const { data: tiposExamen = [] } = useTiposExamen();
```

Agregar el helper `toggleFiltro` y actualizar `ipsConDistancia` para aplicar el filtro. Agregar `useEffect` para inicializar `tipoExamen` cuando se carguen los tipos:

```typescript
// Inicializar tipoExamen con el primer tipo disponible
useEffect(() => {
  if (tiposExamen.length > 0 && !tipoExamen) {
    setTipoExamen(tiposExamen[0].nombre);
  }
}, [tiposExamen, tipoExamen]);

const toggleFiltro = (nombre: string, checked: boolean) => {
  setFiltroClasificaciones((prev) =>
    checked ? [...prev, nombre] : prev.filter((x) => x !== nombre)
  );
};
```

Actualizar `ipsConDistancia` para aplicar el filtro de clasificaciones. Reemplazar el `useMemo` existente:

```typescript
// Antes:
const ipsConDistancia = useMemo(() => {
  return ipsEnCiudad
    .map((ips) => ({
      ips,
      distancia: ips.lat && ips.lng ? haversineKm(centro, { lat: ips.lat, lng: ips.lng }) : 999,
    }))
    .sort((a, b) => a.distancia - b.distancia);
}, [ipsEnCiudad, centro]);

// Después:
const ipsConDistancia = useMemo(() => {
  return ipsEnCiudad
    .filter((ips) => {
      if (filtroClasificaciones.length === 0) return true;
      return filtroClasificaciones.some((c) => (ips.clasificaciones ?? []).includes(c));
    })
    .map((ips) => ({
      ips,
      distancia: ips.lat && ips.lng ? haversineKm(centro, { lat: ips.lat, lng: ips.lng }) : 999,
    }))
    .sort((a, b) => a.distancia - b.distancia);
}, [ipsEnCiudad, centro, filtroClasificaciones]);
```

- [ ] **Step 2: Reemplazar el selector de tipo de examen y agregar filtro de clasificaciones en la UI**

Dentro del primer `<Card>` (datos del empleado), reemplazar el bloque del selector de tipo de examen (líneas 146-155 aproximadamente):

```typescript
// Antes:
<div>
  <Label>Tipo de examen</Label>
  <Select value={tipoExamen} onValueChange={(v) => setTipoExamen(v as typeof tipoExamen)}>
    <SelectTrigger><SelectValue /></SelectTrigger>
    <SelectContent>
      <SelectItem value="ingreso">Ingreso</SelectItem>
      <SelectItem value="anual">Anual (periódico)</SelectItem>
      <SelectItem value="retiro">Retiro</SelectItem>
    </SelectContent>
  </Select>
</div>

// Después:
<div>
  <Label>Tipo de examen</Label>
  <Select value={tipoExamen} onValueChange={setTipoExamen}>
    <SelectTrigger><SelectValue placeholder="Seleccionar tipo" /></SelectTrigger>
    <SelectContent>
      {tiposExamen.map((t) => (
        <SelectItem key={t.id} value={t.nombre}>{t.nombre}</SelectItem>
      ))}
    </SelectContent>
  </Select>
</div>
```

Dentro del segundo `<Card>` (IPS cercanas), agregar el filtro de clasificaciones antes del `<IpsMap>`:

```typescript
// Agregar antes de <IpsMap ...>:
{clasificaciones.length > 0 && (
  <div>
    <Label className="text-xs text-muted-foreground">Filtrar por clasificación</Label>
    <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
      {clasificaciones.map((c) => (
        <label key={c.id} className="flex items-center gap-1.5 text-xs cursor-pointer select-none">
          <Checkbox
            checked={filtroClasificaciones.includes(c.nombre)}
            onCheckedChange={(checked) => toggleFiltro(c.nombre, !!checked)}
          />
          {c.nombre}
        </label>
      ))}
    </div>
  </div>
)}
```

- [ ] **Step 3: Verificar build**

```bash
bun run build
```

- [ ] **Step 4: Commit**

```bash
git add src/routes/app.empresa.solicitar.tsx
git commit -m "feat: add clasificaciones filter and dynamic tipos_examen to empresa solicitar"
```

---

### Task 12: Particular solicitar — filtro clasificaciones + tipos filtrados por rol

**Files:**
- Modify: `src/routes/app.particular.solicitar.tsx`

**Interfaces:**
- Consumes: `useClasificaciones()`, `useTiposExamen()` de `@/lib/hooks/useCatalogos`
- Produces: filtro de clasificaciones; selector de tipo de examen mostrando solo los que incluyen `'particular'` en `roles_permitidos`

- [ ] **Step 1: Agregar imports y estado**

Al inicio de `src/routes/app.particular.solicitar.tsx`, agregar:

```typescript
import { Checkbox } from "@/components/ui/checkbox";
import { useClasificaciones, useTiposExamen } from "@/lib/hooks/useCatalogos";
```

Dentro de `function ParticularSolicitar()`, cambiar el estado `tipoExamen` y agregar el filtro:

```typescript
// Antes (línea 32):
const [tipoExamen, setTipoExamen] = useState<"ingreso" | "anual" | "retiro">("anual");

// Después:
const [tipoExamen, setTipoExamen] = useState<string>("");
const [filtroClasificaciones, setFiltroClasificaciones] = useState<string[]>([]);
```

Agregar queries de catálogos después del estado existente:

```typescript
const { data: clasificaciones = [] } = useClasificaciones();
const { data: tiposExamen = [] } = useTiposExamen();
const tiposDisponibles = tiposExamen.filter((t) => t.roles_permitidos.includes("particular"));
```

Agregar `useEffect` para inicializar `tipoExamen` e `import { useEffect } from "react"` si no está:

```typescript
useEffect(() => {
  if (tiposDisponibles.length > 0 && !tipoExamen) {
    setTipoExamen(tiposDisponibles[0].nombre);
  }
}, [tiposDisponibles, tipoExamen]);

const toggleFiltro = (nombre: string, checked: boolean) => {
  setFiltroClasificaciones((prev) =>
    checked ? [...prev, nombre] : prev.filter((x) => x !== nombre)
  );
};
```

Reemplazar el `useMemo` de `ipsConDistancia` para incluir el filtro:

```typescript
const ipsConDistancia = useMemo(() => {
  return ipsEnCiudad
    .filter((ips) => {
      if (filtroClasificaciones.length === 0) return true;
      return filtroClasificaciones.some((c) => (ips.clasificaciones ?? []).includes(c));
    })
    .map((ips) => ({
      ips,
      distancia: ips.lat && ips.lng ? haversineKm(centro, { lat: ips.lat, lng: ips.lng }) : 999,
    }))
    .sort((a, b) => a.distancia - b.distancia);
}, [ipsEnCiudad, centro, filtroClasificaciones]);
```

- [ ] **Step 2: Reemplazar selector de tipo de examen y agregar filtro en la UI**

Reemplazar el bloque del selector de tipo de examen:

```typescript
// Antes:
<div>
  <Label>Tipo de examen</Label>
  <Select value={tipoExamen} onValueChange={(v) => setTipoExamen(v as typeof tipoExamen)}>
    <SelectTrigger><SelectValue /></SelectTrigger>
    <SelectContent>
      <SelectItem value="ingreso">Ingreso</SelectItem>
      <SelectItem value="anual">Anual (periódico)</SelectItem>
      <SelectItem value="retiro">Retiro</SelectItem>
    </SelectContent>
  </Select>
</div>

// Después:
<div>
  <Label>Tipo de examen</Label>
  <Select value={tipoExamen} onValueChange={setTipoExamen}>
    <SelectTrigger><SelectValue placeholder="Seleccionar tipo" /></SelectTrigger>
    <SelectContent>
      {tiposDisponibles.map((t) => (
        <SelectItem key={t.id} value={t.nombre}>{t.nombre}</SelectItem>
      ))}
    </SelectContent>
  </Select>
</div>
```

Dentro del `<Card>` de IPS cercanas, agregar filtro de clasificaciones antes del `<IpsMap>`:

```typescript
{clasificaciones.length > 0 && (
  <div>
    <Label className="text-xs text-muted-foreground">Filtrar por clasificación</Label>
    <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
      {clasificaciones.map((c) => (
        <label key={c.id} className="flex items-center gap-1.5 text-xs cursor-pointer select-none">
          <Checkbox
            checked={filtroClasificaciones.includes(c.nombre)}
            onCheckedChange={(checked) => toggleFiltro(c.nombre, !!checked)}
          />
          {c.nombre}
        </label>
      ))}
    </div>
  </div>
)}
```

- [ ] **Step 3: Verificar build final**

```bash
bun run build
```

Resolver cualquier error de TypeScript restante.

- [ ] **Step 4: Commit final**

```bash
git add src/routes/app.particular.solicitar.tsx
git commit -m "feat: add clasificaciones filter and role-filtered tipos_examen to particular solicitar"
```
