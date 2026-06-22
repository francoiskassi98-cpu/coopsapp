
-- 1. Restrict cooperatives SELECT to admins or members
DROP POLICY IF EXISTS "coops_read" ON public.cooperatives;
CREATE POLICY "coops_read" ON public.cooperatives
  FOR SELECT TO authenticated
  USING (public.is_admin() OR (id = ANY (public.my_cooperative_ids())));

-- 2. Remove overly permissive / duplicate partners policies
DROP POLICY IF EXISTS "partners_read" ON public.partners;
DROP POLICY IF EXISTS "partners_insert_admin" ON public.partners;
DROP POLICY IF EXISTS "partners_update_admin" ON public.partners;
DROP POLICY IF EXISTS "partners_delete_admin" ON public.partners;

-- 3. Restrict partner-logos storage writes to admins
DROP POLICY IF EXISTS "Auth users upload partner-logos" ON storage.objects;
DROP POLICY IF EXISTS "Auth users update partner-logos" ON storage.objects;
DROP POLICY IF EXISTS "Auth users delete partner-logos" ON storage.objects;

CREATE POLICY "Admins upload partner-logos" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'partner-logos' AND (public.is_super_admin() OR public.is_coop_admin()));

CREATE POLICY "Admins update partner-logos" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'partner-logos' AND (public.is_super_admin() OR public.is_coop_admin()))
  WITH CHECK (bucket_id = 'partner-logos' AND (public.is_super_admin() OR public.is_coop_admin()));

CREATE POLICY "Admins delete partner-logos" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'partner-logos' AND (public.is_super_admin() OR public.is_coop_admin()));

-- 4. Revoke EXECUTE from anon on SECURITY DEFINER functions in public schema
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT n.nspname, p.proname,
           pg_catalog.pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prosecdef = true
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %I.%I(%s) FROM anon, public',
                   r.nspname, r.proname, r.args);
  END LOOP;
END $$;

-- Restore EXECUTE for functions the client genuinely calls when signed in
GRANT EXECUTE ON FUNCTION public.log_login_event(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_active_campaign() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_dashboard_stats_by_campaign(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_remaining_potential_by_campaign(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_max_receipt_number(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.next_lot_number(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.export_all_producers() TO authenticated;
GRANT EXECUTE ON FUNCTION public.export_all_deliveries() TO authenticated;
