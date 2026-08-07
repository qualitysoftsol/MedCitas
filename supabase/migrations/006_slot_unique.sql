-- Prevent double-booking the same slot
ALTER TABLE appointments ADD CONSTRAINT appointments_slot_id_unique UNIQUE (slot_id);
