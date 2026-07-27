CREATE OR REPLACE FUNCTION public.get_subscription_status(_coop_id uuid)
RETURNS text
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_res text;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NULL;
  END IF;
  IF NOT public.is_super_admin() AND NOT (_coop_id = ANY (public.my_cooperative_ids())) THEN
    RETURN NULL;
  END IF;
  WITH last_sub AS (
    SELECT status, end_date
    FROM public.subscriptions
    WHERE cooperative_id = _coop_id
    ORDER BY end_date DESC NULLS LAST
    LIMIT 1
  )
  SELECT CASE
    WHEN NOT EXISTS (SELECT 1 FROM last_sub) THEN 'expired'
    WHEN (SELECT status FROM last_sub) = 'suspended' THEN 'suspended'
    WHEN (SELECT end_date FROM last_sub) IS NOT NULL AND (SELECT end_date FROM last_sub) < CURRENT_DATE THEN 'expired'
    WHEN (SELECT status FROM last_sub) = 'trial' THEN 'trial'
    ELSE 'active'
  END INTO v_res;
  RETURN v_res;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_subscription_status(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_subscription_status(uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.get_super_admin_stats() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_super_admin_stats() TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.log_login_event(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.log_login_event(text) TO authenticated, service_role;