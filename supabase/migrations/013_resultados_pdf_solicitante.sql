-- ============================================================
-- MedCitas — Migration 013: el solicitante puede leer el PDF de sus resultados
-- Run in: Supabase Dashboard → SQL Editor → New query
--
-- La política de 012 solo deja leer el bucket `resultados-pdfs` a la IPS dueña
-- de la carpeta y al admin. `createSignedUrl` se ejecuta con los permisos del
-- usuario que la pide, así que un particular o una empresa no podía generar el
-- enlace para ver o descargar su propio resultado.
--
-- Esta política añade lectura (solo SELECT) para el solicitante del resultado
-- cuyo `pdf_url` coincide con el objeto. No cambia la escritura.
-- ============================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
    AND policyname = 'resultados_pdf_solicitante_read'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY "resultados_pdf_solicitante_read" ON storage.objects
        FOR SELECT
        USING (
          bucket_id = 'resultados-pdfs'
          AND EXISTS (
            SELECT 1 FROM public.resultados r
            WHERE r.pdf_url = storage.objects.name
              AND r.solicitante_id = auth.uid()
          )
        );
    $policy$;
  END IF;
END;
$$;
