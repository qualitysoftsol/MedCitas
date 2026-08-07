# MedCitas — Migración a Supabase + Fotos de IPS

**Fecha:** 2026-08-05  
**Estado:** Aprobado  
**Alcance:** Migración completa de localStorage a Supabase (Auth, PostgreSQL, Storage, Edge Functions) + funcionalidad de fotos de instalaciones por IPS

---

## 1. Contexto

La plataforma actualmente almacena todos los datos en `localStorage` con un Context de React (`store.tsx`). Esto impide la sincronización entre dispositivos, limita el almacenamiento a ~5MB, expone contraseñas en texto plano y no escala para múltiples IPS y empresas en producción.

La migración es desde cero — no hay datos reales que conservar.

---

## 2. Stack tras la migración

| Capa | Tecnología |
|------|-----------|
| Frontend | React 19, TanStack Router, TanStack Query (ya instalado) |
| Auth | Supabase Auth (email + contraseña) |
| Base de datos | PostgreSQL en Supabase |
| Storage | Supabase Storage (fotos IPS) |
| Emails | Resend + Supabase Edge Functions |
| Tiempo real | Supabase Realtime (notificaciones) |

---

## 3. Esquema de base de datos

### `profiles`
Extiende `auth.users`. Creado automáticamente por trigger al confirmar registro.

| Campo | Tipo | Notas |
|-------|------|-------|
| id | uuid PK | FK → auth.users.id |
| role | enum | 'admin' \| 'ips' \| 'empresa' \| 'particular' |
| nombre | text | |
| telefono | text | nullable |
| direccion | text | nullable |
| descripcion | text | nullable |
| nit | text | nullable, solo empresa |
| cedula | text | nullable, solo particular |
| departamento | text | nullable, solo IPS |
| ciudad | text | nullable, solo IPS |
| lat | float8 | nullable, solo IPS |
| lng | float8 | nullable, solo IPS |
| departamentos_medicos | text[] | nullable, solo IPS |
| created_at | timestamptz | default now() |

### `ips_fotos`
Hasta 5 fotos por IPS. Eliminación en cascada al borrar la IPS.

| Campo | Tipo | Notas |
|-------|------|-------|
| id | uuid PK | |
| ips_id | uuid | FK → profiles.id ON DELETE CASCADE |
| url | text | URL pública en Supabase Storage |
| orden | int2 | 0 = portada, máx 4 |
| created_at | timestamptz | default now() |

### `slots`
Horarios disponibles publicados por cada IPS.

| Campo | Tipo | Notas |
|-------|------|-------|
| id | uuid PK | |
| ips_id | uuid | FK → profiles.id |
| fecha | date | |
| hora | time | |
| departamento_medico | text | |
| ciudad | text | |
| taken | boolean | default false |
| created_at | timestamptz | |

### `appointments`
Citas agendadas. `solicitante_id` cubre tanto empresas como particulares.

| Campo | Tipo | Notas |
|-------|------|-------|
| id | uuid PK | |
| slot_id | uuid | FK → slots.id |
| ips_id | uuid | FK → profiles.id |
| solicitante_id | uuid | FK → profiles.id (empresa o particular) |
| empleado_nombre | text | |
| empleado_cedula | text | |
| tipo_examen | enum | 'ingreso' \| 'anual' \| 'retiro' |
| fecha | date | |
| hora | time | |
| ciudad | text | |
| departamento_medico | text | |
| estado | enum | 'agendada' \| 'atendida' \| 'cancelada' |
| created_at | timestamptz | |

### `resultados`

| Campo | Tipo | Notas |
|-------|------|-------|
| id | uuid PK | |
| appointment_id | uuid | FK → appointments.id |
| solicitante_id | uuid | FK → profiles.id |
| ips_id | uuid | FK → profiles.id |
| empleado_nombre | text | |
| empleado_cedula | text | |
| fecha | date | |
| diagnostico | text | |
| apto | enum | 'apto' \| 'apto_restricciones' \| 'no_apto' |
| observaciones | text | |
| created_at | timestamptz | |

### `notifications`

| Campo | Tipo | Notas |
|-------|------|-------|
| id | uuid PK | |
| user_id | uuid | FK → profiles.id |
| tipo | enum | 'cita_agendada' \| 'cita_cancelada' \| 'resultado_cargado' |
| titulo | text | |
| mensaje | text | |
| read | boolean | default false |
| created_at | timestamptz | |

---

## 4. Row Level Security (RLS)

Todas las tablas tienen RLS habilitado. Políticas principales:

### `profiles`
- **SELECT:** Público para perfiles IPS. Usuarios autenticados pueden leer su propio perfil.
- **UPDATE:** Solo el propio usuario puede actualizar su perfil. Admin puede actualizar cualquiera.

### `ips_fotos`
- **SELECT:** Público (cualquier visitante puede ver fotos de IPS).
- **INSERT/UPDATE/DELETE:** Solo el IPS dueño (`ips_id = auth.uid()`) o rol admin.

### `slots`
- **SELECT:** Público.
- **INSERT/UPDATE/DELETE:** Solo la IPS dueña del slot.

### `appointments`
- **SELECT:** El solicitante ve sus propias citas. La IPS ve citas donde `ips_id = auth.uid()`.
- **INSERT:** Usuarios con rol empresa o particular.
- **UPDATE:** La IPS puede cambiar `estado`. El solicitante puede cancelar sus propias citas.

### `resultados`
- **SELECT:** El solicitante ve resultados donde `solicitante_id = auth.uid()`. La IPS ve los que cargó.
- **INSERT:** Solo la IPS correspondiente al appointment.

### `notifications`
- **SELECT/UPDATE:** Solo el destinatario (`user_id = auth.uid()`).
- **INSERT:** Solo vía Edge Functions (service role key).

---

## 5. Autenticación

- **Proveedor:** Supabase Auth con email + contraseña
- **Confirmación de email:** Activada — el usuario recibe email de verificación antes de poder entrar
- **Formulario de registro:** Se agrega campo `email` como identificador principal. El campo `usuario` actual se elimina.
- **Trigger SQL:** Al confirmar el email, `handle_new_user()` inserta automáticamente en `profiles` con los datos del registro (rol, nombre, etc.) pasados como `user_metadata`
- **Sesión:** Gestionada por `@supabase/ssr`, JWT renovado automáticamente
- **Redirección por rol:** Se mantiene la lógica actual (admin → `/app/admin`, ips → `/app/ips/calendario`, empresa/particular → `/app/empresa/solicitar`)

---

## 6. Capa de datos en el frontend

Se elimina `src/lib/store.tsx` completamente. Se reemplaza por:

### Cliente Supabase
```
src/lib/supabase.ts        ← instancia del cliente
```

### Hooks con TanStack Query
```
src/lib/hooks/
  useAuth.ts              ← login, logout, registro, sesión actual
  useProfile.ts           ← leer y actualizar perfil
  useSlots.ts             ← listar slots, agregar slots (IPS)
  useAppointments.ts      ← agendar, cancelar, listar citas
  useResultados.ts        ← cargar resultados (IPS), leer resultados
  useNotifications.ts     ← listar, marcar leídas, tiempo real
  useIpsFotos.ts          ← subir, listar, reordenar, eliminar fotos
```

**Patrón:** lecturas con `useQuery`, escrituras con `useMutation`. TanStack Query invalida caché automáticamente tras mutaciones para mantener la UI sincronizada.

**Tiempo real:** `useNotifications` abre una suscripción Supabase Realtime a la tabla `notifications` filtrada por `user_id = auth.uid()`. La campana del header se actualiza al instante.

---

## 7. Fotos de instalaciones IPS

### Storage
- **Bucket:** `ips-fotos` (público)
- **Ruta:** `{ips_id}/{timestamp}_{nombre}.webp`
- **Límite:** 5 fotos por IPS (validado en cliente y por RLS)
- **Formato:** Las imágenes se convierten a WebP en el cliente antes de subir (usando Canvas API) para reducir peso

### Gestión de fotos (IPS y admin)

**IPS — desde `/app/perfil`:**
- Nueva sección "Fotos de instalaciones"
- Grid con las fotos actuales (máx 5), cada una con botón de eliminar
- Botón "Subir foto" deshabilitado si ya hay 5
- La primera foto (orden = 0) es la portada

**Admin — desde `/app/admin`:**
- Al ver detalle de una IPS, mismas opciones de gestión

### Visualización al elegir IPS

En `/app/empresa/solicitar` y `/app/particular/solicitar`:

**Tarjeta de IPS en la lista:**
- Muestra foto de portada (orden = 0) como thumbnail
- Si no tiene fotos, muestra placeholder con ícono de clínica

**Panel de detalle al seleccionar:**
Al hacer clic en "Elegir" o en el marcador del mapa, se abre un panel con:
- Carrusel de hasta 5 fotos de instalaciones
- Nombre de la IPS, dirección, distancia desde la ubicación del usuario
- Chips con departamentos médicos disponibles
- Botón "Confirmar selección" que despliega los horarios disponibles

---

## 8. Notificaciones por email

### Servicio
**Resend** — plan gratuito 3,000 emails/mes. Integración oficial con Supabase.

### Arquitectura
1. **Database Webhook** en Supabase escucha inserts/updates en `appointments` y `resultados`
2. Dispara la **Edge Function** correspondiente con el payload del registro
3. La Edge Function consulta los perfiles de los destinatarios y envía el email vía Resend

### Edge Functions
```
supabase/functions/
  notify-appointment/index.ts   ← cita agendada y cancelada
  notify-resultado/index.ts     ← resultado disponible
```

### Emails generados

| Evento | Destinatarios | Asunto |
|--------|--------------|-------|
| Cita agendada | Solicitante + IPS | "Cita confirmada — {empleado}, {fecha}" |
| Cita cancelada | Solicitante + IPS | "Cita cancelada — {fecha} {hora}" |
| Resultado disponible | Solicitante | "Resultado disponible — {empleado}" |

**Formato:** HTML con logo MedCitas, detalles del evento y botón de acceso. Generado directamente en la Edge Function, sin servicios de plantillas externos.

### Notificaciones in-app
Se mantiene la campana en el header. Las notificaciones persisten en la tabla `notifications` y se actualizan en tiempo real vía Supabase Realtime.

---

## 9. Variables de entorno necesarias

```env
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=   ← solo en Edge Functions, nunca en el cliente
RESEND_API_KEY=              ← solo en Edge Functions
```

---

## 10. Lo que NO cambia

- Estructura de rutas (TanStack Router, mismos paths)
- UI y componentes (shadcn, Tailwind, IpsMap, AddressInput)
- Lógica de mapa y distancia haversine
- Los 4 roles y sus permisos de navegación
- Tipos de examen: ingreso, anual, retiro
- Datos de Colombia (departamentos y ciudades con lat/lng)
