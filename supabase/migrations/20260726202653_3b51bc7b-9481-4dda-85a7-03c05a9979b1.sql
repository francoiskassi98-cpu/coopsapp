REVOKE EXECUTE ON FUNCTION public.my_cooperative_names() FROM authenticated, anon;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM authenticated, anon;