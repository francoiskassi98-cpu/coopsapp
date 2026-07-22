
-- Ajouts pour la gestion multi-coopératives (super admin)
ALTER TABLE public.cooperatives
  ADD COLUMN IF NOT EXISTS region TEXT,
  ADD COLUMN IF NOT EXISTS manager_name TEXT,
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- Statut d'abonnement calculé (essai / actif / expiré / suspendu)
CREATE OR REPLACE FUNCTION public.get_subscription_status(_coop_id uuid)
RETURNS text
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
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
  END;
$$;

REVOKE ALL ON FUNCTION public.get_subscription_status(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_subscription_status(uuid) TO authenticated, service_role;

-- Statistiques globales pour le dashboard super_admin
CREATE OR REPLACE FUNCTION public.get_super_admin_stats()
RETURNS TABLE (
  total_coops bigint,
  active_coops bigint,
  trial_coops bigint,
  expired_coops bigint,
  suspended_coops bigint,
  total_registres bigint,
  total_users bigint,
  total_producers bigint
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Accès réservé au super administrateur.';
  END IF;
  RETURN QUERY
  WITH coops AS (
    SELECT id, public.get_subscription_status(id) AS s
    FROM public.cooperatives WHERE deleted_at IS NULL
  )
  SELECT
    (SELECT count(*) FROM coops),
    (SELECT count(*) FROM coops WHERE s = 'active'),
    (SELECT count(*) FROM coops WHERE s = 'trial'),
    (SELECT count(*) FROM coops WHERE s = 'expired'),
    (SELECT count(*) FROM coops WHERE s = 'suspended'),
    (SELECT count(*) FROM public.registres),
    (SELECT count(*) FROM auth.users),
    (SELECT count(*) FROM public.producers);
END;
$$;

REVOKE ALL ON FUNCTION public.get_super_admin_stats() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_super_admin_stats() TO authenticated, service_role;

-- Politique : le super_admin peut modifier/supprimer toute coopérative,
-- les coop_admin ne voient et ne modifient que leur coopérative (non supprimée).
DROP POLICY IF EXISTS "coops_super_admin_manage" ON public.cooperatives;
CREATE POLICY "coops_super_admin_manage" ON public.cooperatives
  FOR ALL TO authenticated
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());
