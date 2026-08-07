-- ============================================================
-- MedCitas — Migration 007: Update handle_new_user trigger
-- Adds direccion to profile insert, fixes servicios metadata key
-- Run in: Supabase Dashboard → SQL Editor → New query
-- ============================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
DECLARE
  servicios_arr text[];
BEGIN
  -- Support both 'servicios' (current) and legacy 'departamentos_medicos' metadata keys
  servicios_arr := CASE
    WHEN NEW.raw_user_meta_data->'servicios' IS NOT NULL
    THEN ARRAY(SELECT jsonb_array_elements_text(NEW.raw_user_meta_data->'servicios'))
    WHEN NEW.raw_user_meta_data->'departamentos_medicos' IS NOT NULL
    THEN ARRAY(SELECT jsonb_array_elements_text(NEW.raw_user_meta_data->'departamentos_medicos'))
    ELSE NULL
  END;

  INSERT INTO public.profiles (
    id, role, nombre, telefono, nit, cedula,
    departamento, ciudad, lat, lng, direccion, servicios
  ) VALUES (
    NEW.id,
    (NEW.raw_user_meta_data->>'role')::user_role,
    COALESCE(NEW.raw_user_meta_data->>'nombre', 'Sin nombre'),
    NEW.raw_user_meta_data->>'telefono',
    NEW.raw_user_meta_data->>'nit',
    NEW.raw_user_meta_data->>'cedula',
    NEW.raw_user_meta_data->>'departamento',
    NEW.raw_user_meta_data->>'ciudad',
    NULLIF(NEW.raw_user_meta_data->>'lat', '')::float8,
    NULLIF(NEW.raw_user_meta_data->>'lng', '')::float8,
    NEW.raw_user_meta_data->>'direccion',
    servicios_arr
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
