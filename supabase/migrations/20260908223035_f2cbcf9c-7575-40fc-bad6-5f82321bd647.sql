DROP POLICY IF EXISTS producer_registry_update ON public.producer_registry;
CREATE POLICY producer_registry_update ON public.producer_registry
  FOR UPDATE TO authenticated
  USING (public.can_access_registre(registre_id) AND (public.is_super_admin() OR public.is_coop_admin()))
  WITH CHECK (public.can_write_registre(registre_id) AND (public.is_super_admin() OR public.is_coop_admin()));

DROP POLICY IF EXISTS user_registres_admin_manage ON public.user_registres;

CREATE POLICY user_registres_admin_insert ON public.user_registres
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_super_admin() OR (
      public.is_coop_admin() AND EXISTS (
        SELECT 1 FROM public.registres r
        WHERE r.id = user_registres.registre_id
          AND r.cooperative_id = ANY (public.my_cooperative_ids())
      )
    )
  );

CREATE POLICY user_registres_admin_update ON public.user_registres
  FOR UPDATE TO authenticated
  USING (
    public.is_super_admin() OR (
      public.is_coop_admin() AND EXISTS (
        SELECT 1 FROM public.registres r
        WHERE r.id = user_registres.registre_id
          AND r.cooperative_id = ANY (public.my_cooperative_ids())
      )
    )
  )
  WITH CHECK (
    public.is_super_admin() OR (
      public.is_coop_admin() AND EXISTS (
        SELECT 1 FROM public.registres r
        WHERE r.id = user_registres.registre_id
          AND r.cooperative_id = ANY (public.my_cooperative_ids())
      )
    )
  );

CREATE POLICY user_registres_admin_delete ON public.user_registres
  FOR DELETE TO authenticated
  USING (
    public.is_super_admin() OR (
      public.is_coop_admin() AND EXISTS (
        SELECT 1 FROM public.registres r
        WHERE r.id = user_registres.registre_id
          AND r.cooperative_id = ANY (public.my_cooperative_ids())
      )
    )
  );