
-- Lock down provisioning function to service_role only
REVOKE EXECUTE ON FUNCTION public.create_cooperative_with_admin(uuid, text, text, jsonb, date, date, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.create_cooperative_with_admin(uuid, text, text, jsonb) FROM PUBLIC, anon, authenticated;

-- Server-side validation for business rules
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='deliveries_bag_weight_check') THEN
    ALTER TABLE public.deliveries
      ADD CONSTRAINT deliveries_bag_weight_check
      CHECK (num_bags IS NULL OR num_bags = 0 OR net_weight IS NULL OR (net_weight / NULLIF(num_bags,0)) <= 110);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='deliveries_positive_weight') THEN
    ALTER TABLE public.deliveries
      ADD CONSTRAINT deliveries_positive_weight
      CHECK (net_weight IS NULL OR net_weight >= 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='deliveries_positive_bags') THEN
    ALTER TABLE public.deliveries
      ADD CONSTRAINT deliveries_positive_bags
      CHECK (num_bags IS NULL OR num_bags >= 0);
  END IF;
END $$;
