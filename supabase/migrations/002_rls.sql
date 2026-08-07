-- ============================================================
-- MedCitas — Row Level Security Policies
-- Run this second in: Supabase Dashboard → SQL Editor → New query
-- Expected result: "Success. No rows returned."
-- ============================================================

-- Enable RLS on all tables
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE ips_fotos ENABLE ROW LEVEL SECURITY;
ALTER TABLE slots ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE resultados ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- Helper: is the current user an admin?
CREATE OR REPLACE FUNCTION is_admin()
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
  );
$$ LANGUAGE sql SECURITY DEFINER;

-- profiles: IPS are public, others see only themselves. Admin sees all.
CREATE POLICY "ips_profiles_public" ON profiles
  FOR SELECT USING (role = 'ips' OR id = auth.uid() OR is_admin());

CREATE POLICY "user_updates_own_profile" ON profiles
  FOR UPDATE USING (id = auth.uid() OR is_admin());

-- ips_fotos: public read, owner + admin write
CREATE POLICY "fotos_public_read" ON ips_fotos
  FOR SELECT USING (true);

CREATE POLICY "ips_manages_own_fotos" ON ips_fotos
  FOR ALL USING (ips_id = auth.uid() OR is_admin());

-- slots: public read, IPS owner writes
CREATE POLICY "slots_public_read" ON slots
  FOR SELECT USING (true);

CREATE POLICY "ips_manages_own_slots" ON slots
  FOR ALL USING (ips_id = auth.uid() OR is_admin());

-- appointments: solicitante + IPS see their own
CREATE POLICY "appointments_read" ON appointments
  FOR SELECT USING (solicitante_id = auth.uid() OR ips_id = auth.uid() OR is_admin());

CREATE POLICY "solicitante_books" ON appointments
  FOR INSERT WITH CHECK (
    solicitante_id = auth.uid() AND
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('empresa', 'particular'))
  );

CREATE POLICY "ips_or_solicitante_updates" ON appointments
  FOR UPDATE USING (ips_id = auth.uid() OR solicitante_id = auth.uid() OR is_admin());

-- resultados: IPS + solicitante see their own; IPS inserts
CREATE POLICY "resultados_read" ON resultados
  FOR SELECT USING (solicitante_id = auth.uid() OR ips_id = auth.uid() OR is_admin());

CREATE POLICY "ips_inserts_resultado" ON resultados
  FOR INSERT WITH CHECK (ips_id = auth.uid());

-- notifications: private per user
CREATE POLICY "notifications_own" ON notifications
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "notifications_update_own" ON notifications
  FOR UPDATE USING (user_id = auth.uid());
