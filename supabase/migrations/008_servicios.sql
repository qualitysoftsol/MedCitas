-- Rename table and add FK to clasificaciones
ALTER TABLE departamentos_medicos RENAME TO servicios;
ALTER TABLE servicios ADD COLUMN clasificacion_id uuid REFERENCES clasificaciones(id) ON DELETE SET NULL;

-- Rename column in profiles, drop clasificaciones column
ALTER TABLE profiles RENAME COLUMN departamentos_medicos TO servicios;
ALTER TABLE profiles DROP COLUMN clasificaciones;

-- Rename column in slots and appointments
ALTER TABLE slots RENAME COLUMN departamento_medico TO servicio;
ALTER TABLE appointments RENAME COLUMN departamento_medico TO servicio;

-- Update trigger handle_new_user to read 'servicios' instead of 'departamentos_medicos'
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (
    id, role, nombre, telefono, nit, cedula,
    departamento, ciudad, lat, lng, servicios
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
      WHEN NEW.raw_user_meta_data->'servicios' IS NOT NULL
      THEN ARRAY(SELECT jsonb_array_elements_text(NEW.raw_user_meta_data->'servicios'))
      ELSE NULL
    END
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
