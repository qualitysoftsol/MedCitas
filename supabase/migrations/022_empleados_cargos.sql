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
--    correo (avisar_empleado). Desde el navegador solo se cambia el estado de
--    una cita; el resto lo fija crear_cita_interna en el mismo INSERT, que ahora
--    también guarda la aceptación de la política y usa otro cupo de la misma
--    hora si el elegido se acaba de tomar.
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

-- Desde el navegador solo se cambia el estado de una cita (cancelar, atender).
-- El resto lo fijan las funciones que la crean; antes la política de
-- actualización (002) permitía tocar cualquier columna. Igual que en la 018,
-- no aplica a las Edge Functions ni a pg_cron (sin auth.uid()), ni al renombre
-- de un servicio (019), que actualiza el resumen de pruebas.
CREATE OR REPLACE FUNCTION validar_cambio_cita()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _rol text;
BEGIN
  IF auth.uid() IS NULL OR current_setting('medcitas.renombrando_servicio', true) = 'on' THEN
    RETURN NEW;
  END IF;
  SELECT role::text INTO _rol FROM profiles WHERE id = NEW.solicitante_id;

  IF TG_OP = 'INSERT' THEN
    IF _rol = 'particular' THEN
      RAISE EXCEPTION 'Las citas de particulares se agendan con pago en línea.'
        USING HINT = 'REQUIERE_PAGO';
    END IF;
    RETURN NEW;
  END IF;

  IF (NEW.slot_id, NEW.ips_id, NEW.solicitante_id, NEW.empleado_nombre, NEW.empleado_cedula, NEW.tipo_examen,
      NEW.tipo_evaluacion, NEW.fecha, NEW.hora, NEW.ciudad, NEW.servicio, NEW.datos_evaluacion, NEW.enfasis,
      NEW.cargo, NEW.politica_aceptada_at, NEW.empleado_id, NEW.avisar_empleado, NEW.created_at)
     IS DISTINCT FROM
     (OLD.slot_id, OLD.ips_id, OLD.solicitante_id, OLD.empleado_nombre, OLD.empleado_cedula, OLD.tipo_examen,
      OLD.tipo_evaluacion, OLD.fecha, OLD.hora, OLD.ciudad, OLD.servicio, OLD.datos_evaluacion, OLD.enfasis,
      OLD.cargo, OLD.politica_aceptada_at, OLD.empleado_id, OLD.avisar_empleado, OLD.created_at) THEN
    RAISE EXCEPTION 'Solo se puede cambiar el estado de la cita.' USING HINT = 'CAMPO_PROTEGIDO';
  END IF;

  IF NEW.estado IS DISTINCT FROM OLD.estado THEN
    IF OLD.estado IN ('pendiente_pago', 'expirada') THEN
      RAISE EXCEPTION 'Esta cita se confirma o vence automáticamente según el pago.'
        USING HINT = 'ESTADO_DE_PAGO';
    END IF;
    IF NEW.estado = 'cancelada' AND _rol = 'particular' AND auth.uid() = OLD.solicitante_id
       AND ((OLD.fecha + OLD.hora) AT TIME ZONE 'America/Bogota') < now() + interval '12 hours' THEN
      RAISE EXCEPTION 'Solo puedes cancelar hasta 12 horas antes de la cita.'
        USING HINT = 'CANCELACION_TARDIA';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- ─── 3. Crear citas ──────────────────────────────────────────────────────────

-- Igual que en la 020, y además:
--   · guarda el empleado, el aviso y la aceptación de la política en el mismo
--     INSERT (no hay actualizaciones posteriores que puedan fallar);
--   · un particular debe aceptar la política (POLITICA_NO_ACEPTADA);
--   · si el cupo elegido ya se tomó, usa otro libre de la misma IPS a la misma
--     hora (cuando la IPS atiende a varios pacientes a la vez).
DROP FUNCTION IF EXISTS public.crear_cita_interna(uuid, uuid, text, text, text, jsonb, uuid[], text, text, boolean);

CREATE OR REPLACE FUNCTION public.crear_cita_interna(
  p_solicitante       uuid,
  p_slot_id           uuid,
  p_empleado_nombre   text,
  p_empleado_cedula   text,
  p_tipo_evaluacion   text,
  p_datos             jsonb,
  p_enfasis_ids       uuid[],
  p_cargo             text,
  p_estado            text,
  p_permitir_parcial  boolean,
  p_empleado_id       uuid,
  p_avisar            boolean,
  p_politica_aceptada boolean
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
  IF _rol = 'particular' AND p_politica_aceptada IS NOT TRUE THEN
    RAISE EXCEPTION 'Debes aceptar la política de tratamiento de datos.' USING HINT = 'POLITICA_NO_ACEPTADA';
  END IF;
  IF COALESCE(trim(p_empleado_nombre), '') = '' OR COALESCE(trim(p_empleado_cedula), '') = '' THEN
    RAISE EXCEPTION 'Faltan el nombre o el documento del paciente.' USING HINT = 'DATOS_INVALIDOS';
  END IF;

  SELECT * INTO _tipo FROM tipos_evaluacion WHERE codigo = p_tipo_evaluacion;
  IF NOT FOUND OR NOT (_rol = ANY(_tipo.roles_permitidos)) THEN
    RAISE EXCEPTION 'Tipo de evaluación no válido.' USING HINT = 'DATOS_INVALIDOS';
  END IF;
  IF p_datos IS NULL THEN
    RAISE EXCEPTION 'Faltan los datos de la evaluación.' USING HINT = 'DATOS_INVALIDOS';
  END IF;
  PERFORM validar_datos_evaluacion(p_tipo_evaluacion, p_datos, p_solicitante, p_empleado_cedula);

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
  IF FOUND AND _slot.taken THEN
    SELECT * INTO _slot FROM slots s
    WHERE s.ips_id = _slot.ips_id AND s.fecha = _slot.fecha AND s.hora = _slot.hora AND NOT s.taken
    ORDER BY s.created_at
    LIMIT 1
    FOR UPDATE SKIP LOCKED;
  END IF;
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
    datos_evaluacion, enfasis, cargo, empleado_id, avisar_empleado, politica_aceptada_at
  ) VALUES (
    _slot.id, _slot.ips_id, p_solicitante, trim(p_empleado_nombre), trim(p_empleado_cedula),
    _tipo.nombre, _tipo.codigo, _slot.fecha, _slot.hora, _slot.ciudad, _resumen, p_estado::appointment_estado,
    p_datos, _nombres, NULLIF(trim(p_cargo), ''), p_empleado_id, COALESCE(p_avisar, false),
    CASE WHEN p_politica_aceptada THEN now() END
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

REVOKE ALL ON FUNCTION public.crear_cita_interna(uuid, uuid, text, text, text, jsonb, uuid[], text, text, boolean, uuid, boolean, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.crear_cita_interna(uuid, uuid, text, text, text, jsonb, uuid[], text, text, boolean, uuid, boolean, boolean) TO service_role;

-- ─── 4. Agendar como empresa ─────────────────────────────────────────────────

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

  RETURN crear_cita_interna(auth.uid(), p_slot_id, _e.nombres || ' ' || _e.apellidos, _e.numero,
                            p_tipo_evaluacion, p_datos, p_enfasis_ids, p_cargo, 'agendada', true,
                            _e.id, p_avisar, NULL);
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
    -- Un énfasis pudo volverse excluyente después de armar el cargo.
    IF cardinality(_enfasis) > 1 AND EXISTS (SELECT 1 FROM enfasis WHERE id = ANY(_enfasis) AND exclusivo) THEN
      RAISE EXCEPTION 'El cargo "%" combina un énfasis excluyente con otros. Corrígelo en Cargos.', _cargo.nombre
        USING HINT = 'DATOS_INVALIDOS';
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

    PERFORM crear_cita_interna(
      _empresa.id, (_c->>'slot_id')::uuid, trim(_c->>'nombres') || ' ' || trim(_c->>'apellidos'), trim(_c->>'numero'),
      p_tipo_evaluacion, _datos, _enfasis, _cargo.nombre, 'agendada', false,
      _emp_id, p_avisar, NULL
    );
    _n := _n + 1;
  END LOOP;
  RETURN _n;
END;
$$;

REVOKE ALL ON FUNCTION public.agendar_lote_empresa(text, boolean, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.agendar_lote_empresa(text, boolean, jsonb) TO authenticated;

-- ─── 5. Días de crédito y vencimiento de facturas ────────────────────────────

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
