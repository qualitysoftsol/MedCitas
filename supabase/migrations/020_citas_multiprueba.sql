-- ============================================================
-- MedCitas — Migration 020: citas con varias pruebas
-- Run in: Supabase Dashboard → SQL Editor → New query
-- Requiere: 019. Justo después, desplegar la Edge Function rapyd-checkout
-- (supabase functions deploy rapyd-checkout): la versión anterior crea la cita
-- directamente y deja de funcionar con esta migración.
-- Diseño: docs/superpowers/specs/2026-11-18-evaluaciones-multiprueba-design.md
--
-- 1. Un horario es un cupo de la IPS para un paciente, sin servicio. Los
--    horarios libres y futuros que ya existen pasan a ser cupos.
-- 2. Una cita es una visita con varias pruebas: las de los énfasis elegidos
--    que la IPS hace (está en su perfil y tiene precio) y cuyo servicio está
--    en al menos una línea activa.
--    · citas_pruebas: cada prueba con su precio y comisión (solo el admin la
--      lee; el precio base es confidencial).
--    · citas_precios: la suma, como antes. Facturas, liquidaciones y pagos no
--      cambian.
--    · appointments.servicio: el resumen de las pruebas ("Evaluación médica
--      ocupacional, Audiometría"), para las pantallas que lo muestran.
-- 3. Las citas solo se crean con estas funciones, que calculan las pruebas y
--    el precio en el servidor:
--    · agendar_cita_empresa · agendar_lote_empresa (empresas)
--    · crear_cita_interna (rapyd-checkout, para particulares)
--    Los datos de cada tipo de evaluación (datos_evaluacion) se validan aquí.
--    Mientras los flujos de Solicitar cita no los pidan (etapas 3 y 4), pueden
--    enviarlos en NULL.
-- ============================================================

BEGIN;

-- ─── 1. Horarios sin servicio ────────────────────────────────────────────────

ALTER TABLE slots ALTER COLUMN servicio DROP NOT NULL;

-- Convertir los horarios no es crear uno nuevo: validar_precio_slot (versión
-- de la 019, todavía activa aquí) se salta con esta marca, igual que al
-- renombrar un servicio. Sin ella rechazaría cada fila y la migración fallaría.
SELECT set_config('medcitas.renombrando_servicio', 'on', true);
UPDATE slots
SET servicio = NULL
WHERE taken = false
  AND servicio IS NOT NULL
  AND fecha >= (now() AT TIME ZONE 'America/Bogota')::date;
SELECT set_config('medcitas.renombrando_servicio', 'off', true);

-- Un cupo nuevo exige que la IPS tenga al menos un servicio de su perfil con
-- precio. Los horarios antiguos con servicio conservan la regla de la 016.
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

  IF NEW.servicio IS NULL THEN
    IF NOT EXISTS (
      SELECT 1
      FROM precios_ips p
      JOIN servicios s ON s.id = p.servicio_id
      JOIN profiles pr ON pr.id = p.ips_id
      WHERE p.ips_id = NEW.ips_id AND s.nombre = ANY(pr.servicios)
    ) THEN
      RAISE EXCEPTION 'Define el precio de al menos un servicio en tu perfil antes de crear horarios.'
        USING HINT = 'SERVICIO_SIN_PRECIO';
    END IF;
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

-- ─── 2. Citas con varias pruebas ─────────────────────────────────────────────

ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS datos_evaluacion jsonb NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS enfasis text[],
  ADD COLUMN IF NOT EXISTS cargo text;

CREATE TABLE IF NOT EXISTS citas_pruebas (
  appointment_id uuid NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
  servicio_id    uuid NOT NULL REFERENCES servicios(id),
  servicio       text NOT NULL,          -- nombre al momento de agendar
  precio_ips     integer NOT NULL,
  comision_pct   numeric(5,2) NOT NULL,
  precio_total   integer NOT NULL,
  PRIMARY KEY (appointment_id, servicio_id)
);

ALTER TABLE citas_pruebas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "citas_pruebas_admin" ON citas_pruebas;
CREATE POLICY "citas_pruebas_admin" ON citas_pruebas FOR SELECT USING (is_admin());

-- Las citas que ya tienen precio pasan a tener una prueba: su servicio.
INSERT INTO citas_pruebas (appointment_id, servicio_id, servicio, precio_ips, comision_pct, precio_total)
SELECT a.id, s.id, s.nombre, cp.precio_ips, cp.comision_pct, cp.precio_total
FROM appointments a
JOIN citas_precios cp ON cp.appointment_id = a.id
JOIN servicios s ON s.nombre = a.servicio
ON CONFLICT DO NOTHING;

-- El precio lo calcula ahora la función que crea la cita.
DROP TRIGGER IF EXISTS appointment_precio ON appointments;
DROP FUNCTION IF EXISTS registrar_precio_cita();

-- Solo las funciones de esta migración crean citas.
DROP POLICY IF EXISTS "solicitante_books" ON appointments;

-- Un servicio que es prueba de alguna cita tampoco se elimina.
CREATE OR REPLACE FUNCTION validar_eliminar_servicio()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM slots WHERE servicio = OLD.nombre)
     OR EXISTS (SELECT 1 FROM appointments WHERE servicio = OLD.nombre)
     OR EXISTS (SELECT 1 FROM citas_pruebas WHERE servicio_id = OLD.id) THEN
    RAISE EXCEPTION 'No se puede eliminar "%": tiene horarios o citas.', OLD.nombre
      USING HINT = 'SERVICIO_EN_USO';
  END IF;
  UPDATE profiles SET servicios = array_remove(servicios, OLD.nombre) WHERE OLD.nombre = ANY(servicios);
  RETURN OLD;
END;
$$;

-- rapyd-checkout ya lee tipos_evaluacion.
DROP VIEW IF EXISTS tipos_examen;

-- ─── 3. Datos de cada tipo de evaluación ─────────────────────────────────────

-- Fecha 'YYYY-MM-DD' de un campo de datos_evaluacion; NULL si falta o no es válida.
CREATE OR REPLACE FUNCTION fecha_de(p_datos jsonb, p_campo text)
RETURNS date
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  RETURN (p_datos->>p_campo)::date;
EXCEPTION WHEN others THEN
  RETURN NULL;
END;
$$;

-- Lanza DATOS_INVALIDOS con un mensaje para el usuario si falta o sobra algo.
CREATE OR REPLACE FUNCTION validar_datos_evaluacion(p_codigo text, p_datos jsonb, p_solicitante uuid, p_cedula text)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _txt  text;
  _ini  date;
  _fin  date;
  _ref  uuid;
BEGIN
  IF p_codigo IN ('PRE_INGRESO', 'EGRESO') AND COALESCE(trim(p_datos->>'empresa'), '') = '' THEN
    RAISE EXCEPTION 'Indica la empresa.' USING HINT = 'DATOS_INVALIDOS';
  END IF;
  IF p_codigo IN ('PRE_INGRESO', 'PERIODICA') AND COALESCE(trim(p_datos->>'cargo'), '') = '' THEN
    RAISE EXCEPTION 'Indica el cargo.' USING HINT = 'DATOS_INVALIDOS';
  END IF;

  IF p_codigo = 'PERIODICA' AND COALESCE(p_datos->>'motivo', '') NOT IN ('programada', 'cambio_ocupacion') THEN
    RAISE EXCEPTION 'Indica si es un control programado o un cambio de ocupación.' USING HINT = 'DATOS_INVALIDOS';
  END IF;

  IF p_codigo = 'EGRESO' AND fecha_de(p_datos, 'fecha_retiro') IS NULL THEN
    RAISE EXCEPTION 'Indica la fecha de retiro.' USING HINT = 'DATOS_INVALIDOS';
  END IF;

  IF p_codigo = 'POST_INCAPACIDAD' THEN
    _ini := fecha_de(p_datos, 'inicio');
    _fin := fecha_de(p_datos, 'fin');
    IF _ini IS NULL OR _fin IS NULL OR _fin < _ini THEN
      RAISE EXCEPTION 'Indica el inicio y el fin de la incapacidad.' USING HINT = 'DATOS_INVALIDOS';
    END IF;
    IF _fin - _ini + 1 < 30 THEN
      RAISE EXCEPTION 'La incapacidad fue de % días. Esta evaluación aplica desde 30 días calendario.', _fin - _ini + 1
        USING HINT = 'DATOS_INVALIDOS';
    END IF;
  END IF;

  IF p_codigo = 'RETORNO' THEN
    IF COALESCE(p_datos->>'motivo', '') NOT IN ('licencia_no_remunerada', 'suspension_contrato', 'comision_estudios', 'otro') THEN
      RAISE EXCEPTION 'Indica el motivo de la ausencia.' USING HINT = 'DATOS_INVALIDOS';
    END IF;
    _ini := fecha_de(p_datos, 'inicio');
    _fin := fecha_de(p_datos, 'regreso');
    IF _ini IS NULL OR _fin IS NULL OR _fin < _ini THEN
      RAISE EXCEPTION 'Indica el inicio de la ausencia y la fecha de regreso.' USING HINT = 'DATOS_INVALIDOS';
    END IF;
    IF _fin - _ini < 90 THEN
      RAISE EXCEPTION 'La ausencia fue de % días. Esta evaluación aplica desde 90 días calendario.', _fin - _ini
        USING HINT = 'DATOS_INVALIDOS';
    END IF;
  END IF;

  IF p_codigo = 'SEGUIMIENTO' THEN
    IF COALESCE(trim(p_datos->>'que_controlar'), '') = '' THEN
      RAISE EXCEPTION 'Indica qué se va a controlar.' USING HINT = 'DATOS_INVALIDOS';
    END IF;
    _txt := p_datos->>'referencia_id';
    IF _txt IS NOT NULL THEN
      BEGIN
        _ref := _txt::uuid;
      EXCEPTION WHEN others THEN
        _ref := NULL;
      END;
      IF _ref IS NULL OR NOT EXISTS (
        SELECT 1 FROM appointments
        WHERE id = _ref AND estado = 'atendida' AND solicitante_id = p_solicitante AND empleado_cedula = p_cedula
      ) THEN
        RAISE EXCEPTION 'La evaluación de referencia no es válida.' USING HINT = 'DATOS_INVALIDOS';
      END IF;
    ELSIF fecha_de(p_datos->'externa', 'fecha') IS NULL OR COALESCE(trim(p_datos->'externa'->>'tipo'), '') = '' THEN
      RAISE EXCEPTION 'Elige la evaluación de referencia o indica la fecha y el tipo de la evaluación en otra IPS.'
        USING HINT = 'DATOS_INVALIDOS';
    END IF;
  END IF;
END;
$$;

-- ─── 4. Crear citas ──────────────────────────────────────────────────────────

-- Crea la cita, sus pruebas y su precio. Interna: la llaman las funciones de
-- empresa y rapyd-checkout (service role), que ya verificaron quién agenda.
--   p_datos NULL: no se validan los datos del tipo (flujos anteriores).
--   p_permitir_parcial: si la IPS no hace todas las pruebas, se agendan las
--   que hace (false en lotes: se rechaza).
CREATE OR REPLACE FUNCTION public.crear_cita_interna(
  p_solicitante      uuid,
  p_slot_id          uuid,
  p_empleado_nombre  text,
  p_empleado_cedula  text,
  p_tipo_evaluacion  text,
  p_datos            jsonb,
  p_enfasis_ids      uuid[],
  p_cargo            text,
  p_estado           text,
  p_permitir_parcial boolean
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _rol        text;
  _tipo       tipos_evaluacion%ROWTYPE;
  _slot       slots%ROWTYPE;
  _n_enfasis  int;
  _n_excl     int;
  _nombres    text[];
  _pedidas    uuid[];
  _hechas     uuid[];
  _resumen    text;
  _id         uuid;
BEGIN
  SELECT role::text INTO _rol FROM profiles WHERE id = p_solicitante;
  IF _rol IS NULL OR _rol NOT IN ('empresa', 'particular') THEN
    RAISE EXCEPTION 'Solo empresas y particulares agendan citas.' USING HINT = 'DATOS_INVALIDOS';
  END IF;
  IF COALESCE(trim(p_empleado_nombre), '') = '' OR COALESCE(trim(p_empleado_cedula), '') = '' THEN
    RAISE EXCEPTION 'Faltan el nombre o el documento del paciente.' USING HINT = 'DATOS_INVALIDOS';
  END IF;

  SELECT * INTO _tipo FROM tipos_evaluacion WHERE codigo = p_tipo_evaluacion;
  IF NOT FOUND OR NOT (_rol = ANY(_tipo.roles_permitidos)) THEN
    RAISE EXCEPTION 'Tipo de evaluación no válido.' USING HINT = 'DATOS_INVALIDOS';
  END IF;
  IF p_datos IS NOT NULL THEN
    PERFORM validar_datos_evaluacion(p_tipo_evaluacion, p_datos, p_solicitante, p_empleado_cedula);
  END IF;

  -- Énfasis: al menos uno, todos existentes; un excluyente va solo.
  SELECT count(*), count(*) FILTER (WHERE exclusivo), array_agg(nombre ORDER BY orden NULLS LAST, nombre)
  INTO _n_enfasis, _n_excl, _nombres
  FROM enfasis WHERE id = ANY(p_enfasis_ids);
  IF _n_enfasis = 0 OR _n_enfasis <> (SELECT count(DISTINCT x) FROM unnest(p_enfasis_ids) x) THEN
    RAISE EXCEPTION 'Elige al menos un énfasis válido.' USING HINT = 'DATOS_INVALIDOS';
  END IF;
  IF _n_excl > 0 AND _n_enfasis > 1 THEN
    RAISE EXCEPTION 'Un énfasis excluyente no se combina con otros.' USING HINT = 'DATOS_INVALIDOS';
  END IF;

  -- Pruebas pedidas: servicios de los énfasis que están en alguna línea activa.
  SELECT array_agg(DISTINCT es.servicio_id) INTO _pedidas
  FROM enfasis_servicios es
  WHERE es.enfasis_id = ANY(p_enfasis_ids)
    AND EXISTS (
      SELECT 1 FROM servicio_lineas sl JOIN lineas_servicio l ON l.id = sl.linea_id
      WHERE sl.servicio_id = es.servicio_id AND l.activo
    );
  IF _pedidas IS NULL THEN
    RAISE EXCEPTION 'Los énfasis elegidos no tienen pruebas disponibles.' USING HINT = 'SIN_PRUEBAS';
  END IF;

  -- Bloquea el cupo: dos solicitudes al mismo tiempo no lo toman las dos.
  SELECT * INTO _slot FROM slots WHERE id = p_slot_id FOR UPDATE;
  IF NOT FOUND OR _slot.taken OR (_slot.fecha + _slot.hora) <= (now() AT TIME ZONE 'America/Bogota') THEN
    RAISE EXCEPTION 'Ese horario ya no está disponible.' USING HINT = 'HORARIO_TOMADO';
  END IF;

  -- Pruebas que hace la IPS: en su perfil y con precio.
  SELECT array_agg(s.id) INTO _hechas
  FROM servicios s
  JOIN precios_ips p ON p.servicio_id = s.id AND p.ips_id = _slot.ips_id
  JOIN profiles pr ON pr.id = _slot.ips_id
  WHERE s.id = ANY(_pedidas) AND s.nombre = ANY(pr.servicios);
  IF _hechas IS NULL THEN
    RAISE EXCEPTION 'Esta IPS no hace ninguna de las pruebas de la evaluación.' USING HINT = 'SIN_PRUEBAS';
  END IF;
  IF NOT p_permitir_parcial AND cardinality(_hechas) < cardinality(_pedidas) THEN
    RAISE EXCEPTION 'Esta IPS no hace todas las pruebas de la evaluación.' USING HINT = 'PRUEBAS_INCOMPLETAS';
  END IF;

  SELECT string_agg(s.nombre, ', ' ORDER BY
           CASE s.tipo WHEN 'evaluacion_medica' THEN 0 WHEN 'prueba_complementaria' THEN 1 WHEN 'imagen' THEN 2 ELSE 3 END,
           s.nombre)
  INTO _resumen
  FROM servicios s WHERE s.id = ANY(_hechas);

  INSERT INTO appointments (
    slot_id, ips_id, solicitante_id, empleado_nombre, empleado_cedula,
    tipo_examen, tipo_evaluacion, fecha, hora, ciudad, servicio, estado,
    datos_evaluacion, enfasis, cargo
  ) VALUES (
    _slot.id, _slot.ips_id, p_solicitante, trim(p_empleado_nombre), trim(p_empleado_cedula),
    _tipo.nombre, _tipo.codigo, _slot.fecha, _slot.hora, _slot.ciudad, _resumen, p_estado::appointment_estado,
    COALESCE(p_datos, '{}'), _nombres, NULLIF(trim(p_cargo), '')
  )
  RETURNING id INTO _id;

  INSERT INTO citas_pruebas (appointment_id, servicio_id, servicio, precio_ips, comision_pct, precio_total)
  SELECT _id, s.id, s.nombre, p.precio, c.pct, precio_con_comision(p.precio, c.pct)
  FROM servicios s
  JOIN precios_ips p ON p.servicio_id = s.id AND p.ips_id = _slot.ips_id
  CROSS JOIN LATERAL (SELECT comision_aplicable(_slot.ips_id, s.id, _rol) AS pct) c
  WHERE s.id = ANY(_hechas);

  -- comision_pct de la suma: el porcentaje efectivo (informativo).
  INSERT INTO citas_precios (appointment_id, precio_ips, comision_pct, precio_total)
  SELECT _id, sum(precio_ips),
         CASE WHEN sum(precio_ips) > 0 THEN round((sum(precio_total)::numeric / sum(precio_ips) - 1) * 100, 2) ELSE 0 END,
         sum(precio_total)
  FROM citas_pruebas WHERE appointment_id = _id;

  RETURN _id;
END;
$$;

REVOKE ALL ON FUNCTION public.crear_cita_interna(uuid, uuid, text, text, text, jsonb, uuid[], text, text, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.crear_cita_interna(uuid, uuid, text, text, text, jsonb, uuid[], text, text, boolean) TO service_role;

-- Empresa: una cita. Se agenda confirmada (se cobra en la factura mensual).
CREATE OR REPLACE FUNCTION public.agendar_cita_empresa(
  p_slot_id         uuid,
  p_empleado_nombre text,
  p_empleado_cedula text,
  p_tipo_evaluacion text,
  p_datos           jsonb,
  p_enfasis_ids     uuid[],
  p_cargo           text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'empresa') THEN
    RAISE EXCEPTION 'Solo las empresas agendan por este medio.' USING HINT = 'DATOS_INVALIDOS';
  END IF;
  RETURN crear_cita_interna(auth.uid(), p_slot_id, p_empleado_nombre, p_empleado_cedula,
                            p_tipo_evaluacion, p_datos, p_enfasis_ids, p_cargo, 'agendada', true);
END;
$$;

REVOKE ALL ON FUNCTION public.agendar_cita_empresa(uuid, text, text, text, jsonb, uuid[], text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.agendar_cita_empresa(uuid, text, text, text, jsonb, uuid[], text) TO authenticated;

-- Empresa: varias citas en una sola transacción (todas o ninguna).
-- p_citas: [{ slot_id, empleado_nombre, empleado_cedula, enfasis_ids, cargo, datos }]
-- Si algún cupo ya no está libre, falla con HORARIO_TOMADO y en DETAIL la
-- lista de esos cupos separados por coma, para reasignarlos.
CREATE OR REPLACE FUNCTION public.agendar_lote_empresa(p_tipo_evaluacion text, p_citas jsonb)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _c       jsonb;
  _tomados text;
  _n       int := 0;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'empresa') THEN
    RAISE EXCEPTION 'Solo las empresas agendan por este medio.' USING HINT = 'DATOS_INVALIDOS';
  END IF;
  IF p_tipo_evaluacion NOT IN ('PRE_INGRESO', 'PERIODICA', 'EGRESO') THEN
    RAISE EXCEPTION 'Este tipo de evaluación se agenda de a una persona.' USING HINT = 'DATOS_INVALIDOS';
  END IF;
  IF jsonb_typeof(p_citas) <> 'array' OR jsonb_array_length(p_citas) = 0 THEN
    RAISE EXCEPTION 'No hay citas para agendar.' USING HINT = 'DATOS_INVALIDOS';
  END IF;
  IF (SELECT count(*) <> count(DISTINCT c->>'slot_id') FROM jsonb_array_elements(p_citas) c) THEN
    RAISE EXCEPTION 'Dos personas tienen el mismo horario.' USING HINT = 'DATOS_INVALIDOS';
  END IF;

  SELECT string_agg(c->>'slot_id', ',') INTO _tomados
  FROM jsonb_array_elements(p_citas) c
  LEFT JOIN slots s ON s.id = (c->>'slot_id')::uuid
  WHERE s.id IS NULL OR s.taken OR (s.fecha + s.hora) <= (now() AT TIME ZONE 'America/Bogota');
  IF _tomados IS NOT NULL THEN
    RAISE EXCEPTION 'Algunos horarios ya no están disponibles.' USING HINT = 'HORARIO_TOMADO', DETAIL = _tomados;
  END IF;

  FOR _c IN SELECT * FROM jsonb_array_elements(p_citas) LOOP
    PERFORM crear_cita_interna(
      auth.uid(),
      (_c->>'slot_id')::uuid,
      _c->>'empleado_nombre',
      _c->>'empleado_cedula',
      p_tipo_evaluacion,
      CASE WHEN _c ? 'datos' AND jsonb_typeof(_c->'datos') = 'object' THEN _c->'datos' END,
      ARRAY(SELECT jsonb_array_elements_text(_c->'enfasis_ids'))::uuid[],
      _c->>'cargo',
      'agendada',
      false
    );
    _n := _n + 1;
  END LOOP;
  RETURN _n;
END;
$$;

REVOKE ALL ON FUNCTION public.agendar_lote_empresa(text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.agendar_lote_empresa(text, jsonb) TO authenticated;

COMMIT;
