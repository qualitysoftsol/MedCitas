-- ============================================================
-- MedCitas — Admin Profile Insert
-- Run this fourth in: Supabase Dashboard → SQL Editor → New query
--
-- BEFORE running this:
--   1. Go to Supabase Dashboard → Authentication → Users
--   2. Click "Add user" → "Create new user"
--   3. Enter your admin email and a strong password → "Create user"
--
-- THEN replace 'admin@medcitas.co' below with your actual admin email
-- and run the query.
-- ============================================================

-- Insert admin profile manually
-- (the trigger does NOT run for users created via the dashboard UI)
INSERT INTO profiles (id, role, nombre)
SELECT id, 'admin', 'Administrador General'
FROM auth.users
WHERE email = 'admin@medcitas.co';  -- <-- CHANGE THIS to your actual admin email
