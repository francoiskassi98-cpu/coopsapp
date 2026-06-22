
CREATE POLICY "Auth users read partner-logos" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'partner-logos');
CREATE POLICY "Auth users upload partner-logos" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'partner-logos');
CREATE POLICY "Auth users update partner-logos" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'partner-logos');
CREATE POLICY "Auth users delete partner-logos" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'partner-logos');
