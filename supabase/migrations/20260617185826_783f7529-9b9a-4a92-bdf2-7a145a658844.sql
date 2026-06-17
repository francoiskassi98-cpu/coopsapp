
REVOKE EXECUTE ON FUNCTION public.log_audit() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.log_audit() FROM anon;
REVOKE EXECUTE ON FUNCTION public.log_audit() FROM authenticated;
