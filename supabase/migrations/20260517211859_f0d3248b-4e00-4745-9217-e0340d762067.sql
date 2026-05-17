
-- 1. Restrict DELETE on producers/deliveries to admins only
DROP POLICY IF EXISTS "Auth delete producers" ON public.producers;
CREATE POLICY "Admins can delete producers"
ON public.producers FOR DELETE TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Auth delete deliveries" ON public.deliveries;
CREATE POLICY "Admins can delete deliveries"
ON public.deliveries FOR DELETE TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- 2. Revoke EXECUTE from anon on SECURITY DEFINER / data-export functions
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM anon;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enforce_single_chargement_campaign() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.export_all_producers() FROM anon;
REVOKE EXECUTE ON FUNCTION public.export_all_deliveries() FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_max_receipt_number(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_active_campaign() FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_remaining_potential_by_campaign(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_dashboard_stats_by_campaign(uuid) FROM anon;

-- 3. Remove sensitive tables from public realtime publication
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'producer_registry'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime DROP TABLE public.producer_registry';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'campaigns'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime DROP TABLE public.campaigns';
  END IF;
END $$;
