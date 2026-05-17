-- 1. RENAME ENUM
ALTER TYPE public.app_role RENAME VALUE 'user' TO 'agent';

-- 2. profiles.cooperative
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS cooperative text;
CREATE INDEX IF NOT EXISTS idx_profiles_cooperative ON public.profiles(cooperative);
CREATE INDEX IF NOT EXISTS idx_profiles_user_id ON public.profiles(user_id);

-- 3. handle_new_user
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (user_id, username, email)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'username', split_part(NEW.email, '@', 1)), NEW.email);
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'agent');
  RETURN NEW;
END; $$;

-- 4. HELPERS
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin');
$$;

CREATE OR REPLACE FUNCTION public.my_cooperative()
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT cooperative FROM public.profiles WHERE user_id = auth.uid() LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.my_cooperative_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT c.id FROM public.cooperatives c
  JOIN public.profiles p ON lower(p.cooperative) = lower(c.name)
  WHERE p.user_id = auth.uid() LIMIT 1;
$$;

REVOKE EXECUTE ON FUNCTION public.is_admin() FROM anon;
REVOKE EXECUTE ON FUNCTION public.my_cooperative() FROM anon;
REVOKE EXECUTE ON FUNCTION public.my_cooperative_id() FROM anon;

-- 5. DROP OLD POLICIES
DROP POLICY IF EXISTS "Auth select campaigns" ON public.campaigns;
DROP POLICY IF EXISTS "Auth insert campaigns" ON public.campaigns;
DROP POLICY IF EXISTS "Auth update campaigns" ON public.campaigns;
DROP POLICY IF EXISTS "Auth delete campaigns" ON public.campaigns;
DROP POLICY IF EXISTS "Auth select cooperatives" ON public.cooperatives;
DROP POLICY IF EXISTS "Auth insert cooperatives" ON public.cooperatives;
DROP POLICY IF EXISTS "Auth update cooperatives" ON public.cooperatives;
DROP POLICY IF EXISTS "Auth delete cooperatives" ON public.cooperatives;
DROP POLICY IF EXISTS "Auth select partners" ON public.partners;
DROP POLICY IF EXISTS "Auth insert partners" ON public.partners;
DROP POLICY IF EXISTS "Auth update partners" ON public.partners;
DROP POLICY IF EXISTS "Auth delete partners" ON public.partners;
DROP POLICY IF EXISTS "Auth select disabled_sections" ON public.disabled_sections;
DROP POLICY IF EXISTS "Auth insert disabled_sections" ON public.disabled_sections;
DROP POLICY IF EXISTS "Auth delete disabled_sections" ON public.disabled_sections;
DROP POLICY IF EXISTS "Auth select pr" ON public.producer_registry;
DROP POLICY IF EXISTS "Auth insert pr" ON public.producer_registry;
DROP POLICY IF EXISTS "Auth update pr" ON public.producer_registry;
DROP POLICY IF EXISTS "Auth delete pr" ON public.producer_registry;
DROP POLICY IF EXISTS "Auth select producers" ON public.producers;
DROP POLICY IF EXISTS "Auth insert producers" ON public.producers;
DROP POLICY IF EXISTS "Auth update producers" ON public.producers;
DROP POLICY IF EXISTS "Admins can delete producers" ON public.producers;
DROP POLICY IF EXISTS "Auth select shipments" ON public.shipments;
DROP POLICY IF EXISTS "Auth insert shipments" ON public.shipments;
DROP POLICY IF EXISTS "Auth update shipments" ON public.shipments;
DROP POLICY IF EXISTS "Auth select deliveries" ON public.deliveries;
DROP POLICY IF EXISTS "Auth insert deliveries" ON public.deliveries;
DROP POLICY IF EXISTS "Admins can delete deliveries" ON public.deliveries;
DROP POLICY IF EXISTS "Auth select rapports" ON public.rapports_envoyes;
DROP POLICY IF EXISTS "Auth insert rapports" ON public.rapports_envoyes;

-- 6. NEW POLICIES
CREATE POLICY "campaigns_read" ON public.campaigns FOR SELECT TO authenticated USING (true);
CREATE POLICY "campaigns_insert_admin" ON public.campaigns FOR INSERT TO authenticated WITH CHECK (public.is_admin());
CREATE POLICY "campaigns_update_admin" ON public.campaigns FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "campaigns_delete_admin" ON public.campaigns FOR DELETE TO authenticated USING (public.is_admin());

CREATE POLICY "coops_read" ON public.cooperatives FOR SELECT TO authenticated USING (true);
CREATE POLICY "coops_insert_admin" ON public.cooperatives FOR INSERT TO authenticated WITH CHECK (public.is_admin());
CREATE POLICY "coops_update_admin" ON public.cooperatives FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "coops_delete_admin" ON public.cooperatives FOR DELETE TO authenticated USING (public.is_admin());

CREATE POLICY "partners_read" ON public.partners FOR SELECT TO authenticated USING (true);
CREATE POLICY "partners_insert_admin" ON public.partners FOR INSERT TO authenticated WITH CHECK (public.is_admin());
CREATE POLICY "partners_update_admin" ON public.partners FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "partners_delete_admin" ON public.partners FOR DELETE TO authenticated USING (public.is_admin());

CREATE POLICY "ds_read" ON public.disabled_sections FOR SELECT TO authenticated
  USING (public.is_admin() OR lower(cooperative) = lower(public.my_cooperative()));
CREATE POLICY "ds_insert" ON public.disabled_sections FOR INSERT TO authenticated
  WITH CHECK (public.is_admin() OR lower(cooperative) = lower(public.my_cooperative()));
CREATE POLICY "ds_delete" ON public.disabled_sections FOR DELETE TO authenticated
  USING (public.is_admin() OR lower(cooperative) = lower(public.my_cooperative()));

CREATE POLICY "pr_read" ON public.producer_registry FOR SELECT TO authenticated
  USING (public.is_admin() OR lower(cooperative) = lower(public.my_cooperative()));
CREATE POLICY "pr_insert" ON public.producer_registry FOR INSERT TO authenticated
  WITH CHECK (public.is_admin() OR lower(cooperative) = lower(public.my_cooperative()));
CREATE POLICY "pr_update" ON public.producer_registry FOR UPDATE TO authenticated
  USING (public.is_admin() OR lower(cooperative) = lower(public.my_cooperative()))
  WITH CHECK (public.is_admin() OR lower(cooperative) = lower(public.my_cooperative()));
CREATE POLICY "pr_delete" ON public.producer_registry FOR DELETE TO authenticated
  USING (public.is_admin() OR lower(cooperative) = lower(public.my_cooperative()));

CREATE POLICY "prod_read" ON public.producers FOR SELECT TO authenticated
  USING (public.is_admin() OR lower(cooperative) = lower(public.my_cooperative()));
CREATE POLICY "prod_insert" ON public.producers FOR INSERT TO authenticated
  WITH CHECK (public.is_admin() OR lower(cooperative) = lower(public.my_cooperative()));
CREATE POLICY "prod_update" ON public.producers FOR UPDATE TO authenticated
  USING (public.is_admin() OR lower(cooperative) = lower(public.my_cooperative()))
  WITH CHECK (public.is_admin() OR lower(cooperative) = lower(public.my_cooperative()));
CREATE POLICY "prod_delete_admin" ON public.producers FOR DELETE TO authenticated USING (public.is_admin());

CREATE POLICY "shp_read" ON public.shipments FOR SELECT TO authenticated
  USING (public.is_admin() OR cooperative_id = public.my_cooperative_id());
CREATE POLICY "shp_insert" ON public.shipments FOR INSERT TO authenticated
  WITH CHECK (public.is_admin() OR cooperative_id = public.my_cooperative_id());
CREATE POLICY "shp_update" ON public.shipments FOR UPDATE TO authenticated
  USING (public.is_admin() OR cooperative_id = public.my_cooperative_id())
  WITH CHECK (public.is_admin() OR cooperative_id = public.my_cooperative_id());

CREATE POLICY "del_read" ON public.deliveries FOR SELECT TO authenticated
  USING (public.is_admin() OR EXISTS (SELECT 1 FROM public.shipments s WHERE s.id = deliveries.shipment_id AND s.cooperative_id = public.my_cooperative_id()));
CREATE POLICY "del_insert" ON public.deliveries FOR INSERT TO authenticated
  WITH CHECK (public.is_admin() OR EXISTS (SELECT 1 FROM public.shipments s WHERE s.id = deliveries.shipment_id AND s.cooperative_id = public.my_cooperative_id()));
CREATE POLICY "del_delete_admin" ON public.deliveries FOR DELETE TO authenticated USING (public.is_admin());

CREATE POLICY "rap_admin_all" ON public.rapports_envoyes FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- 7. CONSTRAINTS (NOT VALID — apply to new rows only, preserve legacy)
ALTER TABLE public.producer_registry DROP CONSTRAINT IF EXISTS pr_potentiel_positive;
ALTER TABLE public.producer_registry ADD CONSTRAINT pr_potentiel_positive CHECK (potentiel_livraison >= 0 AND potentiel_restant >= 0) NOT VALID;

ALTER TABLE public.producer_registry DROP CONSTRAINT IF EXISTS pr_nom_complet_nonempty;
ALTER TABLE public.producer_registry ADD CONSTRAINT pr_nom_complet_nonempty CHECK (length(btrim(nom_complet)) > 0) NOT VALID;

ALTER TABLE public.producer_registry DROP CONSTRAINT IF EXISTS pr_code_plantation_nonempty;
ALTER TABLE public.producer_registry ADD CONSTRAINT pr_code_plantation_nonempty CHECK (length(btrim(code_plantation)) > 0) NOT VALID;

CREATE INDEX IF NOT EXISTS idx_pr_cooperative ON public.producer_registry (lower(cooperative));
CREATE INDEX IF NOT EXISTS idx_pr_campaign ON public.producer_registry (campaign_id);

ALTER TABLE public.producers DROP CONSTRAINT IF EXISTS prod_potentiel_positive;
ALTER TABLE public.producers ADD CONSTRAINT prod_potentiel_positive CHECK (delivery_potential >= 0 AND remaining_potential >= 0) NOT VALID;

CREATE INDEX IF NOT EXISTS idx_prod_cooperative ON public.producers (lower(cooperative));

ALTER TABLE public.shipments DROP CONSTRAINT IF EXISTS shp_weights_positive;
ALTER TABLE public.shipments ADD CONSTRAINT shp_weights_positive CHECK (total_weight > 0 AND total_bags > 0 AND avg_bag_weight > 0) NOT VALID;

ALTER TABLE public.shipments DROP CONSTRAINT IF EXISTS shp_dates_coherent;
ALTER TABLE public.shipments ADD CONSTRAINT shp_dates_coherent CHECK (delivery_end >= delivery_start) NOT VALID;

CREATE INDEX IF NOT EXISTS idx_shp_cooperative ON public.shipments (cooperative_id);
CREATE INDEX IF NOT EXISTS idx_shp_campaign ON public.shipments (campaign_id);

ALTER TABLE public.deliveries DROP CONSTRAINT IF EXISTS del_weights_positive;
ALTER TABLE public.deliveries ADD CONSTRAINT del_weights_positive CHECK (net_weight > 0 AND num_bags > 0) NOT VALID;

CREATE INDEX IF NOT EXISTS idx_del_shipment ON public.deliveries (shipment_id);
CREATE INDEX IF NOT EXISTS idx_del_producer ON public.deliveries (producer_id);

-- 8. BUSINESS FUNCTIONS -> SECURITY INVOKER
CREATE OR REPLACE FUNCTION public.export_all_producers()
RETURNS TABLE(id uuid, full_name text, section text, plantation_code text, delivery_potential numeric, remaining_potential numeric, cooperative text, sexe text, is_active boolean)
LANGUAGE sql SECURITY INVOKER SET search_path = public AS $$
  SELECT id, full_name, section, plantation_code, delivery_potential, remaining_potential, cooperative, sexe, is_active
  FROM public.producers ORDER BY cooperative, section;
$$;

CREATE OR REPLACE FUNCTION public.export_all_deliveries()
RETURNS TABLE(id uuid, shipment_id uuid, producer_id uuid, receipt_number text, delivery_date date, net_weight numeric, num_bags integer, created_at timestamp with time zone)
LANGUAGE sql SECURITY INVOKER SET search_path = public AS $$
  SELECT id, shipment_id, producer_id, receipt_number, delivery_date, net_weight, num_bags, created_at
  FROM public.deliveries ORDER BY receipt_number;
$$;

CREATE OR REPLACE FUNCTION public.get_max_receipt_number(p_cooperative_id uuid)
RETURNS text LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT receipt_number FROM public.deliveries
  WHERE shipment_id IN (SELECT id FROM public.shipments WHERE cooperative_id = p_cooperative_id)
  AND receipt_number ~ '^\d+$'
  ORDER BY (receipt_number::bigint) DESC LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.get_active_campaign()
RETURNS public.campaigns LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT * FROM public.campaigns WHERE utilise_pour_chargement = true LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.get_remaining_potential_by_campaign(p_campaign_id uuid)
RETURNS TABLE(cooperative text, potentiel_total numeric, livre numeric, restant numeric)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT pr.cooperative, SUM(pr.potentiel_livraison),
    COALESCE((SELECT SUM(s.total_weight) FROM public.shipments s
      WHERE s.campaign_id = p_campaign_id AND s.is_cancelled = false
        AND EXISTS (SELECT 1 FROM public.cooperatives co WHERE co.id = s.cooperative_id AND co.name = pr.cooperative)
    ), 0),
    SUM(pr.potentiel_restant)
  FROM public.producer_registry pr
  WHERE pr.campaign_id = p_campaign_id
  GROUP BY pr.cooperative;
$$;

CREATE OR REPLACE FUNCTION public.get_dashboard_stats_by_campaign(p_campaign_id uuid)
RETURNS TABLE(potentiel_total numeric, poids_livre numeric, potentiel_restant numeric, nb_chargements bigint, nb_producteurs bigint)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT
    COALESCE((SELECT SUM(potentiel_livraison) FROM public.producer_registry WHERE campaign_id = p_campaign_id), 0),
    COALESCE((SELECT SUM(total_weight) FROM public.shipments WHERE campaign_id = p_campaign_id AND is_cancelled = false), 0),
    COALESCE((SELECT SUM(potentiel_restant) FROM public.producer_registry WHERE campaign_id = p_campaign_id), 0),
    (SELECT COUNT(*) FROM public.shipments WHERE campaign_id = p_campaign_id AND is_cancelled = false),
    (SELECT COUNT(*) FROM public.producer_registry WHERE campaign_id = p_campaign_id);
$$;

-- 9. REVOKE anon
REVOKE EXECUTE ON FUNCTION public.export_all_producers() FROM anon;
REVOKE EXECUTE ON FUNCTION public.export_all_deliveries() FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_max_receipt_number(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_active_campaign() FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_remaining_potential_by_campaign(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_dashboard_stats_by_campaign(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM anon;