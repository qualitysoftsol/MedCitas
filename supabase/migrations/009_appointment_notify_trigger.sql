-- ============================================================
-- MedCitas — Migration 009: Trigger para notificar por email
-- al agendar o cancelar una cita via Edge Function notify-appointment
-- ============================================================

-- pg_net viene habilitado en Supabase en el schema 'net'
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Función trigger: llama la Edge Function via HTTP asíncrono
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
  -- INSERT: siempre notificar cita nueva
  -- UPDATE: solo notificar cuando el estado cambia a 'cancelada'
  IF TG_OP = 'INSERT'
    OR (TG_OP = 'UPDATE' AND NEW.estado = 'cancelada' AND OLD.estado <> 'cancelada')
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

-- Trigger: AFTER INSERT OR UPDATE en appointments (idempotente)
DROP TRIGGER IF EXISTS appointment_notify ON appointments;
CREATE TRIGGER appointment_notify
  AFTER INSERT OR UPDATE ON appointments
  FOR EACH ROW
  EXECUTE FUNCTION notify_appointment_on_change();
