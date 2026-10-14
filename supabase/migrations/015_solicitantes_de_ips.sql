-- ============================================================
-- MedCitas — Migration 015: la IPS puede ver quién solicitó cada cita
-- Run in: Supabase Dashboard → SQL Editor → New query
--
-- La regla `ips_profiles_public` (002) solo deja leer perfiles de IPS y el
-- propio, así que una IPS no podía ver el nombre de la empresa o el particular
-- que agendó cada cita (la columna "Empresa" salía siempre vacía).
--
-- En lugar de abrir la tabla `profiles` (expondría teléfono, NIT, dirección,
-- documentos y contactos), esta función devuelve SOLO id, nombre y tipo de
-- cuenta de quienes tienen citas con la IPS que la consulta. El admin recibe
-- todos los solicitantes con citas.
-- ============================================================

CREATE OR REPLACE FUNCTION public.solicitantes_de_ips()
RETURNS TABLE (id uuid, nombre text, role text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT p.id, p.nombre, p.role::text
  FROM profiles p
  JOIN appointments a ON a.solicitante_id = p.id
  WHERE a.ips_id = auth.uid() OR is_admin();
$$;

REVOKE ALL ON FUNCTION public.solicitantes_de_ips() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.solicitantes_de_ips() TO authenticated;
