-- ============================================================
-- MedCitas — Migration 024: mensajes entre el administrador y las IPS
-- Run in: Supabase Dashboard → SQL Editor → New query
-- Requiere: 023 (en una consulta aparte). Después, desplegar la Edge Function
-- notify-mensajes (supabase functions deploy notify-mensajes).
--
-- 1. Conversaciones por tema entre el administrador y cada IPS, con sus
--    mensajes (solo texto). Un mensaje puede enlazar una cita o un resultado
--    de esa IPS. Cualquiera de los dos lados abre, cierra o reabre un tema; en
--    un tema cerrado no se escribe.
-- 2. Nadie edita ni borra mensajes ni conversaciones: no hay permisos de
--    INSERT, UPDATE ni DELETE. Todo se escribe con funciones que validan quién
--    escribe, en qué conversación y qué enlaza:
--      iniciar_conversacion · enviar_mensaje · marcar_conversacion_leida ·
--      cambiar_estado_conversacion
--    marcar_conversacion_leida solo llena leido_at (el "leído" del otro lado).
-- 3. Cada mensaje avisa en la campanita del otro lado. Por conversación queda
--    un solo aviso sin leer, con el último mensaje, y enlace a la conversación
--    (columna nueva notifications.enlace).
-- 4. Si un mensaje sigue sin leer 1 hora después, se manda un correo: pg_cron
--    revisa cada 5 minutos y llama a la Edge Function notify-mensajes. Es un
--    correo por conversación hasta que el otro lado la lea, y no incluye el
--    texto del mensaje.
-- 5. Tiempo real (Realtime) para conversaciones y mensajes.
-- ============================================================

BEGIN;

-- ─── 1. Tablas ───────────────────────────────────────────────────────────────

-- Las referencias no tienen ON DELETE CASCADE a propósito: el historial se
-- conserva, igual que las citas.
CREATE TABLE IF NOT EXISTS conversaciones (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ips_id            uuid NOT NULL REFERENCES profiles(id),
  asunto            text NOT NULL CHECK (length(trim(asunto)) BETWEEN 1 AND 150),
  estado            text NOT NULL DEFAULT 'abierta' CHECK (estado IN ('abierta', 'cerrada')),
  creada_por        uuid NOT NULL REFERENCES profiles(id),
  cerrada_por       uuid REFERENCES profiles(id),
  cerrada_at        timestamptz,
  ultimo_mensaje_at timestamptz NOT NULL DEFAULT now(),
  created_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS conversaciones_recientes ON conversaciones (ultimo_mensaje_at DESC);
CREATE INDEX IF NOT EXISTS conversaciones_ips ON conversaciones (ips_id, ultimo_mensaje_at DESC);

-- Para enlazar más cosas (p. ej. la factura del cobro a la IPS) se agrega otra
-- columna y se suma a la regla num_nonnulls.
CREATE TABLE IF NOT EXISTS mensajes (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversacion_id   uuid NOT NULL REFERENCES conversaciones(id),
  autor_id          uuid NOT NULL REFERENCES profiles(id),
  -- Lado que escribió: true = administrador, false = IPS.
  de_admin          boolean NOT NULL,
  cuerpo            text NOT NULL CHECK (length(trim(cuerpo)) BETWEEN 1 AND 4000),
  appointment_id    uuid REFERENCES appointments(id) ON DELETE SET NULL,
  resultado_id      uuid REFERENCES resultados(id) ON DELETE SET NULL,
  leido_at          timestamptz,
  correo_enviado_at timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT mensajes_un_enlace CHECK (num_nonnulls(appointment_id, resultado_id) <= 1)
);
CREATE INDEX IF NOT EXISTS mensajes_conversacion ON mensajes (conversacion_id, created_at);
CREATE INDEX IF NOT EXISTS mensajes_sin_leer ON mensajes (conversacion_id, de_admin) WHERE leido_at IS NULL;

-- Ruta a la que lleva el aviso de la campanita.
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS enlace text;
CREATE INDEX IF NOT EXISTS notifications_enlace ON notifications (user_id, enlace) WHERE enlace IS NOT NULL;

-- ─── 2. Quién ve qué ─────────────────────────────────────────────────────────

ALTER TABLE conversaciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE mensajes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "conversaciones_leer" ON conversaciones;
CREATE POLICY "conversaciones_leer" ON conversaciones
  FOR SELECT USING (ips_id = auth.uid() OR is_admin());

DROP POLICY IF EXISTS "mensajes_leer" ON mensajes;
CREATE POLICY "mensajes_leer" ON mensajes
  FOR SELECT USING (
    is_admin()
    OR EXISTS (SELECT 1 FROM conversaciones c WHERE c.id = mensajes.conversacion_id AND c.ips_id = auth.uid())
  );

-- Sin políticas de INSERT, UPDATE ni DELETE: el navegador solo lee.

-- ─── 3. Funciones ────────────────────────────────────────────────────────────

-- Lado del usuario actual: 'admin', 'ips' o NULL si su cuenta no usa el chat.
CREATE OR REPLACE FUNCTION public._lado_chat()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE role WHEN 'admin' THEN 'admin' WHEN 'ips' THEN 'ips' END
  FROM profiles WHERE id = auth.uid();
$$;

-- Pantalla de mensajes de un lado, abierta en una conversación.
CREATE OR REPLACE FUNCTION public._enlace_conversacion(p_lado text, p_conversacion_id uuid)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT format('/app/%s/mensajes?c=%s', p_lado, p_conversacion_id);
$$;

-- Conversación a la que el usuario actual tiene acceso, o error.
CREATE OR REPLACE FUNCTION public._conversacion_del_usuario(p_conversacion_id uuid, p_lado text)
RETURNS conversaciones
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _conv conversaciones;
BEGIN
  IF p_lado IS NULL THEN
    RAISE EXCEPTION 'Solo el administrador y las IPS pueden usar los mensajes.';
  END IF;
  SELECT * INTO _conv FROM conversaciones WHERE id = p_conversacion_id;
  IF NOT FOUND OR (p_lado = 'ips' AND _conv.ips_id <> auth.uid()) THEN
    RAISE EXCEPTION 'La conversación no existe.';
  END IF;
  RETURN _conv;
END;
$$;

-- Valida el texto y el enlace, guarda el mensaje y mueve la conversación arriba.
CREATE OR REPLACE FUNCTION public._insertar_mensaje(
  p_conversacion_id uuid,
  p_ips_id uuid,
  p_lado text,
  p_cuerpo text,
  p_appointment_id uuid,
  p_resultado_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _cuerpo text := trim(coalesce(p_cuerpo, ''));
  _id uuid;
BEGIN
  IF _cuerpo = '' THEN
    RAISE EXCEPTION 'Escribe un mensaje.';
  END IF;
  IF length(_cuerpo) > 4000 THEN
    RAISE EXCEPTION 'El mensaje no puede tener más de 4.000 caracteres.';
  END IF;
  IF p_appointment_id IS NOT NULL AND p_resultado_id IS NOT NULL THEN
    RAISE EXCEPTION 'Un mensaje solo puede enlazar una cita o un resultado.';
  END IF;
  IF p_appointment_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM appointments WHERE id = p_appointment_id AND ips_id = p_ips_id) THEN
    RAISE EXCEPTION 'La cita enlazada no es de esta IPS.';
  END IF;
  IF p_resultado_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM resultados WHERE id = p_resultado_id AND ips_id = p_ips_id) THEN
    RAISE EXCEPTION 'El resultado enlazado no es de esta IPS.';
  END IF;

  INSERT INTO mensajes (conversacion_id, autor_id, de_admin, cuerpo, appointment_id, resultado_id)
  VALUES (p_conversacion_id, auth.uid(), p_lado = 'admin', _cuerpo, p_appointment_id, p_resultado_id)
  RETURNING id INTO _id;

  UPDATE conversaciones SET ultimo_mensaje_at = now() WHERE id = p_conversacion_id;
  RETURN _id;
END;
$$;

-- Abre un tema con su primer mensaje. El administrador elige la IPS; para una
-- IPS siempre es ella misma (p_ips_id se ignora).
CREATE OR REPLACE FUNCTION public.iniciar_conversacion(
  p_asunto text,
  p_cuerpo text,
  p_ips_id uuid DEFAULT NULL,
  p_appointment_id uuid DEFAULT NULL,
  p_resultado_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _lado text := _lado_chat();
  _asunto text := trim(coalesce(p_asunto, ''));
  _ips uuid;
  _id uuid;
BEGIN
  IF _lado IS NULL THEN
    RAISE EXCEPTION 'Solo el administrador y las IPS pueden usar los mensajes.';
  END IF;
  IF _lado = 'ips' THEN
    _ips := auth.uid();
  ELSIF p_ips_id IS NULL OR NOT EXISTS (SELECT 1 FROM profiles WHERE id = p_ips_id AND role = 'ips') THEN
    RAISE EXCEPTION 'Elige la IPS con la que quieres hablar.';
  ELSE
    _ips := p_ips_id;
  END IF;
  IF _asunto = '' THEN
    RAISE EXCEPTION 'Escribe el asunto de la conversación.';
  END IF;
  IF length(_asunto) > 150 THEN
    RAISE EXCEPTION 'El asunto no puede tener más de 150 caracteres.';
  END IF;

  INSERT INTO conversaciones (ips_id, asunto, creada_por)
  VALUES (_ips, _asunto, auth.uid())
  RETURNING id INTO _id;

  PERFORM _insertar_mensaje(_id, _ips, _lado, p_cuerpo, p_appointment_id, p_resultado_id);
  RETURN _id;
END;
$$;

CREATE OR REPLACE FUNCTION public.enviar_mensaje(
  p_conversacion_id uuid,
  p_cuerpo text,
  p_appointment_id uuid DEFAULT NULL,
  p_resultado_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _lado text := _lado_chat();
  _conv conversaciones;
BEGIN
  _conv := _conversacion_del_usuario(p_conversacion_id, _lado);
  -- Bloquea la fila: nadie cierra la conversación mientras se guarda el mensaje.
  PERFORM 1 FROM conversaciones WHERE id = _conv.id FOR UPDATE;
  IF (SELECT estado FROM conversaciones WHERE id = _conv.id) <> 'abierta' THEN
    RAISE EXCEPTION 'La conversación está cerrada. Reábrela para escribir.';
  END IF;
  RETURN _insertar_mensaje(_conv.id, _conv.ips_id, _lado, p_cuerpo, p_appointment_id, p_resultado_id);
END;
$$;

-- Marca como leídos los mensajes del otro lado y el aviso de la campanita.
CREATE OR REPLACE FUNCTION public.marcar_conversacion_leida(p_conversacion_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _lado text := _lado_chat();
  _conv conversaciones;
  _n integer;
BEGIN
  _conv := _conversacion_del_usuario(p_conversacion_id, _lado);

  UPDATE mensajes SET leido_at = now()
  WHERE conversacion_id = _conv.id AND leido_at IS NULL AND de_admin = (_lado = 'ips');
  GET DIAGNOSTICS _n = ROW_COUNT;

  UPDATE notifications SET read = true
  WHERE user_id = auth.uid() AND enlace = _enlace_conversacion(_lado, _conv.id) AND NOT read;

  RETURN _n;
END;
$$;

CREATE OR REPLACE FUNCTION public.cambiar_estado_conversacion(p_conversacion_id uuid, p_estado text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _conv conversaciones;
BEGIN
  _conv := _conversacion_del_usuario(p_conversacion_id, _lado_chat());
  IF p_estado NOT IN ('abierta', 'cerrada') THEN
    RAISE EXCEPTION 'Estado no válido: %', p_estado;
  END IF;
  UPDATE conversaciones
  SET estado      = p_estado,
      cerrada_por = CASE WHEN p_estado = 'cerrada' THEN auth.uid() END,
      cerrada_at  = CASE WHEN p_estado = 'cerrada' THEN now() END
  WHERE id = _conv.id AND estado <> p_estado;
END;
$$;

-- ─── 4. Aviso en la campanita ────────────────────────────────────────────────

-- Reemplaza el aviso sin leer de la conversación (si lo hay) por uno con el
-- último mensaje: así la campanita no se llena y el aviso sube arriba.
CREATE OR REPLACE FUNCTION public.notificar_mensaje_nuevo()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _conv    conversaciones;
  _destino text := CASE WHEN NEW.de_admin THEN 'ips' ELSE 'admin' END;
  _enlace  text := _enlace_conversacion(_destino, NEW.conversacion_id);
  _autor   text;
  _texto   text := left(NEW.cuerpo, 140) || CASE WHEN length(NEW.cuerpo) > 140 THEN '…' ELSE '' END;
BEGIN
  SELECT * INTO _conv FROM conversaciones WHERE id = NEW.conversacion_id;
  _autor := CASE WHEN NEW.de_admin THEN 'Administrador MedCitas'
                 ELSE (SELECT nombre FROM profiles WHERE id = _conv.ips_id) END;

  DELETE FROM notifications n
  USING profiles p
  WHERE n.user_id = p.id AND n.enlace = _enlace AND NOT n.read
    AND CASE WHEN NEW.de_admin THEN p.id = _conv.ips_id ELSE p.role = 'admin' END;

  INSERT INTO notifications (user_id, tipo, titulo, mensaje, enlace)
  SELECT p.id, 'mensaje_nuevo', 'Mensaje nuevo — ' || _conv.asunto, _autor || ': ' || _texto, _enlace
  FROM profiles p
  WHERE CASE WHEN NEW.de_admin THEN p.id = _conv.ips_id ELSE p.role = 'admin' END;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS mensaje_notificar ON mensajes;
CREATE TRIGGER mensaje_notificar
  AFTER INSERT ON mensajes
  FOR EACH ROW
  EXECUTE FUNCTION notificar_mensaje_nuevo();

-- ─── 5. Correo cuando no se lee en 1 hora ────────────────────────────────────

-- Conversaciones (y lado que escribió) con mensajes sin leer de hace más de
-- 1 hora que aún no generaron correo. Si el otro lado ya recibió un correo de
-- esa conversación y todavía no la lee, no se le escribe otra vez.
CREATE OR REPLACE FUNCTION public._mensajes_por_avisar()
RETURNS TABLE (conversacion_id uuid, de_admin boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT m.conversacion_id, m.de_admin
  FROM mensajes m
  WHERE m.leido_at IS NULL
    AND m.correo_enviado_at IS NULL
    AND m.created_at < now() - interval '1 hour'
    AND NOT EXISTS (
      SELECT 1 FROM mensajes x
      WHERE x.conversacion_id = m.conversacion_id AND x.de_admin = m.de_admin
        AND x.leido_at IS NULL AND x.correo_enviado_at IS NOT NULL
    );
$$;

-- Para notify-mensajes: marca los mensajes como avisados y devuelve a quién
-- escribir. Al marcar en el mismo UPDATE, dos llamadas seguidas no duplican
-- el correo.
CREATE OR REPLACE FUNCTION public.reclamar_mensajes_para_correo()
RETURNS TABLE (conversacion_id uuid, de_admin boolean, sin_leer integer)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH marcados AS (
    UPDATE mensajes m SET correo_enviado_at = now()
    FROM _mensajes_por_avisar() p
    WHERE m.conversacion_id = p.conversacion_id AND m.de_admin = p.de_admin
      AND m.leido_at IS NULL AND m.correo_enviado_at IS NULL
    RETURNING m.conversacion_id, m.de_admin
  )
  SELECT k.conversacion_id, k.de_admin, count(*)::integer
  FROM marcados k
  GROUP BY k.conversacion_id, k.de_admin;
$$;

-- Lo llama pg_cron. Solo despierta la Edge Function si hay algo que avisar.
CREATE EXTENSION IF NOT EXISTS pg_net;

CREATE OR REPLACE FUNCTION public.disparar_correo_mensajes()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM _mensajes_por_avisar()) THEN
    PERFORM net.http_post(
      url     := 'https://qjujxdgtmmubvfrfrtax.supabase.co/functions/v1/notify-mensajes',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFqdWp4ZGd0bW11YnZmcmZydGF4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU5Nzk2NDUsImV4cCI6MjEwMTU1NTY0NX0.8Ab7OisH6krvPRtMw7-foHNbOOfYbcEzyDxc4WL13EI'
      ),
      body    := '{}'::jsonb
    );
  END IF;
END;
$$;

-- ─── 6. Permisos de las funciones ────────────────────────────────────────────

-- Supabase da EXECUTE a anon y authenticated en cada función nueva: se quita
-- en las internas y se deja solo a quien las usa.
REVOKE ALL ON FUNCTION public._lado_chat() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._conversacion_del_usuario(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._insertar_mensaje(uuid, uuid, text, text, uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._mensajes_por_avisar() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.disparar_correo_mensajes() FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.reclamar_mensajes_para_correo() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reclamar_mensajes_para_correo() TO service_role;

REVOKE ALL ON FUNCTION public.iniciar_conversacion(text, text, uuid, uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.enviar_mensaje(uuid, text, uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.marcar_conversacion_leida(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.cambiar_estado_conversacion(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.iniciar_conversacion(text, text, uuid, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.enviar_mensaje(uuid, text, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.marcar_conversacion_leida(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cambiar_estado_conversacion(uuid, text) TO authenticated;

-- ─── 7. Tiempo real ──────────────────────────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables
                 WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'conversaciones') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.conversaciones;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables
                 WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'mensajes') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.mensajes;
  END IF;
END;
$$;

COMMIT;

-- ─── 8. Revisión de correos cada 5 minutos ───────────────────────────────────
-- pg_cron ya está activo desde la migración 018. Si este bloque falla, actívalo
-- en Dashboard → Database → Extensions → pg_cron y vuelve a ejecutar solo este
-- bloque.
-- @cron-inicio
CREATE EXTENSION IF NOT EXISTS pg_cron;
SELECT cron.schedule('medcitas-correo-mensajes', '*/5 * * * *', 'SELECT public.disparar_correo_mensajes()');
-- @cron-fin
