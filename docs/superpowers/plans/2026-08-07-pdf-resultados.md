# PDF Upload en Resultados IPS — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Agregar un campo PDF obligatorio al modal "Nuevo resultado" de IPS, subiendo el archivo a Supabase Storage y mostrando un enlace "Ver PDF" en la lista de resultados cargados.

**Architecture:** Nueva migración SQL crea la columna `pdf_url` en `resultados` y el bucket privado `resultados-pdfs` con sus políticas RLS. El hook `useAddResultado` sube el PDF a Storage antes de insertar la fila. Un nuevo hook `useResultadoPdfUrl` genera signed URLs de 1 hora para mostrar los PDFs en la lista.

**Tech Stack:** React, TanStack Query (useMutation/useQuery), Supabase JS client (storage + db), TypeScript, Tailwind CSS, shadcn/ui.

## Global Constraints

- Bucket privado: `resultados-pdfs`, nunca `public: true`
- Path de storage: `{ips_id}/{appointment_id}.pdf` (upsert habilitado)
- PDF es obligatorio: no se puede guardar resultado sin archivo
- `pdf_url` en DB almacena el path relativo, no la URL firmada
- Signed URL se genera en el cliente con expiración de 3600 segundos
- No modificar lógica de otras rutas (empresa, particular)

---

## File Map

| Archivo | Acción | Responsabilidad |
|---------|--------|-----------------|
| `supabase/migrations/012_resultados_pdf.sql` | Crear | Columna `pdf_url`, bucket, RLS |
| `src/lib/database.types.ts` | Modificar | Agregar `pdf_url: string` al Row de `resultados` |
| `src/lib/hooks/useResultados.ts` | Modificar | `useAddResultado` recibe `File`, nuevo `useResultadoPdfUrl` |
| `src/routes/app.ips.resultados.tsx` | Modificar | Campo PDF en modal, enlace "Ver PDF" en lista |

---

## Task 1: Migración SQL — columna, bucket y RLS

**Files:**
- Create: `supabase/migrations/012_resultados_pdf.sql`

**Interfaces:**
- Produces: columna `pdf_url text NOT NULL DEFAULT ''` en tabla `resultados`; bucket `resultados-pdfs` privado; políticas RLS `resultados_pdf_ips_write` y `resultados_pdf_read`

- [ ] **Step 1: Crear el archivo de migración**

Crear `supabase/migrations/012_resultados_pdf.sql` con este contenido exacto:

```sql
-- ============================================================
-- MedCitas — Migration 012: PDF adjunto en resultados
-- Run in: Supabase Dashboard → SQL Editor → New query
-- ============================================================

-- 1. Nueva columna en resultados
ALTER TABLE resultados
  ADD COLUMN IF NOT EXISTS pdf_url text NOT NULL DEFAULT '';

-- 2. Bucket privado para PDFs de resultados
INSERT INTO storage.buckets (id, name, public)
VALUES ('resultados-pdfs', 'resultados-pdfs', false)
ON CONFLICT (id) DO UPDATE SET public = false;

-- 3. RLS: IPS owner y admin pueden escribir/eliminar
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
    AND policyname = 'resultados_pdf_ips_write'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY "resultados_pdf_ips_write" ON storage.objects
        FOR ALL
        USING (
          bucket_id = 'resultados-pdfs' AND (
            (storage.foldername(name))[1] = auth.uid()::text
            OR EXISTS (
              SELECT 1 FROM public.profiles
              WHERE id = auth.uid() AND role = 'admin'
            )
          )
        )
        WITH CHECK (
          bucket_id = 'resultados-pdfs' AND (
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

-- 4. RLS: IPS owner y admin pueden leer (solicitante accede via signed URL)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
    AND policyname = 'resultados_pdf_read'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY "resultados_pdf_read" ON storage.objects
        FOR SELECT
        USING (
          bucket_id = 'resultados-pdfs' AND (
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

- [ ] **Step 2: Ejecutar la migración en Supabase Dashboard**

Ir a Supabase Dashboard → SQL Editor → New query → pegar el contenido del archivo → Run.

Verificar que no haya errores. Confirmar en Table Editor que `resultados` tiene la columna `pdf_url`.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/012_resultados_pdf.sql
git commit -m "feat: migration 012 - pdf_url column and resultados-pdfs storage bucket"
```

---

## Task 2: Actualizar tipos TypeScript

**Files:**
- Modify: `src/lib/database.types.ts` (línea ~84, tabla `resultados`)

**Interfaces:**
- Consumes: resultado de Task 1 (columna `pdf_url` existe en DB)
- Produces: `Resultado['pdf_url']` tipado como `string`, disponible para Tasks 3 y 4

- [ ] **Step 1: Agregar `pdf_url` al Row de `resultados`**

En `src/lib/database.types.ts`, dentro del bloque `resultados.Row`, agregar `pdf_url: string` después de `observaciones`:

```ts
// Antes (líneas 74-90):
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
  Update: Partial<Database['public']['Tables']['resultados']['Insert']>
}

// Después:
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
    pdf_url: string
    created_at: string
  }
  Insert: Omit<Database['public']['Tables']['resultados']['Row'], 'id' | 'created_at'>
  Update: Partial<Database['public']['Tables']['resultados']['Insert']>
}
```

- [ ] **Step 2: Verificar que TypeScript no reporta errores**

```bash
npx tsc --noEmit
```

Expected: sin errores nuevos.

- [ ] **Step 3: Commit**

```bash
git add src/lib/database.types.ts
git commit -m "feat: add pdf_url to Resultado type"
```

---

## Task 3: Actualizar hooks de resultados

**Files:**
- Modify: `src/lib/hooks/useResultados.ts`

**Interfaces:**
- Consumes: `Resultado['pdf_url']` de Task 2; `supabase.storage` client
- Produces:
  - `useAddResultado()` → `mutate({ ...camposExistentes, pdfFile: File })` donde `pdfFile` es el `File` del input
  - `useResultadoPdfUrl(path: string)` → `{ signedUrl: string | null, isLoading: boolean }`

- [ ] **Step 1: Actualizar `useAddResultado` para recibir `pdfFile`**

Reemplazar el contenido completo de `src/lib/hooks/useResultados.ts`:

```ts
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

type NewResultado = Omit<Resultado, 'id' | 'created_at' | 'pdf_url'> & { pdfFile: File }

export function useAddResultado() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (r: NewResultado) => {
      const { pdfFile, ...campos } = r
      const path = `${campos.ips_id}/${campos.appointment_id}.pdf`

      const { error: uploadError } = await supabase.storage
        .from('resultados-pdfs')
        .upload(path, pdfFile, { upsert: true, contentType: 'application/pdf' })

      if (uploadError) throw new Error(`Error al subir el PDF: ${uploadError.message}`)

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase.from('resultados') as any).insert({ ...campos, pdf_url: path })
      if (error) throw error

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase.from('appointments') as any).update({ estado: 'atendida' }).eq('id', r.appointment_id)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['resultados'] })
      qc.invalidateQueries({ queryKey: ['appointments'] })
    },
  })
}

export function useResultadoPdfUrl(path: string | undefined) {
  return useQuery({
    queryKey: ['resultado-pdf-url', path],
    queryFn: async () => {
      if (!path) return null
      const { data, error } = await supabase.storage
        .from('resultados-pdfs')
        .createSignedUrl(path, 3600)
      if (error) throw error
      return data.signedUrl
    },
    enabled: !!path,
    staleTime: 50 * 60 * 1000, // refrescar antes de que expire (50 min)
  })
}
```

- [ ] **Step 2: Verificar TypeScript**

```bash
npx tsc --noEmit
```

Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
git add src/lib/hooks/useResultados.ts
git commit -m "feat: useAddResultado uploads PDF to storage, add useResultadoPdfUrl hook"
```

---

## Task 4: Actualizar UI — modal y lista

**Files:**
- Modify: `src/routes/app.ips.resultados.tsx`

**Interfaces:**
- Consumes:
  - `useAddResultado().mutate({ ..., pdfFile: File })` de Task 3
  - `useResultadoPdfUrl(path)` de Task 3 — retorna `{ data: string | null, isLoading: boolean }`
- Produces: modal con campo PDF obligatorio + enlace "Ver PDF" en lista

- [ ] **Step 1: Reemplazar el contenido de `app.ips.resultados.tsx`**

```tsx
import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { useAppointments } from "@/lib/hooks/useAppointments";
import { useResultados, useAddResultado, useResultadoPdfUrl } from "@/lib/hooks/useResultados";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import type { Resultado } from "@/lib/database.types";

export const Route = createFileRoute("/app/ips/resultados")({
  component: IpsResultados,
});

function ResultadoPdfLink({ path }: { path: string }) {
  const { data: signedUrl, isLoading } = useResultadoPdfUrl(path);
  if (isLoading) return <span className="text-xs text-muted-foreground">Cargando...</span>;
  if (!signedUrl) return null;
  return (
    <a
      href={signedUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="text-xs text-primary underline"
    >
      Ver PDF ↗
    </a>
  );
}

function IpsResultados() {
  const { profile } = useAuth();
  const { data: appointments = [] } = useAppointments(profile?.id, 'ips');
  const { data: atendidas = [] } = useResultados(profile?.id, 'ips');
  const addResultado = useAddResultado();

  const pendientes = appointments.filter((a) => a.estado === 'agendada');

  const [open, setOpen] = useState(false);
  const [apptId, setApptId] = useState<string>("");
  const [diagnostico, setDiagnostico] = useState("");
  const [apto, setApto] = useState<"apto" | "apto_restricciones" | "no_apto">("apto");
  const [obs, setObs] = useState("");
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const resetForm = () => {
    setApptId(""); setDiagnostico(""); setObs(""); setApto("apto");
    setPdfFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const submit = () => {
    const appt = appointments.find((a) => a.id === apptId);
    if (!appt) return toast.error("Selecciona una cita");
    if (!diagnostico.trim()) return toast.error("Diagnóstico requerido");
    if (!pdfFile) return toast.error("El PDF del resultado es obligatorio");

    addResultado.mutate({
      appointment_id: appt.id,
      solicitante_id: appt.solicitante_id,
      ips_id: appt.ips_id,
      empleado_nombre: appt.empleado_nombre,
      empleado_cedula: appt.empleado_cedula,
      fecha: new Date().toISOString().slice(0, 10),
      diagnostico,
      apto,
      observaciones: obs,
      pdfFile,
    }, {
      onSuccess: () => {
        toast.success("Resultado cargado");
        setOpen(false);
        resetForm();
      },
      onError: (err: any) => toast.error(err.message),
    });
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Citas pendientes de resultado</CardTitle>
            <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) resetForm(); }}>
              <DialogTrigger asChild><Button>Cargar resultado</Button></DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Nuevo resultado</DialogTitle></DialogHeader>
                <div className="space-y-3">
                  <div>
                    <Label>Cita</Label>
                    <Select value={apptId} onValueChange={setApptId}>
                      <SelectTrigger><SelectValue placeholder="Selecciona una cita" /></SelectTrigger>
                      <SelectContent>
                        {pendientes.map((a) => (
                          <SelectItem key={a.id} value={a.id}>
                            {a.fecha} {a.hora} · {a.empleado_nombre} ({a.empleado_cedula})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Diagnóstico</Label>
                    <Textarea value={diagnostico} onChange={(e) => setDiagnostico(e.target.value)} />
                  </div>
                  <div>
                    <Label>Aptitud</Label>
                    <Select value={apto} onValueChange={(v) => setApto(v as typeof apto)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="apto">Apto</SelectItem>
                        <SelectItem value="apto_restricciones">Apto con restricciones</SelectItem>
                        <SelectItem value="no_apto">No apto</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Observaciones</Label>
                    <Textarea value={obs} onChange={(e) => setObs(e.target.value)} />
                  </div>
                  <div>
                    <Label>Resultado PDF <span className="text-destructive">*</span></Label>
                    <div className="mt-1">
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept=".pdf,application/pdf"
                        className="block w-full text-sm text-muted-foreground file:mr-3 file:py-1.5 file:px-3 file:rounded file:border-0 file:text-sm file:font-medium file:bg-primary file:text-primary-foreground hover:file:bg-primary/90 cursor-pointer"
                        onChange={(e) => setPdfFile(e.target.files?.[0] ?? null)}
                      />
                      {pdfFile && (
                        <p className="text-xs text-muted-foreground mt-1">{pdfFile.name}</p>
                      )}
                    </div>
                  </div>
                </div>
                <DialogFooter>
                  <Button onClick={submit} disabled={addResultado.isPending}>
                    {addResultado.isPending ? "Guardando..." : "Guardar"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent>
          {pendientes.length === 0 ? (
            <p className="text-sm text-muted-foreground">No hay citas pendientes.</p>
          ) : (
            <ul className="divide-y">
              {pendientes.map((a) => (
                <li key={a.id} className="py-2 text-sm">
                  <b>{a.empleado_nombre}</b> · {a.fecha} {a.hora} · {a.servicio}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Resultados cargados</CardTitle></CardHeader>
        <CardContent>
          {atendidas.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sin resultados aún.</p>
          ) : (
            <ul className="divide-y">
              {atendidas.map((r: Resultado) => (
                <li key={r.id} className="py-3">
                  <div className="font-medium">{r.empleado_nombre} · {r.empleado_cedula}</div>
                  <div className="text-xs text-muted-foreground">{r.fecha} — Aptitud: {r.apto.replace("_", " ")}</div>
                  <div className="text-sm mt-1">{r.diagnostico}</div>
                  {r.observaciones && <div className="text-xs text-muted-foreground mt-1">Obs: {r.observaciones}</div>}
                  {r.pdf_url && (
                    <div className="mt-1">
                      <ResultadoPdfLink path={r.pdf_url} />
                    </div>
                  )}
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

- [ ] **Step 2: Verificar TypeScript**

```bash
npx tsc --noEmit
```

Expected: sin errores.

- [ ] **Step 3: Probar en el navegador**

1. Abrir `http://localhost:8080/app/ips/resultados` con sesión de IPS
2. Hacer clic en "Cargar resultado"
3. Intentar guardar sin PDF → debe aparecer toast "El PDF del resultado es obligatorio"
4. Seleccionar un PDF válido → debe mostrarse el nombre del archivo
5. Completar todos los campos y guardar → botón debe decir "Guardando..." mientras procesa
6. Al éxito → toast "Resultado cargado", modal se cierra, resultado aparece en la lista con enlace "Ver PDF ↗"
7. Hacer clic en "Ver PDF ↗" → debe abrir el PDF en nueva pestaña

- [ ] **Step 4: Commit**

```bash
git add src/routes/app.ips.resultados.tsx
git commit -m "feat: PDF upload field in IPS resultado modal with Ver PDF link"
```
