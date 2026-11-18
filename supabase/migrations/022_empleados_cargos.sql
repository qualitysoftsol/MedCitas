-- ============================================================
-- MedCitas — Migration 022: Mis empleados, Cargos y Solicitar cita de empresa
-- Run in: Supabase Dashboard → SQL Editor → New query
-- Requiere: 021. Después, desplegar la Edge Function notify-appointment
-- (supabase functions deploy notify-appointment).
-- Diseño: docs/superpowers/specs/2026-11-18-evaluaciones-multiprueba-design.md
--
-- 1. Cargos de cada empresa con sus énfasis (cargos, cargo_enfasis) y
--    directorio de empleados (empleados). Solo los ve y edita su empresa.
-- 2. Las citas guardan el empleado (empleado_id) y si hay que avisarle por
--    correo (avisar_empleado).
-- 3. Las empresas agendan con:
--    · agendar_cita_empresa: un empleado del directorio.
--    · agendar_lote_empresa: el archivo; crea o actualiza cada empleado por
--      número de documento y toma los énfasis de su cargo.
--    Los datos del tipo de evaluación son obligatorios también para empresas.
-- 4. Días de crédito por empresa (solo el admin los cambia; 30 por defecto)
--    y fecha de vencimiento de cada factura.
-- ============================================================

BEGIN;

-- ─── 1. Cargos y empleados ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS cargos (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  nombre     text NOT NULL CHECK (trim(nombre) <> ''),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS cargos_empresa_nombre ON cargos (empresa_id, lower(trim(nombre)));

CREATE TABLE IF NOT EXISTS cargo_enfasis (
  cargo_id   uuid NOT NULL REFERENCES cargos(id) ON DELETE CASCADE,
  enfasis_id uuid NOT NULL REFERENCES enfasis(id) ON DELETE CASCADE,
  PRIMARY KEY (cargo_id, enfasis_id)
);

CREATE TABLE IF NOT EXISTS empleados (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  tipo_doc   text NOT NULL CHECK (tipo_doc IN ('CC', 'CE', 'TI', 'PA', 'PPT')),
  numero     text NOT NULL CHECK (trim(numero) <> ''),
  nombres    text NOT NULL CHECK (trim(nombres) <> ''),
  apellidos  text NOT NULL CHECK (trim(apellidos) <> ''),
  cargo_id   uuid REFERENCES cargos(id) ON DELETE SET NULL,
  celular    text,
  correo     text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (empresa_id, numero)
);

ALTER TABLE cargos ENABLE ROW LEVEL SECURITY;
ALTER TABLE cargo_enfasis ENABLE ROW LEVEL SECURITY;
ALTER TABLE empleados ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cargos_empresa" ON cargos;
CREATE POLICY "cargos_empresa" ON cargos
  FOR ALL USING (empresa_id = auth.uid() OR is_admin()) WITH CHECK (empresa_id = auth.uid() OR is_admin());

DROP POLICY IF EXISTS "cargo_enfasis_empresa" ON cargo_enfasis;
CREATE POLICY "cargo_enfasis_empresa" ON cargo_enfasis
  FOR ALL
  USING (EXISTS (SELECT 1 FROM cargos c WHERE c.id = cargo_id AND (c.empresa_id = auth.uid() OR is_admin())))
  WITH CHECK (EXISTS (SELECT 1 FROM cargos c WHERE c.id = cargo_id AND (c.empresa_id = auth.uid() OR is_admin())));

DROP POLICY IF EXISTS "empleados_empresa" ON empleados;
CREATE POLICY "empleados_empresa" ON empleados
  FOR ALL USING (empresa_id = auth.uid() OR is_admin()) WITH CHECK (empresa_id = auth.uid() OR is_admin());

-- Guarda un cargo y sus énfasis en un solo paso (con los permisos de quien llama).
CREATE OR REPLACE FUNCTION public.guardar_cargo(p_id uuid, p_nombre text, p_enfasis uuid[])
RETURNS uuid
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  _id uuid := p_id;
BEGIN
  IF _id IS NULL THEN
    INSERT INTO cargos (empresa_id, nombre) VALUES (auth.uid(), trim(p_nombre)) RETURNING id INTO _id;
  ELSE
    UPDATE cargos SET nombre = trim(p_nombre) WHERE id = _id;
  END IF;
  DELETE FROM cargo_enfasis WHERE cargo_id = _id AND enfasis_id <> ALL(COALESCE(p_enfasis, '{}'));
  INSERT INTO cargo_enfasis (cargo_id, enfasis_id) SELECT _id, unnest(COALESCE(p_enfasis, '{}')) ON CONFLICT DO NOTHING;
  RETURN _id;
END;
$$;

REVOKE ALL ON FUNCTION public.guardar_cargo(uuid, text, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.guardar_cargo(uuid, text, uuid[]) TO authenticated;

-- ─── 2. Empleado y aviso en la cita ──────────────────────────────────────────

ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS empleado_id uuid REFERENCES empleados(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS avisar_empleado boolean NOT NULL DEFAULT false;

-- Los datos del tipo de evaluación ahora son obligatorios para todos.
CREATE OR REPLACE FUNCTION exigir_datos_evaluacion()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.datos_evaluacion = '{}'::jsonb THEN
    RAISE EXCEPTION 'Faltan los datos de la evaluación.' USING HINT = 'DATOS_INVALIDOS';
  END IF;
  RETURN NEW;
END;
$$;

-- ─── 3. Agendar como empresa ─────────────────────────────────────────────────

DROP FUNCTION IF EXISTS public.agendar_cita_empresa(uuid, text, text, text, jsonb, uuid[], text);
DROP FUNCTION IF EXISTS public.agendar_lote_empresa(text, jsonb);

-- Una cita para un empleado del directorio. Nombre y documento salen del
-- directorio, no del navegador.
CREATE OR REPLACE FUNCTION public.agendar_cita_empresa(
  p_empleado_id     uuid,
  p_slot_id         uuid,
  p_tipo_evaluacion text,
  p_datos           jsonb,
  p_enfasis_ids     uuid[],
  p_cargo           text,
  p_avisar          boolean
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _e  empleados%ROWTYPE;
  _id uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'empresa') THEN
    RAISE EXCEPTION 'Solo las empresas agendan por este medio.' USING HINT = 'DATOS_INVALIDOS';
  END IF;
  SELECT * INTO _e FROM empleados WHERE id = p_empleado_id AND empresa_id = auth.uid();
  IF NOT FOUND THEN
    RAISE EXCEPTION 'El empleado no está en tu directorio.' USING HINT = 'DATOS_INVALIDOS';
  END IF;
  IF p_datos IS NULL THEN
    RAISE EXCEPTION 'Faltan los datos de la evaluación.' USING HINT = 'DATOS_INVALIDOS';
  END IF;

  _id := crear_cita_interna(auth.uid(), p_slot_id, _e.nombres || ' ' || _e.apellidos, _e.numero,
                            p_tipo_evaluacion, p_datos, p_enfasis_ids, p_cargo, 'agendada', true);
  UPDATE appointments SET empleado_id = _e.id, avisar_empleado = COALESCE(p_avisar, false) WHERE id = _id;
  RETURN _id;
END;
$$;

REVOKE ALL ON FUNCTION public.agendar_cita_empresa(uuid, uuid, text, jsonb, uuid[], text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.agendar_cita_empresa(uuid, uuid, text, jsonb, uuid[], text, boolean) TO authenticated;

-- Varias citas en una sola transacción (todas o ninguna).
-- p_citas: [{ slot_id, tipo_doc, numero, nombres, apellidos, cargo_id, celular, correo, fecha_retiro }]
-- Cada fila crea o actualiza el empleado por número de documento. Los énfasis
-- salen del cargo, y los datos del tipo se arman aquí: la empresa es la que
-- agenda, el cargo es el del archivo y Periódica es "programada".
-- Si algún cupo ya no está libre, falla con HORARIO_TOMADO y en DETAIL la
-- lista de esos cupos separados por coma.
CREATE OR REPLACE FUNCTION public.agendar_lote_empresa(p_tipo_evaluacion text, p_avisar boolean, p_citas jsonb)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _empresa  profiles%ROWTYPE;
  _c        jsonb;
  _cargo    cargos%ROWTYPE;
  _enfasis  uuid[];
  _emp_id   uuid;
  _datos    jsonb;
  _id       uuid;
  _tomados  text;
  _n        int := 0;
BEGIN
  SELECT * INTO _empresa FROM profiles WHERE id = auth.uid() AND role = 'empresa';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Solo las empresas agendan por este medio.' USING HINT = 'DATOS_INVALIDOS';
  END IF;
  IF p_tipo_evaluacion NOT IN ('PRE_INGRESO', 'PERIODICA', 'EGRESO') THEN
    RAISE EXCEPTION 'Este tipo de evaluación se agenda de a una persona.' USING HINT = 'DATOS_INVALIDOS';
  END IF;
  IF jsonb_typeof(p_citas) <> 'array' OR jsonb_array_length(p_citas) = 0 THEN
    RAISE EXCEPTION 'No hay citas para agendar.' USING HINT = 'DATOS_INVALIDOS';
  END IF;
  IF (SELECT count(*) <> count(DISTINCT c->>'slot_id') FROM jsonb_array_elements(p_citas) c) THEN
    RAISE EXCEPTION 'Dos empleados tienen el mismo horario.' USING HINT = 'DATOS_INVALIDOS';
  END IF;
  IF (SELECT count(*) <> count(DISTINCT trim(c->>'numero')) FROM jsonb_array_elements(p_citas) c) THEN
    RAISE EXCEPTION 'Hay documentos repetidos en el lote.' USING HINT = 'DATOS_INVALIDOS';
  END IF;

  SELECT string_agg(c->>'slot_id', ',') INTO _tomados
  FROM jsonb_array_elements(p_citas) c
  LEFT JOIN slots s ON s.id = (c->>'slot_id')::uuid
  WHERE s.id IS NULL OR s.taken OR (s.fecha + s.hora) <= (now() AT TIME ZONE 'America/Bogota');
  IF _tomados IS NOT NULL THEN
    RAISE EXCEPTION 'Algunos horarios ya no están disponibles.' USING HINT = 'HORARIO_TOMADO', DETAIL = _tomados;
  END IF;

  FOR _c IN SELECT * FROM jsonb_array_elements(p_citas) LOOP
    SELECT * INTO _cargo FROM cargos WHERE id = (_c->>'cargo_id')::uuid AND empresa_id = _empresa.id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'El cargo de % % no está en tus cargos.', _c->>'nombres', _c->>'apellidos' USING HINT = 'DATOS_INVALIDOS';
    END IF;
    SELECT array_agg(enfasis_id) INTO _enfasis FROM cargo_enfasis WHERE cargo_id = _cargo.id;
    IF _enfasis IS NULL THEN
      RAISE EXCEPTION 'El cargo "%" no tiene énfasis. Defínelos en Cargos.', _cargo.nombre USING HINT = 'DATOS_INVALIDOS';
    END IF;

    INSERT INTO empleados (empresa_id, tipo_doc, numero, nombres, apellidos, cargo_id, celular, correo)
    VALUES (
      _empresa.id, _c->>'tipo_doc', trim(_c->>'numero'), trim(_c->>'nombres'), trim(_c->>'apellidos'), _cargo.id,
      NULLIF(trim(_c->>'celular'), ''), NULLIF(lower(trim(_c->>'correo')), '')
    )
    ON CONFLICT (empresa_id, numero) DO UPDATE
    SET tipo_doc = EXCLUDED.tipo_doc, nombres = EXCLUDED.nombres, apellidos = EXCLUDED.apellidos,
        cargo_id = EXCLUDED.cargo_id,
        celular = COALESCE(EXCLUDED.celular, empleados.celular),
        correo = COALESCE(EXCLUDED.correo, empleados.correo)
    RETURNING id INTO _emp_id;

    _datos := CASE p_tipo_evaluacion
      WHEN 'PRE_INGRESO' THEN jsonb_build_object('empresa', _empresa.nombre, 'cargo', _cargo.nombre)
      WHEN 'PERIODICA'   THEN jsonb_build_object('motivo', 'programada', 'cargo', _cargo.nombre)
      ELSE                    jsonb_build_object('empresa', _empresa.nombre, 'fecha_retiro', _c->>'fecha_retiro')
    END;

    _id := crear_cita_interna(
      _empresa.id, (_c->>'slot_id')::uuid, trim(_c->>'nombres') || ' ' || trim(_c->>'apellidos'), trim(_c->>'numero'),
      p_tipo_evaluacion, _datos, _enfasis, _cargo.nombre, 'agendada', false
    );
    UPDATE appointments SET empleado_id = _emp_id, avisar_empleado = COALESCE(p_avisar, false) WHERE id = _id;
    _n := _n + 1;
  END LOOP;
  RETURN _n;
END;
$$;

REVOKE ALL ON FUNCTION public.agendar_lote_empresa(text, boolean, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.agendar_lote_empresa(text, boolean, jsonb) TO authenticated;

-- ─── 4. Días de crédito y vencimiento de facturas ────────────────────────────

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS dias_credito smallint NOT NULL DEFAULT 30
  CHECK (dias_credito BETWEEN 0 AND 365);

-- Cada usuario puede editar su perfil (002), pero los días de crédito solo el admin.
CREATE OR REPLACE FUNCTION proteger_dias_credito()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.dias_credito IS DISTINCT FROM OLD.dias_credito AND auth.uid() IS NOT NULL AND NOT is_admin() THEN
    RAISE EXCEPTION 'Solo el administrador cambia los días de crédito.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profile_dias_credito ON profiles;
CREATE TRIGGER profile_dias_credito
  BEFORE UPDATE OF dias_credito ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION proteger_dias_credito();

ALTER TABLE facturas_empresa ADD COLUMN IF NOT EXISTS vence_el date;

UPDATE facturas_empresa f
SET vence_el = (f.created_at AT TIME ZONE 'America/Bogota')::date + p.dias_credito
FROM profiles p
WHERE p.id = f.empresa_id AND f.vence_el IS NULL;

-- Igual que en la 018; la factura nueva vence a los días de crédito de la empresa.
CREATE OR REPLACE FUNCTION public.generar_facturas_empresas(p_periodo date)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _inicio date := date_trunc('month', p_periodo)::date;
  _fin    date := (date_trunc('month', p_periodo) + interval '1 month')::date;
  _hoy    date := (now() AT TIME ZONE 'America/Bogota')::date;
  _n      integer;
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'Solo el administrador puede generar facturas.';
  END IF;

  -- Citas que se cancelaron después de generar la factura.
  DELETE FROM facturas_empresa_items i
  USING facturas_empresa f, appointments a
  WHERE i.factura_id = f.id AND f.periodo = _inicio AND f.estado = 'pendiente'
    AND a.id = i.appointment_id AND a.estado NOT IN ('agendada', 'atendida');

  INSERT INTO facturas_empresa (empresa_id, periodo, vence_el)
  SELECT DISTINCT a.solicitante_id, _inicio, _hoy + pr.dias_credito
  FROM appointments a
  JOIN profiles pr ON pr.id = a.solicitante_id AND pr.role = 'empresa'
  JOIN citas_precios cp ON cp.appointment_id = a.id
  WHERE a.fecha >= _inicio AND a.fecha < _fin AND a.estado IN ('agendada', 'atendida')
    AND NOT EXISTS (SELECT 1 FROM facturas_empresa_items i WHERE i.appointment_id = a.id)
  ON CONFLICT (empresa_id, periodo) DO NOTHING;

  INSERT INTO facturas_empresa_items (factura_id, appointment_id, valor)
  SELECT f.id, a.id, cp.precio_total
  FROM appointments a
  JOIN citas_precios cp ON cp.appointment_id = a.id
  JOIN facturas_empresa f ON f.empresa_id = a.solicitante_id AND f.periodo = _inicio AND f.estado = 'pendiente'
  WHERE a.fecha >= _inicio AND a.fecha < _fin AND a.estado IN ('agendada', 'atendida')
  ON CONFLICT (appointment_id) DO NOTHING;

  UPDATE facturas_empresa f
  SET num_citas  = (SELECT count(*) FROM facturas_empresa_items i WHERE i.factura_id = f.id),
      total      = COALESCE((SELECT sum(valor) FROM facturas_empresa_items i WHERE i.factura_id = f.id), 0),
      updated_at = now()
  WHERE f.periodo = _inicio AND f.estado = 'pendiente';

  SELECT count(*) INTO _n FROM facturas_empresa WHERE periodo = _inicio;
  RETURN _n;
END;
$$;

COMMIT;
