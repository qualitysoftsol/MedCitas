-- ============================================================
-- MedCitas — Migration 010: Trigger para sincronizar slots.taken
-- al insertar o cancelar citas (bypasa RLS con SECURITY DEFINER)
-- ============================================================

CREATE OR REPLACE FUNCTION sync_slot_taken()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE slots SET taken = true WHERE id = NEW.slot_id;
  ELSIF TG_OP = 'UPDATE' AND NEW.estado = 'cancelada' AND OLD.estado <> 'cancelada' THEN
    UPDATE slots SET taken = false WHERE id = NEW.slot_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS appointment_slot_sync ON appointments;
CREATE TRIGGER appointment_slot_sync
  AFTER INSERT OR UPDATE ON appointments
  FOR EACH ROW
  EXECUTE FUNCTION sync_slot_taken();
