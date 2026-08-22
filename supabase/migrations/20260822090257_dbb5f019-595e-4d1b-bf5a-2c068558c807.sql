
CREATE OR REPLACE FUNCTION public.coop_subscription_active(_coop_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT public.is_super_admin() OR EXISTS (
    SELECT 1 FROM public.subscriptions s
    WHERE s.cooperative_id = _coop_id
      AND s.status IN ('trial','active')
      AND (s.end_date IS NULL OR s.end_date >= CURRENT_DATE)
  );
$$;

CREATE OR REPLACE FUNCTION public.can_write_registre(_registre_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT public.can_access_registre(_registre_id)
     AND (public.is_super_admin() OR EXISTS (
       SELECT 1 FROM public.registres r
       WHERE r.id = _registre_id
         AND public.coop_subscription_active(r.cooperative_id)
     ));
$$;

REVOKE ALL ON FUNCTION public.coop_subscription_active(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_write_registre(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.coop_subscription_active(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_write_registre(uuid) TO authenticated, service_role;

-- producers
DROP POLICY IF EXISTS producers_registre_insert ON public.producers;
CREATE POLICY producers_registre_insert ON public.producers FOR INSERT TO authenticated WITH CHECK (can_write_registre(registre_id));
DROP POLICY IF EXISTS producers_registre_update ON public.producers;
CREATE POLICY producers_registre_update ON public.producers FOR UPDATE TO authenticated USING (can_access_registre(registre_id)) WITH CHECK (can_write_registre(registre_id));

-- deliveries
DROP POLICY IF EXISTS deliveries_registre_insert ON public.deliveries;
CREATE POLICY deliveries_registre_insert ON public.deliveries FOR INSERT TO authenticated WITH CHECK (can_write_registre(registre_id));
DROP POLICY IF EXISTS deliveries_registre_update ON public.deliveries;
CREATE POLICY deliveries_registre_update ON public.deliveries FOR UPDATE TO authenticated USING (can_access_registre(registre_id)) WITH CHECK (can_write_registre(registre_id));

-- producer_registry
DROP POLICY IF EXISTS producer_registry_insert ON public.producer_registry;
CREATE POLICY producer_registry_insert ON public.producer_registry FOR INSERT TO authenticated WITH CHECK (can_write_registre(registre_id));
DROP POLICY IF EXISTS producer_registry_update ON public.producer_registry;
CREATE POLICY producer_registry_update ON public.producer_registry FOR UPDATE TO authenticated USING (can_access_registre(registre_id)) WITH CHECK (can_write_registre(registre_id));

-- producer_bonus_settings
DROP POLICY IF EXISTS pbs_insert ON public.producer_bonus_settings;
CREATE POLICY pbs_insert ON public.producer_bonus_settings FOR INSERT TO authenticated WITH CHECK (can_write_registre(registre_id));
DROP POLICY IF EXISTS pbs_update_admin ON public.producer_bonus_settings;
CREATE POLICY pbs_update_admin ON public.producer_bonus_settings FOR UPDATE TO authenticated USING (can_access_registre(registre_id) AND (is_super_admin() OR is_coop_admin())) WITH CHECK (can_write_registre(registre_id) AND (is_super_admin() OR is_coop_admin()));

-- producer_bonus_results
DROP POLICY IF EXISTS pbr_insert ON public.producer_bonus_results;
CREATE POLICY pbr_insert ON public.producer_bonus_results FOR INSERT TO authenticated WITH CHECK (can_write_registre(registre_id));
DROP POLICY IF EXISTS pbr_update_admin ON public.producer_bonus_results;
CREATE POLICY pbr_update_admin ON public.producer_bonus_results FOR UPDATE TO authenticated USING (can_access_registre(registre_id) AND (is_super_admin() OR is_coop_admin())) WITH CHECK (can_write_registre(registre_id) AND (is_super_admin() OR is_coop_admin()));

-- disabled_sections
DROP POLICY IF EXISTS disabled_sections_insert ON public.disabled_sections;
CREATE POLICY disabled_sections_insert ON public.disabled_sections FOR INSERT TO authenticated WITH CHECK (can_write_registre(registre_id));
DROP POLICY IF EXISTS disabled_sections_update_admin ON public.disabled_sections;
CREATE POLICY disabled_sections_update_admin ON public.disabled_sections FOR UPDATE TO authenticated USING (can_access_registre(registre_id) AND (is_super_admin() OR is_coop_admin())) WITH CHECK (can_write_registre(registre_id) AND (is_super_admin() OR is_coop_admin()));

-- projects
DROP POLICY IF EXISTS "Projects insert via registre" ON public.projects;
CREATE POLICY "Projects insert via registre" ON public.projects FOR INSERT TO authenticated WITH CHECK (is_super_admin() OR can_write_registre(registre_id));

-- shipment_excel_templates
DROP POLICY IF EXISTS shipment_tpl_insert ON public.shipment_excel_templates;
CREATE POLICY shipment_tpl_insert ON public.shipment_excel_templates FOR INSERT TO authenticated WITH CHECK (is_super_admin() OR can_write_registre(registre_id));

-- partners (scoped by cooperative)
DROP POLICY IF EXISTS partners_insert ON public.partners;
CREATE POLICY partners_insert ON public.partners FOR INSERT TO authenticated WITH CHECK (is_super_admin() OR (cooperative_id = ANY (my_cooperative_ids()) AND coop_subscription_active(cooperative_id)));
DROP POLICY IF EXISTS partners_update ON public.partners;
CREATE POLICY partners_update ON public.partners FOR UPDATE TO authenticated USING (is_super_admin() OR (cooperative_id = ANY (my_cooperative_ids()))) WITH CHECK (is_super_admin() OR (cooperative_id = ANY (my_cooperative_ids()) AND coop_subscription_active(cooperative_id)));
