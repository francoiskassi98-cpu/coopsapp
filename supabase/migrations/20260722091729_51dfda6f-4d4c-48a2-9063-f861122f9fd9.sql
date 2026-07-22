
-- 1. Drop campaigns module (table + FK)
ALTER TABLE IF EXISTS public.shipments DROP COLUMN IF EXISTS campaign_id;
DROP TABLE IF EXISTS public.campaigns CASCADE;

-- 2. Cooperative extra fields
ALTER TABLE public.cooperatives
  ADD COLUMN IF NOT EXISTS region text,
  ADD COLUMN IF NOT EXISTS manager_name text;

-- 3. Auto campaign_label trigger
CREATE OR REPLACE FUNCTION public.set_campaign_label_auto()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.campaign_label IS NULL THEN
    NEW.campaign_label := public.compute_campaign_label(COALESCE(NEW.created_at, now()));
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_shipments_camp ON public.shipments;
CREATE TRIGGER trg_shipments_camp BEFORE INSERT ON public.shipments
  FOR EACH ROW EXECUTE FUNCTION public.set_campaign_label_auto();

DROP TRIGGER IF EXISTS trg_deliveries_camp ON public.deliveries;
CREATE TRIGGER trg_deliveries_camp BEFORE INSERT ON public.deliveries
  FOR EACH ROW EXECUTE FUNCTION public.set_campaign_label_auto();

DROP TRIGGER IF EXISTS trg_producers_camp ON public.producers;
CREATE TRIGGER trg_producers_camp BEFORE INSERT ON public.producers
  FOR EACH ROW EXECUTE FUNCTION public.set_campaign_label_auto();

DROP TRIGGER IF EXISTS trg_producer_registry_camp ON public.producer_registry;
CREATE TRIGGER trg_producer_registry_camp BEFORE INSERT ON public.producer_registry
  FOR EACH ROW EXECUTE FUNCTION public.set_campaign_label_auto();

DROP TRIGGER IF EXISTS trg_pbr_camp ON public.producer_bonus_results;
CREATE TRIGGER trg_pbr_camp BEFORE INSERT ON public.producer_bonus_results
  FOR EACH ROW EXECUTE FUNCTION public.set_campaign_label_auto();

-- 4. Compute subscription status live
CREATE OR REPLACE FUNCTION public.get_subscription_status(_coop_id uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE
    WHEN s.status::text = 'suspended' THEN 'suspended'
    WHEN s.end_date < CURRENT_DATE THEN 'expired'
    WHEN s.status::text = 'trial' THEN 'trial'
    ELSE 'active'
  END
  FROM public.subscriptions s
  WHERE s.cooperative_id = _coop_id
  ORDER BY s.end_date DESC NULLS LAST
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_subscription_status(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_subscription_status(uuid) TO authenticated, service_role;

-- 5. Aggregate view for Super Admin dashboard
CREATE OR REPLACE FUNCTION public.get_super_admin_stats()
RETURNS TABLE(
  total_coops bigint,
  active_coops bigint,
  trial_coops bigint,
  expired_coops bigint,
  suspended_coops bigint,
  total_registres bigint,
  total_users bigint,
  total_producers bigint
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    (SELECT count(*) FROM public.cooperatives WHERE deleted_at IS NULL),
    (SELECT count(*) FROM public.cooperatives c WHERE c.deleted_at IS NULL AND public.get_subscription_status(c.id) = 'active'),
    (SELECT count(*) FROM public.cooperatives c WHERE c.deleted_at IS NULL AND public.get_subscription_status(c.id) = 'trial'),
    (SELECT count(*) FROM public.cooperatives c WHERE c.deleted_at IS NULL AND public.get_subscription_status(c.id) = 'expired'),
    (SELECT count(*) FROM public.cooperatives c WHERE c.deleted_at IS NULL AND public.get_subscription_status(c.id) = 'suspended'),
    (SELECT count(*) FROM public.registres),
    (SELECT count(*) FROM public.profiles),
    (SELECT count(*) FROM public.producers WHERE deleted_at IS NULL);
$$;

REVOKE ALL ON FUNCTION public.get_super_admin_stats() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_super_admin_stats() TO authenticated, service_role;
