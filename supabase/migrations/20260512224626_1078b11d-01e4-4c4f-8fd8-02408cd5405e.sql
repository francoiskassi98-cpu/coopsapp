
-- ============ CAMPAIGNS TABLE ============
CREATE TABLE IF NOT EXISTS public.campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nom text NOT NULL UNIQUE,
  date_debut date NOT NULL,
  date_fin date NOT NULL,
  active boolean NOT NULL DEFAULT true,
  utilise_pour_chargement boolean NOT NULL DEFAULT false,
  archived boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT campaigns_nom_format CHECK (nom ~ '^\d{4}-\d{4}$')
);

-- Only one campaign can have utilise_pour_chargement = true
CREATE UNIQUE INDEX IF NOT EXISTS campaigns_one_active_chargement
  ON public.campaigns ((utilise_pour_chargement)) WHERE utilise_pour_chargement = true;

ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Auth select campaigns" ON public.campaigns FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth insert campaigns" ON public.campaigns FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Auth update campaigns" ON public.campaigns FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Auth delete campaigns" ON public.campaigns FOR DELETE TO authenticated USING (true);
-- Permissive for anon as well (demo mode currently in app)
CREATE POLICY "Anon select campaigns" ON public.campaigns FOR SELECT TO anon USING (true);
CREATE POLICY "Anon all campaigns" ON public.campaigns FOR ALL TO anon USING (true) WITH CHECK (true);

-- Trigger: when setting utilise_pour_chargement=true, unset others
CREATE OR REPLACE FUNCTION public.enforce_single_chargement_campaign()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NEW.utilise_pour_chargement = true THEN
    UPDATE public.campaigns
      SET utilise_pour_chargement = false
      WHERE id <> NEW.id AND utilise_pour_chargement = true;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_single_chargement ON public.campaigns;
CREATE TRIGGER trg_single_chargement
  BEFORE INSERT OR UPDATE OF utilise_pour_chargement ON public.campaigns
  FOR EACH ROW EXECUTE FUNCTION public.enforce_single_chargement_campaign();

-- ============ PRODUCER REGISTRY (per campaign) ============
CREATE TABLE IF NOT EXISTS public.producer_registry (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  cooperative text NOT NULL,
  nom_complet text NOT NULL,
  numero_producteur text,
  cni text,
  code_producteur text,
  section text NOT NULL,
  surface_cacao_totale numeric,
  code_plantation text NOT NULL,
  potentiel_livraison numeric NOT NULL DEFAULT 0,
  potentiel_restant numeric NOT NULL DEFAULT 0,
  latitude numeric,
  longitude numeric,
  sexe text,
  actif boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (campaign_id, code_plantation)
);

CREATE INDEX IF NOT EXISTS idx_pr_campaign ON public.producer_registry(campaign_id);
CREATE INDEX IF NOT EXISTS idx_pr_coop ON public.producer_registry(cooperative);

ALTER TABLE public.producer_registry ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth select pr" ON public.producer_registry FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth insert pr" ON public.producer_registry FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Auth update pr" ON public.producer_registry FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Auth delete pr" ON public.producer_registry FOR DELETE TO authenticated USING (true);
CREATE POLICY "Anon all pr" ON public.producer_registry FOR ALL TO anon USING (true) WITH CHECK (true);

-- ============ Add campaign_id to shipments & disabled_sections ============
ALTER TABLE public.shipments ADD COLUMN IF NOT EXISTS campaign_id uuid REFERENCES public.campaigns(id);
CREATE INDEX IF NOT EXISTS idx_shipments_campaign ON public.shipments(campaign_id);

ALTER TABLE public.disabled_sections ADD COLUMN IF NOT EXISTS campaign_id uuid REFERENCES public.campaigns(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_ds_campaign ON public.disabled_sections(campaign_id);

-- ============ BACKFILL campaigns from existing shipments ============
DO $$
DECLARE
  c text;
  y1 int;
  y2 int;
  new_id uuid;
BEGIN
  FOR c IN SELECT DISTINCT campaign FROM public.shipments WHERE campaign IS NOT NULL AND campaign ~ '^\d{4}-\d{4}$'
  LOOP
    y1 := split_part(c, '-', 1)::int;
    y2 := split_part(c, '-', 2)::int;
    INSERT INTO public.campaigns (nom, date_debut, date_fin, active, utilise_pour_chargement, archived)
    VALUES (c, make_date(y1, 9, 1), make_date(y2, 8, 31), true, false, false)
    ON CONFLICT (nom) DO NOTHING;
  END LOOP;

  -- Link shipments
  UPDATE public.shipments s
    SET campaign_id = ca.id
    FROM public.campaigns ca
    WHERE s.campaign_id IS NULL AND s.campaign = ca.nom;

  -- Mark most recent campaign as utilise_pour_chargement
  UPDATE public.campaigns SET utilise_pour_chargement = true
    WHERE id = (SELECT id FROM public.campaigns ORDER BY date_debut DESC LIMIT 1);
END $$;

-- ============ RPCs ============
CREATE OR REPLACE FUNCTION public.get_active_campaign()
RETURNS public.campaigns LANGUAGE sql STABLE SET search_path=public AS $$
  SELECT * FROM public.campaigns WHERE utilise_pour_chargement = true LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.get_dashboard_stats_by_campaign(p_campaign_id uuid)
RETURNS TABLE(
  potentiel_total numeric,
  poids_livre numeric,
  potentiel_restant numeric,
  nb_chargements bigint,
  nb_producteurs bigint
) LANGUAGE sql STABLE SET search_path=public AS $$
  SELECT
    COALESCE((SELECT SUM(potentiel_livraison) FROM producer_registry WHERE campaign_id = p_campaign_id), 0),
    COALESCE((SELECT SUM(total_weight) FROM shipments WHERE campaign_id = p_campaign_id AND is_cancelled = false), 0),
    COALESCE((SELECT SUM(potentiel_restant) FROM producer_registry WHERE campaign_id = p_campaign_id), 0),
    (SELECT COUNT(*) FROM shipments WHERE campaign_id = p_campaign_id AND is_cancelled = false),
    (SELECT COUNT(*) FROM producer_registry WHERE campaign_id = p_campaign_id);
$$;

CREATE OR REPLACE FUNCTION public.get_remaining_potential_by_campaign(p_campaign_id uuid)
RETURNS TABLE(cooperative text, potentiel_total numeric, livre numeric, restant numeric)
LANGUAGE sql STABLE SET search_path=public AS $$
  SELECT
    pr.cooperative,
    SUM(pr.potentiel_livraison),
    COALESCE((SELECT SUM(s.total_weight) FROM shipments s
      WHERE s.campaign_id = p_campaign_id AND s.is_cancelled = false
        AND EXISTS (SELECT 1 FROM cooperatives co WHERE co.id = s.cooperative_id AND co.name = pr.cooperative)
    ), 0),
    SUM(pr.potentiel_restant)
  FROM producer_registry pr
  WHERE pr.campaign_id = p_campaign_id
  GROUP BY pr.cooperative;
$$;

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.campaigns;
ALTER PUBLICATION supabase_realtime ADD TABLE public.producer_registry;
