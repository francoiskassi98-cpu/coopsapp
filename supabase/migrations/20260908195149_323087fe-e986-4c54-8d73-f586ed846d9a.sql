-- Bonus: align DELETE with write rules (includes active subscription check)
DROP POLICY IF EXISTS pbs_delete_admin ON public.producer_bonus_settings;
CREATE POLICY pbs_delete_admin ON public.producer_bonus_settings
  FOR DELETE TO authenticated
  USING (public.can_write_registre(registre_id) AND (public.is_super_admin() OR public.is_coop_admin()));

DROP POLICY IF EXISTS pbr_delete_admin ON public.producer_bonus_results;
CREATE POLICY pbr_delete_admin ON public.producer_bonus_results
  FOR DELETE TO authenticated
  USING (public.can_write_registre(registre_id) AND (public.is_super_admin() OR public.is_coop_admin()));

-- user_roles: make write path explicitly super_admin only
DROP POLICY IF EXISTS "Admins can manage roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can view all roles" ON public.user_roles;

CREATE POLICY "Admins can view all roles" ON public.user_roles
  FOR SELECT TO authenticated
  USING (public.is_super_admin());

CREATE POLICY "Super admins can insert roles" ON public.user_roles
  FOR INSERT TO authenticated
  WITH CHECK (public.is_super_admin());

CREATE POLICY "Super admins can update roles" ON public.user_roles
  FOR UPDATE TO authenticated
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

CREATE POLICY "Super admins can delete roles" ON public.user_roles
  FOR DELETE TO authenticated
  USING (public.is_super_admin());