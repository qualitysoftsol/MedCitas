-- ============================================================
-- MedCitas — Migration 021: Solicitar cita del particular
-- Run in: Supabase Dashboard → SQL Editor → New query
-- Requiere: 020. Justo después, desplegar la Edge Function rapyd-checkout
-- (supabase functions deploy rapyd-checkout).
-- Diseño: docs/superpowers/specs/2026-11-18-evaluaciones-multiprueba-design.md
--
-- 1. appointments.politica_aceptada_at: cuándo el particular aceptó la
--    política de tratamiento de datos (rapyd-checkout la exige y la registra).
-- 2. Las citas de particulares deben traer los datos de su tipo de evaluación:
--    crear_cita_interna los valida cuando llegan; este trigger rechaza la cita
--    si llegan vacíos. Las de empresas se exigen en la migración 022.
-- ============================================================

BEGIN;

ALTER TABLE appointments ADD COLUMN IF NOT EXISTS politica_aceptada_at timestamptz;

CREATE OR REPLACE FUNCTION exigir_datos_evaluacion()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.datos_evaluacion = '{}'::jsonb
     AND EXISTS (SELECT 1 FROM profiles WHERE id = NEW.solicitante_id AND role = 'particular') THEN
    RAISE EXCEPTION 'Faltan los datos de la evaluación.' USING HINT = 'DATOS_INVALIDOS';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS appointment_exigir_datos ON appointments;
CREATE TRIGGER appointment_exigir_datos
  BEFORE INSERT ON appointments
  FOR EACH ROW
  EXECUTE FUNCTION exigir_datos_evaluacion();

COMMIT;
