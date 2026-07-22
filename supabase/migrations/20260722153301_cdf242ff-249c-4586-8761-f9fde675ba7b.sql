
DROP POLICY IF EXISTS shipment_tpl_insert ON public.shipment_excel_templates;
DROP POLICY IF EXISTS shipment_tpl_update ON public.shipment_excel_templates;
DROP POLICY IF EXISTS shipment_tpl_delete ON public.shipment_excel_templates;

CREATE POLICY shipment_tpl_insert ON public.shipment_excel_templates
  FOR INSERT TO authenticated
  WITH CHECK (public.is_super_admin() OR public.can_access_registre(registre_id));

CREATE POLICY shipment_tpl_update ON public.shipment_excel_templates
  FOR UPDATE TO authenticated
  USING (public.is_super_admin() OR public.can_access_registre(registre_id))
  WITH CHECK (public.is_super_admin() OR public.can_access_registre(registre_id));

CREATE POLICY shipment_tpl_delete ON public.shipment_excel_templates
  FOR DELETE TO authenticated
  USING (public.is_super_admin() OR public.can_access_registre(registre_id));
