
-- ============ producer_bonus_settings ============
CREATE TABLE public.producer_bonus_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cooperative_id uuid NOT NULL REFERENCES public.cooperatives(id) ON DELETE CASCADE,
  campaign_id uuid REFERENCES public.campaigns(id) ON DELETE SET NULL,
  section text,
  start_date date NOT NULL,
  end_date date NOT NULL,
  bonus_type text NOT NULL CHECK (bonus_type IN ('total','per_kg')),
  amount numeric NOT NULL CHECK (amount >= 0),
  label text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.producer_bonus_settings TO authenticated;
GRANT ALL ON public.producer_bonus_settings TO service_role;
ALTER TABLE public.producer_bonus_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "bonus_settings_select" ON public.producer_bonus_settings FOR SELECT TO authenticated
  USING (public.is_super_admin() OR cooperative_id = ANY(public.my_cooperative_ids()));
CREATE POLICY "bonus_settings_insert" ON public.producer_bonus_settings FOR INSERT TO authenticated
  WITH CHECK (public.is_super_admin() OR cooperative_id = ANY(public.my_cooperative_ids()));
CREATE POLICY "bonus_settings_update" ON public.producer_bonus_settings FOR UPDATE TO authenticated
  USING (public.is_super_admin() OR cooperative_id = ANY(public.my_cooperative_ids()))
  WITH CHECK (public.is_super_admin() OR cooperative_id = ANY(public.my_cooperative_ids()));
CREATE POLICY "bonus_settings_delete" ON public.producer_bonus_settings FOR DELETE TO authenticated
  USING (public.is_super_admin() OR cooperative_id = ANY(public.my_cooperative_ids()));
CREATE TRIGGER trg_bonus_settings_updated BEFORE UPDATE ON public.producer_bonus_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ producer_bonus_results ============
CREATE TABLE public.producer_bonus_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  setting_id uuid REFERENCES public.producer_bonus_settings(id) ON DELETE CASCADE,
  producer_id uuid NOT NULL REFERENCES public.producers(id) ON DELETE CASCADE,
  cooperative_id uuid NOT NULL REFERENCES public.cooperatives(id) ON DELETE CASCADE,
  volume_delivered numeric NOT NULL DEFAULT 0,
  rate numeric NOT NULL DEFAULT 0,
  calculated_bonus numeric NOT NULL DEFAULT 0,
  period_start date NOT NULL,
  period_end date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.producer_bonus_results TO authenticated;
GRANT ALL ON public.producer_bonus_results TO service_role;
ALTER TABLE public.producer_bonus_results ENABLE ROW LEVEL SECURITY;
CREATE POLICY "bonus_results_select" ON public.producer_bonus_results FOR SELECT TO authenticated
  USING (public.is_super_admin() OR cooperative_id = ANY(public.my_cooperative_ids()));
CREATE POLICY "bonus_results_insert" ON public.producer_bonus_results FOR INSERT TO authenticated
  WITH CHECK (public.is_super_admin() OR cooperative_id = ANY(public.my_cooperative_ids()));
CREATE POLICY "bonus_results_update" ON public.producer_bonus_results FOR UPDATE TO authenticated
  USING (public.is_super_admin() OR cooperative_id = ANY(public.my_cooperative_ids()))
  WITH CHECK (public.is_super_admin() OR cooperative_id = ANY(public.my_cooperative_ids()));
CREATE POLICY "bonus_results_delete" ON public.producer_bonus_results FOR DELETE TO authenticated
  USING (public.is_super_admin() OR cooperative_id = ANY(public.my_cooperative_ids()));
CREATE INDEX idx_bonus_results_setting ON public.producer_bonus_results(setting_id);
CREATE INDEX idx_bonus_results_producer ON public.producer_bonus_results(producer_id);

-- ============ shipment_excel_templates ============
CREATE TABLE public.shipment_excel_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cooperative_id uuid NOT NULL REFERENCES public.cooperatives(id) ON DELETE CASCADE,
  template_name text NOT NULL DEFAULT 'Modèle par défaut',
  is_default boolean NOT NULL DEFAULT false,
  title text DEFAULT 'FICHE DE CHARGEMENT',
  subtitle text,
  slogan text,
  coop_logo_url text,
  partner_logo_url text,
  logo_position text NOT NULL DEFAULT 'left' CHECK (logo_position IN ('left','center','right','split')),
  custom_header text,
  custom_footer text,
  show_driver boolean NOT NULL DEFAULT true,
  show_truck boolean NOT NULL DEFAULT true,
  show_trailer boolean NOT NULL DEFAULT true,
  show_bill_of_lading boolean NOT NULL DEFAULT true,
  show_destination boolean NOT NULL DEFAULT true,
  show_project boolean NOT NULL DEFAULT true,
  show_partner boolean NOT NULL DEFAULT true,
  show_departure_date boolean NOT NULL DEFAULT true,
  show_num_bags boolean NOT NULL DEFAULT true,
  show_total_weight boolean NOT NULL DEFAULT true,
  show_num_producers boolean NOT NULL DEFAULT true,
  show_partner_logo boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.shipment_excel_templates TO authenticated;
GRANT ALL ON public.shipment_excel_templates TO service_role;
ALTER TABLE public.shipment_excel_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "shipment_tpl_select" ON public.shipment_excel_templates FOR SELECT TO authenticated
  USING (public.is_super_admin() OR cooperative_id = ANY(public.my_cooperative_ids()));
CREATE POLICY "shipment_tpl_insert" ON public.shipment_excel_templates FOR INSERT TO authenticated
  WITH CHECK (public.is_super_admin());
CREATE POLICY "shipment_tpl_update" ON public.shipment_excel_templates FOR UPDATE TO authenticated
  USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());
CREATE POLICY "shipment_tpl_delete" ON public.shipment_excel_templates FOR DELETE TO authenticated
  USING (public.is_super_admin());
CREATE TRIGGER trg_shipment_tpl_updated BEFORE UPDATE ON public.shipment_excel_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE UNIQUE INDEX uniq_shipment_tpl_default ON public.shipment_excel_templates(cooperative_id) WHERE is_default = true;
