# Servicios Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rename "departamentos médicos" to "servicios" throughout the app (DB, types, hooks, UI) and link each servicio to a clasificación via FK — IPS classifications are then derived automatically from their servicios.

**Architecture:** The DB table `departamentos_medicos` is renamed to `servicios` and gains a `clasificacion_id` FK. The `profiles.clasificaciones text[]` column is eliminated. A `derivarClasificaciones(nombres, catalogo)` helper computes IPS classifications on the fly from their servicios names by cross-referencing the catalog (which is fetched with the join `clasificacion:clasificaciones(id, nombre)`). UI labels, state, and hooks follow the rename throughout.

**Tech Stack:** React 19, TanStack Router v1, TanStack Query v5, Supabase (PostgreSQL + Auth trigger + Edge Functions), shadcn/ui, Tailwind CSS v4, Bun.

## Global Constraints

- Build command: `bun run build` — no test framework; every task ends with a passing build
- Rename pattern: `departamentos_medicos` → `servicios`, `departamento_medico` → `servicio` everywhere
- Supabase join alias: `select('*, clasificacion:clasificaciones(id, nombre)')` — singular `clasificacion`, NOT `clasificaciones`
- `derivarClasificaciones` is exported from `src/lib/hooks/useCatalogos.ts` and is the single source for deriving IPS classifications from their servicios
- On DELETE of a clasificación: FK is `ON DELETE SET NULL` — affected servicios become unclassified
- SQL migration is written to file only — the user runs it manually in Supabase Dashboard
- Do NOT commit or push — the user controls git

---

### Task 1: SQL Migration

**Files:**
- Create: `supabase/migrations/008_servicios.sql`

**Interfaces:**
- Produces: renamed DB tables/columns that Tasks 2–9 reference in code

- [ ] **Step 1: Create migration file**

Create `supabase/migrations/008_servicios.sql` with this exact content:

```sql
-- Rename table and add FK to clasificaciones
ALTER TABLE departamentos_medicos RENAME TO servicios;
ALTER TABLE servicios ADD COLUMN clasificacion_id uuid REFERENCES clasificaciones(id) ON DELETE SET NULL;

-- Rename column in profiles, drop clasificaciones column
ALTER TABLE profiles RENAME COLUMN departamentos_medicos TO servicios;
ALTER TABLE profiles DROP COLUMN clasificaciones;

-- Rename column in slots and appointments
ALTER TABLE slots RENAME COLUMN departamento_medico TO servicio;
ALTER TABLE appointments RENAME COLUMN departamento_medico TO servicio;

-- Update trigger handle_new_user to read 'servicios' instead of 'departamentos_medicos'
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

- [ ] **Step 2: Verify the file was created**

Confirm `supabase/migrations/008_servicios.sql` exists and contains the SQL above. No build step needed — this file is run manually by the user in Supabase Dashboard.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/008_servicios.sql
git commit -m "chore: add migration 008 — rename servicios, drop profile.clasificaciones"
```

---

### Task 2: TypeScript Types

**Files:**
- Modify: `src/lib/database.types.ts`

**Interfaces:**
- Consumes: DB schema from Task 1 (column names must match)
- Produces: `Servicio`, `Slot`, `Appointment`, `Profile` types used by all subsequent tasks

- [ ] **Step 1: Rewrite `src/lib/database.types.ts`**

Replace the entire file with:

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
          servicios: string[] | null
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
          servicio: string
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
          servicio: string
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
      servicios: {
        Row: { id: string; nombre: string; clasificacion_id: string | null; created_at: string }
        Insert: { nombre: string; clasificacion_id?: string | null }
        Update: Partial<{ nombre: string; clasificacion_id: string | null }>
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
export type TipoExamen = Database['public']['Tables']['tipos_examen']['Row']

export type Servicio = {
  id: string
  nombre: string
  clasificacion_id: string | null
  clasificacion: { id: string; nombre: string } | null
  created_at: string
}
```

Note: `DepartamentoMedico` type is removed. `Servicio` is a separate export (not inside `Database`) because it includes the JOIN result (`clasificacion`) which is not a raw DB column.

- [ ] **Step 2: Build**

Run: `bun run build`
Expected: passes (TypeScript errors about `departamentos_medicos`, `departamento_medico`, `clasificaciones` on Profile/Slot/Appointment will surface in later tasks — if they appear NOW from other imported files, note them but do not fix yet)

- [ ] **Step 3: Commit**

```bash
git add src/lib/database.types.ts
git commit -m "feat: update types — Servicio, rename slot/appointment fields, remove profile.clasificaciones"
```

---

### Task 3: Hooks + derivarClasificaciones

**Files:**
- Modify: `src/lib/hooks/useCatalogos.ts`

**Interfaces:**
- Consumes: `Servicio`, `Clasificacion`, `TipoExamen` from `src/lib/database.types.ts` (Task 2)
- Produces:
  - `useServicios(): { data: Servicio[] }` — fetches all servicios with nested clasificacion
  - `useAddServicio(): useMutation<void, Error, string>` — inserts `{ nombre }` 
  - `useUpdateServicio(): useMutation<void, Error, { id: string; nombre: string; clasificacion_id: string | null }>`
  - `useDeleteServicio(): useMutation<void, Error, string>`
  - `derivarClasificaciones(nombres: string[], catalogo: Servicio[]): string[]` — exported helper

- [ ] **Step 1: Rewrite `src/lib/hooks/useCatalogos.ts`**

Replace the entire file with:

```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Clasificacion, Servicio, TipoExamen } from '@/lib/database.types'

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

// ─── Servicios ────────────────────────────────────────────────────────────────

export function useServicios() {
  return useQuery({
    queryKey: ['catalogos', 'servicios'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('servicios')
        .select('*, clasificacion:clasificaciones(id, nombre)')
        .order('nombre')
      if (error) throw error
      return data as Servicio[]
    },
  })
}

export function useAddServicio() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (nombre: string) => {
      const { error } = await supabase.from('servicios').insert({ nombre })
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['catalogos', 'servicios'] }),
  })
}

export function useUpdateServicio() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, nombre, clasificacion_id }: { id: string; nombre: string; clasificacion_id: string | null }) => {
      const { error } = await supabase.from('servicios').update({ nombre, clasificacion_id }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['catalogos', 'servicios'] }),
  })
}

export function useDeleteServicio() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('servicios').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['catalogos', 'servicios'] }),
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

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function derivarClasificaciones(
  nombresServicios: string[],
  catalogo: Servicio[]
): string[] {
  const set = new Set<string>()
  nombresServicios.forEach((n) => {
    const s = catalogo.find((c) => c.nombre === n)
    if (s?.clasificacion?.nombre) set.add(s.clasificacion.nombre)
  })
  return Array.from(set)
}
```

- [ ] **Step 2: Build**

Run: `bun run build`
Expected: passes. (Type errors in files that still import `useDepartamentosMedicos` or `DepartamentoMedico` are expected — they're fixed in later tasks.)

- [ ] **Step 3: Commit**

```bash
git add src/lib/hooks/useCatalogos.ts
git commit -m "feat: replace departamentos hooks with servicios hooks, add derivarClasificaciones"
```

---

### Task 4: Edge Function

**Files:**
- Modify: `supabase/functions/create-user/index.ts`

**Interfaces:**
- Consumes: updated `handle_new_user` trigger from Task 1 (reads `servicios` from user_metadata)
- Produces: `servicios` field in user_metadata (consumed by the DB trigger)

- [ ] **Step 1: Update `supabase/functions/create-user/index.ts`**

Change the destructuring line (line 26) from:
```typescript
const { email, password, role, nombre, telefono, nit, cedula, departamento, ciudad, lat, lng, departamentos_medicos, clasificaciones } = body
```
to:
```typescript
const { email, password, role, nombre, telefono, nit, cedula, departamento, ciudad, lat, lng, servicios } = body
```

Change the `user_metadata` object (line 41) from:
```typescript
user_metadata: { role, nombre, telefono, nit, cedula, departamento, ciudad, lat, lng, departamentos_medicos, clasificaciones },
```
to:
```typescript
user_metadata: { role, nombre, telefono, nit, cedula, departamento, ciudad, lat, lng, servicios },
```

- [ ] **Step 2: Build**

Run: `bun run build`
Expected: passes (edge function is Deno TS, but the build checks the client-side; ensure no import errors in client code)

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/create-user/index.ts
git commit -m "feat: edge function uses servicios instead of departamentos_medicos"
```

---

### Task 5: Admin Catálogos — ServiciosPanel

**Files:**
- Modify: `src/routes/app.admin.catalogos.tsx`

**Interfaces:**
- Consumes:
  - `useServicios()`, `useAddServicio()`, `useUpdateServicio()`, `useDeleteServicio()` from `useCatalogos.ts` (Task 3)
  - `useClasificaciones()` from `useCatalogos.ts` (Task 3)
  - `Servicio` type from `database.types.ts` (Task 2)
- Produces: Admin UI where each servicio shows its clasificación in a Select dropdown; changing the dropdown saves immediately

The `ServiciosPanel` replaces the existing `SimplePanel` for the "Departamentos Médicos" tab. Key behaviors:
- Nombre is editable inline (click pencil or press Enter/blur to save)
- clasificación dropdown saves immediately on change (no separate button)
- New servicio is added without a clasificación (null)
- "Sin clasificación" is the first Select option (value `"none"`)

- [ ] **Step 1: Rewrite `src/routes/app.admin.catalogos.tsx`**

Replace the entire file with:

```typescript
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Trash2, Pencil, Check, X } from "lucide-react";
import { toast } from "sonner";
import {
  useClasificaciones, useAddClasificacion, useUpdateClasificacion, useDeleteClasificacion,
  useServicios, useAddServicio, useUpdateServicio, useDeleteServicio,
  useTiposExamen, useAddTipoExamen, useUpdateTipoExamen, useDeleteTipoExamen,
} from "@/lib/hooks/useCatalogos";
import type { Servicio, TipoExamen } from "@/lib/database.types";

export const Route = createFileRoute("/app/admin/catalogos")({
  component: AdminCatalogos,
});

// ─── Panel genérico para clasificaciones ───────────────────────────────────────

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
                  onBlur={saveEdit}
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

// ─── Panel de servicios con dropdown de clasificación ─────────────────────────

function ServiciosPanel() {
  const { data: servicios = [] } = useServicios();
  const { data: clasificaciones = [] } = useClasificaciones();
  const addServicio = useAddServicio();
  const updateServicio = useUpdateServicio();
  const deleteServicio = useDeleteServicio();

  const [newName, setNewName] = useState("");
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  const handleAdd = async () => {
    const name = newName.trim();
    if (!name) return;
    try {
      await addServicio.mutateAsync(name);
      setNewName("");
    } catch (e: any) {
      toast.error(e.message ?? "Error al agregar");
    }
  };

  const startEdit = (s: Servicio) => { setEditId(s.id); setEditName(s.nombre); };
  const cancelEdit = () => setEditId(null);

  const saveEdit = async (s: Servicio) => {
    try {
      await updateServicio.mutateAsync({ id: s.id, nombre: editName.trim(), clasificacion_id: s.clasificacion_id });
      setEditId(null);
    } catch (e: any) {
      toast.error(e.message ?? "Error al actualizar");
    }
  };

  const handleClasificacionChange = async (s: Servicio, value: string) => {
    const clasificacion_id = value === "none" ? null : value;
    try {
      await updateServicio.mutateAsync({ id: s.id, nombre: s.nombre, clasificacion_id });
    } catch (e: any) {
      toast.error(e.message ?? "Error al actualizar");
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteServicio.mutateAsync(id);
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
          placeholder="Nuevo servicio"
          onKeyDown={(e) => e.key === "Enter" && handleAdd()}
        />
        <Button onClick={handleAdd}>Agregar</Button>
      </div>
      <ul className="divide-y">
        {servicios.map((s) => (
          <li key={s.id} className="flex items-center gap-2 py-2">
            {editId === s.id ? (
              <Input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="h-7 text-sm flex-1"
                onKeyDown={(e) => { if (e.key === "Enter") saveEdit(s); if (e.key === "Escape") cancelEdit(); }}
                onBlur={() => saveEdit(s)}
                autoFocus
              />
            ) : (
              <span className="flex-1 text-sm">{s.nombre}</span>
            )}
            <Select
              value={s.clasificacion_id ?? "none"}
              onValueChange={(v) => handleClasificacionChange(s, v)}
            >
              <SelectTrigger className="h-7 w-44 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Sin clasificación</SelectItem>
                {clasificaciones.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.nombre}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button size="icon" variant="ghost" onClick={() => startEdit(s)} className="h-7 w-7">
              <Pencil className="w-3 h-3" />
            </Button>
            <Button size="icon" variant="ghost" onClick={() => handleDelete(s.id)} className="h-7 w-7 text-destructive hover:text-destructive">
              <Trash2 className="w-3 h-3" />
            </Button>
          </li>
        ))}
        {servicios.length === 0 && <li className="py-2 text-sm text-muted-foreground">Sin servicios.</li>}
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
                onBlur={() => saveEdit(t)}
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

  return (
    <Card className="max-w-2xl">
      <CardHeader><CardTitle>Catálogos</CardTitle></CardHeader>
      <CardContent>
        <Tabs defaultValue="clasificaciones">
          <TabsList className="mb-4">
            <TabsTrigger value="clasificaciones">Clasificaciones IPS</TabsTrigger>
            <TabsTrigger value="servicios">Servicios</TabsTrigger>
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

          <TabsContent value="servicios">
            <ServiciosPanel />
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

- [ ] **Step 2: Build**

Run: `bun run build`
Expected: passes

- [ ] **Step 3: Commit**

```bash
git add src/routes/app.admin.catalogos.tsx
git commit -m "feat: admin catálogos — ServiciosPanel with clasificación dropdown"
```

---

### Task 6: Admin Registrar + IPS Perfil

**Files:**
- Modify: `src/routes/app.admin.registrar.tsx`
- Modify: `src/routes/app.perfil.tsx`

**Interfaces:**
- Consumes: `useServicios()` from Task 3 (returns `Servicio[]`)
- Consumes: `Profile.servicios` from Task 2 (was `departamentos_medicos`)
- Produces: forms that send `servicios` to the edge function / patch

**Changes in `app.admin.registrar.tsx`:**

1. Import: replace `useDepartamentosMedicos` with `useServicios`; remove `useClasificaciones`
2. State: `selectedDeptosMed` → `selectedServicios`; remove `selectedClasificaciones`
3. Hook call: `const { data: servicios = [] } = useServicios()`; remove clasificaciones hook
4. Label: "Departamentos médicos" → "Servicios"
5. Checkbox list: iterate over `servicios` (type `Servicio[]`), use `d.nombre` and `selectedServicios`
6. Body: remove `clasificaciones`, replace `departamentos_medicos: selectedDeptosMed` with `servicios: selectedServicios`
7. Reset: `setSelectedDeptosMed([])` → `setSelectedServicios([])`; remove `setSelectedClasificaciones([])`
8. Remove the entire "Clasificaciones" checkbox section from JSX

- [ ] **Step 1: Update `src/routes/app.admin.registrar.tsx`**

Replace the entire file with:

```typescript
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useAuth, DEPARTAMENTOS } from "@/lib/auth-context";
import { supabase } from "@/lib/supabase";
import { useServicios } from "@/lib/hooks/useCatalogos";
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
  const [selectedServicios, setSelectedServicios] = useState<string[]>([]);

  const { data: servicios = [] } = useServicios();

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
          servicios: selectedServicios,
        } : {}),
      }),
    });

    const data = await res.json();
    if (!res.ok) return toast.error(data.error ?? "Error al crear usuario");

    const label = role === "ips" ? "IPS" : role === "empresa" ? "Empresa" : "Particular";
    toast.success(`${label} creada`);
    setEmail(""); setPassword(""); setNombre(""); setTelefono(""); setNit(""); setCedula("");
    setDepto(""); setCiudad(""); setSelectedServicios([]);
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
              <Label>Servicios</Label>
              <div className="mt-1 flex flex-wrap gap-x-4 gap-y-2">
                {servicios.map((s) => (
                  <label key={s.id} className="flex items-center gap-1.5 text-sm cursor-pointer select-none">
                    <Checkbox
                      checked={selectedServicios.includes(s.nombre)}
                      onCheckedChange={() => toggleItem(selectedServicios, setSelectedServicios, s.nombre)}
                    />
                    {s.nombre}
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

- [ ] **Step 2: Update `src/routes/app.perfil.tsx`**

Replace the entire file with:

```typescript
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

  const { data: catalogoServicios = [] } = useServicios();

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
          <div><Label>Dirección</Label><Input value={direccion} onChange={(e) => setDireccion(e.target.value)} /></div>
          <div><Label>Descripción</Label><Textarea value={descripcion} onChange={(e) => setDescripcion(e.target.value)} /></div>
          {profile.role === 'ips' && (
            <div>
              <Label>Servicios</Label>
              <div className="mt-1 flex flex-wrap gap-x-4 gap-y-2">
                {catalogoServicios.map((s) => (
                  <label key={s.id} className="flex items-center gap-1.5 text-sm cursor-pointer select-none">
                    <Checkbox
                      checked={selectedServicios.includes(s.nombre)}
                      onCheckedChange={() => toggleItem(selectedServicios, setSelectedServicios, s.nombre)}
                    />
                    {s.nombre}
                  </label>
                ))}
              </div>
            </div>
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
```

- [ ] **Step 3: Build**

Run: `bun run build`
Expected: passes

- [ ] **Step 4: Commit**

```bash
git add src/routes/app.admin.registrar.tsx src/routes/app.perfil.tsx
git commit -m "feat: admin registrar + perfil use servicios instead of departamentos_medicos"
```

---

### Task 7: IpsDetailPanel + Admin Index

**Files:**
- Modify: `src/components/IpsDetailPanel.tsx`
- Modify: `src/routes/app.admin.index.tsx`

**Interfaces:**
- Consumes:
  - `useServicios()` from Task 3
  - `derivarClasificaciones(nombres, catalogo)` from Task 3
  - `Profile.servicios` from Task 2 (was `departamentos_medicos`; `clasificaciones` removed)

**`IpsDetailPanel` changes:**
- Add `useServicios()` call
- Import `derivarClasificaciones` from useCatalogos
- Display `ips.servicios` badges (variant="secondary"), guard on length > 0
- Compute `derivarClasificaciones(ips.servicios ?? [], catalogoServicios)` and display as badges (variant="outline"), guard on length > 0

**`app.admin.index.tsx` changes:**
- Add `useServicios()` call at component top level (one call shared across all IPS in the list)
- Import `derivarClasificaciones`
- Replace `u.departamentos_medicos` with `u.servicios`
- Replace `u.clasificaciones` with `derivarClasificaciones(u.servicios ?? [], catalogoServicios)`

- [ ] **Step 1: Update `src/components/IpsDetailPanel.tsx`**

Replace the entire file with:

```typescript
import { useIpsFotos } from "@/lib/hooks/useIpsFotos";
import { useState } from "react";
import { ChevronLeft, ChevronRight, Stethoscope } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { Profile } from "@/lib/database.types";
import { useServicios, derivarClasificaciones } from "@/lib/hooks/useCatalogos";

interface Props {
  ips: Profile;
  distancia: number;
  onConfirm: () => void;
}

export function IpsDetailPanel({ ips, distancia, onConfirm }: Props) {
  const { data: fotos = [] } = useIpsFotos(ips.id);
  const { data: catalogoServicios = [] } = useServicios();
  const [current, setCurrent] = useState(0);

  const clasificacionesDerived = derivarClasificaciones(ips.servicios ?? [], catalogoServicios);

  const prev = () => setCurrent((c) => Math.max(0, c - 1));
  const next = () => setCurrent((c) => Math.min(fotos.length - 1, c + 1));

  return (
    <div className="space-y-3">
      {fotos.length > 0 ? (
        <div className="relative rounded-md overflow-hidden border aspect-video">
          <img src={fotos[current].url} alt={`Foto ${current + 1}`} className="w-full h-full object-cover" />
          {fotos.length > 1 && (
            <>
              <button
                onClick={prev}
                disabled={current === 0}
                className="absolute left-2 top-1/2 -translate-y-1/2 bg-background/80 rounded-full p-1 disabled:opacity-30"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={next}
                disabled={current === fotos.length - 1}
                className="absolute right-2 top-1/2 -translate-y-1/2 bg-background/80 rounded-full p-1 disabled:opacity-30"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
              <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1">
                {fotos.map((_, i) => (
                  <button
                    key={i}
                    onClick={() => setCurrent(i)}
                    className={`w-1.5 h-1.5 rounded-full transition-colors ${i === current ? 'bg-white' : 'bg-white/50'}`}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      ) : (
        <div className="rounded-md border aspect-video flex items-center justify-center bg-muted">
          <Stethoscope className="w-10 h-10 text-muted-foreground" />
        </div>
      )}

      <div>
        <div className="font-semibold text-base">{ips.nombre}</div>
        <div className="text-sm text-muted-foreground">{ips.direccion} · {distancia.toFixed(1)} km</div>
      </div>

      {(ips.servicios ?? []).length > 0 && (
        <div className="flex flex-wrap gap-1">
          {ips.servicios!.map((s) => (
            <Badge key={s} variant="secondary" className="text-xs">{s}</Badge>
          ))}
        </div>
      )}

      {clasificacionesDerived.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {clasificacionesDerived.map((c) => (
            <Badge key={c} variant="outline" className="text-xs">{c}</Badge>
          ))}
        </div>
      )}

      <Button className="w-full" onClick={onConfirm}>Confirmar selección y ver horarios</Button>
    </div>
  );
}
```

- [ ] **Step 2: Update `src/routes/app.admin.index.tsx`**

Replace the entire file with:

```typescript
import { createFileRoute } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth-context";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { Profile } from "@/lib/database.types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Building2, Stethoscope, ClipboardList, FileCheck2, User } from "lucide-react";
import { IpsFotosSection } from "@/components/IpsFotosSection";
import { useServicios, derivarClasificaciones } from "@/lib/hooks/useCatalogos";

export const Route = createFileRoute("/app/admin/")({
  component: AdminDashboard,
});

function AdminDashboard() {
  useAuth();

  const { data: users = [] } = useQuery({
    queryKey: ['admin', 'users'],
    queryFn: async () => {
      const { data, error } = await supabase.from('profiles').select('*')
      if (error) throw error
      return data as Profile[]
    },
  });

  const { data: appointments = [] } = useQuery({
    queryKey: ['admin', 'appointments'],
    queryFn: async () => {
      const { data, error } = await supabase.from('appointments').select('id')
      if (error) throw error
      return data
    },
  });

  const { data: resultados = [] } = useQuery({
    queryKey: ['admin', 'resultados'],
    queryFn: async () => {
      const { data, error } = await supabase.from('resultados').select('id')
      if (error) throw error
      return data
    },
  });

  const { data: catalogoServicios = [] } = useServicios();

  const ips = users.filter((u) => u.role === 'ips');
  const emps = users.filter((u) => u.role === 'empresa');
  const parts = users.filter((u) => u.role === 'particular');

  const stats = [
    { label: "IPS registradas", value: ips.length, icon: Stethoscope },
    { label: "Empresas registradas", value: emps.length, icon: Building2 },
    { label: "Particulares", value: parts.length, icon: User },
    { label: "Citas agendadas", value: appointments.length, icon: ClipboardList },
    { label: "Resultados cargados", value: resultados.length, icon: FileCheck2 },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {stats.map((s) => (
          <Card key={s.label}>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-3xl font-bold text-primary">{s.value}</div>
                  <div className="text-sm text-muted-foreground">{s.label}</div>
                </div>
                <s.icon className="w-6 h-6 text-muted-foreground" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>IPS</CardTitle></CardHeader>
          <CardContent>
            {ips.length === 0 ? <p className="text-sm text-muted-foreground">Sin IPS.</p> : (
              <ul className="divide-y">
                {ips.map((u) => {
                  const clasifs = derivarClasificaciones(u.servicios ?? [], catalogoServicios);
                  return (
                    <li key={u.id} className="py-2">
                      <div className="font-medium">{u.nombre}</div>
                      <div className="text-xs text-muted-foreground">
                        {u.ciudad}, {u.departamento}
                      </div>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {(u.servicios ?? []).map((s) => <Badge key={s} variant="secondary" className="text-xs">{s}</Badge>)}
                      </div>
                      {clasifs.length > 0 && (
                        <div className="mt-1 flex flex-wrap gap-1">
                          {clasifs.map((c) => <Badge key={c} variant="outline" className="text-xs">{c}</Badge>)}
                        </div>
                      )}
                      <div className="mt-3">
                        <IpsFotosSection ipsId={u.id} />
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Empresas</CardTitle></CardHeader>
          <CardContent>
            {emps.length === 0 ? <p className="text-sm text-muted-foreground">Sin empresas.</p> : (
              <ul className="divide-y">
                {emps.map((u) => (
                  <li key={u.id} className="py-2">
                    <div className="font-medium">{u.nombre}</div>
                    <div className="text-xs text-muted-foreground">
                      {u.nit ? `NIT ${u.nit}` : ""}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
        <Card className="md:col-span-2">
          <CardHeader><CardTitle>Particulares</CardTitle></CardHeader>
          <CardContent>
            {parts.length === 0 ? <p className="text-sm text-muted-foreground">Sin particulares.</p> : (
              <ul className="divide-y">
                {parts.map((u) => (
                  <li key={u.id} className="py-2">
                    <div className="font-medium">{u.nombre}</div>
                    <div className="text-xs text-muted-foreground">
                      {u.cedula ? `CC ${u.cedula}` : ""}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Build**

Run: `bun run build`
Expected: passes

- [ ] **Step 4: Commit**

```bash
git add src/components/IpsDetailPanel.tsx src/routes/app.admin.index.tsx
git commit -m "feat: IpsDetailPanel + admin index use derivarClasificaciones from servicios"
```

---

### Task 8: Empresa + Particular Solicitar

**Files:**
- Modify: `src/routes/app.empresa.solicitar.tsx`
- Modify: `src/routes/app.particular.solicitar.tsx`

**Interfaces:**
- Consumes:
  - `useServicios()`, `derivarClasificaciones` from Task 3
  - `useClasificaciones()` from Task 3 (still used for filter UI labels)
  - `Slot.servicio` from Task 2 (was `departamento_medico`)
  - `Profile.servicios` from Task 2

**Changes in both files:**
1. Add import: `useServicios, derivarClasificaciones` from useCatalogos
2. Add hook call: `const { data: catalogoServicios = [] } = useServicios()`
3. Update `ipsConDistancia` filter:
   - Old: `filtroClasificaciones.some((c) => (ips.clasificaciones ?? []).includes(c))`
   - New: `derivarClasificaciones(ips.servicios ?? [], catalogoServicios).some(c => filtroClasificaciones.includes(c))`
4. Slot display: `s.departamento_medico` → `s.servicio`
5. `bookAppointment.mutate` call: `departamento_medico: slot.departamento_medico` → `servicio: slot.servicio`

- [ ] **Step 1: Update `src/routes/app.empresa.solicitar.tsx`**

Make the following targeted changes (do not rewrite the full file unless simpler):

a) Change the import line for useCatalogos:
```typescript
// Before:
import { useClasificaciones, useTiposExamen } from "@/lib/hooks/useCatalogos";
// After:
import { useClasificaciones, useTiposExamen, useServicios, derivarClasificaciones } from "@/lib/hooks/useCatalogos";
```

b) Add hook call after the `const { data: tiposExamen = [] } = useTiposExamen();` line:
```typescript
const { data: catalogoServicios = [] } = useServicios();
```

c) Update the filter inside `ipsConDistancia` useMemo:
```typescript
// Before:
.filter((ips) => {
  if (filtroClasificaciones.length === 0) return true;
  return filtroClasificaciones.some((c) => (ips.clasificaciones ?? []).includes(c));
})
// After:
.filter((ips) => {
  if (filtroClasificaciones.length === 0) return true;
  return derivarClasificaciones(ips.servicios ?? [], catalogoServicios)
    .some((c) => filtroClasificaciones.includes(c));
})
```

d) Add `catalogoServicios` to the `useMemo` dependency array:
```typescript
// Before:
}, [ipsEnCiudad, centro, filtroClasificaciones]);
// After:
}, [ipsEnCiudad, centro, filtroClasificaciones, catalogoServicios]);
```

e) Update slot display in the slot picker grid:
```typescript
// Before:
<div className="text-xs text-muted-foreground">{s.hora} · {s.departamento_medico}</div>
// After:
<div className="text-xs text-muted-foreground">{s.hora} · {s.servicio}</div>
```

f) Update `bookAppointment.mutate` call:
```typescript
// Before:
departamento_medico: slot.departamento_medico,
// After:
servicio: slot.servicio,
```

- [ ] **Step 2: Update `src/routes/app.particular.solicitar.tsx`**

Apply the same six changes as Step 1 (the files are structurally identical in these sections).

- [ ] **Step 3: Build**

Run: `bun run build`
Expected: passes

- [ ] **Step 4: Commit**

```bash
git add src/routes/app.empresa.solicitar.tsx src/routes/app.particular.solicitar.tsx
git commit -m "feat: solicitar uses derivarClasificaciones for IPS filter + rename servicio field"
```

---

### Task 9: IPS Calendario + Citas + Resultados

**Files:**
- Modify: `src/routes/app.ips.calendario.tsx`
- Modify: `src/routes/app.ips.citas.tsx`
- Modify: `src/routes/app.ips.resultados.tsx`
- Check (may need edits): `src/routes/app.empresa.citas.tsx`, `src/routes/app.particular.citas.tsx`

**Interfaces:**
- Consumes: `Slot.servicio` (was `departamento_medico`) from Task 2
- Consumes: `Appointment.servicio` (was `departamento_medico`) from Task 2
- Consumes: `Profile.servicios` (was `departamentos_medicos`) from Task 2

- [ ] **Step 1: Update `src/routes/app.ips.calendario.tsx`**

a) State initialization:
```typescript
// Before:
const [depMed, setDepMed] = useState(profile?.departamentos_medicos?.[0] ?? "Medicina General");
// After:
const [depMed, setDepMed] = useState(profile?.servicios?.[0] ?? "Medicina General");
```

b) Slot insert inside `handleAdd` → `addSlots.mutate`:
```typescript
// Before:
departamento_medico: depMed,
// After:
servicio: depMed,
```

c) Label in JSX:
```typescript
// Before:
<Label>Departamento médico</Label>
// After:
<Label>Servicio</Label>
```

d) Select options source:
```typescript
// Before:
{(profile?.departamentos_medicos ?? ["Medicina General"]).map((d) => (
// After:
{(profile?.servicios ?? ["Medicina General"]).map((d) => (
```

e) Slot display in the list:
```typescript
// Before:
<div className="font-medium">{s.hora} · {s.departamento_medico}</div>
// After:
<div className="font-medium">{s.hora} · {s.servicio}</div>
```

- [ ] **Step 2: Update `src/routes/app.ips.citas.tsx`**

a) Column header:
```typescript
// Before:
<TableHead>Depto médico</TableHead>
// After:
<TableHead>Servicio</TableHead>
```

b) Cell value:
```typescript
// Before:
<TableCell>{a.departamento_medico}</TableCell>
// After:
<TableCell>{a.servicio}</TableCell>
```

- [ ] **Step 3: Update `src/routes/app.ips.resultados.tsx`**

Change the pending appointment display line:
```typescript
// Before:
<b>{a.empleado_nombre}</b> · {a.fecha} {a.hora} · {a.departamento_medico}
// After:
<b>{a.empleado_nombre}</b> · {a.fecha} {a.hora} · {a.servicio}
```

- [ ] **Step 4: Check empresa.citas + particular.citas**

Search both files for any occurrence of `departamento_medico`. If found, rename to `servicio`. (These files may not reference the field at all — if so, no change needed.)

- [ ] **Step 5: Build**

Run: `bun run build`
Expected: passes with zero TypeScript errors

- [ ] **Step 6: Commit**

```bash
git add src/routes/app.ips.calendario.tsx src/routes/app.ips.citas.tsx src/routes/app.ips.resultados.tsx
git commit -m "feat: IPS calendario + citas + resultados rename departamento_medico → servicio"
```

---

## Post-Implementation Checklist

After all tasks pass build:

- [ ] User runs `supabase/migrations/008_servicios.sql` in Supabase Dashboard (SQL Editor → New query → paste → Run)
- [ ] Verify Supabase Studio shows `servicios` table with `clasificacion_id` column, `profiles` with `servicios` column (no `clasificaciones`), `slots` and `appointments` with `servicio` column
- [ ] Admin can link a servicio to a clasificación in Catálogos → Servicios tab
- [ ] IPS profile shows "Servicios" checkboxes (no "Clasificaciones" section)
- [ ] IpsDetailPanel shows servicios badges + derived clasificaciones badges
