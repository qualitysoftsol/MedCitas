-- ============================================================
-- MedCitas — Migration 012: PDF adjunto en resultados
-- Run in: Supabase Dashboard → SQL Editor → New query
-- ============================================================

-- 1. Nueva columna en resultados
ALTER TABLE resultados
  ADD COLUMN IF NOT EXISTS pdf_url text NOT NULL DEFAULT '';

-- 2. Bucket privado para PDFs de resultados
INSERT INTO storage.buckets (id, name, public)
VALUES ('resultados-pdfs', 'resultados-pdfs', false)
ON CONFLICT (id) DO UPDATE SET public = false;

-- 3. RLS: IPS owner y admin pueden escribir/eliminar
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
    AND policyname = 'resultados_pdf_ips_write'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY "resultados_pdf_ips_write" ON storage.objects
        FOR ALL
        USING (
          bucket_id = 'resultados-pdfs' AND (
            (storage.foldername(name))[1] = auth.uid()::text
            OR EXISTS (
              SELECT 1 FROM public.profiles
              WHERE id = auth.uid() AND role = 'admin'
            )
          )
        )
        WITH CHECK (
          bucket_id = 'resultados-pdfs' AND (
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

-- 4. RLS: IPS owner y admin pueden leer (solicitante accede via signed URL)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
    AND policyname = 'resultados_pdf_read'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY "resultados_pdf_read" ON storage.objects
        FOR SELECT
        USING (
          bucket_id = 'resultados-pdfs' AND (
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
