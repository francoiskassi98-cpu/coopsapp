
DROP POLICY IF EXISTS shipments_insert ON public.shipments;
CREATE POLICY shipments_insert ON public.shipments FOR INSERT TO authenticated WITH CHECK (can_write_registre(registre_id));
DROP POLICY IF EXISTS shipments_update ON public.shipments;
CREATE POLICY shipments_update ON public.shipments FOR UPDATE TO authenticated USING (can_access_registre(registre_id)) WITH CHECK (can_write_registre(registre_id));
