-- deliveries: split the broad ALL policy so DELETE stays admin-only
DROP POLICY IF EXISTS "deliveries_registre_access" ON public.deliveries;

CREATE POLICY "deliveries_registre_select" ON public.deliveries
  FOR SELECT TO authenticated
  USING (public.can_access_registre(registre_id));

CREATE POLICY "deliveries_registre_insert" ON public.deliveries
  FOR INSERT TO authenticated
  WITH CHECK (public.can_access_registre(registre_id));

CREATE POLICY "deliveries_registre_update" ON public.deliveries
  FOR UPDATE TO authenticated
  USING (public.can_access_registre(registre_id))
  WITH CHECK (public.can_access_registre(registre_id));

-- producers: same split, DELETE remains admin-only via prod_delete_admin
DROP POLICY IF EXISTS "producers_registre_access" ON public.producers;

CREATE POLICY "producers_registre_select" ON public.producers
  FOR SELECT TO authenticated
  USING (public.can_access_registre(registre_id));

CREATE POLICY "producers_registre_insert" ON public.producers
  FOR INSERT TO authenticated
  WITH CHECK (public.can_access_registre(registre_id));

CREATE POLICY "producers_registre_update" ON public.producers
  FOR UPDATE TO authenticated
  USING (public.can_access_registre(registre_id))
  WITH CHECK (public.can_access_registre(registre_id));

-- admin delete policies scoped to registre access as well
DROP POLICY IF EXISTS "del_delete_admin" ON public.deliveries;
CREATE POLICY "del_delete_admin" ON public.deliveries
  FOR DELETE TO authenticated
  USING (public.is_super_admin() OR (public.is_coop_admin() AND public.can_access_registre(registre_id)));

DROP POLICY IF EXISTS "prod_delete_admin" ON public.producers;
CREATE POLICY "prod_delete_admin" ON public.producers
  FOR DELETE TO authenticated
  USING (public.is_super_admin() OR (public.is_coop_admin() AND public.can_access_registre(registre_id)));