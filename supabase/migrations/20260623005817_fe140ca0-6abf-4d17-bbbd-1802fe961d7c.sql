
CREATE POLICY "shipment-assets read authenticated"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'shipment-assets');

CREATE POLICY "shipment-assets insert authenticated"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'shipment-assets');

CREATE POLICY "shipment-assets update authenticated"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'shipment-assets')
WITH CHECK (bucket_id = 'shipment-assets');

CREATE POLICY "shipment-assets delete authenticated"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'shipment-assets');
