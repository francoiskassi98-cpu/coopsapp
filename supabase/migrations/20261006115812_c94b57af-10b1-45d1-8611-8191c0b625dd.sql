REVOKE EXECUTE ON FUNCTION public.sync_producer_potential() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.recompute_producer_potential(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.recompute_potentials(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.delete_registre(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sync_producer_potential() TO service_role;
GRANT EXECUTE ON FUNCTION public.recompute_producer_potential(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.recompute_potentials(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.delete_registre(uuid) TO service_role;