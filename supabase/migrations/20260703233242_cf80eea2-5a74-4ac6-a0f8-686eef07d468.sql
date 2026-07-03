DROP POLICY IF EXISTS "shipment-assets read authenticated" ON storage.objects;
DROP POLICY IF EXISTS "shipment-assets insert authenticated" ON storage.objects;
DROP POLICY IF EXISTS "shipment-assets update authenticated" ON storage.objects;
DROP POLICY IF EXISTS "shipment-assets delete authenticated" ON storage.objects;

CREATE POLICY "shipment-assets read by cooperative"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'shipment-assets' AND (
    public.is_super_admin()
    OR (
      (storage.foldername(name))[1] IS NOT NULL
      AND (
        CASE WHEN (storage.foldername(name))[1] ~ '^[0-9a-fA-F-]{36}$'
             THEN ((storage.foldername(name))[1])::uuid = ANY (public.my_cooperative_ids())
             ELSE false END
      )
    )
  )
);

CREATE POLICY "shipment-assets insert by cooperative"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'shipment-assets' AND (
    public.is_super_admin()
    OR (
      (storage.foldername(name))[1] IS NOT NULL
      AND (
        CASE WHEN (storage.foldername(name))[1] ~ '^[0-9a-fA-F-]{36}$'
             THEN ((storage.foldername(name))[1])::uuid = ANY (public.my_cooperative_ids())
             ELSE false END
      )
    )
  )
);

CREATE POLICY "shipment-assets update by cooperative"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'shipment-assets' AND (
    public.is_super_admin()
    OR (
      (storage.foldername(name))[1] IS NOT NULL
      AND (
        CASE WHEN (storage.foldername(name))[1] ~ '^[0-9a-fA-F-]{36}$'
             THEN ((storage.foldername(name))[1])::uuid = ANY (public.my_cooperative_ids())
             ELSE false END
      )
    )
  )
)
WITH CHECK (
  bucket_id = 'shipment-assets' AND (
    public.is_super_admin()
    OR (
      (storage.foldername(name))[1] IS NOT NULL
      AND (
        CASE WHEN (storage.foldername(name))[1] ~ '^[0-9a-fA-F-]{36}$'
             THEN ((storage.foldername(name))[1])::uuid = ANY (public.my_cooperative_ids())
             ELSE false END
      )
    )
  )
);

CREATE POLICY "shipment-assets delete by cooperative"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'shipment-assets' AND (
    public.is_super_admin()
    OR (
      (storage.foldername(name))[1] IS NOT NULL
      AND (
        CASE WHEN (storage.foldername(name))[1] ~ '^[0-9a-fA-F-]{36}$'
             THEN ((storage.foldername(name))[1])::uuid = ANY (public.my_cooperative_ids())
             ELSE false END
      )
    )
  )
);