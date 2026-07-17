
-- =========================================================================
-- LOT 1 : Refonte modèle métier — Coopérative → Registre
-- =========================================================================

-- 1) WIPE
TRUNCATE TABLE
  public.deliveries,
  public.shipments,
  public.producers,
  public.producer_registry,
  public.producer_bonus_results,
  public.producer_bonus_settings,
  public.shipment_excel_templates,
  public.partners,
  public.disabled_sections,
  public.audit_logs,
  public.notifications,
  public.rapports_envoyes,
  public.reports_ppt_history,
  public.login_events,
  public.campaigns
RESTART IDENTITY CASCADE;

-- 2) SUPPRESSION MODULE CAMPAGNES
ALTER TABLE public.shipments                DROP COLUMN IF EXISTS campaign_id CASCADE;
ALTER TABLE public.producer_registry        DROP COLUMN IF EXISTS campaign_id CASCADE;
ALTER TABLE public.producer_bonus_settings  DROP COLUMN IF EXISTS campaign_id CASCADE;
ALTER TABLE public.disabled_sections        DROP COLUMN IF EXISTS campaign_id CASCADE;
ALTER TABLE public.audit_logs               DROP COLUMN IF EXISTS campaign_id CASCADE;
ALTER TABLE public.reports_ppt_history      DROP COLUMN IF EXISTS campaign_id CASCADE;

DROP FUNCTION IF EXISTS public.get_active_campaign() CASCADE;
DROP FUNCTION IF EXISTS public.enforce_single_chargement_campaign() CASCADE;
DROP FUNCTION IF EXISTS public.get_remaining_potential_by_campaign(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.get_dashboard_stats_by_campaign(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.next_lot_number(uuid, uuid) CASCADE;

DROP TABLE IF EXISTS public.campaigns CASCADE;

-- 3) FONCTION CAMPAGNE AUTOMATIQUE
CREATE OR REPLACE FUNCTION public.compute_campaign_label(d timestamptz)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN EXTRACT(MONTH FROM d)::int >= 9
      THEN EXTRACT(YEAR FROM d)::int::text || '-' || (EXTRACT(YEAR FROM d)::int + 1)::text
    ELSE (EXTRACT(YEAR FROM d)::int - 1)::text || '-' || EXTRACT(YEAR FROM d)::int::text
  END;
$$;

CREATE OR REPLACE FUNCTION public.set_campaign_label_from_created()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.campaign_label IS NULL THEN
    NEW.campaign_label := public.compute_campaign_label(COALESCE(NEW.created_at, now()));
  END IF;
  RETURN NEW;
END; $$;

-- 4) TABLES REGISTRES
CREATE TABLE public.registres (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cooperative_id uuid NOT NULL REFERENCES public.cooperatives(id) ON DELETE CASCADE,
  name text NOT NULL,
  code text,
  responsable text,
  phone text,
  address text,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (cooperative_id, name)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.registres TO authenticated;
GRANT ALL ON public.registres TO service_role;
ALTER TABLE public.registres ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.user_registres (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  registre_id uuid NOT NULL REFERENCES public.registres(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, registre_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_registres TO authenticated;
GRANT ALL ON public.user_registres TO service_role;
ALTER TABLE public.user_registres ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER trg_registres_updated_at
  BEFORE UPDATE ON public.registres
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 5) HELPERS RLS
CREATE OR REPLACE FUNCTION public.my_registre_ids()
RETURNS uuid[] LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT CASE
    WHEN public.is_super_admin() THEN
      COALESCE((SELECT array_agg(id) FROM public.registres), ARRAY[]::uuid[])
    WHEN public.is_coop_admin() THEN
      COALESCE((
        SELECT array_agg(r.id) FROM public.registres r
        JOIN public.user_cooperatives uc ON uc.cooperative_id = r.cooperative_id
        WHERE uc.user_id = auth.uid()
      ), ARRAY[]::uuid[])
    ELSE
      COALESCE((SELECT array_agg(registre_id) FROM public.user_registres WHERE user_id = auth.uid()), ARRAY[]::uuid[])
  END;
$$;

CREATE OR REPLACE FUNCTION public.can_access_registre(_registre_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT _registre_id = ANY(public.my_registre_ids()); $$;

-- 6) RLS registres / user_registres
CREATE POLICY "registres_select" ON public.registres FOR SELECT TO authenticated
  USING (id = ANY(public.my_registre_ids()));
CREATE POLICY "registres_coop_admin_manage" ON public.registres FOR ALL TO authenticated
  USING (public.is_super_admin() OR (public.is_coop_admin() AND cooperative_id = ANY(public.my_cooperative_ids())))
  WITH CHECK (public.is_super_admin() OR (public.is_coop_admin() AND cooperative_id = ANY(public.my_cooperative_ids())));

CREATE POLICY "user_registres_select" ON public.user_registres FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_super_admin() OR public.is_coop_admin());
CREATE POLICY "user_registres_admin_manage" ON public.user_registres FOR ALL TO authenticated
  USING (public.is_super_admin() OR public.is_coop_admin())
  WITH CHECK (public.is_super_admin() OR public.is_coop_admin());

-- 7) TABLES MÉTIER
ALTER TABLE public.producers DROP COLUMN IF EXISTS cooperative CASCADE;
ALTER TABLE public.producers ADD COLUMN registre_id uuid NOT NULL REFERENCES public.registres(id) ON DELETE CASCADE;
ALTER TABLE public.producers ADD COLUMN campaign_label text NOT NULL;
CREATE INDEX idx_producers_registre ON public.producers(registre_id);
CREATE TRIGGER trg_producers_campaign BEFORE INSERT ON public.producers
  FOR EACH ROW EXECUTE FUNCTION public.set_campaign_label_from_created();

ALTER TABLE public.producer_registry DROP COLUMN IF EXISTS cooperative CASCADE;
ALTER TABLE public.producer_registry ADD COLUMN registre_id uuid NOT NULL REFERENCES public.registres(id) ON DELETE CASCADE;
ALTER TABLE public.producer_registry ADD COLUMN campaign_label text NOT NULL;
CREATE INDEX idx_producer_registry_registre ON public.producer_registry(registre_id);
CREATE TRIGGER trg_producer_registry_campaign BEFORE INSERT ON public.producer_registry
  FOR EACH ROW EXECUTE FUNCTION public.set_campaign_label_from_created();

ALTER TABLE public.shipments DROP COLUMN IF EXISTS cooperative_id CASCADE;
ALTER TABLE public.shipments RENAME COLUMN campaign TO campaign_label;
ALTER TABLE public.shipments ALTER COLUMN campaign_label DROP NOT NULL;
ALTER TABLE public.shipments ADD COLUMN registre_id uuid NOT NULL REFERENCES public.registres(id) ON DELETE CASCADE;
CREATE INDEX idx_shipments_registre ON public.shipments(registre_id);
CREATE TRIGGER trg_shipments_campaign BEFORE INSERT ON public.shipments
  FOR EACH ROW EXECUTE FUNCTION public.set_campaign_label_from_created();

ALTER TABLE public.deliveries ADD COLUMN registre_id uuid NOT NULL REFERENCES public.registres(id) ON DELETE CASCADE;
ALTER TABLE public.deliveries ADD COLUMN campaign_label text NOT NULL;
CREATE INDEX idx_deliveries_registre ON public.deliveries(registre_id);
CREATE TRIGGER trg_deliveries_campaign BEFORE INSERT ON public.deliveries
  FOR EACH ROW EXECUTE FUNCTION public.set_campaign_label_from_created();

ALTER TABLE public.partners DROP COLUMN IF EXISTS cooperative_id CASCADE;
ALTER TABLE public.partners ADD COLUMN registre_id uuid NOT NULL REFERENCES public.registres(id) ON DELETE CASCADE;
CREATE INDEX idx_partners_registre ON public.partners(registre_id);

ALTER TABLE public.disabled_sections DROP COLUMN IF EXISTS cooperative CASCADE;
ALTER TABLE public.disabled_sections ADD COLUMN registre_id uuid NOT NULL REFERENCES public.registres(id) ON DELETE CASCADE;
ALTER TABLE public.disabled_sections ADD COLUMN campaign_label text NOT NULL;
CREATE INDEX idx_disabled_sections_registre ON public.disabled_sections(registre_id);
CREATE TRIGGER trg_disabled_sections_campaign BEFORE INSERT ON public.disabled_sections
  FOR EACH ROW EXECUTE FUNCTION public.set_campaign_label_from_created();

ALTER TABLE public.producer_bonus_settings DROP COLUMN IF EXISTS cooperative_id CASCADE;
ALTER TABLE public.producer_bonus_settings ADD COLUMN registre_id uuid NOT NULL REFERENCES public.registres(id) ON DELETE CASCADE;
ALTER TABLE public.producer_bonus_settings ADD COLUMN campaign_label text NOT NULL;
CREATE INDEX idx_pbs_registre ON public.producer_bonus_settings(registre_id);
CREATE TRIGGER trg_pbs_campaign BEFORE INSERT ON public.producer_bonus_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_campaign_label_from_created();

ALTER TABLE public.producer_bonus_results DROP COLUMN IF EXISTS cooperative_id CASCADE;
ALTER TABLE public.producer_bonus_results ADD COLUMN registre_id uuid NOT NULL REFERENCES public.registres(id) ON DELETE CASCADE;
ALTER TABLE public.producer_bonus_results ADD COLUMN campaign_label text NOT NULL;
CREATE INDEX idx_pbr_registre ON public.producer_bonus_results(registre_id);
CREATE TRIGGER trg_pbr_campaign BEFORE INSERT ON public.producer_bonus_results
  FOR EACH ROW EXECUTE FUNCTION public.set_campaign_label_from_created();

ALTER TABLE public.shipment_excel_templates DROP COLUMN IF EXISTS cooperative_id CASCADE;
ALTER TABLE public.shipment_excel_templates ADD COLUMN registre_id uuid NOT NULL REFERENCES public.registres(id) ON DELETE CASCADE;
CREATE INDEX idx_set_registre ON public.shipment_excel_templates(registre_id);

ALTER TABLE public.audit_logs         DROP COLUMN IF EXISTS cooperative;
ALTER TABLE public.audit_logs         ADD COLUMN registre text;
ALTER TABLE public.audit_logs         ADD COLUMN campaign_label text;
ALTER TABLE public.reports_ppt_history DROP COLUMN IF EXISTS cooperatives;
ALTER TABLE public.reports_ppt_history ADD COLUMN registres text[];
ALTER TABLE public.reports_ppt_history ADD COLUMN campaign_label text;

-- 8) NOUVELLES POLICIES (scope registre)
CREATE POLICY "producers_registre_access" ON public.producers FOR ALL TO authenticated
  USING (public.can_access_registre(registre_id)) WITH CHECK (public.can_access_registre(registre_id));
CREATE POLICY "producer_registry_registre_access" ON public.producer_registry FOR ALL TO authenticated
  USING (public.can_access_registre(registre_id)) WITH CHECK (public.can_access_registre(registre_id));
CREATE POLICY "shipments_registre_access" ON public.shipments FOR ALL TO authenticated
  USING (public.can_access_registre(registre_id)) WITH CHECK (public.can_access_registre(registre_id));
CREATE POLICY "deliveries_registre_access" ON public.deliveries FOR ALL TO authenticated
  USING (public.can_access_registre(registre_id)) WITH CHECK (public.can_access_registre(registre_id));
CREATE POLICY "partners_registre_access" ON public.partners FOR ALL TO authenticated
  USING (public.can_access_registre(registre_id)) WITH CHECK (public.can_access_registre(registre_id));
CREATE POLICY "disabled_sections_registre_access" ON public.disabled_sections FOR ALL TO authenticated
  USING (public.can_access_registre(registre_id)) WITH CHECK (public.can_access_registre(registre_id));
CREATE POLICY "pbs_registre_access" ON public.producer_bonus_settings FOR ALL TO authenticated
  USING (public.can_access_registre(registre_id)) WITH CHECK (public.can_access_registre(registre_id));
CREATE POLICY "pbr_registre_access" ON public.producer_bonus_results FOR ALL TO authenticated
  USING (public.can_access_registre(registre_id)) WITH CHECK (public.can_access_registre(registre_id));
CREATE POLICY "set_registre_access" ON public.shipment_excel_templates FOR ALL TO authenticated
  USING (public.can_access_registre(registre_id)) WITH CHECK (public.can_access_registre(registre_id));

-- 9) RPC
CREATE OR REPLACE FUNCTION public.next_lot_number(p_registre uuid, p_campaign_label text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_max int; v_next int;
BEGIN
  SELECT COALESCE(MAX( NULLIF(regexp_replace(lot_number,'\D','','g'),'')::int ), 0)
    INTO v_max
  FROM public.shipments
  WHERE registre_id = p_registre AND campaign_label = p_campaign_label AND lot_number IS NOT NULL;
  v_next := v_max + 1;
  RETURN 'LOT-' || lpad(v_next::text, 4, '0');
END; $$;

CREATE OR REPLACE FUNCTION public.get_dashboard_stats_by_registre(p_registre_id uuid, p_campaign_label text DEFAULT NULL)
RETURNS TABLE(potentiel_total numeric, poids_livre numeric, potentiel_restant numeric, nb_chargements bigint, nb_producteurs bigint)
LANGUAGE sql STABLE SET search_path = public
AS $$
  SELECT
    COALESCE((SELECT SUM(potentiel_livraison) FROM public.producer_registry
              WHERE registre_id = p_registre_id AND (p_campaign_label IS NULL OR campaign_label = p_campaign_label)), 0),
    COALESCE((SELECT SUM(total_weight) FROM public.shipments
              WHERE registre_id = p_registre_id AND is_cancelled = false AND (p_campaign_label IS NULL OR campaign_label = p_campaign_label)), 0),
    COALESCE((SELECT SUM(potentiel_restant) FROM public.producer_registry
              WHERE registre_id = p_registre_id AND (p_campaign_label IS NULL OR campaign_label = p_campaign_label)), 0),
    (SELECT COUNT(*) FROM public.shipments
     WHERE registre_id = p_registre_id AND is_cancelled = false AND (p_campaign_label IS NULL OR campaign_label = p_campaign_label)),
    (SELECT COUNT(*) FROM public.producer_registry
     WHERE registre_id = p_registre_id AND (p_campaign_label IS NULL OR campaign_label = p_campaign_label));
$$;

DROP FUNCTION IF EXISTS public.export_all_producers();
CREATE OR REPLACE FUNCTION public.export_all_producers()
RETURNS TABLE(id uuid, full_name text, section text, plantation_code text, delivery_potential numeric, remaining_potential numeric, registre_id uuid, sexe text, is_active boolean)
LANGUAGE sql SET search_path = public
AS $$
  SELECT id, full_name, section, plantation_code, delivery_potential, remaining_potential, registre_id, sexe, is_active
  FROM public.producers ORDER BY registre_id, section;
$$;

DROP FUNCTION IF EXISTS public.get_max_receipt_number(uuid);
CREATE OR REPLACE FUNCTION public.get_max_receipt_number(p_registre_id uuid)
RETURNS text LANGUAGE sql STABLE SET search_path = public
AS $$
  SELECT receipt_number FROM public.deliveries
  WHERE registre_id = p_registre_id AND receipt_number ~ '^\d+$'
  ORDER BY (receipt_number::bigint) DESC LIMIT 1;
$$;
