-- ============================================================
-- MedCitas — Migration 016: precios por IPS y comisión de la plataforma
-- Run in: Supabase Dashboard → SQL Editor → New query
--
-- 1. Cada IPS define el precio de cada servicio que presta (precios_ips).
-- 2. El admin define el porcentaje de comisión (comisiones). Una regla puede
--    aplicar a una IPS, a un servicio y/o a un tipo de cliente (empresa o
--    particular); los campos vacíos significan "todos". Cuando varias reglas
--    aplican gana la más específica, con este peso:
--        IPS = 4 · servicio = 2 · tipo de cliente = 1
--    (p. ej. "IPS X" le gana a "Servicio Y + Empresa", y ésta a "Servicio Y").
--    La regla sin IPS, sin servicio y sin tipo es la comisión general.
-- 3. Al agendar, se guarda una foto del precio, el % y el total en
--    citas_precios: cambiar después el precio o la comisión no altera las citas
--    ya agendadas.
--
-- Confidencialidad: empresas y particulares nunca leen el precio base ni el
-- porcentaje. Solo reciben el total ya calculado a través de las funciones
-- precios_servicios() y valores_citas(). La IPS solo ve su precio base.
--
-- Total = precio × (1 + % / 100), redondeado al peso. Sin IVA.
-- ============================================================

BEGIN;

-- ─── 1. Precios de cada IPS ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS precios_ips (
  ips_id      uuid    NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  servicio_id uuid    NOT NULL REFERENCES servicios(id) ON DELETE CASCADE,
  precio      integer NOT NULL CHECK (precio > 0),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (ips_id, servicio_id)
);

ALTER TABLE precios_ips ENABLE ROW LEVEL SECURITY;

-- Solo la propia IPS y el admin: el precio base es confidencial.
DROP POLICY IF EXISTS "precios_ips_lectura" ON precios_ips;
CREATE POLICY "precios_ips_lectura" ON precios_ips
  FOR SELECT USING (ips_id = auth.uid() OR is_admin());

DROP POLICY IF EXISTS "precios_ips_escritura" ON precios_ips;
CREATE POLICY "precios_ips_escritura" ON precios_ips
  FOR ALL
  USING (ips_id = auth.uid() OR is_admin())
  WITH CHECK (
    is_admin()
    OR (ips_id = auth.uid() AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'ips'))
  );

-- ─── 2. Comisiones ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS comisiones (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ips_id      uuid REFERENCES profiles(id) ON DELETE CASCADE,
  servicio_id uuid REFERENCES servicios(id) ON DELETE CASCADE,
  rol         text CHECK (rol IN ('empresa', 'particular')),
  porcentaje  numeric(5,2) NOT NULL CHECK (porcentaje >= 0 AND porcentaje <= 100),
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Una sola regla por combinación (los vacíos cuentan como iguales).
CREATE UNIQUE INDEX IF NOT EXISTS comisiones_regla_unica ON comisiones (
  COALESCE(ips_id, '00000000-0000-0000-0000-000000000000'::uuid),
  COALESCE(servicio_id, '00000000-0000-0000-0000-000000000000'::uuid),
  COALESCE(rol, '')
);

ALTER TABLE comisiones ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "comisiones_admin" ON comisiones;
CREATE POLICY "comisiones_admin" ON comisiones
  FOR ALL USING (is_admin()) WITH CHECK (is_admin());

-- Comisión general inicial en 0 %: el admin la ajusta desde "Comisiones".
INSERT INTO comisiones (porcentaje)
SELECT 0
WHERE NOT EXISTS (SELECT 1 FROM comisiones WHERE ips_id IS NULL AND servicio_id IS NULL AND rol IS NULL);

-- Porcentaje que aplica a una IPS + servicio + tipo de cliente (0 si no hay reglas).
-- Interna: no se expone a los usuarios.
CREATE OR REPLACE FUNCTION public.comision_aplicable(p_ips uuid, p_servicio uuid, p_rol text)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((
    SELECT c.porcentaje
    FROM comisiones c
    WHERE (c.ips_id IS NULL OR c.ips_id = p_ips)
      AND (c.servicio_id IS NULL OR c.servicio_id = p_servicio)
      AND (c.rol IS NULL OR c.rol = p_rol)
    ORDER BY (c.ips_id IS NOT NULL)::int * 4
           + (c.servicio_id IS NOT NULL)::int * 2
           + (c.rol IS NOT NULL)::int DESC
    LIMIT 1
  ), 0);
$$;

REVOKE ALL ON FUNCTION public.comision_aplicable(uuid, uuid, text) FROM PUBLIC, anon, authenticated;

-- Total redondeado al peso.
CREATE OR REPLACE FUNCTION public.precio_con_comision(p_precio integer, p_porcentaje numeric)
RETURNS integer
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT round(p_precio * (100 + p_porcentaje) / 100.0)::integer;
$$;

-- ─── 3. Valor que ve la empresa o el particular antes de agendar ─────────────

-- Devuelve el total (precio + comisión según el tipo de cuenta de quien
-- consulta) de cada servicio con precio de las IPS indicadas. Para cualquier
-- otro rol no devuelve filas.
CREATE OR REPLACE FUNCTION public.precios_servicios(p_ips_ids uuid[])
RETURNS TABLE (ips_id uuid, servicio text, total integer)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH yo AS (
    SELECT pr.role::text AS rol
    FROM profiles pr
    WHERE pr.id = auth.uid() AND pr.role IN ('empresa', 'particular')
  )
  SELECT p.ips_id,
         s.nombre,
         precio_con_comision(p.precio, comision_aplicable(p.ips_id, p.servicio_id, yo.rol))
  FROM precios_ips p
  JOIN servicios s ON s.id = p.servicio_id
  CROSS JOIN yo
  WHERE p.ips_id = ANY(p_ips_ids);
$$;

REVOKE ALL ON FUNCTION public.precios_servicios(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.precios_servicios(uuid[]) TO authenticated;

-- ─── 4. Precio guardado en cada cita ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS citas_precios (
  appointment_id uuid PRIMARY KEY REFERENCES appointments(id) ON DELETE CASCADE,
  precio_ips     integer NOT NULL,
  comision_pct   numeric(5,2) NOT NULL,
  precio_total   integer NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now()
);

-- Solo el admin lee la tabla. Nadie escribe directamente: la llena el trigger.
ALTER TABLE citas_precios ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "citas_precios_admin" ON citas_precios;
CREATE POLICY "citas_precios_admin" ON citas_precios
  FOR SELECT USING (is_admin());

-- Calcula el precio con los datos del horario (no con lo que envía el cliente)
-- y rechaza la cita si el servicio no tiene precio.
CREATE OR REPLACE FUNCTION registrar_precio_cita()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _ips_id      uuid;
  _servicio    text;
  _servicio_id uuid;
  _precio      integer;
  _rol         text;
  _pct         numeric;
BEGIN
  SELECT s.ips_id, s.servicio INTO _ips_id, _servicio FROM slots s WHERE s.id = NEW.slot_id;
  SELECT sv.id INTO _servicio_id FROM servicios sv WHERE sv.nombre = _servicio;
  SELECT p.precio INTO _precio FROM precios_ips p WHERE p.ips_id = _ips_id AND p.servicio_id = _servicio_id;

  IF _precio IS NULL THEN
    RAISE EXCEPTION 'El servicio "%" no tiene precio en esta IPS.', _servicio
      USING HINT = 'SERVICIO_SIN_PRECIO';
  END IF;

  SELECT pr.role::text INTO _rol FROM profiles pr WHERE pr.id = NEW.solicitante_id;
  _pct := comision_aplicable(_ips_id, _servicio_id, _rol);

  INSERT INTO citas_precios (appointment_id, precio_ips, comision_pct, precio_total)
  VALUES (NEW.id, _precio, _pct, precio_con_comision(_precio, _pct));

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS appointment_precio ON appointments;
CREATE TRIGGER appointment_precio
  AFTER INSERT ON appointments
  FOR EACH ROW
  EXECUTE FUNCTION registrar_precio_cita();

-- Valor de cada cita según quién consulta: el solicitante ve el total, la IPS
-- ve su precio base. Las citas anteriores a esta migración no tienen valor.
CREATE OR REPLACE FUNCTION public.valores_citas()
RETURNS TABLE (appointment_id uuid, valor integer)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT cp.appointment_id,
         CASE WHEN a.solicitante_id = auth.uid() THEN cp.precio_total ELSE cp.precio_ips END
  FROM citas_precios cp
  JOIN appointments a ON a.id = cp.appointment_id
  WHERE a.solicitante_id = auth.uid() OR a.ips_id = auth.uid();
$$;

REVOKE ALL ON FUNCTION public.valores_citas() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.valores_citas() TO authenticated;

-- ─── 5. No se crean horarios de servicios sin precio ─────────────────────────

-- En UPDATE solo se valida si cambia el servicio: los horarios creados antes de
-- esta migración se pueden seguir moviendo de fecha u hora.
CREATE OR REPLACE FUNCTION validar_precio_slot()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
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

DROP TRIGGER IF EXISTS slot_requiere_precio ON slots;
CREATE TRIGGER slot_requiere_precio
  BEFORE INSERT OR UPDATE OF servicio, ips_id ON slots
  FOR EACH ROW
  EXECUTE FUNCTION validar_precio_slot();

COMMIT;
