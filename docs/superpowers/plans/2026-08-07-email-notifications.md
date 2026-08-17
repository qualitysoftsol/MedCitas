# Email Notifications on Appointment Booking — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enviar emails automáticos a IPS y empresa/particular cuando se agenda o cancela una cita, usando un trigger de PostgreSQL que llama la Edge Function `notify-appointment` vía Resend.

**Architecture:** Un trigger `AFTER INSERT OR UPDATE` en la tabla `appointments` usa `pg_net` para hacer POST a la Edge Function ya existente. La función obtiene los emails de `auth.users` y los envía via Resend. Cero cambios en el frontend.

**Tech Stack:** Supabase Edge Functions (Deno), PostgreSQL + pg_net, Resend API

## Global Constraints

- No modificar hooks del frontend (`useBookAppointment`, `useBookAppointmentsBatch`, `useCancelAppointment`)
- Supabase project ref: `qjujxdgtmmubvfrfrtax`
- Edge Function URL: `https://qjujxdgtmmubvfrfrtax.supabase.co/functions/v1/notify-appointment`
- Anon key (para el header Authorization del trigger): `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFqdWp4ZGd0bW11YnZmcmZydGF4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU5Nzk2NDUsImV4cCI6MjEwMTU1NTY0NX0.8Ab7OisH6krvPRtMw7-foHNbOOfYbcEzyDxc4WL13EI`
- Sender para pruebas: `onboarding@resend.dev` (solo entrega al email del dueño de la cuenta Resend)
- Migraciones deben ser idempotentes (usar `IF NOT EXISTS`, `CREATE OR REPLACE`)
- Seguir el estilo de migraciones existentes (ver `008_storage_public.sql`)

---

## Archivos afectados

| Archivo | Acción | Responsabilidad |
|---------|--------|-----------------|
| `supabase/functions/notify-appointment/index.ts` | Modificar | Cambiar `from:` a `onboarding@resend.dev` |
| `supabase/migrations/009_appointment_notify_trigger.sql` | Crear | Trigger pg_net que dispara la Edge Function |

---

## Task 1: Actualizar Edge Function — cambiar sender

**Files:**
- Modify: `supabase/functions/notify-appointment/index.ts:41`

**Interfaces:**
- Consumes: `payload.record` (fila de `appointments` como JSON)
- Produces: emails enviados a `record.ips_id` y `record.solicitante_id` via Resend

- [ ] **Step 1: Abrir el archivo de la Edge Function**

  Archivo: `supabase/functions/notify-appointment/index.ts`

  Línea a cambiar (línea ~41):
  ```typescript
  // ANTES:
  body: JSON.stringify({ from: 'MedCitas <notificaciones@tudominio.co>', to, subject, html }),
  
  // DESPUÉS:
  body: JSON.stringify({ from: 'MedCitas <onboarding@resend.dev>', to, subject, html }),
  ```

  Hacer el cambio con Edit.

- [ ] **Step 2: Verificar que el archivo quedó correcto**

  El archivo completo debe quedar así en las líneas relevantes:
  ```typescript
  await Promise.all(recipients.map((to) =>
    fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${Deno.env.get('RESEND_API_KEY')}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: 'MedCitas <onboarding@resend.dev>', to, subject, html }),
    })
  ))
  ```

- [ ] **Step 3: Commit**

  ```bash
  git add supabase/functions/notify-appointment/index.ts
  git commit -m "fix: use resend test sender onboarding@resend.dev"
  ```

---

## Task 2: Crear migración — trigger pg_net

**Files:**
- Create: `supabase/migrations/009_appointment_notify_trigger.sql`

**Interfaces:**
- Consumes: tabla `appointments` (INSERT y UPDATE)
- Produces: HTTP POST a `notify-appointment` con `{ "record": <fila_nueva> }`

- [ ] **Step 1: Crear el archivo de migración**

  Crear `supabase/migrations/009_appointment_notify_trigger.sql` con el siguiente contenido:

  ```sql
  -- ============================================================
  -- MedCitas — Migration 009: Trigger para notificar por email
  -- al agendar o cancelar una cita via Edge Function notify-appointment
  -- ============================================================

  -- pg_net ya viene habilitado en Supabase, pero por si acaso:
  CREATE EXTENSION IF NOT EXISTS pg_net SCHEMA extensions;

  -- Función trigger: llama la Edge Function via HTTP asíncrono
  CREATE OR REPLACE FUNCTION notify_appointment_on_change()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
  AS $$
  DECLARE
    _url     text := 'https://qjujxdgtmmubvfrfrtax.supabase.co/functions/v1/notify-appointment';
    _headers jsonb := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFqdWp4ZGd0bW11YnZmcmZydGF4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU5Nzk2NDUsImV4cCI6MjEwMTU1NTY0NX0.8Ab7OisH6krvPRtMw7-foHNbOOfYbcEzyDxc4WL13EI'
    );
  BEGIN
    -- INSERT: siempre notificar cita nueva
    -- UPDATE: solo notificar cuando el estado cambia a 'cancelada'
    IF TG_OP = 'INSERT'
      OR (TG_OP = 'UPDATE' AND NEW.estado = 'cancelada' AND OLD.estado <> 'cancelada')
    THEN
      PERFORM extensions.net.http_post(
        url     := _url,
        headers := _headers,
        body    := jsonb_build_object('record', row_to_json(NEW))
      );
    END IF;
    RETURN NEW;
  END;
  $$;

  -- Trigger: AFTER INSERT OR UPDATE en appointments
  DROP TRIGGER IF EXISTS appointment_notify ON appointments;
  CREATE TRIGGER appointment_notify
    AFTER INSERT OR UPDATE ON appointments
    FOR EACH ROW
    EXECUTE FUNCTION notify_appointment_on_change();
  ```

- [ ] **Step 2: Verificar que pg_net está disponible en el schema correcto**

  En algunas versiones de Supabase, pg_net vive en `extensions` o en `net`. Si `extensions.net.http_post` da error al aplicar la migración, cambiar a `net.http_post` (sin prefijo `extensions.`).

  Para verificarlo después de aplicar, correr en Supabase SQL Editor:
  ```sql
  SELECT routine_schema, routine_name
  FROM information_schema.routines
  WHERE routine_name = 'http_post';
  ```
  El resultado muestra qué schema usar.

- [ ] **Step 3: Commit**

  ```bash
  git add supabase/migrations/009_appointment_notify_trigger.sql
  git commit -m "feat: trigger pg_net para notificaciones email al agendar citas"
  ```

---

## Task 3: Configurar Resend y Supabase Secrets

> Esta task es de configuración manual en dashboards externos. No hay código. Hacerla antes de deployar.

- [ ] **Step 1: Crear cuenta en Resend**

  1. Ir a [resend.com](https://resend.com) → Sign up con el email del admin del proyecto
  2. Confirmar el email de verificación

- [ ] **Step 2: Crear API Key en Resend**

  1. Resend Dashboard → API Keys → Create API Key
  2. Nombre: `medcitas-dev`
  3. Permisos: `Sending access`
  4. Copiar el valor (empieza con `re_...`) — solo se muestra una vez

- [ ] **Step 3: Agregar secrets en Supabase**

  1. Ir a [supabase.com](https://supabase.com) → proyecto `qjujxdgtmmubvfrfrtax`
  2. Edge Functions → Secrets → Add new secret

  Agregar estos dos secrets:

  | Name | Value |
  |------|-------|
  | `RESEND_API_KEY` | `re_...` (el API key copiado en Step 2) |
  | `SITE_URL` | `http://localhost:5173` (para pruebas locales) |

- [ ] **Step 4: Verificar secrets guardados**

  En la lista de secrets de Supabase deben aparecer `RESEND_API_KEY` y `SITE_URL` (los valores están ocultos, solo se ve el nombre).

---

## Task 4: Deploy y prueba de integración

- [ ] **Step 1: Verificar que Supabase CLI está instalado**

  ```bash
  supabase --version
  ```
  Si no está instalado: `npm install -g supabase` o ver [docs.supabase.com/guides/cli](https://supabase.com/docs/guides/cli)

- [ ] **Step 2: Login al CLI de Supabase**

  ```bash
  supabase login
  ```
  Abre el navegador para autenticarse.

- [ ] **Step 3: Linkar el proyecto local**

  Desde la raíz del repo:
  ```bash
  supabase link --project-ref qjujxdgtmmubvfrfrtax
  ```

- [ ] **Step 4: Deployar la Edge Function**

  ```bash
  supabase functions deploy notify-appointment
  ```

  Salida esperada:
  ```
  Deploying Function notify-appointment (script size: ~2KB)
  Done: notify-appointment
  ```

- [ ] **Step 5: Aplicar la migración del trigger**

  ```bash
  supabase db push
  ```

  Si pide confirmación, escribir `y`.

  Si `extensions.net.http_post` da error, editar la migración para usar `net.http_post` (sin prefijo) y correr `supabase db push` de nuevo.

- [ ] **Step 6: Test de la Edge Function directamente**

  Invocar la función con un payload de prueba para verificar que llega el email:

  ```bash
  supabase functions invoke notify-appointment --body '{
    "record": {
      "id": "test-id-123",
      "ips_id": "<UUID_DE_UN_IPS_REAL_EN_TU_DB>",
      "solicitante_id": "<UUID_DEL_USUARIO_LOGUEADO>",
      "empleado_nombre": "Test Empleado",
      "empleado_cedula": "1234567890",
      "tipo_examen": "ingreso",
      "fecha": "2026-08-10",
      "hora": "09:00",
      "estado": "agendada"
    }
  }'
  ```

  > **Nota:** Reemplazar `ips_id` y `solicitante_id` con UUIDs reales de tu base de datos. Los puedes obtener en Supabase → Table Editor → profiles.

  Salida esperada: `ok`

  Verificar en Resend Dashboard → Emails que aparece un email enviado.

- [ ] **Step 7: Test end-to-end desde la UI**

  1. Abrir la app en `http://localhost:5173`
  2. Iniciar sesión como empresa o particular
  3. Agendar una cita
  4. Verificar en Resend Dashboard → Emails que aparecen 2 emails enviados (IPS + solicitante)
  5. Revisar el email en la bandeja del email registrado en Resend

- [ ] **Step 8: Test de cancelación**

  1. En la UI, cancelar la cita recién agendada
  2. Verificar en Resend Dashboard que aparecen 2 emails más con asunto "Cita cancelada"

---

## Troubleshooting

**`extensions.net.http_post` no existe:**
Cambiar en la migración a `net.http_post(...)` sin el prefijo `extensions.`. Correr `supabase db push`.

**Error "permission denied for schema net":**
Agregar al inicio de la función trigger: `SET search_path = public, extensions, net;`

**Edge Function retorna error 500:**
Verificar en Supabase Dashboard → Edge Functions → Logs que el `RESEND_API_KEY` está seteado y que los UUIDs de `ips_id` / `solicitante_id` existen en `auth.users`.

**Email no llega pero Resend muestra "delivered":**
Con `onboarding@resend.dev` como sender, Resend solo entrega al email del dueño de la cuenta. Revisar la bandeja de ese email. Los demás recipients aparecen como entregados en el dashboard pero no reciben el email hasta verificar un dominio.

**Trigger no se dispara:**
Verificar en Supabase SQL Editor:
```sql
SELECT trigger_name, event_manipulation, event_object_table
FROM information_schema.triggers
WHERE trigger_name = 'appointment_notify';
```
