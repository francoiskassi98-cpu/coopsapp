CREATE OR REPLACE FUNCTION public.list_campaign_labels()
RETURNS TABLE(campaign_label text)
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$
  SELECT DISTINCT t.campaign_label
  FROM (
    SELECT s.campaign_label FROM public.shipments s WHERE s.campaign_label IS NOT NULL
    UNION
    SELECT p.campaign_label FROM public.producers p WHERE p.campaign_label IS NOT NULL
    UNION
    SELECT d.campaign_label FROM public.deliveries d WHERE d.campaign_label IS NOT NULL
  ) t
  ORDER BY 1 DESC;
$$;

REVOKE ALL ON FUNCTION public.list_campaign_labels() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_campaign_labels() TO authenticated;