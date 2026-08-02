-- PARTNERS
DROP POLICY IF EXISTS partners_registre_access ON public.partners;
CREATE POLICY partners_select ON public.partners FOR SELECT TO authenticated USING (public.can_access_registre(registre_id));
CREATE POLICY partners_insert ON public.partners FOR INSERT TO authenticated WITH CHECK (public.can_access_registre(registre_id));
CREATE POLICY partners_update ON public.partners FOR UPDATE TO authenticated USING (public.can_access_registre(registre_id)) WITH CHECK (public.can_access_registre(registre_id));
CREATE POLICY partners_delete_admin ON public.partners FOR DELETE TO authenticated USING (public.can_access_registre(registre_id) AND (public.is_super_admin() OR public.is_coop_admin()));

-- PRODUCER BONUS SETTINGS
DROP POLICY IF EXISTS pbs_registre_access ON public.producer_bonus_settings;
CREATE POLICY pbs_select ON public.producer_bonus_settings FOR SELECT TO authenticated USING (public.can_access_registre(registre_id));
CREATE POLICY pbs_insert ON public.producer_bonus_settings FOR INSERT TO authenticated WITH CHECK (public.can_access_registre(registre_id));
CREATE POLICY pbs_update_admin ON public.producer_bonus_settings FOR UPDATE TO authenticated USING (public.can_access_registre(registre_id) AND (public.is_super_admin() OR public.is_coop_admin())) WITH CHECK (public.can_access_registre(registre_id) AND (public.is_super_admin() OR public.is_coop_admin()));
CREATE POLICY pbs_delete_admin ON public.producer_bonus_settings FOR DELETE TO authenticated USING (public.can_access_registre(registre_id) AND (public.is_super_admin() OR public.is_coop_admin()));

-- PRODUCER REGISTRY
DROP POLICY IF EXISTS producer_registry_registre_access ON public.producer_registry;
CREATE POLICY producer_registry_select ON public.producer_registry FOR SELECT TO authenticated USING (public.can_access_registre(registre_id));
CREATE POLICY producer_registry_insert ON public.producer_registry FOR INSERT TO authenticated WITH CHECK (public.can_access_registre(registre_id));
CREATE POLICY producer_registry_update ON public.producer_registry FOR UPDATE TO authenticated USING (public.can_access_registre(registre_id)) WITH CHECK (public.can_access_registre(registre_id));
CREATE POLICY producer_registry_delete_admin ON public.producer_registry FOR DELETE TO authenticated USING (public.can_access_registre(registre_id) AND (public.is_super_admin() OR public.is_coop_admin()));

-- SHIPMENTS
DROP POLICY IF EXISTS shipments_registre_access ON public.shipments;
CREATE POLICY shipments_select ON public.shipments FOR SELECT TO authenticated USING (public.can_access_registre(registre_id));
CREATE POLICY shipments_insert ON public.shipments FOR INSERT TO authenticated WITH CHECK (public.can_access_registre(registre_id));
CREATE POLICY shipments_update ON public.shipments FOR UPDATE TO authenticated USING (public.can_access_registre(registre_id)) WITH CHECK (public.can_access_registre(registre_id));
CREATE POLICY shipments_delete_admin ON public.shipments FOR DELETE TO authenticated USING (public.can_access_registre(registre_id) AND (public.is_super_admin() OR public.is_coop_admin()));