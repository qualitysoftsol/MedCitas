-- ============================================================
-- MedCitas — Migration 011: Empresa document fields
-- Run in: Supabase Dashboard → SQL Editor → New query
-- ============================================================

-- 1. New columns on profiles
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS rut_url text,
  ADD COLUMN IF NOT EXISTS camara_comercio_url text,
  ADD COLUMN IF NOT EXISTS contacto_rrhh_telefono text,
  ADD COLUMN IF NOT EXISTS contacto_rrhh_email text,
  ADD COLUMN IF NOT EXISTS contacto_contabilidad_telefono text,
  ADD COLUMN IF NOT EXISTS contacto_contabilidad_email text;

-- 2. Private storage bucket for empresa documents
INSERT INTO storage.buckets (id, name, public)
VALUES ('empresa-docs', 'empresa-docs', false)
ON CONFLICT (id) DO UPDATE SET public = false;

-- 3. RLS policy: empresa owner + admin can read/write
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
    AND policyname = 'empresa_docs_owner_all'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY "empresa_docs_owner_all" ON storage.objects
        FOR ALL
        USING (
          bucket_id = 'empresa-docs' AND (
            (storage.foldername(name))[1] = auth.uid()::text
            OR EXISTS (
              SELECT 1 FROM public.profiles
              WHERE id = auth.uid() AND role = 'admin'
            )
          )
        )
        WITH CHECK (
          bucket_id = 'empresa-docs' AND (
            (storage.foldername(name))[1] = auth.uid()::text
            OR EXISTS (
              SELECT 1 FROM public.profiles
              WHERE id = auth.uid() AND role = 'admin'
            )
          )
        );
    $policy$;
  END IF;
END;
$$;
