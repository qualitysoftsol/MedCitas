-- ============================================================
-- MedCitas — Migration 014: permitir volver a reservar un horario cancelado
-- Run in: Supabase Dashboard → SQL Editor → New query
--
-- La restricción de 006 (UNIQUE (slot_id)) incluía las citas canceladas.
-- Al cancelar, el trigger de 010 libera el horario (slots.taken = false),
-- pero cualquier nueva reserva de ese slot fallaba con 23505 porque la
-- cita cancelada seguía ocupando el slot_id. El cupo quedaba perdido.
--
-- Se reemplaza por un índice único parcial: sigue impidiendo dos citas
-- activas (agendada o atendida) en el mismo horario, pero ignora las
-- canceladas. Una cita cancelada no puede volver a activarse si el horario
-- ya fue tomado por otra persona (el índice lo rechaza).
--
-- Seguro de ejecutar: con la restricción anterior no pueden existir
-- duplicados, así que el índice se crea sin conflictos.
-- ============================================================

BEGIN;

ALTER TABLE appointments DROP CONSTRAINT IF EXISTS appointments_slot_id_unique;

CREATE UNIQUE INDEX IF NOT EXISTS appointments_slot_id_activa_unique
  ON appointments (slot_id)
  WHERE estado <> 'cancelada';

COMMIT;
