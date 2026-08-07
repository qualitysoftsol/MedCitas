-- ============================================================
-- MedCitas — Auth Trigger (handle_new_user)
-- Run this third in: Supabase Dashboard → SQL Editor → New query
-- Expected result: "Success. No rows returned."
-- ============================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (
    id, role, nombre, telefono, nit, cedula,
    departamento, ciudad, lat, lng, departamentos_medicos
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
    CASE
      WHEN NEW.raw_user_meta_data->'departamentos_medicos' IS NOT NULL
      THEN ARRAY(SELECT jsonb_array_elements_text(NEW.raw_user_meta_data->'departamentos_medicos'))
      ELSE NULL
    END
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
