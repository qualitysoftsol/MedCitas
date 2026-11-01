-- ============================================================
-- MedCitas — Migration 018: pagos en línea (Rapyd), reembolsos,
-- facturas mensuales de empresas y pagos mensuales a las IPS
-- Run in: Supabase Dashboard → SQL Editor → New query
-- Requiere: 016 (precios y comisiones) y 017 (estados), ejecutada antes en
-- otra consulta.
--
-- Particulares
--   · La cita se crea "pendiente_pago" desde la Edge Function rapyd-checkout
--     y aparta el horario 30 minutos. El navegador ya no puede crearla.
--   · Cuando Rapyd confirma el pago (webhook) pasa a "agendada". Si no se paga
--     a tiempo pasa a "expirada" y el horario se libera (pg_cron, cada minuto).
--   · Solo se puede cancelar hasta 12 horas antes. Si estaba pagada se crea
--     una solicitud de reembolso total que aprueba el administrador. Igual si
--     la cancela la IPS, sin límite de tiempo.
-- Empresas
--   · Agendan como antes, sin pago en línea. El admin genera cada mes la
--     factura de cada empresa con sus citas (valor con comisión).
-- IPS
--   · El admin genera cada mes lo que se le debe a cada IPS por todas sus
--     citas del mes (precio base, sin comisión).
-- ============================================================

BEGIN;

-- ─── 1. Horarios: una cita pendiente aparta el horario, una expirada lo libera ──

DROP INDEX IF EXISTS appointments_slot_id_activa_unique;
CREATE UNIQUE INDEX appointments_slot_id_activa_unique
  ON appointments (slot_id)
  WHERE estado NOT IN ('cancelada', 'expirada');

CREATE OR REPLACE FUNCTION sync_slot_taken()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE slots SET taken = true WHERE id = NEW.slot_id;
  ELSIF TG_OP = 'UPDATE' AND NEW.estado IS DISTINCT FROM OLD.estado THEN
    IF NEW.estado IN ('cancelada', 'expirada') AND OLD.estado NOT IN ('cancelada', 'expirada') THEN
      UPDATE slots SET taken = false WHERE id = NEW.slot_id;
    ELSIF OLD.estado IN ('cancelada', 'expirada') AND NEW.estado NOT IN ('cancelada', 'expirada') THEN
      -- Pago aprobado tarde sobre una reserva vencida cuyo horario seguía libre.
      UPDATE slots SET taken = true WHERE id = NEW.slot_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- ─── 2. Correos: se avisa al confirmar el pago, no al apartar el horario ──────

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
  -- Cita nueva ya confirmada (empresas) · pago aprobado (particulares) ·
  -- cancelación de una cita confirmada. Las pendientes y expiradas no notifican.
  IF (TG_OP = 'INSERT' AND NEW.estado = 'agendada')
    OR (TG_OP = 'UPDATE' AND NEW.estado = 'agendada' AND OLD.estado IN ('pendiente_pago', 'expirada'))
    OR (TG_OP = 'UPDATE' AND NEW.estado = 'cancelada' AND OLD.estado IN ('agendada', 'atendida'))
  THEN
    PERFORM net.http_post(
      url     := _url,
      headers := _headers,
      body    := jsonb_build_object('record', row_to_json(NEW))
    );
  END IF;
  RETURN NEW;
END;
$$;

-- ─── 3. Reglas que el navegador no puede saltarse ────────────────────────────

-- Las Edge Functions (service role) y pg_cron no tienen auth.uid(): para ellas
-- no aplican estas reglas, que solo limitan a los usuarios.
CREATE OR REPLACE FUNCTION validar_cambio_cita()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _rol text;
BEGIN
  IF auth.uid() IS NULL THEN
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

DROP TRIGGER IF EXISTS appointment_validar ON appointments;
CREATE TRIGGER appointment_validar
  BEFORE INSERT OR UPDATE ON appointments
  FOR EACH ROW
  EXECUTE FUNCTION validar_cambio_cita();

-- ─── 4. Pagos y reembolsos ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS pagos (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id    uuid NOT NULL UNIQUE REFERENCES appointments(id) ON DELETE CASCADE,
  solicitante_id    uuid NOT NULL REFERENCES profiles(id),
  monto             integer NOT NULL CHECK (monto > 0),
  moneda            text NOT NULL DEFAULT 'COP',
  -- rechazado = el último intento falló; se puede reintentar mientras no venza.
  estado            text NOT NULL DEFAULT 'pendiente'
                    CHECK (estado IN ('pendiente', 'aprobado', 'rechazado', 'expirado')),
  expira_at         timestamptz NOT NULL,
  rapyd_checkout_id text,
  rapyd_payment_id  text UNIQUE,
  metodo            text,
  detalle           text,
  aprobado_at       timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS reembolsos (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pago_id         uuid NOT NULL UNIQUE REFERENCES pagos(id) ON DELETE CASCADE,
  monto           integer NOT NULL,
  motivo          text NOT NULL,
  -- solicitado → (admin aprueba) en_proceso → completado | fallido
  -- solicitado → (admin rechaza) denegado
  estado          text NOT NULL DEFAULT 'solicitado'
                  CHECK (estado IN ('solicitado', 'en_proceso', 'completado', 'fallido', 'denegado')),
  rapyd_refund_id text UNIQUE,
  detalle         text,
  resuelto_por    uuid REFERENCES profiles(id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- Webhooks recibidos de Rapyd: auditoría e idempotencia (un webhook repetido se ignora).
CREATE TABLE IF NOT EXISTS pagos_eventos (
  id         text PRIMARY KEY,
  tipo       text NOT NULL,
  payload    jsonb NOT NULL,
  resultado  text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE pagos ENABLE ROW LEVEL SECURITY;
ALTER TABLE reembolsos ENABLE ROW LEVEL SECURITY;
ALTER TABLE pagos_eventos ENABLE ROW LEVEL SECURITY;

-- Solo lectura para el pagador y el admin. Las escrituras las hacen las Edge
-- Functions con service role y las funciones de esta migración.
DROP POLICY IF EXISTS "pagos_lectura" ON pagos;
CREATE POLICY "pagos_lectura" ON pagos
  FOR SELECT USING (solicitante_id = auth.uid() OR is_admin());

DROP POLICY IF EXISTS "reembolsos_lectura" ON reembolsos;
CREATE POLICY "reembolsos_lectura" ON reembolsos
  FOR SELECT USING (
    is_admin() OR EXISTS (SELECT 1 FROM pagos p WHERE p.id = pago_id AND p.solicitante_id = auth.uid())
  );

DROP POLICY IF EXISTS "pagos_eventos_admin" ON pagos_eventos;
CREATE POLICY "pagos_eventos_admin" ON pagos_eventos
  FOR SELECT USING (is_admin());

-- Al cancelar una cita pagada se pide el reembolso total.
CREATE OR REPLACE FUNCTION solicitar_reembolso_al_cancelar()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _pago pagos%ROWTYPE;
BEGIN
  IF NEW.estado = 'cancelada' AND OLD.estado = 'agendada' THEN
    SELECT * INTO _pago FROM pagos WHERE appointment_id = NEW.id AND estado = 'aprobado';
    IF FOUND THEN
      INSERT INTO reembolsos (pago_id, monto, motivo)
      VALUES (
        _pago.id,
        _pago.monto,
        CASE
          WHEN auth.uid() = NEW.solicitante_id THEN 'Cancelada por el paciente'
          WHEN auth.uid() = NEW.ips_id THEN 'Cancelada por la IPS'
          ELSE 'Cita cancelada'
        END
      )
      ON CONFLICT (pago_id) DO NOTHING;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS appointment_reembolso ON appointments;
CREATE TRIGGER appointment_reembolso
  AFTER UPDATE ON appointments
  FOR EACH ROW
  EXECUTE FUNCTION solicitar_reembolso_al_cancelar();

-- Aplica un webhook de pago de Rapyd. La llama la Edge Function rapyd-webhook
-- (service role) después de verificar la firma.
CREATE OR REPLACE FUNCTION public.registrar_pago_rapyd(
  p_pago_id    uuid,
  p_evento     text,
  p_payment_id text,
  p_metodo     text,
  p_monto      numeric,
  p_moneda     text,
  p_detalle    text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _pago pagos%ROWTYPE;
  _cita appointments%ROWTYPE;
BEGIN
  SELECT * INTO _pago FROM pagos WHERE id = p_pago_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN 'pago_desconocido';
  END IF;

  IF p_evento = 'PAYMENT_COMPLETED' THEN
    IF _pago.estado = 'aprobado' THEN
      RETURN 'ya_aprobado';
    END IF;
    IF p_monto IS DISTINCT FROM _pago.monto::numeric OR upper(p_moneda) IS DISTINCT FROM _pago.moneda THEN
      UPDATE pagos
      SET detalle = format('Rapyd reportó %s %s y se esperaban %s %s: revisar en el portal de Rapyd.', p_monto, p_moneda, _pago.monto, _pago.moneda),
          rapyd_payment_id = p_payment_id, updated_at = now()
      WHERE id = _pago.id;
      RETURN 'monto_no_coincide';
    END IF;

    UPDATE pagos
    SET estado = 'aprobado', rapyd_payment_id = p_payment_id, metodo = p_metodo,
        aprobado_at = now(), detalle = NULL, updated_at = now()
    WHERE id = _pago.id;

    SELECT * INTO _cita FROM appointments WHERE id = _pago.appointment_id FOR UPDATE;
    IF _cita.estado = 'pendiente_pago' THEN
      UPDATE appointments SET estado = 'agendada' WHERE id = _cita.id;
      RETURN 'cita_confirmada';
    END IF;

    -- Pago aprobado después de vencer la reserva: se confirma si el horario
    -- sigue libre y no ha pasado; si no, se devuelve el dinero.
    IF _cita.estado = 'expirada'
       AND ((_cita.fecha + _cita.hora) AT TIME ZONE 'America/Bogota') > now()
       AND NOT EXISTS (
         SELECT 1 FROM appointments a
         WHERE a.slot_id = _cita.slot_id AND a.id <> _cita.id AND a.estado NOT IN ('cancelada', 'expirada')
       ) THEN
      UPDATE appointments SET estado = 'agendada' WHERE id = _cita.id;
      RETURN 'cita_confirmada_tarde';
    END IF;

    INSERT INTO reembolsos (pago_id, monto, motivo)
    VALUES (_pago.id, _pago.monto, 'Pago recibido después de vencer la reserva; el horario ya no estaba disponible')
    ON CONFLICT (pago_id) DO NOTHING;
    RETURN 'reembolso_por_pago_tardio';
  END IF;

  IF p_evento IN ('PAYMENT_FAILED', 'PAYMENT_EXPIRED') THEN
    IF _pago.estado = 'pendiente' THEN
      UPDATE pagos
      SET estado = CASE WHEN p_evento = 'PAYMENT_FAILED' THEN 'rechazado' ELSE estado END,
          detalle = p_detalle, updated_at = now()
      WHERE id = _pago.id;
    END IF;
    RETURN 'registrado';
  END IF;

  RETURN 'ignorado';
END;
$$;

-- Vence las reservas sin pagar y libera sus horarios.
CREATE OR REPLACE FUNCTION public.expirar_pagos_pendientes()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _n integer;
BEGIN
  UPDATE pagos p
  SET estado = 'expirado', updated_at = now()
  FROM appointments a
  WHERE a.id = p.appointment_id
    AND a.estado = 'pendiente_pago'
    AND p.estado IN ('pendiente', 'rechazado')
    AND p.expira_at < now();

  UPDATE appointments a
  SET estado = 'expirada'
  FROM pagos p
  WHERE p.appointment_id = a.id
    AND a.estado = 'pendiente_pago'
    AND p.estado = 'expirado';
  GET DIAGNOSTICS _n = ROW_COUNT;
  RETURN _n;
END;
$$;

REVOKE ALL ON FUNCTION public.registrar_pago_rapyd(uuid, text, text, text, numeric, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.expirar_pagos_pendientes() FROM PUBLIC, anon, authenticated;

-- ─── 5. Facturas mensuales de empresas ───────────────────────────────────────

CREATE TABLE IF NOT EXISTS facturas_empresa (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  periodo    date NOT NULL CHECK (extract(day FROM periodo) = 1),
  num_citas  integer NOT NULL DEFAULT 0,
  total      integer NOT NULL DEFAULT 0,
  estado     text NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'pagada')),
  numero     text,
  pdf_path   text,
  pagada_at  timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (empresa_id, periodo)
);

CREATE TABLE IF NOT EXISTS facturas_empresa_items (
  appointment_id uuid PRIMARY KEY REFERENCES appointments(id) ON DELETE CASCADE,
  factura_id     uuid NOT NULL REFERENCES facturas_empresa(id) ON DELETE CASCADE,
  valor          integer NOT NULL
);

ALTER TABLE facturas_empresa ENABLE ROW LEVEL SECURITY;
ALTER TABLE facturas_empresa_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "facturas_lectura" ON facturas_empresa;
CREATE POLICY "facturas_lectura" ON facturas_empresa
  FOR SELECT USING (empresa_id = auth.uid() OR is_admin());

DROP POLICY IF EXISTS "facturas_admin" ON facturas_empresa;
CREATE POLICY "facturas_admin" ON facturas_empresa
  FOR UPDATE USING (is_admin()) WITH CHECK (is_admin());

DROP POLICY IF EXISTS "facturas_items_lectura" ON facturas_empresa_items;
CREATE POLICY "facturas_items_lectura" ON facturas_empresa_items
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM facturas_empresa f WHERE f.id = factura_id AND (f.empresa_id = auth.uid() OR is_admin()))
  );

-- Crea o completa las facturas pendientes del mes. Incluye las citas agendadas
-- o atendidas con fecha en ese mes; las facturas ya pagadas no se modifican.
-- Se puede ejecutar varias veces. Devuelve cuántas facturas tiene el mes.
CREATE OR REPLACE FUNCTION public.generar_facturas_empresas(p_periodo date)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _inicio date := date_trunc('month', p_periodo)::date;
  _fin    date := (date_trunc('month', p_periodo) + interval '1 month')::date;
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

  INSERT INTO facturas_empresa (empresa_id, periodo)
  SELECT DISTINCT a.solicitante_id, _inicio
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

REVOKE ALL ON FUNCTION public.generar_facturas_empresas(date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.generar_facturas_empresas(date) TO authenticated;

-- PDF de la factura electrónica: facturas/<empresa_id>/<YYYY-MM>.pdf
INSERT INTO storage.buckets (id, name, public)
VALUES ('facturas', 'facturas', false)
ON CONFLICT (id) DO UPDATE SET public = false;

DROP POLICY IF EXISTS "facturas_pdf_admin" ON storage.objects;
CREATE POLICY "facturas_pdf_admin" ON storage.objects
  FOR ALL
  USING (bucket_id = 'facturas' AND public.is_admin())
  WITH CHECK (bucket_id = 'facturas' AND public.is_admin());

DROP POLICY IF EXISTS "facturas_pdf_empresa" ON storage.objects;
CREATE POLICY "facturas_pdf_empresa" ON storage.objects
  FOR SELECT
  USING (bucket_id = 'facturas' AND (storage.foldername(name))[1] = auth.uid()::text);

-- ─── 6. Pagos mensuales a las IPS ────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS liquidaciones_ips (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ips_id     uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  periodo    date NOT NULL CHECK (extract(day FROM periodo) = 1),
  num_citas  integer NOT NULL DEFAULT 0,
  total      integer NOT NULL DEFAULT 0,
  estado     text NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'pagada')),
  pagada_at  timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (ips_id, periodo)
);

CREATE TABLE IF NOT EXISTS liquidaciones_ips_items (
  appointment_id uuid PRIMARY KEY REFERENCES appointments(id) ON DELETE CASCADE,
  liquidacion_id uuid NOT NULL REFERENCES liquidaciones_ips(id) ON DELETE CASCADE,
  valor          integer NOT NULL
);

ALTER TABLE liquidaciones_ips ENABLE ROW LEVEL SECURITY;
ALTER TABLE liquidaciones_ips_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "liquidaciones_admin" ON liquidaciones_ips;
CREATE POLICY "liquidaciones_admin" ON liquidaciones_ips
  FOR ALL USING (is_admin()) WITH CHECK (is_admin());

DROP POLICY IF EXISTS "liquidaciones_items_admin" ON liquidaciones_ips_items;
CREATE POLICY "liquidaciones_items_admin" ON liquidaciones_ips_items
  FOR SELECT USING (is_admin());

-- Igual que las facturas, pero por IPS y con el precio base. Incluye las citas
-- de empresas y de particulares (estas solo quedan agendadas si se pagaron).
CREATE OR REPLACE FUNCTION public.generar_liquidaciones_ips(p_periodo date)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _inicio date := date_trunc('month', p_periodo)::date;
  _fin    date := (date_trunc('month', p_periodo) + interval '1 month')::date;
  _n      integer;
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'Solo el administrador puede generar los pagos a las IPS.';
  END IF;

  DELETE FROM liquidaciones_ips_items i
  USING liquidaciones_ips l, appointments a
  WHERE i.liquidacion_id = l.id AND l.periodo = _inicio AND l.estado = 'pendiente'
    AND a.id = i.appointment_id AND a.estado NOT IN ('agendada', 'atendida');

  INSERT INTO liquidaciones_ips (ips_id, periodo)
  SELECT DISTINCT a.ips_id, _inicio
  FROM appointments a
  JOIN citas_precios cp ON cp.appointment_id = a.id
  WHERE a.fecha >= _inicio AND a.fecha < _fin AND a.estado IN ('agendada', 'atendida')
    AND NOT EXISTS (SELECT 1 FROM liquidaciones_ips_items i WHERE i.appointment_id = a.id)
  ON CONFLICT (ips_id, periodo) DO NOTHING;

  INSERT INTO liquidaciones_ips_items (liquidacion_id, appointment_id, valor)
  SELECT l.id, a.id, cp.precio_ips
  FROM appointments a
  JOIN citas_precios cp ON cp.appointment_id = a.id
  JOIN liquidaciones_ips l ON l.ips_id = a.ips_id AND l.periodo = _inicio AND l.estado = 'pendiente'
  WHERE a.fecha >= _inicio AND a.fecha < _fin AND a.estado IN ('agendada', 'atendida')
  ON CONFLICT (appointment_id) DO NOTHING;

  UPDATE liquidaciones_ips l
  SET num_citas  = (SELECT count(*) FROM liquidaciones_ips_items i WHERE i.liquidacion_id = l.id),
      total      = COALESCE((SELECT sum(valor) FROM liquidaciones_ips_items i WHERE i.liquidacion_id = l.id), 0),
      updated_at = now()
  WHERE l.periodo = _inicio AND l.estado = 'pendiente';

  SELECT count(*) INTO _n FROM liquidaciones_ips WHERE periodo = _inicio;
  RETURN _n;
END;
$$;

REVOKE ALL ON FUNCTION public.generar_liquidaciones_ips(date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.generar_liquidaciones_ips(date) TO authenticated;

COMMIT;

-- ─── 7. Vencimiento automático cada minuto ───────────────────────────────────
-- pg_cron viene incluido en Supabase. Si este bloque falla, actívalo en
-- Dashboard → Database → Extensions → pg_cron y vuelve a ejecutar solo este bloque.
-- @cron-inicio
CREATE EXTENSION IF NOT EXISTS pg_cron;
SELECT cron.schedule('medcitas-expirar-pagos', '* * * * *', 'SELECT public.expirar_pagos_pendientes()');
-- @cron-fin
