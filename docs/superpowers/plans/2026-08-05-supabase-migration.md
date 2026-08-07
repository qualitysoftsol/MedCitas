# MedCitas — Supabase Migration + IPS Photos Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate MedCitas from localStorage/Context to Supabase (Auth, PostgreSQL, Storage, Edge Functions) and add IPS facility photos with gallery display.

**Architecture:** Replace `src/lib/store.tsx` with Supabase Auth for sessions and TanStack Query hooks for all data. All SQL runs in the Supabase dashboard. Admin user creation uses an Edge Function with the service role key. IPS photos upload to Supabase Storage and display in a detail panel on the solicitar pages.

**Tech Stack:** `@supabase/supabase-js` v2, TanStack Query v5 (already installed), Resend for email, Supabase Edge Functions (Deno), Supabase Storage.

## Global Constraints

- React 19, TypeScript strict, Vite, TailwindCSS v4, TanStack Router — no changes to these
- All Supabase client queries use the typed `Database` type from `src/lib/database.types.ts`
- `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are the only env vars exposed to the client
- `SUPABASE_SERVICE_ROLE_KEY` and `RESEND_API_KEY` are used **only** in Edge Functions, never in client code
- Field naming follows snake_case in DB and TS types: `solicitante_id`, `ips_id`, `empleado_nombre`, `departamento_medico`, `tipo_examen`, `created_at`
- Maximum 5 photos per IPS; bucket name is `ips-fotos`
- **Do NOT make git commits or pushes**
- Run dev server with `bun run dev` (or `npm run dev`)

## File Map

**New files:**
- `src/lib/supabase.ts` — Supabase client singleton
- `src/lib/database.types.ts` — TypeScript types for all DB tables
- `src/lib/auth-context.tsx` — AuthProvider + useAuth hook (global session)
- `src/lib/imageUtils.ts` — WebP conversion before upload
- `src/lib/hooks/useSlots.ts` — slots queries + mutations
- `src/lib/hooks/useAppointments.ts` — appointments queries + mutations
- `src/lib/hooks/useResultados.ts` — resultados queries + mutations
- `src/lib/hooks/useNotifications.ts` — notifications + Realtime subscription
- `src/lib/hooks/useProfile.ts` — profile query + update mutation
- `src/lib/hooks/useIpsFotos.ts` — IPS photos upload/list/delete
- `supabase/functions/notify-appointment/index.ts` — email on cita agendada/cancelada
- `supabase/functions/notify-resultado/index.ts` — email on resultado cargado
- `supabase/functions/create-user/index.ts` — admin creates IPS/empresa accounts

**Modified files:**
- `.env` — add Supabase env vars
- `package.json` — add `@supabase/supabase-js`
- `src/routes/__root.tsx` — replace `StoreProvider` with `AuthProvider`
- `src/routes/auth.tsx` — rewrite with Supabase Auth, add email field
- `src/routes/index.tsx` — use `useAuth` instead of `useStore`
- `src/routes/app.tsx` — use `useAuth` instead of `useStore`
- `src/routes/app.perfil.tsx` — use `useProfile` + `useAuth`, add IPS photos section
- `src/routes/app.ips.calendario.tsx` — use `useSlots` + `useAuth`
- `src/routes/app.ips.citas.tsx` — use `useAppointments` + `useAuth`
- `src/routes/app.ips.resultados.tsx` — use `useResultados` + `useAppointments` + `useAuth`
- `src/routes/app.empresa.solicitar.tsx` — use hooks + show IPS photos
- `src/routes/app.empresa.citas.tsx` — use `useAppointments` + `useAuth`
- `src/routes/app.empresa.resultados.tsx` — use `useResultados` + `useAuth`
- `src/routes/app.particular.solicitar.tsx` — same pattern as empresa.solicitar
- `src/routes/app.particular.citas.tsx` — same pattern as empresa.citas
- `src/routes/app.particular.resultados.tsx` — same pattern as empresa.resultados
- `src/routes/app.admin.index.tsx` — use hooks for stats
- `src/routes/app.admin.registrar.tsx` — use `create-user` Edge Function
- `src/components/NotificationBell.tsx` — use `useNotifications`

**Deleted files:**
- `src/lib/store.tsx` — removed in Task 14 after all references updated

---

## Task 1: Supabase project setup + client + types

**Files:**
- Modify: `.env`
- Modify: `package.json` (via bun/npm install)
- Create: `src/lib/supabase.ts`
- Create: `src/lib/database.types.ts`

**Interfaces:**
- Produces: `supabase` client, `Database` type, `Profile`, `Slot`, `Appointment`, `Resultado`, `Notification`, `IpsFoto` types — used by all subsequent tasks

- [ ] **Step 1: Create a Supabase project**

  Go to [supabase.com](https://supabase.com), sign in, click "New project". Choose a name (e.g. `medcitas`), set a strong DB password, pick region `us-east-1`. Wait ~2 min for provisioning.

- [ ] **Step 2: Get project credentials**

  In the Supabase dashboard → Project Settings → API. Copy:
  - `Project URL` → this is `VITE_SUPABASE_URL`
  - `anon public` key → this is `VITE_SUPABASE_ANON_KEY`

- [ ] **Step 3: Add env vars to .env**

  Open `.env` and append (keep the existing Google Maps vars):
  ```env
  VITE_SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co
  VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
  ```

- [ ] **Step 4: Install Supabase JS client**

  ```bash
  bun add @supabase/supabase-js
  ```

- [ ] **Step 5: Create `src/lib/supabase.ts`**

  ```typescript
  import { createClient } from '@supabase/supabase-js'
  import type { Database } from './database.types'

  export const supabase = createClient<Database>(
    import.meta.env.VITE_SUPABASE_URL,
    import.meta.env.VITE_SUPABASE_ANON_KEY
  )
  ```

- [ ] **Step 6: Create `src/lib/database.types.ts`**

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
            tipo_examen: 'ingreso' | 'anual' | 'retiro'
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
      }
    }
  }

  export type Profile = Database['public']['Tables']['profiles']['Row']
  export type IpsFoto = Database['public']['Tables']['ips_fotos']['Row']
  export type Slot = Database['public']['Tables']['slots']['Row']
  export type Appointment = Database['public']['Tables']['appointments']['Row']
  export type Resultado = Database['public']['Tables']['resultados']['Row']
  export type Notification = Database['public']['Tables']['notifications']['Row']
  ```

- [ ] **Step 7: Verify dev server still starts**

  ```bash
  bun run dev
  ```
  Expected: app loads at `http://localhost:8080` with no TypeScript errors. Auth still uses localStorage (store.tsx untouched).

---

## Task 2: SQL schema, RLS policies, auth trigger + Storage bucket

**Files:** All SQL runs in Supabase Dashboard → SQL Editor → New query

**Interfaces:**
- Produces: all 6 tables with RLS, `handle_new_user` trigger, `ips-fotos` Storage bucket — required by all subsequent tasks

- [ ] **Step 1: Run schema migration**

  In Supabase Dashboard → SQL Editor → New query, paste and run:

  ```sql
  -- Enums
  CREATE TYPE user_role AS ENUM ('admin', 'ips', 'empresa', 'particular');
  CREATE TYPE tipo_examen_enum AS ENUM ('ingreso', 'anual', 'retiro');
  CREATE TYPE appointment_estado AS ENUM ('agendada', 'atendida', 'cancelada');
  CREATE TYPE apto_status AS ENUM ('apto', 'apto_restricciones', 'no_apto');
  CREATE TYPE notification_tipo AS ENUM ('cita_agendada', 'cita_cancelada', 'resultado_cargado');

  -- Profiles (extends auth.users)
  CREATE TABLE profiles (
    id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    role user_role NOT NULL,
    nombre text NOT NULL,
    telefono text,
    direccion text,
    descripcion text,
    nit text,
    cedula text,
    departamento text,
    ciudad text,
    lat float8,
    lng float8,
    departamentos_medicos text[],
    created_at timestamptz DEFAULT now()
  );

  -- IPS Photos (max 5 per IPS)
  CREATE TABLE ips_fotos (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    ips_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    url text NOT NULL,
    orden int2 NOT NULL DEFAULT 0,
    created_at timestamptz DEFAULT now()
  );

  -- Slots
  CREATE TABLE slots (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    ips_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    fecha date NOT NULL,
    hora time NOT NULL,
    departamento_medico text NOT NULL,
    ciudad text NOT NULL,
    taken boolean NOT NULL DEFAULT false,
    created_at timestamptz DEFAULT now()
  );

  -- Appointments
  CREATE TABLE appointments (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    slot_id uuid NOT NULL REFERENCES slots(id),
    ips_id uuid NOT NULL REFERENCES profiles(id),
    solicitante_id uuid NOT NULL REFERENCES profiles(id),
    empleado_nombre text NOT NULL,
    empleado_cedula text NOT NULL,
    tipo_examen tipo_examen_enum NOT NULL,
    fecha date NOT NULL,
    hora time NOT NULL,
    ciudad text NOT NULL,
    departamento_medico text NOT NULL,
    estado appointment_estado NOT NULL DEFAULT 'agendada',
    created_at timestamptz DEFAULT now()
  );

  -- Resultados
  CREATE TABLE resultados (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    appointment_id uuid NOT NULL REFERENCES appointments(id),
    solicitante_id uuid NOT NULL REFERENCES profiles(id),
    ips_id uuid NOT NULL REFERENCES profiles(id),
    empleado_nombre text NOT NULL,
    empleado_cedula text NOT NULL,
    fecha date NOT NULL,
    diagnostico text NOT NULL,
    apto apto_status NOT NULL,
    observaciones text NOT NULL DEFAULT '',
    created_at timestamptz DEFAULT now()
  );

  -- Notifications
  CREATE TABLE notifications (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    tipo notification_tipo NOT NULL,
    titulo text NOT NULL,
    mensaje text NOT NULL,
    read boolean NOT NULL DEFAULT false,
    created_at timestamptz DEFAULT now()
  );
  ```

  Expected: "Success. No rows returned."

- [ ] **Step 2: Run RLS policies**

  New query:

  ```sql
  -- Enable RLS on all tables
  ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
  ALTER TABLE ips_fotos ENABLE ROW LEVEL SECURITY;
  ALTER TABLE slots ENABLE ROW LEVEL SECURITY;
  ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;
  ALTER TABLE resultados ENABLE ROW LEVEL SECURITY;
  ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

  -- Helper: is the current user an admin?
  CREATE OR REPLACE FUNCTION is_admin()
  RETURNS boolean AS $$
    SELECT EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
    );
  $$ LANGUAGE sql SECURITY DEFINER;

  -- profiles: IPS are public, others see only themselves. Admin sees all.
  CREATE POLICY "ips_profiles_public" ON profiles
    FOR SELECT USING (role = 'ips' OR id = auth.uid() OR is_admin());

  CREATE POLICY "user_updates_own_profile" ON profiles
    FOR UPDATE USING (id = auth.uid() OR is_admin());

  -- ips_fotos: public read, owner + admin write
  CREATE POLICY "fotos_public_read" ON ips_fotos
    FOR SELECT USING (true);

  CREATE POLICY "ips_manages_own_fotos" ON ips_fotos
    FOR ALL USING (ips_id = auth.uid() OR is_admin());

  -- slots: public read, IPS owner writes
  CREATE POLICY "slots_public_read" ON slots
    FOR SELECT USING (true);

  CREATE POLICY "ips_manages_own_slots" ON slots
    FOR ALL USING (ips_id = auth.uid() OR is_admin());

  -- appointments: solicitante + IPS see their own
  CREATE POLICY "appointments_read" ON appointments
    FOR SELECT USING (solicitante_id = auth.uid() OR ips_id = auth.uid() OR is_admin());

  CREATE POLICY "solicitante_books" ON appointments
    FOR INSERT WITH CHECK (
      solicitante_id = auth.uid() AND
      EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('empresa', 'particular'))
    );

  CREATE POLICY "ips_or_solicitante_updates" ON appointments
    FOR UPDATE USING (ips_id = auth.uid() OR solicitante_id = auth.uid() OR is_admin());

  -- resultados: IPS + solicitante see their own; IPS inserts
  CREATE POLICY "resultados_read" ON resultados
    FOR SELECT USING (solicitante_id = auth.uid() OR ips_id = auth.uid() OR is_admin());

  CREATE POLICY "ips_inserts_resultado" ON resultados
    FOR INSERT WITH CHECK (ips_id = auth.uid());

  -- notifications: private per user
  CREATE POLICY "notifications_own" ON notifications
    FOR SELECT USING (user_id = auth.uid());

  CREATE POLICY "notifications_update_own" ON notifications
    FOR UPDATE USING (user_id = auth.uid());
  ```

  Expected: "Success. No rows returned."

- [ ] **Step 3: Run auth trigger**

  New query:

  ```sql
  CREATE OR REPLACE FUNCTION public.handle_new_user()
  RETURNS trigger AS $$
  BEGIN
    INSERT INTO public.profiles (
      id, role, nombre, telefono, nit, cedula,
      departamento, ciudad, lat, lng, departamentos_medicos
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
      END
    );
    RETURN NEW;
  END;
  $$ LANGUAGE plpgsql SECURITY DEFINER;

  CREATE OR REPLACE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
  ```

  Expected: "Success. No rows returned."

- [ ] **Step 4: Create the admin user**

  In Supabase Dashboard → Authentication → Users → "Add user" → "Create new user":
  - Email: (your admin email, e.g. `admin@medcitas.co`)
  - Password: (strong password)
  - Click "Create user"

  Then in SQL Editor:
  ```sql
  -- Insert admin profile manually (trigger doesn't run for manually created users in dashboard)
  INSERT INTO profiles (id, role, nombre)
  SELECT id, 'admin', 'Administrador General'
  FROM auth.users
  WHERE email = 'admin@medcitas.co';
  ```

- [ ] **Step 5: Create `ips-fotos` Storage bucket**

  In Supabase Dashboard → Storage → "New bucket":
  - Name: `ips-fotos`
  - Public bucket: ✓ (checked)
  - Click "Save"

  Then add Storage RLS policy — Dashboard → Storage → `ips-fotos` → Policies → "New policy" → "For full customization":

  **Policy 1 — Public read:**
  - Policy name: `public_read`
  - Allowed operation: SELECT
  - Target roles: (leave empty = all)
  - USING expression: `true`

  **Policy 2 — IPS writes own folder:**
  - Policy name: `ips_writes_own`
  - Allowed operations: INSERT, UPDATE, DELETE
  - Target roles: authenticated
  - USING expression: `(storage.foldername(name))[1] = auth.uid()::text`

- [ ] **Step 6: Verify tables in dashboard**

  Go to Supabase Dashboard → Table Editor. Confirm all 6 tables are visible: `profiles`, `ips_fotos`, `slots`, `appointments`, `resultados`, `notifications`.

---

## Task 3: AuthProvider + auth.tsx rewrite + update root, index, app routes

**Files:**
- Create: `src/lib/auth-context.tsx`
- Modify: `src/routes/__root.tsx`
- Modify: `src/routes/auth.tsx`
- Modify: `src/routes/index.tsx`
- Modify: `src/routes/app.tsx`

**Interfaces:**
- Consumes: `supabase` from `src/lib/supabase.ts`, `Profile` type
- Produces: `useAuth()` hook returning `{ profile, loading, login, logout, register }` — consumed by all route files

- [ ] **Step 1: Create `src/lib/auth-context.tsx`**

  ```typescript
  import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
  import { supabase } from './supabase'
  import type { Profile } from './database.types'
  import { DEPARTAMENTOS } from './colombia'

  export type { Profile }
  export { DEPARTAMENTOS }

  interface RegisterData {
    email: string
    password: string
    role: 'ips' | 'empresa' | 'particular'
    nombre: string
    telefono?: string
    nit?: string
    cedula?: string
    departamento?: string
    ciudad?: string
    lat?: number
    lng?: number
    departamentos_medicos?: string[]
  }

  interface AuthCtx {
    profile: Profile | null
    loading: boolean
    login: (email: string, password: string) => Promise<void>
    logout: () => Promise<void>
    register: (data: RegisterData) => Promise<void>
  }

  const AuthContext = createContext<AuthCtx | null>(null)

  export function AuthProvider({ children }: { children: ReactNode }) {
    const [profile, setProfile] = useState<Profile | null>(null)
    const [loading, setLoading] = useState(true)

    useEffect(() => {
      supabase.auth.getSession().then(({ data: { session } }) => {
        if (session?.user) {
          fetchProfile(session.user.id)
        } else {
          setLoading(false)
        }
      })

      const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
        if (session?.user) {
          fetchProfile(session.user.id)
        } else {
          setProfile(null)
          setLoading(false)
        }
      })

      return () => subscription.unsubscribe()
    }, [])

    const fetchProfile = async (userId: string) => {
      const { data } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single()
      setProfile(data)
      setLoading(false)
    }

    const login = async (email: string, password: string) => {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) throw error
    }

    const logout = async () => {
      await supabase.auth.signOut()
    }

    const register = async (data: RegisterData) => {
      const { error } = await supabase.auth.signUp({
        email: data.email,
        password: data.password,
        options: {
          data: {
            role: data.role,
            nombre: data.nombre,
            telefono: data.telefono ?? null,
            nit: data.nit ?? null,
            cedula: data.cedula ?? null,
            departamento: data.departamento ?? null,
            ciudad: data.ciudad ?? null,
            lat: data.lat ?? null,
            lng: data.lng ?? null,
            departamentos_medicos: data.departamentos_medicos ?? null,
          }
        }
      })
      if (error) throw error
    }

    return (
      <AuthContext.Provider value={{ profile, loading, login, logout, register }}>
        {children}
      </AuthContext.Provider>
    )
  }

  export function useAuth() {
    const ctx = useContext(AuthContext)
    if (!ctx) throw new Error('useAuth must be used within AuthProvider')
    return ctx
  }
  ```

- [ ] **Step 2: Update `src/routes/__root.tsx`**

  Replace `StoreProvider` import and usage:

  ```typescript
  import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
  import {
    Outlet,
    Link,
    createRootRouteWithContext,
    HeadContent,
    Scripts,
  } from "@tanstack/react-router";
  import { type ReactNode } from "react";
  import appCss from "../styles.css?url";
  import { AuthProvider } from "@/lib/auth-context";
  import { Toaster } from "@/components/ui/sonner";

  // ... (keep NotFoundComponent and ErrorComponent unchanged)

  function RootComponent() {
    const { queryClient } = Route.useRouteContext();
    return (
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <Outlet />
          <Toaster richColors position="top-center" />
        </AuthProvider>
      </QueryClientProvider>
    );
  }
  ```

- [ ] **Step 3: Rewrite `src/routes/auth.tsx`**

  Replace the entire file:

  ```typescript
  import { createFileRoute, useNavigate } from "@tanstack/react-router";
  import { useState } from "react";
  import { useAuth, DEPARTAMENTOS } from "@/lib/auth-context";
  import { Button } from "@/components/ui/button";
  import { Input } from "@/components/ui/input";
  import { Label } from "@/components/ui/label";
  import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
  import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
  import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
  import { Stethoscope } from "lucide-react";
  import { toast } from "sonner";

  export const Route = createFileRoute("/auth")({
    head: () => ({
      meta: [
        { title: "Ingreso — MedCitas" },
        { name: "description", content: "Inicia sesión o regístrate en MedCitas." },
      ],
    }),
    component: AuthPage,
  });

  function AuthPage() {
    const { login, register, profile } = useAuth();
    const navigate = useNavigate();
    const [tab, setTab] = useState("login");

    // login
    const [lEmail, setLEmail] = useState("");
    const [lPass, setLPass] = useState("");

    // register
    const [role, setRole] = useState<"empresa" | "ips" | "particular">("empresa");
    const [rEmail, setREmail] = useState("");
    const [rPass, setRPass] = useState("");
    const [nombre, setNombre] = useState("");
    const [telefono, setTelefono] = useState("");
    const [nit, setNit] = useState("");
    const [cedula, setCedula] = useState("");
    const [depto, setDepto] = useState("");
    const [ciudad, setCiudad] = useState("");
    const [deptosMed, setDeptosMed] = useState("Medicina General, Optometría");

    if (profile) return <div />;

    const handleLogin = async (e: React.FormEvent) => {
      e.preventDefault();
      try {
        await login(lEmail.trim(), lPass);
        navigate({ to: "/" });
      } catch (err: any) {
        toast.error(err.message ?? "Credenciales inválidas");
      }
    };

    const handleRegister = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!rEmail.trim() || !rPass || !nombre.trim()) return toast.error("Completa los campos requeridos");
      if (role === "ips" && (!depto || !ciudad)) return toast.error("La IPS debe seleccionar departamento y ciudad");
      const ciudadObj = DEPARTAMENTOS.find((d) => d.nombre === depto)?.ciudades.find((c) => c.nombre === ciudad);
      try {
        await register({
          email: rEmail.trim(),
          password: rPass,
          role,
          nombre: nombre.trim(),
          telefono: telefono || undefined,
          ...(role === "empresa" ? { nit } : {}),
          ...(role === "particular" ? { cedula } : {}),
          ...(role === "ips" ? {
            departamento: depto,
            ciudad,
            lat: ciudadObj?.lat,
            lng: ciudadObj?.lng,
            departamentos_medicos: deptosMed.split(",").map((s) => s.trim()).filter(Boolean),
          } : {}),
        });
        toast.success("Cuenta creada. Revisa tu email para confirmar.");
      } catch (err: any) {
        toast.error(err.message ?? "Error al registrar");
      }
    };

    const ciudades = DEPARTAMENTOS.find((d) => d.nombre === depto)?.ciudades ?? [];

    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-4 py-8 bg-[color:var(--muted)]">
        <div className="flex items-center gap-2 mb-6">
          <div className="rounded-xl p-2" style={{ background: "var(--gradient-primary)" }}>
            <Stethoscope className="w-6 h-6 text-primary-foreground" />
          </div>
          <span className="text-2xl font-bold">MedCitas</span>
        </div>
        <Card className="w-full max-w-md shadow-lg">
          <CardHeader>
            <CardTitle>Acceso a la plataforma</CardTitle>
            <CardDescription>Ingresa o crea una cuenta como IPS, Empresa o Particular.</CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs value={tab} onValueChange={setTab}>
              <TabsList className="grid grid-cols-2 w-full">
                <TabsTrigger value="login">Iniciar sesión</TabsTrigger>
                <TabsTrigger value="register">Registrarme</TabsTrigger>
              </TabsList>
              <TabsContent value="login">
                <form onSubmit={handleLogin} className="space-y-3 mt-4">
                  <div>
                    <Label>Correo electrónico</Label>
                    <Input type="email" value={lEmail} onChange={(e) => setLEmail(e.target.value)} autoComplete="email" />
                  </div>
                  <div>
                    <Label>Contraseña</Label>
                    <Input type="password" value={lPass} onChange={(e) => setLPass(e.target.value)} autoComplete="current-password" />
                  </div>
                  <Button type="submit" className="w-full">Entrar</Button>
                </form>
              </TabsContent>
              <TabsContent value="register">
                <form onSubmit={handleRegister} className="space-y-3 mt-4">
                  <div>
                    <Label>Tipo de cuenta</Label>
                    <Select value={role} onValueChange={(v) => setRole(v as typeof role)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="empresa">Empresa</SelectItem>
                        <SelectItem value="ips">IPS</SelectItem>
                        <SelectItem value="particular">Particular</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Correo electrónico</Label>
                    <Input type="email" value={rEmail} onChange={(e) => setREmail(e.target.value)} />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>Contraseña</Label>
                      <Input type="password" value={rPass} onChange={(e) => setRPass(e.target.value)} />
                    </div>
                    <div>
                      <Label>{role === "ips" ? "Nombre IPS" : role === "particular" ? "Nombre completo" : "Razón social"}</Label>
                      <Input value={nombre} onChange={(e) => setNombre(e.target.value)} />
                    </div>
                  </div>
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
                            <SelectTrigger><SelectValue placeholder="Seleccione" /></SelectTrigger>
                            <SelectContent>
                              {DEPARTAMENTOS.map((d) => <SelectItem key={d.nombre} value={d.nombre}>{d.nombre}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <Label>Ciudad</Label>
                          <Select value={ciudad} onValueChange={setCiudad} disabled={!depto}>
                            <SelectTrigger><SelectValue placeholder="Seleccione" /></SelectTrigger>
                            <SelectContent>
                              {ciudades.map((c) => <SelectItem key={c.nombre} value={c.nombre}>{c.nombre}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      <div>
                        <Label>Departamentos médicos (separados por coma)</Label>
                        <Input value={deptosMed} onChange={(e) => setDeptosMed(e.target.value)} />
                      </div>
                    </>
                  )}
                  <Button type="submit" className="w-full">Crear cuenta</Button>
                </form>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    );
  }
  ```

- [ ] **Step 4: Update `src/routes/index.tsx`**

  ```typescript
  import { createFileRoute, Navigate } from "@tanstack/react-router";
  import { useAuth } from "@/lib/auth-context";

  export const Route = createFileRoute("/")({
    component: Index,
  });

  function Index() {
    const { profile, loading } = useAuth();
    if (loading) return null;
    if (!profile) return <Navigate to="/auth" />;
    if (profile.role === "admin") return <Navigate to="/app/admin" />;
    if (profile.role === "ips") return <Navigate to="/app/ips/calendario" />;
    return <Navigate to="/app/empresa/solicitar" />;
  }
  ```

- [ ] **Step 5: Update `src/routes/app.tsx`**

  Replace the entire `useStore` usage with `useAuth`. The sidebar NAV object and layout remain exactly the same; only the auth-related imports change:

  ```typescript
  // Replace:
  import { useStore, type Role } from "@/lib/store";
  // With:
  import { useAuth } from "@/lib/auth-context";
  import type { Profile } from "@/lib/database.types";
  type Role = Profile['role'];
  ```

  In `AppLayout`:
  ```typescript
  // Replace:
  const { currentUser, logout } = useStore();
  if (!currentUser) return <Navigate to="/auth" />;
  const items = NAV[currentUser.role];
  // With:
  const { profile, logout } = useAuth();
  if (!profile) return <Navigate to="/auth" />;
  const items = NAV[profile.role];
  ```

  In the header JSX:
  ```typescript
  // Replace: currentUser.profile.nombre
  // With:    profile.nombre
  ```

  In the logout button:
  ```typescript
  onClick={() => { logout(); navigate({ to: "/auth" }); }}
  // logout() is now async but fire-and-forget is fine here
  ```

  In `AppSidebar`, replace `role: Role` prop usage — it still receives `role` prop so no changes needed inside it.

- [ ] **Step 6: Test auth flow**

  Start dev server. Open `http://localhost:8080`.
  - Verify redirect to `/auth`
  - Log in with the admin email/password you created in Task 2 Step 4
  - Verify redirect to `/app/admin`
  - Verify sidebar shows "admin" role and username in header
  - Verify logout works and redirects to `/auth`

---

## Task 4: useSlots hook + app.ips.calendario.tsx

**Files:**
- Create: `src/lib/hooks/useSlots.ts`
- Modify: `src/routes/app.ips.calendario.tsx`

**Interfaces:**
- Consumes: `supabase`, `Slot` type, `useAuth()`
- Produces: `useSlots(ipsId)` returning `{ slots, isLoading }`, `useAddSlots()` mutation, `useSlotsForIps(ipsId)` — consumed by calendario and solicitar routes

- [ ] **Step 1: Create `src/lib/hooks/useSlots.ts`**

  ```typescript
  import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
  import { supabase } from '@/lib/supabase'
  import type { Slot } from '@/lib/database.types'

  export function useSlots(ipsId: string | undefined) {
    return useQuery({
      queryKey: ['slots', ipsId],
      queryFn: async () => {
        if (!ipsId) return []
        const { data, error } = await supabase
          .from('slots')
          .select('*')
          .eq('ips_id', ipsId)
          .order('fecha')
          .order('hora')
        if (error) throw error
        return data as Slot[]
      },
      enabled: !!ipsId,
    })
  }

  export function useAvailableSlots(ipsId: string | null) {
    return useQuery({
      queryKey: ['slots', 'available', ipsId],
      queryFn: async () => {
        if (!ipsId) return []
        const { data, error } = await supabase
          .from('slots')
          .select('*')
          .eq('ips_id', ipsId)
          .eq('taken', false)
          .order('fecha')
          .order('hora')
        if (error) throw error
        return data as Slot[]
      },
      enabled: !!ipsId,
    })
  }

  type NewSlot = Omit<Slot, 'id' | 'created_at' | 'taken'>

  export function useAddSlots() {
    const qc = useQueryClient()
    return useMutation({
      mutationFn: async (slots: NewSlot[]) => {
        const { error } = await supabase.from('slots').insert(slots)
        if (error) throw error
      },
      onSuccess: (_data, variables) => {
        qc.invalidateQueries({ queryKey: ['slots', variables[0]?.ips_id] })
      },
    })
  }
  ```

- [ ] **Step 2: Update `src/routes/app.ips.calendario.tsx`**

  Replace `useStore` with `useAuth` + `useSlots` + `useAddSlots`:

  ```typescript
  import { createFileRoute } from "@tanstack/react-router";
  import { useState } from "react";
  import { useAuth } from "@/lib/auth-context";
  import { DEPARTAMENTOS } from "@/lib/colombia";
  import { useSlots, useAddSlots } from "@/lib/hooks/useSlots";
  import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
  import { Button } from "@/components/ui/button";
  import { Input } from "@/components/ui/input";
  import { Label } from "@/components/ui/label";
  import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
  import { Calendar } from "@/components/ui/calendar";
  import { Badge } from "@/components/ui/badge";
  import { toast } from "sonner";

  export const Route = createFileRoute("/app/ips/calendario")({
    component: IpsCalendario,
  });

  function IpsCalendario() {
    const { profile } = useAuth();
    const [date, setDate] = useState<Date | undefined>(new Date());
    const [depMed, setDepMed] = useState(profile?.departamentos_medicos?.[0] ?? "Medicina General");
    const [depto, setDepto] = useState(profile?.departamento ?? "");
    const [ciudad, setCiudad] = useState(profile?.ciudad ?? "");
    const [horas, setHoras] = useState("08:00, 09:00, 10:00, 14:00, 15:00");

    const { data: slots = [] } = useSlots(profile?.id);
    const addSlots = useAddSlots();

    const ciudades = DEPARTAMENTOS.find((d) => d.nombre === depto)?.ciudades ?? [];
    const selectedDate = date?.toISOString().slice(0, 10);
    const misSlots = slots.filter((s) => !selectedDate || s.fecha === selectedDate);

    const handleAdd = () => {
      if (!date) return toast.error("Selecciona una fecha");
      if (!ciudad || !depto) return toast.error("Selecciona departamento y ciudad");
      const fecha = date.toISOString().slice(0, 10);
      const lista = horas.split(",").map((h) => h.trim()).filter(Boolean);
      addSlots.mutate(
        lista.map((h) => ({
          ips_id: profile!.id,
          fecha,
          hora: h,
          departamento_medico: depMed,
          ciudad,
        })),
        {
          onSuccess: () => toast.success(`${lista.length} horarios agregados`),
          onError: (err: any) => toast.error(err.message),
        }
      );
    };

    return (
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Registrar disponibilidad</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="rounded-md border p-2 pointer-events-auto">
              <Calendar mode="single" selected={date} onSelect={setDate} className="mx-auto pointer-events-auto" />
            </div>
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
              <Label>Departamento médico</Label>
              <Select value={depMed} onValueChange={setDepMed}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(profile?.departamentos_medicos ?? ["Medicina General"]).map((d) => (
                    <SelectItem key={d} value={d}>{d}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Horas (separadas por coma)</Label>
              <Input value={horas} onChange={(e) => setHoras(e.target.value)} />
            </div>
            <Button onClick={handleAdd} disabled={addSlots.isPending} className="w-full">
              {addSlots.isPending ? "Guardando..." : "Agregar horarios"}
            </Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Horarios {date ? `del ${date.toLocaleDateString("es-CO")}` : ""}</CardTitle>
          </CardHeader>
          <CardContent>
            {misSlots.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sin horarios en esta fecha.</p>
            ) : (
              <ul className="divide-y">
                {misSlots.sort((a, b) => a.hora.localeCompare(b.hora)).map((s) => (
                  <li key={s.id} className="py-2 flex items-center justify-between">
                    <div>
                      <div className="font-medium">{s.hora} · {s.departamento_medico}</div>
                      <div className="text-xs text-muted-foreground">{s.ciudad}</div>
                    </div>
                    <Badge variant={s.taken ? "secondary" : "default"}>
                      {s.taken ? "Ocupado" : "Disponible"}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }
  ```

- [ ] **Step 3: Manual test**

  Log in as an IPS account. Go to `/app/ips/calendario`. Add slots for today. Refresh the page — slots should persist (loaded from Supabase, not localStorage).

---

## Task 5: useAppointments hook + all citas and solicitar routes

**Files:**
- Create: `src/lib/hooks/useAppointments.ts`
- Modify: `src/routes/app.empresa.solicitar.tsx`
- Modify: `src/routes/app.particular.solicitar.tsx`
- Modify: `src/routes/app.empresa.citas.tsx`
- Modify: `src/routes/app.ips.citas.tsx`
- Modify: `src/routes/app.particular.citas.tsx`

**Interfaces:**
- Consumes: `supabase`, `Appointment` type, `useAuth()`, `useAvailableSlots()`
- Produces: `useAppointments()`, `useBookAppointment()`, `useCancelAppointment()` — used by citas and solicitar pages

- [ ] **Step 1: Create `src/lib/hooks/useAppointments.ts`**

  ```typescript
  import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
  import { supabase } from '@/lib/supabase'
  import type { Appointment } from '@/lib/database.types'

  type AppointmentWithNames = Appointment & {
    ips: { nombre: string } | null
    solicitante: { nombre: string } | null
  }

  export function useAppointments(userId: string | undefined, role: string | undefined) {
    return useQuery({
      queryKey: ['appointments', userId],
      queryFn: async () => {
        if (!userId) return []
        let query = supabase
          .from('appointments')
          .select('*, ips:profiles!ips_id(nombre), solicitante:profiles!solicitante_id(nombre)')
          .order('fecha', { ascending: false })
          .order('hora', { ascending: false })

        if (role === 'ips') {
          query = query.eq('ips_id', userId)
        } else {
          query = query.eq('solicitante_id', userId)
        }

        const { data, error } = await query
        if (error) throw error
        return data as AppointmentWithNames[]
      },
      enabled: !!userId,
    })
  }

  type BookData = Omit<Appointment, 'id' | 'created_at' | 'estado'>

  export function useBookAppointment() {
    const qc = useQueryClient()
    return useMutation({
      mutationFn: async (appt: BookData) => {
        const { error } = await supabase.from('appointments').insert(appt)
        if (error) throw error
        // Mark slot as taken
        await supabase.from('slots').update({ taken: true }).eq('id', appt.slot_id)
      },
      onSuccess: (_data, variables) => {
        qc.invalidateQueries({ queryKey: ['appointments'] })
        qc.invalidateQueries({ queryKey: ['slots', 'available', variables.ips_id] })
      },
    })
  }

  export function useCancelAppointment() {
    const qc = useQueryClient()
    return useMutation({
      mutationFn: async ({ id, slotId }: { id: string; slotId: string }) => {
        const { error } = await supabase
          .from('appointments')
          .update({ estado: 'cancelada' })
          .eq('id', id)
        if (error) throw error
        await supabase.from('slots').update({ taken: false }).eq('id', slotId)
      },
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: ['appointments'] })
        qc.invalidateQueries({ queryKey: ['slots'] })
      },
    })
  }
  ```

- [ ] **Step 2: Update `src/routes/app.empresa.solicitar.tsx`**

  Replace `useStore` with hooks. The IPS list now comes from a Supabase query instead of filtering in-memory. Key changes:

  ```typescript
  import { useAuth } from "@/lib/auth-context";
  import { useQuery } from "@tanstack/react-query";
  import { supabase } from "@/lib/supabase";
  import { useAvailableSlots } from "@/lib/hooks/useSlots";
  import { useBookAppointment } from "@/lib/hooks/useAppointments";
  import type { Profile } from "@/lib/database.types";
  // Keep all other existing imports (IpsMap, AddressInput, haversineKm, etc.)

  function EmpresaSolicitar() {
    const { profile } = useAuth();
    const bookAppointment = useBookAppointment();

    // ... keep state for empleadoNombre, empleadoCedula, tipoExamen, depto, ciudad, etc.

    // Replace in-memory users.filter with a Supabase query
    const { data: ipsEnCiudad = [] } = useQuery({
      queryKey: ['ips', ciudad],
      queryFn: async () => {
        const { data, error } = await supabase
          .from('profiles')
          .select('*')
          .eq('role', 'ips')
          .eq('ciudad', ciudad)
        if (error) throw error
        return data as Profile[]
      },
      enabled: !!ciudad,
    });

    // Replace slots.filter with useAvailableSlots
    const { data: slotsIps = [] } = useAvailableSlots(selectedIps);

    // ipsConDistancia computed same way as before using haversineKm

    // In submit():
    const submit = () => {
      if (!empleadoNombre.trim() || !empleadoCedula.trim()) return toast.error("Ingresa nombre y cédula del empleado");
      const slot = slotsIps.find((s) => s.id === selectedSlot);
      if (!slot) return toast.error("Selecciona un horario");
      bookAppointment.mutate({
        slot_id: slot.id,
        ips_id: slot.ips_id,
        solicitante_id: profile!.id,
        empleado_nombre: empleadoNombre,
        empleado_cedula: empleadoCedula,
        tipo_examen: tipoExamen,
        fecha: slot.fecha,
        hora: slot.hora,
        ciudad: slot.ciudad,
        departamento_medico: slot.departamento_medico,
      }, {
        onSuccess: () => {
          toast.success("Cita agendada");
          setEmpleadoNombre(""); setEmpleadoCedula(""); setSelectedSlot(null);
        },
        onError: (err: any) => toast.error(err.message),
      });
    };

    // In the IPS list, replace: users.find(u=>u.id===selectedIps)?.profile.nombre
    // With: ipsEnCiudad.find(u=>u.id===selectedIps)?.nombre
    // Replace: ips.profile.nombre → ips.nombre
    // Replace: ips.profile.direccion → ips.direccion
    // Replace: s.ipsId → s.ips_id, s.departamentoMedico → s.departamento_medico
  }
  ```

- [ ] **Step 3: Update `src/routes/app.particular.solicitar.tsx`**

  Apply the exact same changes as Step 2. Additional difference: `particular` uses own name and cedula as empleado data:

  ```typescript
  // In submit():
  bookAppointment.mutate({
    slot_id: slot.id,
    ips_id: slot.ips_id,
    solicitante_id: profile!.id,
    empleado_nombre: profile!.nombre,
    empleado_cedula: cedula,
    tipo_examen: tipoExamen,
    fecha: slot.fecha,
    hora: slot.hora,
    ciudad: slot.ciudad,
    departamento_medico: slot.departamento_medico,
  }, { ... });
  ```

  Remove the `updateProfile` call that was saving cedula/dirección (profile updates handled in useProfile).

- [ ] **Step 4: Update `src/routes/app.empresa.citas.tsx`**

  ```typescript
  import { useAuth } from "@/lib/auth-context";
  import { useAppointments, useCancelAppointment } from "@/lib/hooks/useAppointments";

  function EmpresaCitas() {
    const { profile } = useAuth();
    const { data: mine = [] } = useAppointments(profile?.id, profile?.role);
    const cancelAppointment = useCancelAppointment();

    // Replace: a.empresaId → a.solicitante_id
    // Replace: a.ipsId → a.ips_id
    // Replace: a.empleadoNombre → a.empleado_nombre
    // Replace: a.tipoExamen → a.tipo_examen
    // Replace: nombreIps(a.ipsId) → a.ips?.nombre ?? "—"
    // cancelAppointment call:
    //   cancelAppointment.mutate({ id: a.id, slotId: a.slot_id })
  }
  ```

- [ ] **Step 5: Update `src/routes/app.ips.citas.tsx`**

  Same pattern as Step 4:

  ```typescript
  import { useAuth } from "@/lib/auth-context";
  import { useAppointments, useCancelAppointment } from "@/lib/hooks/useAppointments";

  function IpsCitas() {
    const { profile } = useAuth();
    const { data: mine = [] } = useAppointments(profile?.id, profile?.role);
    const cancelAppointment = useCancelAppointment();

    // Replace: a.ipsId → a.ips_id
    // Replace: a.empresaId → a.solicitante_id
    // Replace: a.empleadoNombre → a.empleado_nombre, a.empleadoCedula → a.empleado_cedula
    // Replace: a.tipoExamen → a.tipo_examen, a.departamentoMedico → a.departamento_medico
    // Replace: nombreEmpresa(a.empresaId) → a.solicitante?.nombre ?? "—"
    // cancelAppointment.mutate({ id: a.id, slotId: a.slot_id })
  }
  ```

- [ ] **Step 6: Update `src/routes/app.particular.citas.tsx`**

  Read the file first, then apply the same pattern as Step 4 (empresa.citas). The only difference is the page title ("Mis citas" vs "Citas de mis empleados").

- [ ] **Step 7: Manual test**

  Log in as empresa. Solicitar a cita. Verify it appears in `/app/empresa/citas`. Log in as the IPS. Verify the appointment appears in `/app/ips/citas`. Cancel the appointment from IPS. Verify status changes to "cancelada" on both sides after page refresh.

---

## Task 6: useResultados hook + all resultados routes

**Files:**
- Create: `src/lib/hooks/useResultados.ts`
- Modify: `src/routes/app.ips.resultados.tsx`
- Modify: `src/routes/app.empresa.resultados.tsx`
- Modify: `src/routes/app.particular.resultados.tsx`

**Interfaces:**
- Consumes: `supabase`, `Resultado` type, `useAuth()`, `useAppointments()`
- Produces: `useResultados()`, `useAddResultado()` — consumed by resultados routes

- [ ] **Step 1: Create `src/lib/hooks/useResultados.ts`**

  ```typescript
  import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
  import { supabase } from '@/lib/supabase'
  import type { Resultado } from '@/lib/database.types'

  export function useResultados(userId: string | undefined, role: string | undefined) {
    return useQuery({
      queryKey: ['resultados', userId],
      queryFn: async () => {
        if (!userId) return []
        let query = supabase.from('resultados').select('*').order('created_at', { ascending: false })
        if (role === 'ips') {
          query = query.eq('ips_id', userId)
        } else {
          query = query.eq('solicitante_id', userId)
        }
        const { data, error } = await query
        if (error) throw error
        return data as Resultado[]
      },
      enabled: !!userId,
    })
  }

  type NewResultado = Omit<Resultado, 'id' | 'created_at'>

  export function useAddResultado() {
    const qc = useQueryClient()
    return useMutation({
      mutationFn: async (r: NewResultado) => {
        const { error } = await supabase.from('resultados').insert(r)
        if (error) throw error
        // Mark appointment as atendida
        await supabase.from('appointments').update({ estado: 'atendida' }).eq('id', r.appointment_id)
      },
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: ['resultados'] })
        qc.invalidateQueries({ queryKey: ['appointments'] })
      },
    })
  }
  ```

- [ ] **Step 2: Update `src/routes/app.ips.resultados.tsx`**

  ```typescript
  import { useAuth } from "@/lib/auth-context";
  import { useAppointments } from "@/lib/hooks/useAppointments";
  import { useResultados, useAddResultado } from "@/lib/hooks/useResultados";

  function IpsResultados() {
    const { profile } = useAuth();
    const { data: appointments = [] } = useAppointments(profile?.id, 'ips');
    const { data: atendidas = [] } = useResultados(profile?.id, 'ips');
    const addResultado = useAddResultado();

    const pendientes = appointments.filter((a) => a.estado === 'agendada');

    // In submit():
    addResultado.mutate({
      appointment_id: apptId,
      solicitante_id: appt.solicitante_id,
      ips_id: appt.ips_id,
      empleado_nombre: appt.empleado_nombre,
      empleado_cedula: appt.empleado_cedula,
      fecha: new Date().toISOString().slice(0, 10),
      diagnostico,
      apto,
      observaciones: obs,
    }, {
      onSuccess: () => {
        toast.success("Resultado cargado");
        setOpen(false); setApptId(""); setDiagnostico(""); setObs(""); setApto("apto");
      },
      onError: (err: any) => toast.error(err.message),
    });

    // Replace: appt.empleadoNombre → appt.empleado_nombre
    // Replace: appt.empleadoCedula → appt.empleado_cedula
    // Replace: appt.departamentoMedico → appt.departamento_medico
    // Replace: r.empleadoNombre → r.empleado_nombre, r.empleadoCedula → r.empleado_cedula
  }
  ```

- [ ] **Step 3: Update `src/routes/app.empresa.resultados.tsx`**

  ```typescript
  import { useAuth } from "@/lib/auth-context";
  import { useResultados } from "@/lib/hooks/useResultados";
  import { useQuery } from "@tanstack/react-query";
  import { supabase } from "@/lib/supabase";
  import type { Profile } from "@/lib/database.types";

  function EmpresaResultados() {
    const { profile } = useAuth();
    const { data: mine = [] } = useResultados(profile?.id, profile?.role);

    // To show IPS name, fetch profiles for unique ips_ids in results
    const ipsIds = [...new Set(mine.map((r) => r.ips_id))];
    const { data: ipsProfiles = [] } = useQuery({
      queryKey: ['profiles', ipsIds],
      queryFn: async () => {
        if (ipsIds.length === 0) return [];
        const { data, error } = await supabase.from('profiles').select('id, nombre').in('id', ipsIds);
        if (error) throw error;
        return data as Pick<Profile, 'id' | 'nombre'>[];
      },
      enabled: ipsIds.length > 0,
    });
    const ipsNombre = (id: string) => ipsProfiles.find((p) => p.id === id)?.nombre ?? "—";

    // Replace: r.empleadoNombre → r.empleado_nombre, r.empleadoCedula → r.empleado_cedula
    // Replace: r.empresaId → r.solicitante_id
  }
  ```

- [ ] **Step 4: Update `src/routes/app.particular.resultados.tsx`**

  Read the file first, then apply the same pattern as Step 3.

- [ ] **Step 5: Manual test**

  Log in as IPS. Go to `/app/ips/resultados`. Upload a result for a pending appointment. Verify it moves to "Resultados cargados". Log in as empresa. Verify the result appears in `/app/empresa/resultados`.

---

## Task 7: useNotifications hook + NotificationBell

**Files:**
- Create: `src/lib/hooks/useNotifications.ts`
- Modify: `src/components/NotificationBell.tsx`

**Interfaces:**
- Consumes: `supabase`, `Notification` type, `useAuth()`
- Produces: `useNotifications()` with Realtime subscription — used by NotificationBell

- [ ] **Step 1: Create `src/lib/hooks/useNotifications.ts`**

  ```typescript
  import { useEffect } from 'react'
  import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
  import { supabase } from '@/lib/supabase'
  import type { Notification } from '@/lib/database.types'

  export function useNotifications(userId: string | undefined) {
    const qc = useQueryClient()

    const query = useQuery({
      queryKey: ['notifications', userId],
      queryFn: async () => {
        if (!userId) return []
        const { data, error } = await supabase
          .from('notifications')
          .select('*')
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
        if (error) throw error
        return data as Notification[]
      },
      enabled: !!userId,
    })

    // Realtime subscription
    useEffect(() => {
      if (!userId) return
      const channel = supabase
        .channel(`notifications:${userId}`)
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` },
          () => { qc.invalidateQueries({ queryKey: ['notifications', userId] }) }
        )
        .subscribe()
      return () => { supabase.removeChannel(channel) }
    }, [userId, qc])

    return query
  }

  export function useMarkNotificationsRead() {
    const qc = useQueryClient()
    return useMutation({
      mutationFn: async (userId: string) => {
        const { error } = await supabase
          .from('notifications')
          .update({ read: true })
          .eq('user_id', userId)
          .eq('read', false)
        if (error) throw error
      },
      onSuccess: (_data, userId) => {
        qc.invalidateQueries({ queryKey: ['notifications', userId] })
      },
    })
  }

  export function useClearNotifications() {
    const qc = useQueryClient()
    return useMutation({
      mutationFn: async (userId: string) => {
        const { error } = await supabase
          .from('notifications')
          .delete()
          .eq('user_id', userId)
        if (error) throw error
      },
      onSuccess: (_data, userId) => {
        qc.invalidateQueries({ queryKey: ['notifications', userId] })
      },
    })
  }
  ```

- [ ] **Step 2: Update `src/components/NotificationBell.tsx`**

  ```typescript
  import { Bell, Check, Trash2 } from "lucide-react";
  import { Button } from "@/components/ui/button";
  import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
  import { useAuth } from "@/lib/auth-context";
  import { useNotifications, useMarkNotificationsRead, useClearNotifications } from "@/lib/hooks/useNotifications";

  export function NotificationBell() {
    const { profile } = useAuth();
    const { data: notifications = [] } = useNotifications(profile?.id);
    const markRead = useMarkNotificationsRead();
    const clear = useClearNotifications();

    if (!profile) return null;

    const unread = notifications.filter((n) => !n.read).length;

    return (
      <Popover onOpenChange={(o) => {
        if (o && unread && profile.id) markRead.mutate(profile.id);
      }}>
        <PopoverTrigger asChild>
          <Button variant="ghost" size="sm" className="relative" aria-label="Notificaciones">
            <Bell className="w-4 h-4" />
            {unread > 0 && (
              <span className="absolute -top-0.5 -right-0.5 min-w-4 h-4 px-1 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center">
                {unread}
              </span>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-80 p-0">
          <div className="flex items-center justify-between px-3 py-2 border-b">
            <div className="font-semibold text-sm">Notificaciones</div>
            {notifications.length > 0 && (
              <Button variant="ghost" size="sm" onClick={() => clear.mutate(profile.id)} className="h-7">
                <Trash2 className="w-3.5 h-3.5 mr-1" /> Limpiar
              </Button>
            )}
          </div>
          <div className="max-h-96 overflow-y-auto">
            {notifications.length === 0 ? (
              <p className="p-4 text-sm text-muted-foreground text-center">Sin notificaciones.</p>
            ) : (
              <ul className="divide-y">
                {notifications.map((n) => (
                  <li key={n.id} className="px-3 py-2 text-sm">
                    <div className="flex items-center gap-2 font-medium">
                      <Check className="w-3.5 h-3.5 text-primary" />
                      {n.titulo}
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">{n.mensaje}</div>
                    <div className="text-[10px] text-muted-foreground/60 mt-0.5">
                      {new Date(n.created_at).toLocaleString("es-CO")}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </PopoverContent>
      </Popover>
    );
  }
  ```

- [ ] **Step 3: Enable Realtime in Supabase dashboard**

  Go to Supabase Dashboard → Database → Replication. Enable replication for the `notifications` table (toggle it on).

- [ ] **Step 4: Manual test**

  Open two browser tabs. In Tab 1: log in as empresa and book an appointment. In Tab 2: log in as IPS. Verify the notification bell in Tab 2 updates without refreshing.

---

## Task 8: useProfile hook + app.perfil.tsx

**Files:**
- Create: `src/lib/hooks/useProfile.ts`
- Modify: `src/routes/app.perfil.tsx`

**Interfaces:**
- Consumes: `supabase`, `Profile` type, `useAuth()`
- Produces: `useUpdateProfile()`, `useChangePassword()` — used by perfil route

- [ ] **Step 1: Create `src/lib/hooks/useProfile.ts`**

  ```typescript
  import { useMutation, useQueryClient } from '@tanstack/react-query'
  import { supabase } from '@/lib/supabase'
  import type { Profile } from '@/lib/database.types'

  export function useUpdateProfile() {
    return useMutation({
      mutationFn: async ({ id, patch }: { id: string; patch: Partial<Profile> }) => {
        const { error } = await supabase.from('profiles').update(patch).eq('id', id)
        if (error) throw error
      },
    })
  }

  export function useChangePassword() {
    return useMutation({
      mutationFn: async (newPassword: string) => {
        const { error } = await supabase.auth.updateUser({ password: newPassword })
        if (error) throw error
      },
    })
  }
  ```

- [ ] **Step 2: Update `src/routes/app.perfil.tsx`**

  ```typescript
  import { createFileRoute } from "@tanstack/react-router";
  import { useState, useEffect } from "react";
  import { useAuth } from "@/lib/auth-context";
  import { useUpdateProfile, useChangePassword } from "@/lib/hooks/useProfile";
  import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
  import { Button } from "@/components/ui/button";
  import { Input } from "@/components/ui/input";
  import { Label } from "@/components/ui/label";
  import { Textarea } from "@/components/ui/textarea";
  import { toast } from "sonner";

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
    const [newP, setNewP] = useState("");
    const [confirmP, setConfirmP] = useState("");

    useEffect(() => {
      if (!profile) return;
      setNombre(profile.nombre);
      setTelefono(profile.telefono ?? "");
      setDireccion(profile.direccion ?? "");
      setDescripcion(profile.descripcion ?? "");
    }, [profile]);

    if (!profile) return null;

    const saveProfile = () => {
      updateProfile.mutate(
        { id: profile.id, patch: { nombre, telefono, direccion, descripcion } },
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
            <div><Label>Email</Label><Input value={profile ? (profile as any).email ?? "" : ""} disabled /></div>
            <div><Label>Nombre / Razón social</Label><Input value={nombre} onChange={(e) => setNombre(e.target.value)} /></div>
            <div><Label>Teléfono</Label><Input value={telefono} onChange={(e) => setTelefono(e.target.value)} /></div>
            <div><Label>Dirección</Label><Input value={direccion} onChange={(e) => setDireccion(e.target.value)} /></div>
            <div><Label>Descripción</Label><Textarea value={descripcion} onChange={(e) => setDescripcion(e.target.value)} /></div>
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
      </div>
    );
  }
  ```

  Note: To show the user's email in the profile form, read it from the Supabase session: `supabase.auth.getUser()` returns the email. Alternatively, add an `email` column to `profiles` and populate it in the trigger. The simpler approach is to call `supabase.auth.getUser()` inside a `useEffect` and store the email in local state.

- [ ] **Step 3: Manual test**

  Log in, go to `/app/perfil`, update the phone number, save. Refresh — the updated phone number should persist.

---

## Task 9: Admin routes migration + create-user Edge Function

**Files:**
- Create: `supabase/functions/create-user/index.ts`
- Modify: `src/routes/app.admin.index.tsx`
- Modify: `src/routes/app.admin.registrar.tsx`
- Modify: `src/routes/app.admin.menus.tsx`

**Interfaces:**
- Consumes: `supabase`, `Profile` type, `useAuth()`, Supabase service role key (Edge Function only)
- Produces: `create-user` Edge Function URL — called from `app.admin.registrar.tsx`

- [ ] **Step 1: Install Supabase CLI (if not installed)**

  ```bash
  # Windows (PowerShell as admin)
  winget install Supabase.CLI
  ```

  Verify: `supabase --version`

- [ ] **Step 2: Initialize Supabase local project**

  In the project root:
  ```bash
  supabase init
  supabase login
  supabase link --project-ref YOUR_PROJECT_REF
  ```

  `YOUR_PROJECT_REF` is the string in your Supabase URL: `https://YOUR_PROJECT_REF.supabase.co`

- [ ] **Step 3: Create `supabase/functions/create-user/index.ts`**

  ```typescript
  import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
  import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  }

  serve(async (req) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // Verify caller is admin
    const authHeader = req.headers.get('Authorization')!
    const { data: { user }, error: authError } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''))
    if (authError || !user) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders })

    const { data: callerProfile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
    if (callerProfile?.role !== 'admin') return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: corsHeaders })

    const body = await req.json()
    const { email, password, role, nombre, telefono, nit, cedula, departamento, ciudad, lat, lng, departamentos_medicos } = body

    if (!email || !password || !role || !nombre) {
      return new Response(JSON.stringify({ error: 'Campos requeridos: email, password, role, nombre' }), { status: 400, headers: corsHeaders })
    }

    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { role, nombre, telefono, nit, cedula, departamento, ciudad, lat, lng, departamentos_medicos },
    })

    if (error) return new Response(JSON.stringify({ error: error.message }), { status: 400, headers: corsHeaders })

    return new Response(JSON.stringify({ user: data.user }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  })
  ```

- [ ] **Step 4: Deploy the Edge Function**

  ```bash
  supabase functions deploy create-user
  ```

  In Supabase Dashboard → Settings → Edge Functions, verify `create-user` appears.

- [ ] **Step 5: Update `src/routes/app.admin.registrar.tsx`**

  Replace the `register` call with a fetch to the Edge Function:

  ```typescript
  import { createFileRoute } from "@tanstack/react-router";
  import { useState } from "react";
  import { useAuth, DEPARTAMENTOS } from "@/lib/auth-context";
  import { supabase } from "@/lib/supabase";
  // ... same UI imports as before

  function AdminRegistrar() {
    const { profile } = useAuth();
    // ... same state as before, replace 'usuario' with 'email'
    const [email, setEmail] = useState("");
    // ... rest of state unchanged

    const submit = async () => {
      if (!email.trim() || !password || !nombre.trim()) return toast.error("Campos requeridos");
      const c = ciudades.find((x) => x.nombre === ciudad);
      const { data: { session } } = await supabase.auth.getSession();

      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-user`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`,
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
            departamento: depto, ciudad, lat: c?.lat, lng: c?.lng,
            departamentos_medicos: deptosMed.split(",").map((s) => s.trim()).filter(Boolean),
          } : {}),
        }),
      });

      const data = await res.json();
      if (!res.ok) return toast.error(data.error ?? "Error al crear usuario");

      const label = role === "ips" ? "IPS" : role === "empresa" ? "Empresa" : "Particular";
      toast.success(`${label} creada`);
      setEmail(""); setPassword(""); setNombre(""); setTelefono(""); setNit(""); setCedula(""); setDepto(""); setCiudad("");
    };

    // In JSX: replace "Usuario" label/input with "Correo electrónico" + type="email"
  }
  ```

- [ ] **Step 6: Update `src/routes/app.admin.index.tsx`**

  Replace `useStore` with direct Supabase queries:

  ```typescript
  import { useAuth } from "@/lib/auth-context";
  import { useQuery } from "@tanstack/react-query";
  import { supabase } from "@/lib/supabase";

  function AdminDashboard() {
    const { data: users = [] } = useQuery({
      queryKey: ['admin', 'users'],
      queryFn: async () => {
        const { data, error } = await supabase.from('profiles').select('*')
        if (error) throw error
        return data
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

    const ips = users.filter((u) => u.role === 'ips');
    const emps = users.filter((u) => u.role === 'empresa');
    const parts = users.filter((u) => u.role === 'particular');

    // Replace: u.profile.nombre → u.nombre
    // Replace: u.departamentos → u.departamentos_medicos
  }
  ```

- [ ] **Step 7: Update `src/routes/app.admin.menus.tsx`**

  Read the file first. Replace `useStore` with `useAuth`. The menus page likely just displays role-based nav info — update accordingly.

- [ ] **Step 8: Manual test**

  Log in as admin. Go to `/app/admin`. Verify stats load. Go to `/app/admin/registrar`, create a new IPS account. Go back to `/app/admin` — verify the IPS count increased. Log in with the new IPS account — verify it works.

---

## Task 10: useIpsFotos hook + imageUtils.ts

**Files:**
- Create: `src/lib/imageUtils.ts`
- Create: `src/lib/hooks/useIpsFotos.ts`

**Interfaces:**
- Consumes: `supabase`, `IpsFoto` type, Supabase Storage bucket `ips-fotos`
- Produces: `useIpsFotos(ipsId)`, `useUploadFoto()`, `useDeleteFoto()`, `convertToWebP()` — consumed by Task 11 and 12

- [ ] **Step 1: Create `src/lib/imageUtils.ts`**

  ```typescript
  export async function convertToWebP(file: File, maxWidthPx = 1200): Promise<Blob> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        URL.revokeObjectURL(url);
        const scale = Math.min(1, maxWidthPx / img.width);
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        canvas.toBlob((blob) => {
          if (blob) resolve(blob);
          else reject(new Error('Error converting image'));
        }, 'image/webp', 0.85);
      };
      img.onerror = () => reject(new Error('Error loading image'));
      img.src = url;
    });
  }
  ```

- [ ] **Step 2: Create `src/lib/hooks/useIpsFotos.ts`**

  ```typescript
  import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
  import { supabase } from '@/lib/supabase'
  import { convertToWebP } from '@/lib/imageUtils'
  import type { IpsFoto } from '@/lib/database.types'

  export function useIpsFotos(ipsId: string | undefined) {
    return useQuery({
      queryKey: ['ips-fotos', ipsId],
      queryFn: async () => {
        if (!ipsId) return []
        const { data, error } = await supabase
          .from('ips_fotos')
          .select('*')
          .eq('ips_id', ipsId)
          .order('orden')
        if (error) throw error
        return data as IpsFoto[]
      },
      enabled: !!ipsId,
    })
  }

  export function useUploadFoto() {
    const qc = useQueryClient()
    return useMutation({
      mutationFn: async ({ ipsId, file, orden }: { ipsId: string; file: File; orden: number }) => {
        const webpBlob = await convertToWebP(file)
        const fileName = `${Date.now()}_${file.name.replace(/\.[^.]+$/, '')}.webp`
        const path = `${ipsId}/${fileName}`

        const { error: uploadError } = await supabase.storage
          .from('ips-fotos')
          .upload(path, webpBlob, { contentType: 'image/webp', upsert: false })
        if (uploadError) throw uploadError

        const { data: { publicUrl } } = supabase.storage.from('ips-fotos').getPublicUrl(path)

        const { error: dbError } = await supabase
          .from('ips_fotos')
          .insert({ ips_id: ipsId, url: publicUrl, orden })
        if (dbError) throw dbError
      },
      onSuccess: (_data, { ipsId }) => {
        qc.invalidateQueries({ queryKey: ['ips-fotos', ipsId] })
      },
    })
  }

  export function useDeleteFoto() {
    const qc = useQueryClient()
    return useMutation({
      mutationFn: async ({ foto, ipsId }: { foto: IpsFoto; ipsId: string }) => {
        // Extract storage path from public URL
        const urlParts = foto.url.split('/ips-fotos/')
        const storagePath = urlParts[1]

        const { error: storageError } = await supabase.storage
          .from('ips-fotos')
          .remove([storagePath])
        if (storageError) throw storageError

        const { error: dbError } = await supabase
          .from('ips_fotos')
          .delete()
          .eq('id', foto.id)
        if (dbError) throw dbError
      },
      onSuccess: (_data, { ipsId }) => {
        qc.invalidateQueries({ queryKey: ['ips-fotos', ipsId] })
      },
    })
  }
  ```

- [ ] **Step 3: Verify bucket access**

  In the browser console (with IPS user logged in):
  ```javascript
  const { data } = await supabase.storage.from('ips-fotos').list()
  console.log(data)
  ```
  Expected: empty array (no error).

---

## Task 11: IPS Photos UI in /app/perfil + admin panel

**Files:**
- Modify: `src/routes/app.perfil.tsx`
- Modify: `src/routes/app.admin.index.tsx`

**Interfaces:**
- Consumes: `useIpsFotos()`, `useUploadFoto()`, `useDeleteFoto()`, `useAuth()`

- [ ] **Step 1: Add photos section to `src/routes/app.perfil.tsx` (IPS only)**

  Add this component and render it below the existing two cards when `profile.role === 'ips'`:

  ```typescript
  import { useIpsFotos, useUploadFoto, useDeleteFoto } from "@/lib/hooks/useIpsFotos";
  import { ImagePlus, X } from "lucide-react";

  function IpsFotosSection({ ipsId }: { ipsId: string }) {
    const { data: fotos = [] } = useIpsFotos(ipsId);
    const uploadFoto = useUploadFoto();
    const deleteFoto = useDeleteFoto();
    const MAX_FOTOS = 5;

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      if (fotos.length >= MAX_FOTOS) return toast.error("Máximo 5 fotos por IPS");
      uploadFoto.mutate(
        { ipsId, file, orden: fotos.length },
        {
          onSuccess: () => toast.success("Foto subida"),
          onError: (err: any) => toast.error(err.message),
        }
      );
      e.target.value = "";
    };

    return (
      <Card className="md:col-span-2">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Fotos de instalaciones ({fotos.length}/{MAX_FOTOS})</CardTitle>
            <label className={`cursor-pointer ${fotos.length >= MAX_FOTOS ? "opacity-50 pointer-events-none" : ""}`}>
              <input type="file" accept="image/*" className="hidden" onChange={handleFileChange} disabled={uploadFoto.isPending} />
              <Button asChild variant="outline" size="sm">
                <span>
                  <ImagePlus className="w-4 h-4 mr-1" />
                  {uploadFoto.isPending ? "Subiendo..." : "Subir foto"}
                </span>
              </Button>
            </label>
          </div>
        </CardHeader>
        <CardContent>
          {fotos.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sin fotos. La primera foto será la portada.</p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
              {fotos.map((foto, i) => (
                <div key={foto.id} className="relative group rounded-md overflow-hidden border aspect-square">
                  <img src={foto.url} alt={`Foto ${i + 1}`} className="w-full h-full object-cover" />
                  {i === 0 && (
                    <span className="absolute top-1 left-1 bg-primary text-primary-foreground text-[10px] px-1.5 py-0.5 rounded font-medium">
                      Portada
                    </span>
                  )}
                  <button
                    onClick={() => deleteFoto.mutate({ foto, ipsId })}
                    className="absolute top-1 right-1 bg-background/80 rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    );
  }
  ```

  In `Perfil` component, after the existing cards:
  ```typescript
  {profile.role === 'ips' && <IpsFotosSection ipsId={profile.id} />}
  ```

- [ ] **Step 2: Add IPS photo management in `src/routes/app.admin.index.tsx`**

  In the IPS list, show each IPS's fotos count and add a collapsible `IpsFotosSection` (same component) per IPS:

  ```typescript
  import { IpsFotosSection } from "@/routes/app.perfil"; // or extract to a shared component

  // In the IPS list item:
  <li key={u.id} className="py-2">
    <div className="font-medium">{u.nombre}</div>
    <div className="text-xs text-muted-foreground">@{u.ciudad}, {u.departamento}</div>
    <IpsFotosSection ipsId={u.id} />
  </li>
  ```

  Note: Extract `IpsFotosSection` to `src/components/IpsFotosSection.tsx` and import it in both routes to avoid duplication.

- [ ] **Step 3: Extract shared component**

  Create `src/components/IpsFotosSection.tsx` with the `IpsFotosSection` component from Step 1. Update the imports in `app.perfil.tsx` and `app.admin.index.tsx`.

- [ ] **Step 4: Manual test**

  Log in as IPS. Go to `/app/perfil`. Upload 2 photos. Verify they appear in the grid, the first is marked "Portada". Delete one. Verify grid updates. Try uploading a 6th photo — verify the button is disabled.

---

## Task 12: IPS Photos display in solicitar pages

**Files:**
- Modify: `src/routes/app.empresa.solicitar.tsx`
- Modify: `src/routes/app.particular.solicitar.tsx`

**Interfaces:**
- Consumes: `useIpsFotos()`, `Profile` type with IPS data
- Produces: photo thumbnail in IPS card + detail panel with photo carousel on IPS selection

- [ ] **Step 1: Add IPS detail panel component**

  Create `src/components/IpsDetailPanel.tsx`:

  ```typescript
  import { useIpsFotos } from "@/lib/hooks/useIpsFotos";
  import { useState } from "react";
  import { ChevronLeft, ChevronRight, Stethoscope } from "lucide-react";
  import { Badge } from "@/components/ui/badge";
  import { Button } from "@/components/ui/button";
  import type { Profile } from "@/lib/database.types";

  interface Props {
    ips: Profile;
    distancia: number;
    onConfirm: () => void;
  }

  export function IpsDetailPanel({ ips, distancia, onConfirm }: Props) {
    const { data: fotos = [] } = useIpsFotos(ips.id);
    const [current, setCurrent] = useState(0);

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

        {(ips.departamentos_medicos ?? []).length > 0 && (
          <div className="flex flex-wrap gap-1">
            {ips.departamentos_medicos!.map((d) => (
              <Badge key={d} variant="secondary" className="text-xs">{d}</Badge>
            ))}
          </div>
        )}

        <Button className="w-full" onClick={onConfirm}>Confirmar selección y ver horarios</Button>
      </div>
    );
  }
  ```

- [ ] **Step 2: Add portada thumbnail to IPS cards in `app.empresa.solicitar.tsx`**

  In the IPS list, fetch portada for each IPS and show it as a thumbnail. To avoid N+1 queries, fetch all fotos for all IPS in the current city at once:

  ```typescript
  import { IpsDetailPanel } from "@/components/IpsDetailPanel";

  // After selectedIps state, add:
  const [showDetail, setShowDetail] = useState(false);

  // Fetch portadas (orden=0) for all IPS in city
  const ipsIds = ipsEnCiudad.map((i) => i.id);
  const { data: portadas = [] } = useQuery({
    queryKey: ['ips-fotos-portadas', ipsIds],
    queryFn: async () => {
      if (ipsIds.length === 0) return [];
      const { data, error } = await supabase
        .from('ips_fotos')
        .select('*')
        .in('ips_id', ipsIds)
        .eq('orden', 0);
      if (error) throw error;
      return data as IpsFoto[];
    },
    enabled: ipsIds.length > 0,
  });
  const portadaUrl = (ipsId: string) => portadas.find((f) => f.ips_id === ipsId)?.url;

  // In the IPS list items, add thumbnail:
  <li key={ips.id} className={`py-2 flex items-center gap-3 ${selectedIps===ips.id ? "bg-accent/40 rounded-md px-2" : ""}`}>
    <div className="w-14 h-14 rounded-md overflow-hidden border bg-muted flex-shrink-0">
      {portadaUrl(ips.id) ? (
        <img src={portadaUrl(ips.id)} alt={ips.nombre} className="w-full h-full object-cover" />
      ) : (
        <div className="w-full h-full flex items-center justify-center">
          <Stethoscope className="w-5 h-5 text-muted-foreground" />
        </div>
      )}
    </div>
    <div className="flex-1">
      <div className="font-medium">{ips.nombre}</div>
      <div className="text-xs text-muted-foreground">{ips.direccion} · {distancia.toFixed(1)} km</div>
    </div>
    <Button size="sm" variant={selectedIps===ips.id ? "default" : "outline"}
      onClick={() => { setSelectedIps(ips.id); setSelectedSlot(null); setShowDetail(true); }}>
      Elegir
    </Button>
  </li>

  // Replace the existing selectedIps detail section with the panel:
  {selectedIps && showDetail && (
    <Card className="lg:col-span-2">
      <CardHeader><CardTitle>Detalle de la IPS</CardTitle></CardHeader>
      <CardContent>
        <IpsDetailPanel
          ips={ipsEnCiudad.find(i => i.id === selectedIps)!}
          distancia={ipsConDistancia.find(i => i.ips.id === selectedIps)?.distancia ?? 0}
          onConfirm={() => setShowDetail(false)}
        />
      </CardContent>
    </Card>
  )}

  {selectedIps && !showDetail && (
    // ... existing slots selection card unchanged
  )}
  ```

- [ ] **Step 3: Apply same changes to `app.particular.solicitar.tsx`**

  Identical pattern as Step 2.

- [ ] **Step 4: Manual test**

  Log in as empresa. Go to solicitar. Select Bogotá. IPS cards should show thumbnails (placeholder if no photo). Click "Elegir" — detail panel opens with photo carousel, departamentos médicos, and "Confirmar selección" button. Click "Confirmar" — slots panel appears as before.

---

## Task 13: Email Edge Functions + Resend + webhooks

**Files:**
- Create: `supabase/functions/notify-appointment/index.ts`
- Create: `supabase/functions/notify-resultado/index.ts`

**Interfaces:**
- Consumes: Supabase DB webhooks, Resend API, `RESEND_API_KEY` env var, `SUPABASE_SERVICE_ROLE_KEY`

- [ ] **Step 1: Create a Resend account**

  Go to [resend.com](https://resend.com), create a free account. In the dashboard → API Keys → "Create API Key". Copy the key.

- [ ] **Step 2: Add Resend key to Supabase Edge Function secrets**

  In the Supabase Dashboard → Settings → Edge Functions → "Add new secret":
  - Name: `RESEND_API_KEY`
  - Value: `re_xxxxxxxxxxxx`

- [ ] **Step 3: Create `supabase/functions/notify-appointment/index.ts`**

  ```typescript
  import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
  import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

  serve(async (req) => {
    const payload = await req.json()
    const record = payload.record
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const [{ data: ips }, { data: solicitante }] = await Promise.all([
      supabase.from('profiles').select('nombre').eq('id', record.ips_id).single(),
      supabase.from('profiles').select('nombre').eq('id', record.solicitante_id).single(),
    ])

    const { data: { user: ipsUser } } = await supabase.auth.admin.getUserById(record.ips_id)
    const { data: { user: solUser } } = await supabase.auth.admin.getUserById(record.solicitante_id)

    const isCancel = record.estado === 'cancelada'
    const subject = isCancel
      ? `Cita cancelada — ${record.fecha} ${record.hora}`
      : `Cita confirmada — ${record.empleado_nombre}, ${record.fecha}`

    const body = isCancel
      ? `La cita de ${record.empleado_nombre} (CC ${record.empleado_cedula}) el ${record.fecha} a las ${record.hora} ha sido cancelada.`
      : `Se ha confirmado la cita de ${record.empleado_nombre} (CC ${record.empleado_cedula}) en ${ips?.nombre} el ${record.fecha} a las ${record.hora}. Examen: ${record.tipo_examen}.`

    const html = `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto">
        <h2 style="color:#0891b2">MedCitas</h2>
        <p>${body}</p>
        <a href="${Deno.env.get('SITE_URL') ?? 'https://medcitas.co'}" style="display:inline-block;margin-top:16px;padding:10px 20px;background:#0891b2;color:white;border-radius:6px;text-decoration:none">
          Ver en plataforma
        </a>
      </div>
    `

    const recipients = [ipsUser?.email, solUser?.email].filter(Boolean) as string[]
    await Promise.all(recipients.map((to) =>
      fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${Deno.env.get('RESEND_API_KEY')}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: 'MedCitas <notificaciones@tudominio.co>', to, subject, html }),
      })
    ))

    return new Response('ok')
  })
  ```

- [ ] **Step 4: Create `supabase/functions/notify-resultado/index.ts`**

  ```typescript
  import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
  import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

  serve(async (req) => {
    const payload = await req.json()
    const record = payload.record
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const { data: ips } = await supabase.from('profiles').select('nombre').eq('id', record.ips_id).single()
    const { data: { user: solUser } } = await supabase.auth.admin.getUserById(record.solicitante_id)

    const aptoLabel = record.apto === 'apto' ? 'Apto' : record.apto === 'apto_restricciones' ? 'Apto con restricciones' : 'No apto'

    const html = `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto">
        <h2 style="color:#0891b2">MedCitas — Resultado disponible</h2>
        <p>${ips?.nombre} ha cargado el resultado del examen de <strong>${record.empleado_nombre}</strong>.</p>
        <p>Aptitud: <strong>${aptoLabel}</strong></p>
        <p>Diagnóstico: ${record.diagnostico}</p>
        <a href="${Deno.env.get('SITE_URL') ?? 'https://medcitas.co'}" style="display:inline-block;margin-top:16px;padding:10px 20px;background:#0891b2;color:white;border-radius:6px;text-decoration:none">
          Ver resultado completo
        </a>
      </div>
    `

    if (solUser?.email) {
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${Deno.env.get('RESEND_API_KEY')}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: 'MedCitas <notificaciones@tudominio.co>',
          to: solUser.email,
          subject: `Resultado disponible — ${record.empleado_nombre}`,
          html,
        }),
      })
    }

    return new Response('ok')
  })
  ```

- [ ] **Step 5: Deploy both Edge Functions**

  ```bash
  supabase functions deploy notify-appointment
  supabase functions deploy notify-resultado
  ```

- [ ] **Step 6: Configure Database Webhooks**

  In Supabase Dashboard → Database → Webhooks → "Create a new hook":

  **Webhook 1:**
  - Name: `on_appointment_change`
  - Table: `appointments`
  - Events: INSERT, UPDATE
  - Type: Supabase Edge Functions
  - Edge Function: `notify-appointment`

  **Webhook 2:**
  - Name: `on_resultado_insert`
  - Table: `resultados`
  - Events: INSERT
  - Type: Supabase Edge Functions
  - Edge Function: `notify-resultado`

- [ ] **Step 7: Add SITE_URL secret to Edge Functions**

  In Supabase Dashboard → Settings → Edge Functions → "Add new secret":
  - Name: `SITE_URL`
  - Value: `http://localhost:8080` (update to production URL when deployed)

- [ ] **Step 8: Configure Resend sender domain**

  In Resend dashboard → Domains → "Add domain". Add your domain (or use `onboarding@resend.dev` for testing). Update the `from` address in both Edge Functions.

- [ ] **Step 9: Manual test**

  Book a new appointment. Check the email inbox of both the empresa and IPS accounts. Verify the "Cita confirmada" email arrives.

---

## Task 14: Delete store.tsx + final cleanup

**Files:**
- Delete: `src/lib/store.tsx`
- Verify: all routes compile with no imports from `store.tsx`

- [ ] **Step 1: Verify no remaining imports from store**

  In the project root, search for all references to `from "@/lib/store"` or `from "../lib/store"`:

  ```bash
  grep -r "from.*lib/store" src/
  ```

  Expected: no output. If any files still import from store, update them using the patterns established in Tasks 3-9.

- [ ] **Step 2: Delete `src/lib/store.tsx`**

  Delete the file `src/lib/store.tsx`.

- [ ] **Step 3: Run TypeScript check**

  ```bash
  bun run build
  ```

  Expected: build completes with no TypeScript errors.

- [ ] **Step 4: End-to-end smoke test**

  Run `bun run dev` and verify:
  1. `/auth` — login and register forms work
  2. IPS login → `/app/ips/calendario` — add slots, verify they persist after refresh
  3. Empresa login → `/app/empresa/solicitar` — IPS list loads from DB, portada thumbnails visible, book appointment
  4. IPS → `/app/ips/citas` — appointment appears
  5. IPS → `/app/ips/resultados` — upload result
  6. Empresa → `/app/empresa/resultados` — result visible
  7. Notification bell — notifications appear and update in real time
  8. IPS → `/app/perfil` — upload photos, verify gallery
  9. Admin → `/app/admin` — stats load, register new IPS
  10. Email inbox — verify notification emails arrived
