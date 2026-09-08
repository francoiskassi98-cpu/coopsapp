DROP POLICY IF EXISTS coops_insert_admin ON public.cooperatives;
DROP POLICY IF EXISTS coops_update_admin ON public.cooperatives;
DROP POLICY IF EXISTS coops_delete_admin ON public.cooperatives;
DROP POLICY IF EXISTS coops_read ON public.cooperatives;

CREATE POLICY coops_insert_admin ON public.cooperatives
  FOR INSERT TO authenticated
  WITH CHECK (public.is_super_admin());

CREATE POLICY coops_update_admin ON public.cooperatives
  FOR UPDATE TO authenticated
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

CREATE POLICY coops_delete_admin ON public.cooperatives
  FOR DELETE TO authenticated
  USING (public.is_super_admin());

CREATE POLICY coops_read ON public.cooperatives
  FOR SELECT TO authenticated
  USING (public.is_super_admin() OR id = ANY (public.my_cooperative_ids()));