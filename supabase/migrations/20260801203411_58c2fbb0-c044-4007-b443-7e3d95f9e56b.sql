CREATE OR REPLACE FUNCTION public.shares_my_cooperative(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_cooperatives target
    JOIN public.user_cooperatives mine
      ON mine.cooperative_id = target.cooperative_id
    WHERE target.user_id = _user_id
      AND mine.user_id = auth.uid()
  );
$$;

REVOKE ALL ON FUNCTION public.shares_my_cooperative(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.shares_my_cooperative(uuid) TO authenticated, service_role;

-- Un coop_admin peut consulter les profils des utilisateurs de sa/ses coopérative(s),
-- sauf ceux des super administrateurs.
CREATE POLICY "Coop admins can view their cooperative profiles"
ON public.profiles
FOR SELECT
TO authenticated
USING (
  public.is_coop_admin()
  AND public.shares_my_cooperative(user_id)
  AND NOT public.has_role(user_id, 'super_admin')
);

-- Un coop_admin peut voir les rattachements de son périmètre (jamais un super_admin)
CREATE POLICY "Coop admins can view their cooperative roles"
ON public.user_roles
FOR SELECT
TO authenticated
USING (
  public.is_coop_admin()
  AND public.shares_my_cooperative(user_id)
  AND role <> 'super_admin'::public.app_role
);