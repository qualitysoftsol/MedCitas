-- ============================================================
-- MedCitas — Migration 008: Make ips-fotos bucket public
-- Run in: Supabase Dashboard → SQL Editor → New query
-- ============================================================

-- Create the bucket if it doesn't exist, or make it public if it does
INSERT INTO storage.buckets (id, name, public)
VALUES ('ips-fotos', 'ips-fotos', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- Storage policies (idempotent)
DO $$
BEGIN
  -- Public read: anyone can view IPS photos
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'ips_fotos_public_read'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY "ips_fotos_public_read" ON storage.objects
        FOR SELECT USING (bucket_id = 'ips-fotos');
    $policy$;
  END IF;

  -- IPS writes to own folder, admin writes to any
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'ips_fotos_owner_write'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY "ips_fotos_owner_write" ON storage.objects
        FOR INSERT WITH CHECK (
          bucket_id = 'ips-fotos' AND (
            (storage.foldername(name))[1] = auth.uid()::text
            OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
          )
        );
    $policy$;
  END IF;

  -- IPS deletes from own folder, admin deletes from any
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'ips_fotos_owner_delete'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY "ips_fotos_owner_delete" ON storage.objects
        FOR DELETE USING (
          bucket_id = 'ips-fotos' AND (
            (storage.foldername(name))[1] = auth.uid()::text
            OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
          )
        );
    $policy$;
  END IF;
END;
$$;
