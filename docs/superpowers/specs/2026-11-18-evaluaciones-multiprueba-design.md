# Diseño: Evaluaciones con varias pruebas, catálogos y nuevo Solicitar cita

**Fecha:** 2026-11-18
**Rama:** feat/evaluaciones-multiprueba (local, sin publicar hasta aprobación)
**Migraciones:** 019 a 022

---

## Contexto

Hoy una cita es **un horario de una IPS para un solo servicio**. El precio sale de ese servicio, el pago (Rapyd) cobra ese valor y la factura mensual de la empresa suma esos valores. El tipo de examen (Ingreso, Anual, Retiro) se guarda como texto en la cita.

El rediseño cambia el modelo: una **evaluación médica ocupacional** es una visita a una IPS en la que se hacen **varias pruebas**. Las pruebas salen de los **énfasis** (riesgos del cargo), el motivo es uno de los **6 tipos de evaluación** y cada tipo pide sus propios datos. Esto afecta los catálogos del admin, el calendario de la IPS, los precios, el flujo del particular y el flujo de la empresa, que además gana un directorio de empleados y un catálogo de cargos.

---

## Decisiones

| Tema | Decisión |
|---|---|
| Horarios | El horario (`slots`) pasa a ser un **cupo de la IPS sin servicio**. Un cupo = un paciente. Varios pacientes a la misma hora = varios cupos. |
| Pruebas de una cita | Unión de los servicios de los énfasis marcados. "Ninguno especial (oficina)" excluye a los demás. El tipo de evaluación no agrega pruebas. |
| Qué pruebas hace una IPS | Las que están en su perfil (`profiles.servicios`) **y** tienen precio (`precios_ips`). |
| IPS que hace solo parte | **Particular y empresa individual:** se puede elegir y se agendan solo las pruebas que hace. **Empresa en lote:** no se puede elegir. |
| Precio | Suma de las pruebas. Cada prueba lleva su comisión con las reglas actuales (IPS · servicio · tipo de cliente). |
| Renombrar servicio | Se actualiza el nombre en perfiles de IPS, horarios y citas. |
| Eliminar servicio | Se bloquea si tiene horarios, citas o pruebas de citas. |
| Tipo de evaluación en la cita | Se guarda el **código** (`PRE_INGRESO`…). Las citas existentes pasan así: Ingreso → `PRE_INGRESO`, Anual → `PERIODICA`, Retiro → `EGRESO`. |
| Datos por tipo | Se guardan en la cita (`datos_evaluacion`). Se **bloquea** la solicitud si la incapacidad dura < 30 días o la ausencia < 90 días. |
| Apartar horario (particular) | Sin cambios: se aparta 30 min al presionar "Pagar". Sin cuenta regresiva. |
| Apartar turnos (empresa) | No se apartan. Si al confirmar un turno ya fue tomado, se reasigna y se muestra el cambio. |
| Quién paga (particular) | Siempre el particular. Se quita "Me envía una empresa". |
| Forma de pago (empresa) | Solo **Factura a crédito**. Vence a los N días de emitida (30 por defecto, configurable por el admin por empresa). |
| Avisos al empleado | Por **correo** (Resend). WhatsApp y SMS se muestran deshabilitados con "Próximamente". |
| Seguimiento o control | La referencia es una cita **atendida** de esa cédula que pidió el mismo solicitante, o "Evaluación en otra IPS" con fecha y tipo escritos a mano. |
| Mis empleados | Pantalla nueva del menú de empresa. El archivo masivo crea o actualiza empleados por número de documento. |
| Cargos | Pantalla nueva del menú de empresa, aparte de Mis empleados. Cada cargo tiene sus énfasis. Si un cargo del archivo no existe, se crea en el mismo paso. |
| Cambio de ocupación | Los énfasis salen del cargo nuevo. El cargo del directorio **no** se actualiza. |
| Indicaciones | Campo en Servicios y en Tipos de evaluación. Iguales para todas las IPS. |
| Duración | Minutos por servicio. La duración de la visita es la suma. |
| Política de datos | Página pública nueva, con espacios `[ASÍ]` que completa el dueño del producto. |

---

## Modelo de datos

### Etapa 1 · `019_catalogos_evaluacion.sql`

**Líneas de servicio** (reemplazan a `clasificaciones`)

```sql
ALTER TABLE clasificaciones RENAME TO lineas_servicio;
ALTER TABLE lineas_servicio
  ADD COLUMN descripcion text,
  ADD COLUMN activo boolean NOT NULL DEFAULT true;

CREATE TABLE servicio_lineas (
  servicio_id uuid REFERENCES servicios(id) ON DELETE CASCADE,
  linea_id    uuid REFERENCES lineas_servicio(id) ON DELETE CASCADE,
  PRIMARY KEY (servicio_id, linea_id)
);
-- Se copia servicios.clasificacion_id a servicio_lineas y luego se elimina la columna.
```

Al eliminar una línea se desvincula de sus servicios (cascada sobre `servicio_lineas`).

**Servicios**: columnas nuevas.

| Columna | Tipo | Uso |
|---|---|---|
| `tipo` | text CHECK (`evaluacion_medica`, `prueba_complementaria`, `imagen`, `terapia`) | Lista fija |
| `preparacion` | text | Etiqueta corta para la tabla del admin ("Ayuno") |
| `indicaciones` | text | Lo que lee el paciente ("Ven en ayunas 8 horas") |
| `duracion_min` | integer CHECK (> 0) | Se suma para la duración de la visita |

Triggers:
- `servicio_renombrado`: AFTER UPDATE OF nombre. Reemplaza el nombre en `profiles.servicios`, `slots.servicio` y `appointments.servicio`.
- `servicio_en_uso`: BEFORE DELETE. Lanza un error con `HINT = 'SERVICIO_EN_USO'` si el servicio aparece en `slots`, `appointments` o `citas_pruebas`.

**Tipos de evaluación** (reemplazan a `tipos_examen`)

```sql
ALTER TABLE tipos_examen RENAME TO tipos_evaluacion;
ALTER TABLE tipos_evaluacion
  ADD COLUMN codigo text UNIQUE,
  ADD COLUMN descripcion text,      -- "Antes de empezar un trabajo nuevo."
  ADD COLUMN regla text,            -- "Fechas de incapacidad · mínimo 30 días"
  ADD COLUMN indicaciones text,     -- "Lleva tu documento y el certificado de incapacidad."
  ADD COLUMN orden smallint;
```

Se cargan los 6 códigos: `PRE_INGRESO`, `PERIODICA`, `EGRESO`, `POST_INCAPACIDAD`, `RETORNO`, `SEGUIMIENTO`. Egreso queda solo para empresa y el resto para ambos roles. Solo se puede actualizar nombre, descripción, regla, indicaciones y roles: no se insertan ni se borran filas (RLS: el admin solo tiene `UPDATE`).

**Código en la cita**

```sql
ALTER TABLE appointments ADD COLUMN tipo_evaluacion text REFERENCES tipos_evaluacion(codigo);
```

- Las citas existentes se llenan según el mapeo (Ingreso → `PRE_INGRESO`, Anual → `PERIODICA`, Retiro → `EGRESO`). Después se borran las filas viejas del catálogo.
- `appointments.tipo_examen` se conserva como el nombre visible al momento de agendar.
- Un trigger BEFORE INSERT llena `tipo_evaluacion` a partir de `tipo_examen` cuando no viene. Así los flujos actuales (incluida la Edge Function de pagos) siguen funcionando sin cambios hasta las etapas 3 y 4.

**Énfasis**

```sql
CREATE TABLE enfasis (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre text NOT NULL UNIQUE,
  exclusivo boolean NOT NULL DEFAULT false,   -- "Ninguno especial (oficina)"
  orden smallint,
  created_at timestamptz DEFAULT now()
);
CREATE TABLE enfasis_servicios (
  enfasis_id  uuid REFERENCES enfasis(id) ON DELETE CASCADE,
  servicio_id uuid REFERENCES servicios(id) ON DELETE CASCADE,
  PRIMARY KEY (enfasis_id, servicio_id)
);
```

Datos iniciales: las 6 combinaciones de ejemplo. Los servicios Evaluación médica ocupacional, Visiometría, Optometría, Audiometría, Espirometría, Laboratorio clínico, Psicología, Rayos X y Fisioterapia se crean si no existen (`ON CONFLICT DO NOTHING`).

RLS en las tablas nuevas: lectura pública y escritura solo del admin, igual que los catálogos actuales.

### Etapa 2 · `020_citas_multiprueba.sql`

```sql
ALTER TABLE slots ALTER COLUMN servicio DROP NOT NULL;           -- cupo sin servicio
ALTER TABLE appointments ALTER COLUMN servicio DROP NOT NULL;     -- solo citas viejas
ALTER TABLE appointments
  ADD COLUMN datos_evaluacion jsonb NOT NULL DEFAULT '{}',
  ADD COLUMN enfasis text[],           -- nombres al momento de agendar
  ADD COLUMN cargo text;

CREATE TABLE citas_pruebas (
  appointment_id uuid REFERENCES appointments(id) ON DELETE CASCADE,
  servicio_id    uuid NOT NULL REFERENCES servicios(id),
  servicio       text NOT NULL,          -- nombre al momento de agendar
  precio_ips     integer NOT NULL,
  comision_pct   numeric(5,2) NOT NULL,
  precio_total   integer NOT NULL,
  PRIMARY KEY (appointment_id, servicio_id)
);
```

- `citas_precios` sigue existiendo con la **suma** de `citas_pruebas`, así la facturación, las liquidaciones y los pagos de la migración 018 no cambian. Su `comision_pct` pasa a ser el porcentaje efectivo (informativo).
- Las citas existentes reciben una fila en `citas_pruebas` con su servicio actual.
- Los horarios libres y futuros que ya existen pasan a ser cupos sin servicio (`servicio = NULL`). Los ocupados y los pasados conservan su servicio.
- `validar_precio_slot` pasa a exigir que la IPS tenga **al menos una** prueba con precio.
- El trigger `appointment_precio` se elimina. El precio lo calcula la función de agendar.
- Se elimina la vista de compatibilidad `tipos_examen` que dejó la 019 (para entonces `rapyd-checkout` ya lee `tipos_evaluacion`).

**Funciones de agendar** (SECURITY DEFINER, atómicas)

| Función | Quién la usa | Qué hace |
|---|---|---|
| `_crear_cita(solicitante, slot, empleado, tipo, datos, enfasis_ids, cargo)` | Interna, sin permisos públicos | Valida el cupo libre y los datos del tipo; calcula pruebas = énfasis ∩ lo que hace la IPS; inserta la cita, `citas_pruebas` y `citas_precios`. Errores con HINT: `HORARIO_TOMADO`, `SIN_PRUEBAS`, `DATOS_INVALIDOS`. |
| `agendar_cita_empresa(...)` | Empresa, modo individual | Llama a `_crear_cita` con `auth.uid()`. |
| `agendar_lote_empresa(p jsonb)` | Empresa, modo lote | Crea o actualiza los empleados; rechaza el lote completo si un empleado no tiene todas sus pruebas en la IPS; devuelve los horarios ya tomados (`HORARIO_TOMADO` con la lista). |
| `rapyd-checkout` (Edge Function) | Particular | Recibe `{ slot_id, tipo_evaluacion, datos_evaluacion, enfasis_ids }` y llama a `_crear_cita` con service role. |

Las validaciones de `datos_evaluacion` se hacen en el cliente **y** en `_crear_cita`:

| Código | Campos | Regla |
|---|---|---|
| `PRE_INGRESO` | `empresa`, `cargo` | Obligatorios |
| `PERIODICA` | `motivo` (`programada` · `cambio_ocupacion`), `cargo` | Obligatorios |
| `EGRESO` | `fecha_retiro`, `empresa` | Obligatorios; sin límite de fecha |
| `POST_INCAPACIDAD` | `inicio`, `fin` | `fin − inicio + 1 ≥ 30` días calendario |
| `RETORNO` | `motivo` (Licencia no remunerada · Suspensión del contrato · Comisión de estudios · Otro), `inicio`, `regreso` | `regreso − inicio ≥ 90` días calendario |
| `SEGUIMIENTO` | `referencia_id` **o** `externa: { fecha, tipo }`, `que_controlar` | La referencia debe ser una cita atendida del mismo solicitante y la misma cédula |

### Etapa 3 · `021_politica_datos.sql`

- `appointments.politica_aceptada_at timestamptz`: se llena al crear la cita del particular, que debe aceptar la casilla.

### Etapa 4 · `022_empleados_cargos.sql`

```sql
CREATE TABLE cargos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  nombre text NOT NULL,
  created_at timestamptz DEFAULT now()
);
CREATE UNIQUE INDEX cargos_empresa_nombre ON cargos (empresa_id, lower(nombre));

CREATE TABLE cargo_enfasis (
  cargo_id   uuid REFERENCES cargos(id) ON DELETE CASCADE,
  enfasis_id uuid REFERENCES enfasis(id) ON DELETE CASCADE,
  PRIMARY KEY (cargo_id, enfasis_id)
);

CREATE TABLE empleados (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  tipo_doc text NOT NULL CHECK (tipo_doc IN ('CC','CE','TI','PA','PPT')),
  numero text NOT NULL,
  nombres text NOT NULL,
  apellidos text NOT NULL,
  cargo_id uuid REFERENCES cargos(id) ON DELETE SET NULL,
  celular text,
  correo text,
  created_at timestamptz DEFAULT now(),
  UNIQUE (empresa_id, numero)
);

ALTER TABLE appointments
  ADD COLUMN empleado_id uuid REFERENCES empleados(id) ON DELETE SET NULL,
  ADD COLUMN avisar_empleado boolean NOT NULL DEFAULT false;
ALTER TABLE profiles ADD COLUMN dias_credito smallint NOT NULL DEFAULT 30;
ALTER TABLE facturas_empresa ADD COLUMN vence_el date;   -- emisión + dias_credito
```

RLS: `cargos`, `cargo_enfasis` y `empleados` son de lectura y escritura solo para su empresa y el admin. La IPS no lee el directorio: ve los datos copiados en la cita (`empleado_nombre`, `empleado_cedula`, `cargo`).

---

## Pantallas

### Admin · Catálogos (etapa 1)

Cuatro pestañas a todo el ancho, con tablas y diálogos de edición como en el diseño.

| Pestaña | Acciones | Columnas |
|---|---|---|
| Líneas de servicio | Crear, editar (nombre, descripción), eliminar, activar/desactivar | Nombre + descripción, interruptor |
| Servicios | Crear, editar, eliminar (con confirmación; si está en uso, muestra el motivo) | Servicio, Tipo, Líneas (etiquetas), Preparación, Duración |
| Tipos de evaluación | Solo editar: nombre visible, descripción, regla, indicaciones, Empresa/Particular | Código, Nombre visible, Regla, Empresa, Particular |
| Énfasis y pruebas | Crear, renombrar, eliminar; marcar casillas con un clic | Matriz énfasis × servicios |

Una **línea inactiva** deja de ofrecer sus servicios en Solicitar cita: una prueba se ofrece solo si su servicio pertenece al menos a una línea activa. En la matriz de énfasis, los servicios sin línea activa se ven atenuados.

### IPS · Calendario (etapa 2)

- Se quita el selector de servicio. Crear horario = crear un cupo (fecha y hora).
- Si la IPS no tiene ninguna prueba con precio, se muestra el aviso actual con enlace al perfil.
- El detalle de la cita muestra las pruebas, el tipo de evaluación, sus datos, los énfasis y el cargo.

### Particular · Solicitar cita (etapa 3)

Cuatro pasos: **Evaluación → IPS y ubicación → Fecha y hora → Confirmar y pagar**. Panel lateral "Tu evaluación" en todos.

1. **Evaluación**
   - Nombre y documento del perfil, de solo lectura, con enlace "Editar en Mi perfil". Si falta el documento, se pide completarlo antes de seguir.
   - Motivo: tarjetas de los tipos habilitados para particular, con el formulario de datos del tipo elegido.
   - Énfasis: chips de selección múltiple. "Ninguno especial" es excluyente.
   - Nota del panel: "Las pruebas finales las define el médico según tu cargo." (sin la frase de la orden).
2. **IPS y ubicación**
   - Dirección con "Usar mi ubicación" y mapa con números.
   - "N IPS cubren todo tu examen · M parcialmente".
   - Ordenar por: Cercanía, Próxima disponibilidad, Menor precio.
   - Tarjeta de IPS completa: "Hace las N pruebas", próxima cita, total.
   - Tarjeta de IPS parcial: aviso "Hace X de N pruebas. Falta: …" y botón "Elegir con X pruebas".
   - Las IPS sin horarios esta semana van bajo "Mostrar N IPS sin horarios esta semana".
3. **Fecha y hora**
   - Semana navegable con cupos por día, separados en mañana y tarde.
   - "Todas las pruebas se hacen en la misma visita. Duración aproximada: X h".
   - Recuadro "Antes de tu cita" con las indicaciones de cada prueba y las del tipo de evaluación.
4. **Confirmar y pagar**
   - Tarjeta con fecha, IPS y "Cómo llegar" (Google Maps).
   - Desglose por prueba y total.
   - Indicaciones plegables.
   - Casillas obligatorias: política de datos (enlace a la página) y política de cancelación.
   - Aviso actual de los 30 minutos (sin cuenta regresiva). Botón "Pagar $ total".

**Página `/politica-datos`**: pública, redactada según la Ley 1581 de 2012 y el Decreto 1377 de 2013 (compilado en el Decreto 1074 de 2015), con `[RAZÓN SOCIAL]`, `[NIT]`, `[DIRECCIÓN]`, `[CORREO]`, `[TELÉFONO]` y `[FECHA DE VIGENCIA]` por completar. Debe revisarla un abogado antes de producción.

### Empresa · Mis empleados y Cargos (etapa 4)

- **Mis empleados**:
  - Búsqueda por nombre o documento, tabla y diálogo para crear o editar (tipo doc, número, nombres, apellidos, cargo, celular, correo).
  - Eliminar pide confirmación. Las citas del empleado conservan sus datos.
- **Cargos**:
  - Tabla de cargos con sus énfasis como chips. Crear, editar y eliminar.
  - Si un cargo eliminado tiene empleados, quedan sin cargo.

### Empresa · Solicitar cita (etapa 4)

Cuatro pasos: **Empleados y evaluación → IPS → Fecha y hora** (individual) o **Asignación de horarios** (lote) **→ Confirmar**. Panel lateral "Resumen de la solicitud" con "Factura a nombre de {empresa}".

**Modo individual**
- Buscador en Mis empleados, tarjeta del empleado elegido con "Cambiar" y "+ Agregar un empleado nuevo" (formulario en el mismo paso, que se guarda en el directorio).
- Motivo: los 6 tipos, con formularios en tercera persona. En Pre-ingreso y Egreso, la empresa se llena con la que agenda y el cargo sale del empleado. En Periódica por cambio de ocupación, el cargo nuevo se elige del catálogo de Cargos.
- "Énfasis tomado del cargo" con "Cambiar solo para esta cita".
- IPS parcial permitida (igual que el particular). El paso de fecha y hora es igual al del particular.

**Modo lote**
- Evaluación para todo el grupo: Pre-ingreso, Periódica · programada o Egreso. Los otros tipos solo en modo individual, con ese mensaje.
- Archivo **.xlsx o .csv**. Columnas: Tipo doc, Número, Nombres, Apellidos, Cargo, Celular, Correo y Fecha de retiro (obligatoria solo en Egreso). Plantilla descargable en .xlsx.
- Validación por fila: obligatorios vacíos, documento repetido ("Quitar"), número solo dígitos (salvo PA y PPT), celular de 10 dígitos que empieza por 3, correo válido, fecha de retiro, cargo desconocido.
- Un cargo desconocido se resuelve eligiendo uno existente o "Crear cargo «X»" con sus énfasis.
- Contadores "N listos · M con errores", "Ver las N filas" y casilla "Continuar solo con los N listos".
- **IPS**: solo se pueden elegir IPS que hacen todas las pruebas de todos los cargos del lote ("Hace las pruebas de los N cargos").
- **Asignación de horarios**:
  - Parámetros: desde el día, primer turno, máximo por día (selector) y orden (Como viene en el archivo, Por cargo, Alfabético).
  - Toma los cupos libres en orden y salta los ocupados (se muestran como "Turno ya ocupado en la IPS · se salta").
  - El aviso "recibe un empleado cada N min" usa el intervalo más frecuente entre los cupos de la IPS.
  - Tabla por día con "Mover" (elegir otro cupo libre) y "Volver a repartir".
- **Confirmar**:
  - Resumen y "Valor por cargo" (pruebas, empleados, por persona, subtotal) con total.
  - Forma de pago: solo "Factura a crédito · vence en N días".
  - "Avisar a cada empleado su cita, dirección y preparación": Correo activo; WhatsApp y SMS deshabilitados ("Próximamente").
  - Aviso de filas con error con "Descargar filas con error" (.xlsx con la columna Motivo).
  - Nota sobre el certificado de aptitud en Resultados. Botón "Confirmar N citas".
- Si al confirmar algún turno ya fue tomado, el lote no se guarda: se recargan los cupos, se reasigna, se marcan los cambios y se vuelve a confirmar.

### Admin · Empresas (etapa 4)

- Campo "Días de crédito" en el detalle de la empresa (inicial 30).
- `generar_facturas_empresas` llena `vence_el`, y la factura muestra "Vence el …".

---

## Correos

`notify-appointment` agrega a los correos actuales:
- la lista de pruebas, la duración y las indicaciones;
- si `avisar_empleado` está activo y el empleado tiene correo, un correo para el empleado con la cita, la dirección de la IPS y las indicaciones.

---

## Librería de Excel

Se usan `read-excel-file` (leer) y `write-excel-file` (plantilla y filas con error). No se usa el paquete `xlsx` de npm: la última versión publicada ahí (0.18.5) tiene vulnerabilidades conocidas y las versiones corregidas solo se distribuyen desde el CDN de SheetJS.

---

## Entrega

| Etapa | Migración | Contenido | Queda funcionando |
|---|---|---|---|
| 1 | 019 | Catálogos del admin | Todo como hoy. Solicitar cita sigue igual y lee los tipos por código. |
| 2 | 020 | Cupos sin servicio, cita con varias pruebas, calendario de IPS, funciones de agendar | Los flujos actuales agendan con "Ninguno especial" mientras llegan las etapas 3 y 4. |
| 3 | 021 | Flujo nuevo del particular y página de la política | Particular completo. |
| 4 | 022 | Mis empleados, Cargos, flujo nuevo de empresa, días de crédito, correos al empleado | Todo. |

Cada migración se ejecuta en el SQL Editor de Supabase **antes** de publicar el código de su etapa. Nada se sube a la rama remota hasta que el dueño del producto lo apruebe.

---

## Puntos confirmados (2026-11-18)

1. **Línea inactiva.** Sus servicios dejan de ofrecerse como pruebas en Solicitar cita. Mientras exista el filtro por línea del flujo actual (hasta la etapa 3), las líneas inactivas tampoco aparecen ahí.
2. **"Medicina Ocupacional" → "Evaluación médica ocupacional".** Se renombra el servicio existente en la migración 019, y el nombre nuevo se actualiza en las IPS, los horarios y las citas.
3. **Horarios libres existentes.** Los futuros y libres se convierten en cupos sin servicio en la migración 020.
