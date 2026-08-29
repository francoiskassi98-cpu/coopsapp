REVOKE ALL ON FUNCTION public.is_primary_coop_admin(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_primary_coop_admin(uuid, uuid) TO authenticated, service_role;