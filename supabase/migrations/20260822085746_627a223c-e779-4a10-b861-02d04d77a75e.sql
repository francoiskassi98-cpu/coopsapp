
-- disabled_sections
DROP POLICY IF EXISTS disabled_sections_registre_access ON public.disabled_sections;
CREATE POLICY disabled_sections_select ON public.disabled_sections FOR SELECT TO authenticated USING (can_access_registre(registre_id));
CREATE POLICY disabled_sections_insert ON public.disabled_sections FOR INSERT TO authenticated WITH CHECK (can_access_registre(registre_id));
CREATE POLICY disabled_sections_update_admin ON public.disabled_sections FOR UPDATE TO authenticated USING (can_access_registre(registre_id) AND (is_super_admin() OR is_coop_admin())) WITH CHECK (can_access_registre(registre_id) AND (is_super_admin() OR is_coop_admin()));
CREATE POLICY disabled_sections_delete_admin ON public.disabled_sections FOR DELETE TO authenticated USING (can_access_registre(registre_id) AND (is_super_admin() OR is_coop_admin()));

-- producer_bonus_results
DROP POLICY IF EXISTS pbr_registre_access ON public.producer_bonus_results;
CREATE POLICY pbr_insert ON public.producer_bonus_results FOR INSERT TO authenticated WITH CHECK (can_access_registre(registre_id));
CREATE POLICY pbr_update_admin ON public.producer_bonus_results FOR UPDATE TO authenticated USING (can_access_registre(registre_id) AND (is_super_admin() OR is_coop_admin())) WITH CHECK (can_access_registre(registre_id) AND (is_super_admin() OR is_coop_admin()));
CREATE POLICY pbr_delete_admin ON public.producer_bonus_results FOR DELETE TO authenticated USING (can_access_registre(registre_id) AND (is_super_admin() OR is_coop_admin()));

-- shipment_excel_templates
DROP POLICY IF EXISTS set_registre_access ON public.shipment_excel_templates;
DROP POLICY IF EXISTS shipment_tpl_update ON public.shipment_excel_templates;
DROP POLICY IF EXISTS shipment_tpl_delete ON public.shipment_excel_templates;
CREATE POLICY shipment_tpl_select ON public.shipment_excel_templates FOR SELECT TO authenticated USING (is_super_admin() OR can_access_registre(registre_id));
CREATE POLICY shipment_tpl_update_admin ON public.shipment_excel_templates FOR UPDATE TO authenticated USING (is_super_admin() OR (can_access_registre(registre_id) AND is_coop_admin())) WITH CHECK (is_super_admin() OR (can_access_registre(registre_id) AND is_coop_admin()));
CREATE POLICY shipment_tpl_delete_admin ON public.shipment_excel_templates FOR DELETE TO authenticated USING (is_super_admin() OR (can_access_registre(registre_id) AND is_coop_admin()));
