
-- 1) Table de liaison user <-> cooperatives (many-to-many)
CREATE TABLE IF NOT EXISTS public.user_cooperatives (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  cooperative text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, cooperative)
);

CREATE INDEX IF NOT EXISTS idx_user_cooperatives_user ON public.user_cooperatives(user_id);
CREATE INDEX IF NOT EXISTS idx_user_cooperatives_coop ON public.user_cooperatives(lower(cooperative));

ALTER TABLE public.user_cooperatives ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS uc_admin_all ON public.user_cooperatives;
CREATE POLICY uc_admin_all ON public.user_cooperatives
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS uc_self_read ON public.user_cooperatives;
CREATE POLICY uc_self_read ON public.user_cooperatives
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- 2) Migration des données existantes
INSERT INTO public.user_cooperatives (user_id, cooperative)
SELECT user_id, cooperative FROM public.profiles
WHERE cooperative IS NOT NULL AND btrim(cooperative) <> ''
ON CONFLICT (user_id, cooperative) DO NOTHING;

-- 3) Helpers : tableaux des coopératives autorisées du caller
CREATE OR REPLACE FUNCTION public.my_cooperative_names()
RETURNS text[]
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(array_agg(lower(cooperative)), ARRAY[]::text[])
  FROM public.user_cooperatives
  WHERE user_id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.my_cooperative_ids()
RETURNS uuid[]
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(array_agg(c.id), ARRAY[]::uuid[])
  FROM public.cooperatives c
  JOIN public.user_cooperatives uc
    ON lower(uc.cooperative) = lower(c.name)
  WHERE uc.user_id = auth.uid();
$$;

REVOKE EXECUTE ON FUNCTION public.my_cooperative_names() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.my_cooperative_ids() FROM anon, public;
GRANT EXECUTE ON FUNCTION public.my_cooperative_names() TO authenticated;
GRANT EXECUTE ON FUNCTION public.my_cooperative_ids() TO authenticated;

-- 4) RLS producer_registry
DROP POLICY IF EXISTS pr_read ON public.producer_registry;
DROP POLICY IF EXISTS pr_insert ON public.producer_registry;
DROP POLICY IF EXISTS pr_update ON public.producer_registry;
DROP POLICY IF EXISTS pr_delete ON public.producer_registry;
CREATE POLICY pr_read ON public.producer_registry FOR SELECT TO authenticated
  USING (public.is_admin() OR lower(cooperative) = ANY(public.my_cooperative_names()));
CREATE POLICY pr_insert ON public.producer_registry FOR INSERT TO authenticated
  WITH CHECK (public.is_admin() OR lower(cooperative) = ANY(public.my_cooperative_names()));
CREATE POLICY pr_update ON public.producer_registry FOR UPDATE TO authenticated
  USING (public.is_admin() OR lower(cooperative) = ANY(public.my_cooperative_names()))
  WITH CHECK (public.is_admin() OR lower(cooperative) = ANY(public.my_cooperative_names()));
CREATE POLICY pr_delete ON public.producer_registry FOR DELETE TO authenticated
  USING (public.is_admin() OR lower(cooperative) = ANY(public.my_cooperative_names()));

-- 5) RLS producers
DROP POLICY IF EXISTS prod_read ON public.producers;
DROP POLICY IF EXISTS prod_insert ON public.producers;
DROP POLICY IF EXISTS prod_update ON public.producers;
DROP POLICY IF EXISTS prod_delete_admin ON public.producers;
CREATE POLICY prod_read ON public.producers FOR SELECT TO authenticated
  USING (public.is_admin() OR lower(cooperative) = ANY(public.my_cooperative_names()));
CREATE POLICY prod_insert ON public.producers FOR INSERT TO authenticated
  WITH CHECK (public.is_admin() OR lower(cooperative) = ANY(public.my_cooperative_names()));
CREATE POLICY prod_update ON public.producers FOR UPDATE TO authenticated
  USING (public.is_admin() OR lower(cooperative) = ANY(public.my_cooperative_names()))
  WITH CHECK (public.is_admin() OR lower(cooperative) = ANY(public.my_cooperative_names()));
CREATE POLICY prod_delete_admin ON public.producers FOR DELETE TO authenticated
  USING (public.is_admin());

-- 6) RLS shipments
DROP POLICY IF EXISTS shp_read ON public.shipments;
DROP POLICY IF EXISTS shp_insert ON public.shipments;
DROP POLICY IF EXISTS shp_update ON public.shipments;
CREATE POLICY shp_read ON public.shipments FOR SELECT TO authenticated
  USING (public.is_admin() OR cooperative_id = ANY(public.my_cooperative_ids()));
CREATE POLICY shp_insert ON public.shipments FOR INSERT TO authenticated
  WITH CHECK (public.is_admin() OR cooperative_id = ANY(public.my_cooperative_ids()));
CREATE POLICY shp_update ON public.shipments FOR UPDATE TO authenticated
  USING (public.is_admin() OR cooperative_id = ANY(public.my_cooperative_ids()))
  WITH CHECK (public.is_admin() OR cooperative_id = ANY(public.my_cooperative_ids()));

-- 7) RLS deliveries
DROP POLICY IF EXISTS del_read ON public.deliveries;
DROP POLICY IF EXISTS del_insert ON public.deliveries;
CREATE POLICY del_read ON public.deliveries FOR SELECT TO authenticated
  USING (
    public.is_admin() OR EXISTS (
      SELECT 1 FROM public.shipments s
      WHERE s.id = deliveries.shipment_id
        AND s.cooperative_id = ANY(public.my_cooperative_ids())
    )
  );
CREATE POLICY del_insert ON public.deliveries FOR INSERT TO authenticated
  WITH CHECK (
    public.is_admin() OR EXISTS (
      SELECT 1 FROM public.shipments s
      WHERE s.id = deliveries.shipment_id
        AND s.cooperative_id = ANY(public.my_cooperative_ids())
    )
  );

-- 8) RLS disabled_sections
DROP POLICY IF EXISTS ds_read ON public.disabled_sections;
DROP POLICY IF EXISTS ds_insert ON public.disabled_sections;
DROP POLICY IF EXISTS ds_delete ON public.disabled_sections;
CREATE POLICY ds_read ON public.disabled_sections FOR SELECT TO authenticated
  USING (public.is_admin() OR lower(cooperative) = ANY(public.my_cooperative_names()));
CREATE POLICY ds_insert ON public.disabled_sections FOR INSERT TO authenticated
  WITH CHECK (public.is_admin() OR lower(cooperative) = ANY(public.my_cooperative_names()));
CREATE POLICY ds_delete ON public.disabled_sections FOR DELETE TO authenticated
  USING (public.is_admin() OR lower(cooperative) = ANY(public.my_cooperative_names()));

-- 9) Suppression des helpers et de la colonne legacy mono-coopérative
DROP FUNCTION IF EXISTS public.my_cooperative();
DROP FUNCTION IF EXISTS public.my_cooperative_id();
ALTER TABLE public.profiles DROP COLUMN IF EXISTS cooperative;
