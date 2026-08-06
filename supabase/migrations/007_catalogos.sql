-- ============================================================
-- MedCitas — Catálogos + Clasificaciones IPS
-- Run in: Supabase Dashboard → SQL Editor → New query
-- ============================================================

-- 1. Nuevas tablas de catálogos
CREATE TABLE clasificaciones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre text NOT NULL UNIQUE,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE departamentos_medicos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre text NOT NULL UNIQUE,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE tipos_examen (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre text NOT NULL UNIQUE,
  roles_permitidos text[] NOT NULL DEFAULT ARRAY['empresa'::text, 'particular'::text],
  created_at timestamptz DEFAULT now()
);

-- 2. Columna clasificaciones en profiles
ALTER TABLE profiles ADD COLUMN clasificaciones text[];

-- 3. Cambiar tipo_examen de enum a text (para hacerlo dinámico)
ALTER TABLE appointments ALTER COLUMN tipo_examen TYPE text USING tipo_examen::text;
DROP TYPE tipo_examen_enum;

-- 4. RLS en nuevas tablas
ALTER TABLE clasificaciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE departamentos_medicos ENABLE ROW LEVEL SECURITY;
ALTER TABLE tipos_examen ENABLE ROW LEVEL SECURITY;

CREATE POLICY "catalogos_public_read" ON clasificaciones FOR SELECT USING (true);
CREATE POLICY "catalogos_admin_write" ON clasificaciones FOR ALL USING (is_admin());

CREATE POLICY "deptos_public_read" ON departamentos_medicos FOR SELECT USING (true);
CREATE POLICY "deptos_admin_write" ON departamentos_medicos FOR ALL USING (is_admin());

CREATE POLICY "tipos_public_read" ON tipos_examen FOR SELECT USING (true);
CREATE POLICY "tipos_admin_write" ON tipos_examen FOR ALL USING (is_admin());

-- 5. Seed: clasificaciones
INSERT INTO clasificaciones (nombre) VALUES
  ('Medicina Ocupacional'),
  ('Invalidez'),
  ('Rehabilitación'),
  ('Imágenes Diagnósticas');

-- 6. Seed: departamentos médicos comunes en medicina ocupacional colombiana
INSERT INTO departamentos_medicos (nombre) VALUES
  ('Medicina General'),
  ('Optometría'),
  ('Audiometría'),
  ('Psicología'),
  ('Medicina Ocupacional');

-- 7. Seed: tipos de examen con restricciones
INSERT INTO tipos_examen (nombre, roles_permitidos) VALUES
  ('Ingreso',   ARRAY['empresa'::text, 'particular'::text]),
  ('Anual',     ARRAY['empresa'::text, 'particular'::text]),
  ('Retiro',    ARRAY['empresa'::text]);

-- 8. Actualizar trigger para incluir clasificaciones
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (
    id, role, nombre, telefono, nit, cedula,
    departamento, ciudad, lat, lng, departamentos_medicos, clasificaciones
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
    END,
    CASE
      WHEN NEW.raw_user_meta_data->'clasificaciones' IS NOT NULL
      THEN ARRAY(SELECT jsonb_array_elements_text(NEW.raw_user_meta_data->'clasificaciones'))
      ELSE NULL
    END
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
