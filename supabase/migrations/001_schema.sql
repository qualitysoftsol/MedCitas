-- ============================================================
-- MedCitas — Schema Migration
-- Run this first in: Supabase Dashboard → SQL Editor → New query
-- Expected result: "Success. No rows returned."
-- ============================================================

-- Enums
CREATE TYPE user_role AS ENUM ('admin', 'ips', 'empresa', 'particular');
CREATE TYPE tipo_examen_enum AS ENUM ('ingreso', 'anual', 'retiro');
CREATE TYPE appointment_estado AS ENUM ('agendada', 'atendida', 'cancelada');
CREATE TYPE apto_status AS ENUM ('apto', 'apto_restricciones', 'no_apto');
CREATE TYPE notification_tipo AS ENUM ('cita_agendada', 'cita_cancelada', 'resultado_cargado');

-- Profiles (extends auth.users)
CREATE TABLE profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role user_role NOT NULL,
  nombre text NOT NULL,
  telefono text,
  direccion text,
  descripcion text,
  nit text,
  cedula text,
  departamento text,
  ciudad text,
  lat float8,
  lng float8,
  departamentos_medicos text[],
  created_at timestamptz DEFAULT now()
);

-- IPS Photos (max 5 per IPS)
CREATE TABLE ips_fotos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ips_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  url text NOT NULL,
  orden int2 NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- Slots
CREATE TABLE slots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ips_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  fecha date NOT NULL,
  hora time NOT NULL,
  departamento_medico text NOT NULL,
  ciudad text NOT NULL,
  taken boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- Appointments
CREATE TABLE appointments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slot_id uuid NOT NULL REFERENCES slots(id),
  ips_id uuid NOT NULL REFERENCES profiles(id),
  solicitante_id uuid NOT NULL REFERENCES profiles(id),
  empleado_nombre text NOT NULL,
  empleado_cedula text NOT NULL,
  tipo_examen tipo_examen_enum NOT NULL,
  fecha date NOT NULL,
  hora time NOT NULL,
  ciudad text NOT NULL,
  departamento_medico text NOT NULL,
  estado appointment_estado NOT NULL DEFAULT 'agendada',
  created_at timestamptz DEFAULT now()
);

-- Resultados
CREATE TABLE resultados (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id uuid NOT NULL REFERENCES appointments(id),
  solicitante_id uuid NOT NULL REFERENCES profiles(id),
  ips_id uuid NOT NULL REFERENCES profiles(id),
  empleado_nombre text NOT NULL,
  empleado_cedula text NOT NULL,
  fecha date NOT NULL,
  diagnostico text NOT NULL,
  apto apto_status NOT NULL,
  observaciones text NOT NULL DEFAULT '',
  created_at timestamptz DEFAULT now()
);

-- Notifications
CREATE TABLE notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  tipo notification_tipo NOT NULL,
  titulo text NOT NULL,
  mensaje text NOT NULL,
  read boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now()
);
