DROP POLICY IF EXISTS subs_member_read ON public.subscriptions;
CREATE POLICY subs_member_read ON public.subscriptions
  FOR SELECT TO authenticated
  USING (cooperative_id = ANY (public.my_cooperative_ids()));

DROP POLICY IF EXISTS subs_super_admin_all ON public.subscriptions;
CREATE POLICY subs_super_admin_all ON public.subscriptions
  FOR ALL TO authenticated
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

GRANT EXECUTE ON FUNCTION public.my_cooperative_ids() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_subscription_status(uuid) TO authenticated;