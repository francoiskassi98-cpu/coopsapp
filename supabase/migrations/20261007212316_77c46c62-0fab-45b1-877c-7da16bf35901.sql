CREATE INDEX IF NOT EXISTS idx_producers_campaign_registre ON public.producers (campaign_label, registre_id);
CREATE INDEX IF NOT EXISTS idx_shipments_campaign_registre ON public.shipments (campaign_label, registre_id);

CREATE OR REPLACE FUNCTION public.list_campaign_labels()
 RETURNS TABLE(campaign_label text)
 LANGUAGE sql STABLE SET search_path TO 'public'
AS $$
  SELECT DISTINCT t.campaign_label FROM (
    SELECT DISTINCT p.campaign_label FROM public.producers p WHERE p.campaign_label IS NOT NULL
    UNION
    SELECT DISTINCT s.campaign_label FROM public.shipments s WHERE s.campaign_label IS NOT NULL
  ) t ORDER BY 1 DESC;
$$;

CREATE OR REPLACE FUNCTION public.campaign_registre_ids(p_campaign_label text)
 RETURNS TABLE(registre_id uuid)
 LANGUAGE sql STABLE SET search_path TO 'public'
AS $$
  SELECT p.registre_id FROM public.producers p WHERE p.campaign_label = p_campaign_label
  UNION
  SELECT s.registre_id FROM public.shipments s WHERE s.campaign_label = p_campaign_label;
$$;

CREATE OR REPLACE FUNCTION public.producer_potentials_by_registre(p_campaign_label text DEFAULT NULL)
 RETURNS TABLE(registre_id uuid, delivery_potential numeric, remaining_potential numeric, producer_count bigint)
 LANGUAGE sql STABLE SET search_path TO 'public'
AS $$
  SELECT p.registre_id, COALESCE(SUM(p.delivery_potential),0), COALESCE(SUM(p.remaining_potential),0), COUNT(*)
  FROM public.producers p
  WHERE p_campaign_label IS NULL OR p.campaign_label = p_campaign_label
  GROUP BY p.registre_id;
$$;

REVOKE EXECUTE ON FUNCTION public.campaign_registre_ids(text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.producer_potentials_by_registre(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.campaign_registre_ids(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.producer_potentials_by_registre(text) TO authenticated, service_role;