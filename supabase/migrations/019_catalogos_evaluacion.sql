-- ============================================================
-- MedCitas — Migration 019: catálogos de evaluación
-- Run in: Supabase Dashboard → SQL Editor → New query
-- Diseño: docs/superpowers/specs/2026-11-18-evaluaciones-multiprueba-design.md
--
-- 1. Líneas de servicio (antes "clasificaciones"): descripción, activa o no,
--    y un servicio puede estar en varias líneas (servicio_lineas).
-- 2. Servicios: tipo, preparación, indicaciones al paciente y duración.
--    · Renombrar un servicio actualiza su nombre en los perfiles de las IPS,
--      los horarios y las citas (allí se guarda por nombre).
--    · No se puede eliminar un servicio con horarios o citas.
--    · "Medicina Ocupacional" pasa a llamarse "Evaluación médica ocupacional".
-- 3. Tipos de evaluación (antes "tipos_examen"): los 6 de la Resolución 1843
--    de 2025, con código fijo. El admin solo los edita, no los crea ni borra.
--    Las citas guardan el código en appointments.tipo_evaluacion; las
--    existentes se migran (Ingreso → PRE_INGRESO, Anual → PERIODICA,
--    Retiro → EGRESO). Mientras los flujos sigan enviando solo el nombre
--    (tipo_examen), un trigger completa el código.
-- 4. Énfasis (riesgos del cargo) y las pruebas que suma cada uno. Las
--    combinaciones iniciales son de ejemplo: se ajustan con el médico SST.
--
-- Solicitar cita sigue funcionando igual; las líneas inactivas dejan de
-- aparecer en su filtro.
-- ============================================================

BEGIN;

-- ─── 1. Líneas de servicio ───────────────────────────────────────────────────

ALTER TABLE clasificaciones RENAME TO lineas_servicio;
ALTER TABLE lineas_servicio
  ADD COLUMN IF NOT EXISTS descripcion text,
  ADD COLUMN IF NOT EXISTS activo boolean NOT NULL DEFAULT true;

UPDATE lineas_servicio
SET nombre = 'Salud ocupacional (SST)', descripcion = COALESCE(descripcion, 'Antes "' || nombre || '"')
WHERE nombre IN ('Medicina Ocupacional', 'Salud y Riesgos Laborales')
  AND NOT EXISTS (SELECT 1 FROM lineas_servicio WHERE nombre = 'Salud ocupacional (SST)');
UPDATE lineas_servicio SET nombre = 'Calificación de invalidez'
WHERE nombre = 'Invalidez' AND NOT EXISTS (SELECT 1 FROM lineas_servicio WHERE nombre = 'Calificación de invalidez');
UPDATE lineas_servicio SET nombre = 'Imágenes diagnósticas'
WHERE nombre = 'Imágenes Diagnósticas' AND NOT EXISTS (SELECT 1 FROM lineas_servicio WHERE nombre = 'Imágenes diagnósticas');

INSERT INTO lineas_servicio (nombre) VALUES
  ('Salud ocupacional (SST)'),
  ('Imágenes diagnósticas'),
  ('Rehabilitación'),
  ('Calificación de invalidez')
ON CONFLICT (nombre) DO NOTHING;

CREATE TABLE IF NOT EXISTS servicio_lineas (
  servicio_id uuid NOT NULL REFERENCES servicios(id) ON DELETE CASCADE,
  linea_id    uuid NOT NULL REFERENCES lineas_servicio(id) ON DELETE CASCADE,
  PRIMARY KEY (servicio_id, linea_id)
);

INSERT INTO servicio_lineas (servicio_id, linea_id)
SELECT id, clasificacion_id FROM servicios WHERE clasificacion_id IS NOT NULL
ON CONFLICT DO NOTHING;

ALTER TABLE servicios DROP COLUMN IF EXISTS clasificacion_id;

ALTER TABLE servicio_lineas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "servicio_lineas_lectura" ON servicio_lineas;
CREATE POLICY "servicio_lineas_lectura" ON servicio_lineas FOR SELECT USING (true);
DROP POLICY IF EXISTS "servicio_lineas_admin" ON servicio_lineas;
CREATE POLICY "servicio_lineas_admin" ON servicio_lineas FOR ALL USING (is_admin()) WITH CHECK (is_admin());

-- ─── 2. Servicios ────────────────────────────────────────────────────────────

ALTER TABLE servicios
  ADD COLUMN IF NOT EXISTS tipo text
    CHECK (tipo IN ('evaluacion_medica', 'prueba_complementaria', 'imagen', 'terapia')),
  ADD COLUMN IF NOT EXISTS preparacion text,
  ADD COLUMN IF NOT EXISTS indicaciones text,
  ADD COLUMN IF NOT EXISTS duracion_min integer CHECK (duracion_min > 0);

-- validar_precio_slot (016) revisaría el precio de cada horario al cambiarle
-- el nombre del servicio. Un renombre no cambia de servicio, así que se salta.
CREATE OR REPLACE FUNCTION validar_precio_slot()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF current_setting('medcitas.renombrando_servicio', true) = 'on' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.servicio IS NOT DISTINCT FROM OLD.servicio AND NEW.ips_id = OLD.ips_id THEN
    RETURN NEW;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM precios_ips p JOIN servicios s ON s.id = p.servicio_id
    WHERE p.ips_id = NEW.ips_id AND s.nombre = NEW.servicio
  ) THEN
    RAISE EXCEPTION 'Define el precio de "%" en tu perfil antes de crear horarios de este servicio.', NEW.servicio
      USING HINT = 'SERVICIO_SIN_PRECIO';
  END IF;
  RETURN NEW;
END;
$$;

-- Los perfiles, horarios y citas guardan el servicio por nombre.
CREATE OR REPLACE FUNCTION propagar_nombre_servicio()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM set_config('medcitas.renombrando_servicio', 'on', true);
  UPDATE profiles SET servicios = array_replace(servicios, OLD.nombre, NEW.nombre) WHERE OLD.nombre = ANY(servicios);
  UPDATE slots SET servicio = NEW.nombre WHERE servicio = OLD.nombre;
  UPDATE appointments SET servicio = NEW.nombre WHERE servicio = OLD.nombre;
  PERFORM set_config('medcitas.renombrando_servicio', 'off', true);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS servicio_renombrado ON servicios;
CREATE TRIGGER servicio_renombrado
  AFTER UPDATE OF nombre ON servicios
  FOR EACH ROW
  WHEN (NEW.nombre IS DISTINCT FROM OLD.nombre)
  EXECUTE FUNCTION propagar_nombre_servicio();

-- Un servicio con horarios o citas no se elimina. Si se puede, se quita de los
-- perfiles de las IPS (sus precios y comisiones se borran en cascada).
CREATE OR REPLACE FUNCTION validar_eliminar_servicio()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM slots WHERE servicio = OLD.nombre)
     OR EXISTS (SELECT 1 FROM appointments WHERE servicio = OLD.nombre) THEN
    RAISE EXCEPTION 'No se puede eliminar "%": tiene horarios o citas.', OLD.nombre
      USING HINT = 'SERVICIO_EN_USO';
  END IF;
  UPDATE profiles SET servicios = array_remove(servicios, OLD.nombre) WHERE OLD.nombre = ANY(servicios);
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS servicio_en_uso ON servicios;
CREATE TRIGGER servicio_en_uso
  BEFORE DELETE ON servicios
  FOR EACH ROW
  EXECUTE FUNCTION validar_eliminar_servicio();

UPDATE servicios SET nombre = 'Evaluación médica ocupacional'
WHERE nombre = 'Medicina Ocupacional'
  AND NOT EXISTS (SELECT 1 FROM servicios WHERE nombre = 'Evaluación médica ocupacional');

-- Servicios del diseño. Si ya existen solo se completan los campos vacíos.
-- Las indicaciones son de ejemplo: el admin las ajusta en Catálogos.
WITH base (nombre, tipo, preparacion, indicaciones, duracion_min) AS (VALUES
  ('Evaluación médica ocupacional', 'evaluacion_medica',     NULL,               NULL,                                                   30),
  ('Visiometría',                   'prueba_complementaria', 'Gafas o lentes',   'Trae tus gafas o lentes de contacto.',                 15),
  ('Optometría',                    'prueba_complementaria', 'Gafas o lentes',   'Trae tus gafas o lentes de contacto.',                 20),
  ('Audiometría',                   'prueba_complementaria', 'Reposo auditivo',  'Evita ruidos fuertes las 12 horas antes.',             20),
  ('Espirometría',                  'prueba_complementaria', 'Sin cigarrillo',   'No fumes ni hagas ejercicio intenso 2 horas antes.',   20),
  ('Laboratorio clínico',           'prueba_complementaria', 'Ayuno',            'Ven en ayunas de 8 horas.',                            15),
  ('Psicología',                    'prueba_complementaria', NULL,               NULL,                                                   30),
  ('Rayos X',                       'imagen',                NULL,               NULL,                                                   15),
  ('Fisioterapia',                  'terapia',               NULL,               NULL,                                                   45)
),
nuevos AS (
  INSERT INTO servicios (nombre, tipo, preparacion, indicaciones, duracion_min)
  SELECT nombre, tipo, preparacion, indicaciones, duracion_min FROM base
  ON CONFLICT (nombre) DO NOTHING
  RETURNING id
)
UPDATE servicios s
SET tipo = COALESCE(s.tipo, b.tipo),
    preparacion = COALESCE(s.preparacion, b.preparacion),
    indicaciones = COALESCE(s.indicaciones, b.indicaciones),
    duracion_min = COALESCE(s.duracion_min, b.duracion_min)
FROM base b
WHERE s.nombre = b.nombre;

-- Líneas iniciales, solo para los servicios que aún no tienen ninguna.
INSERT INTO servicio_lineas (servicio_id, linea_id)
SELECT s.id, l.id
FROM (VALUES
  ('Evaluación médica ocupacional', 'Salud ocupacional (SST)'),
  ('Visiometría',                   'Salud ocupacional (SST)'),
  ('Optometría',                    'Salud ocupacional (SST)'),
  ('Audiometría',                   'Salud ocupacional (SST)'),
  ('Espirometría',                  'Salud ocupacional (SST)'),
  ('Laboratorio clínico',           'Salud ocupacional (SST)'),
  ('Psicología',                    'Salud ocupacional (SST)'),
  ('Rayos X',                       'Salud ocupacional (SST)'),
  ('Rayos X',                       'Imágenes diagnósticas'),
  ('Fisioterapia',                  'Rehabilitación')
) AS v (servicio, linea)
JOIN servicios s ON s.nombre = v.servicio
JOIN lineas_servicio l ON l.nombre = v.linea
WHERE NOT EXISTS (SELECT 1 FROM servicio_lineas sl WHERE sl.servicio_id = s.id)
ON CONFLICT DO NOTHING;

-- Guarda un servicio y sus líneas en un solo paso. Corre con los permisos de
-- quien llama: las políticas de RLS solo dejan escribir al admin.
CREATE OR REPLACE FUNCTION public.guardar_servicio(
  p_id uuid,
  p_nombre text,
  p_tipo text,
  p_preparacion text,
  p_indicaciones text,
  p_duracion_min integer,
  p_lineas uuid[]
)
RETURNS uuid
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  _id uuid := p_id;
BEGIN
  IF _id IS NULL THEN
    INSERT INTO servicios (nombre, tipo, preparacion, indicaciones, duracion_min)
    VALUES (p_nombre, p_tipo, p_preparacion, p_indicaciones, p_duracion_min)
    RETURNING id INTO _id;
  ELSE
    UPDATE servicios
    SET nombre = p_nombre, tipo = p_tipo, preparacion = p_preparacion,
        indicaciones = p_indicaciones, duracion_min = p_duracion_min
    WHERE id = _id;
  END IF;

  DELETE FROM servicio_lineas WHERE servicio_id = _id AND linea_id <> ALL(COALESCE(p_lineas, '{}'));
  INSERT INTO servicio_lineas (servicio_id, linea_id)
  SELECT _id, unnest(COALESCE(p_lineas, '{}'))
  ON CONFLICT DO NOTHING;

  RETURN _id;
END;
$$;

REVOKE ALL ON FUNCTION public.guardar_servicio(uuid, text, text, text, text, integer, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.guardar_servicio(uuid, text, text, text, text, integer, uuid[]) TO authenticated;

-- ─── 3. Tipos de evaluación ──────────────────────────────────────────────────

ALTER TABLE tipos_examen RENAME TO tipos_evaluacion;
ALTER TABLE tipos_evaluacion
  ADD COLUMN IF NOT EXISTS codigo text UNIQUE,
  ADD COLUMN IF NOT EXISTS descripcion text,
  ADD COLUMN IF NOT EXISTS regla text,
  ADD COLUMN IF NOT EXISTS indicaciones text,
  ADD COLUMN IF NOT EXISTS orden smallint;

INSERT INTO tipos_evaluacion (codigo, nombre, descripcion, regla, indicaciones, roles_permitidos, orden) VALUES
  ('PRE_INGRESO', 'Pre-ingreso', 'Antes de empezar un trabajo nuevo.',
     'Empresa contratante, cargo', 'Lleva tu documento de identidad.',
     ARRAY['empresa', 'particular'], 1),
  ('PERIODICA', 'Periódica', 'Control programado o por cambio de cargo.',
     'Subtipo: programada o cambio de ocupación', 'Lleva tu documento de identidad.',
     ARRAY['empresa', 'particular'], 2),
  ('EGRESO', 'Egreso', 'Al terminar la relación laboral.',
     'Fecha de retiro', 'Lleva tu documento de identidad.',
     ARRAY['empresa'], 3),
  ('POST_INCAPACIDAD', 'Post-incapacidad', 'Después de una incapacidad de 30 días o más.',
     'Fechas de incapacidad · mínimo 30 días', 'Lleva tu documento y el certificado de incapacidad.',
     ARRAY['empresa', 'particular'], 4),
  ('RETORNO', 'Retorno laboral', 'Tras 90 días o más de ausencia no médica.',
     'Motivo y fechas de ausencia · mínimo 90 días', 'Lleva tu documento de identidad.',
     ARRAY['empresa', 'particular'], 5),
  ('SEGUIMIENTO', 'Seguimiento o control', 'Para revisar una recomendación médica previa.',
     'Evaluación previa de referencia', 'Lleva tu documento y el resultado de la evaluación anterior.',
     ARRAY['empresa', 'particular'], 6)
ON CONFLICT (nombre) DO UPDATE
SET codigo = EXCLUDED.codigo, descripcion = EXCLUDED.descripcion, regla = EXCLUDED.regla,
    indicaciones = EXCLUDED.indicaciones, orden = EXCLUDED.orden;

ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS tipo_evaluacion text REFERENCES tipos_evaluacion(codigo);

UPDATE appointments a
SET tipo_evaluacion = COALESCE(
  (SELECT t.codigo FROM tipos_evaluacion t WHERE t.nombre = a.tipo_examen AND t.codigo IS NOT NULL),
  CASE lower(a.tipo_examen)
    WHEN 'ingreso' THEN 'PRE_INGRESO'
    WHEN 'anual'   THEN 'PERIODICA'
    WHEN 'retiro'  THEN 'EGRESO'
  END
)
WHERE a.tipo_evaluacion IS NULL;

DELETE FROM tipos_evaluacion WHERE codigo IS NULL;
ALTER TABLE tipos_evaluacion ALTER COLUMN codigo SET NOT NULL;

-- Fijos: el admin solo actualiza (nombre visible, textos y roles).
DROP POLICY IF EXISTS "tipos_admin_write" ON tipos_evaluacion;
DROP POLICY IF EXISTS "tipos_admin_update" ON tipos_evaluacion;
CREATE POLICY "tipos_admin_update" ON tipos_evaluacion
  FOR UPDATE USING (is_admin()) WITH CHECK (is_admin());

CREATE OR REPLACE FUNCTION completar_tipo_evaluacion()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.tipo_evaluacion IS NULL THEN
    SELECT codigo INTO NEW.tipo_evaluacion FROM tipos_evaluacion WHERE nombre = NEW.tipo_examen;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS appointment_tipo_evaluacion ON appointments;
CREATE TRIGGER appointment_tipo_evaluacion
  BEFORE INSERT ON appointments
  FOR EACH ROW
  EXECUTE FUNCTION completar_tipo_evaluacion();

-- Compatibilidad: la versión desplegada de la Edge Function rapyd-checkout lee
-- "tipos_examen". Esta vista la mantiene funcionando hasta que se despliegue la
-- versión nueva (que lee tipos_evaluacion). Se elimina en la migración 020.
CREATE OR REPLACE VIEW tipos_examen WITH (security_invoker = true) AS
  SELECT id, nombre, roles_permitidos, created_at FROM tipos_evaluacion;

-- ─── 4. Énfasis ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS enfasis (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre     text NOT NULL UNIQUE,
  -- "Ninguno especial": no se combina con otros énfasis.
  exclusivo  boolean NOT NULL DEFAULT false,
  orden      smallint,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS enfasis_servicios (
  enfasis_id  uuid NOT NULL REFERENCES enfasis(id) ON DELETE CASCADE,
  servicio_id uuid NOT NULL REFERENCES servicios(id) ON DELETE CASCADE,
  PRIMARY KEY (enfasis_id, servicio_id)
);

ALTER TABLE enfasis ENABLE ROW LEVEL SECURITY;
ALTER TABLE enfasis_servicios ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "enfasis_lectura" ON enfasis;
CREATE POLICY "enfasis_lectura" ON enfasis FOR SELECT USING (true);
DROP POLICY IF EXISTS "enfasis_admin" ON enfasis;
CREATE POLICY "enfasis_admin" ON enfasis FOR ALL USING (is_admin()) WITH CHECK (is_admin());

DROP POLICY IF EXISTS "enfasis_servicios_lectura" ON enfasis_servicios;
CREATE POLICY "enfasis_servicios_lectura" ON enfasis_servicios FOR SELECT USING (true);
DROP POLICY IF EXISTS "enfasis_servicios_admin" ON enfasis_servicios;
CREATE POLICY "enfasis_servicios_admin" ON enfasis_servicios FOR ALL USING (is_admin()) WITH CHECK (is_admin());

INSERT INTO enfasis (nombre, exclusivo, orden) VALUES
  ('Ninguno especial (oficina)', true,  1),
  ('Trabajo en alturas',         false, 2),
  ('Manipulación de alimentos',  false, 3),
  ('Conducción de vehículos',    false, 4),
  ('Ruido',                      false, 5),
  ('Polvo o químicos',           false, 6)
ON CONFLICT (nombre) DO NOTHING;

INSERT INTO enfasis_servicios (enfasis_id, servicio_id)
SELECT e.id, s.id
FROM (VALUES
  ('Ninguno especial (oficina)', 'Evaluación médica ocupacional'),
  ('Trabajo en alturas',         'Evaluación médica ocupacional'),
  ('Trabajo en alturas',         'Visiometría'),
  ('Trabajo en alturas',         'Audiometría'),
  ('Trabajo en alturas',         'Laboratorio clínico'),
  ('Trabajo en alturas',         'Psicología'),
  ('Manipulación de alimentos',  'Evaluación médica ocupacional'),
  ('Manipulación de alimentos',  'Laboratorio clínico'),
  ('Conducción de vehículos',    'Evaluación médica ocupacional'),
  ('Conducción de vehículos',    'Visiometría'),
  ('Conducción de vehículos',    'Audiometría'),
  ('Conducción de vehículos',    'Psicología'),
  ('Ruido',                      'Evaluación médica ocupacional'),
  ('Ruido',                      'Audiometría'),
  ('Polvo o químicos',           'Evaluación médica ocupacional'),
  ('Polvo o químicos',           'Espirometría'),
  ('Polvo o químicos',           'Rayos X')
) AS v (enfasis, servicio)
JOIN enfasis e ON e.nombre = v.enfasis
JOIN servicios s ON s.nombre = v.servicio
ON CONFLICT DO NOTHING;

COMMIT;
