# Diseño: Notificaciones por Email al Agendar Citas

**Fecha:** 2026-08-07  
**Estado:** Aprobado por usuario

---

## Contexto

MedCitas ya tiene una Edge Function `notify-appointment` escrita en Supabase que envía emails via Resend. Sin embargo, nunca se invoca — los hooks de agendamiento (`useBookAppointment`, `useBookAppointmentsBatch`) insertan en la BD sin disparar notificaciones.

El objetivo es conectar el INSERT/UPDATE en la tabla `appointments` con esa Edge Function de forma automática y confiable, sin cambios en el frontend.

---

## Arquitectura

```
Usuario agenda cita (frontend)
        ↓
supabase.from('appointments').insert(...)
        ↓
PostgreSQL trigger (nueva migración SQL)
        ↓
net.http_post → Edge Function: notify-appointment
        ↓
Resend API → Email a IPS + Email a Empresa/Particular
```

El trigger se crea como migración SQL (`009_appointment_notify_trigger.sql`) para que quede versionado en el repositorio y se aplique con `supabase db push`.

---

## Componentes

### 1. Resend (servicio externo — configuración manual)

- Cuenta gratuita: 3,000 emails/mes, 100/día
- **Modo pruebas:** usar `onboarding@resend.dev` como `from`. Con este sender, Resend solo entrega al email registrado en la cuenta Resend (no a los destinatarios reales). Sirve para verificar que el flujo completo funciona.
- **Modo producción:** verificar un dominio propio → cambiar `from` a `notificaciones@tudominio.com` → emails llegan a IPS/empresa/particular reales.

### 2. Edge Function `notify-appointment` (ya existe, requiere ajustes)

Archivo: `supabase/functions/notify-appointment/index.ts`

Cambios necesarios:
- Actualizar `from:` a `onboarding@resend.dev` para pruebas
- La función ya maneja correctamente `payload.record` y el flag `isCancel` — no necesita cambios de lógica
- Agregar manejo de errores con respuesta HTTP correcta (actualmente retorna `'ok'` sin status code explícito)

### 3. Migración SQL: trigger en `appointments` (nueva)

Archivo: `supabase/migrations/009_appointment_notify_trigger.sql`

Crea:
- Un trigger `AFTER INSERT OR UPDATE ON appointments`
- Llama `net.http_post()` (extensión `pg_net`, ya disponible en Supabase) hacia la URL de la Edge Function
- Pasa `payload.type` ('INSERT' o 'UPDATE') + `payload.record` (fila nueva)
- El trigger solo dispara en UPDATE cuando `estado` cambia a `'cancelada'` (condición en el trigger)

### 4. Supabase Secrets (configuración manual en dashboard)

| Secret | Valor |
|--------|-------|
| `RESEND_API_KEY` | API key de la cuenta Resend |
| `SITE_URL` | URL del app (ej. `https://medcitas.co`) |

---

## Flujo de datos

### Cita nueva (INSERT)
1. Frontend inserta en `appointments` con `estado = 'agendada'`
2. Trigger detecta INSERT → llama Edge Function
3. Edge Function: obtiene emails de IPS y solicitante via `auth.admin.getUserById`
4. Envía email a ambos con asunto "Cita confirmada — {empleado}, {fecha}"
5. Inserta notificaciones in-app en tabla `notifications`

### Cita cancelada (UPDATE)
1. Frontend actualiza `appointments` con `estado = 'cancelada'`
2. Trigger detecta UPDATE donde `NEW.estado = 'cancelada'` → llama Edge Function
3. Edge Function: `isCancel = true` → email con asunto "Cita cancelada — {fecha} {hora}"
4. Inserta notificaciones in-app en tabla `notifications`

---

## Destinatarios

| Evento | IPS | Empresa / Particular |
|--------|-----|----------------------|
| Cita agendada | "Nueva cita recibida" | "Cita confirmada" |
| Cita cancelada | "Cita cancelada" | "Cita cancelada" |

Los emails se obtienen de `auth.users` via `supabase.auth.admin.getUserById(record.ips_id)` y `getUserById(record.solicitante_id)` — ya implementado en la Edge Function.

---

## Cambios de código

| Archivo | Tipo | Descripción |
|---------|------|-------------|
| `supabase/functions/notify-appointment/index.ts` | Modificar | Cambiar `from:` a `onboarding@resend.dev` |
| `supabase/migrations/009_appointment_notify_trigger.sql` | Crear | Trigger pg_net que llama la Edge Function |

**Sin cambios en frontend.** Los hooks `useBookAppointment` y `useBookAppointmentsBatch` no se tocan.

---

## Pasos manuales requeridos (fuera del código)

1. Crear cuenta en [resend.com](https://resend.com) con el email del admin del proyecto
2. Generar API Key en Resend → copiar
3. En Supabase Dashboard → Edge Functions → Secrets → agregar `RESEND_API_KEY`
4. Agregar `SITE_URL` (ej. `http://localhost:5173` para pruebas)
5. Ejecutar `supabase functions deploy notify-appointment`
6. Ejecutar `supabase db push` para aplicar la migración del trigger

---

## Fuera de scope

- Verificación de dominio en Resend (se hace en producción, no en pruebas)
- Email al empleado individual (no tiene cuenta en la plataforma, no hay email en `appointments`)
- Plantillas de email personalizadas (se usa la plantilla HTML ya existente en la Edge Function)
