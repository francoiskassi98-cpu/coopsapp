
CREATE POLICY "coop_logos_read" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'cooperative-logos');

CREATE POLICY "coop_logos_insert_super" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'cooperative-logos' AND public.is_super_admin());

CREATE POLICY "coop_logos_update_super" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'cooperative-logos' AND public.is_super_admin())
  WITH CHECK (bucket_id = 'cooperative-logos' AND public.is_super_admin());

CREATE POLICY "coop_logos_delete_super" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'cooperative-logos' AND public.is_super_admin());
