CREATE OR REPLACE FUNCTION public.geo_set_archived(_request_id uuid, _archived boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF NOT (public.is_super_admin() OR EXISTS (
    SELECT 1 FROM public.geospatial_requests r
    WHERE r.id = _request_id AND r.cooperative_id = ANY (public.my_cooperative_ids())
  )) THEN RAISE EXCEPTION 'forbidden'; END IF;
  UPDATE public.geospatial_requests SET is_archived = _archived WHERE id = _request_id;
END $$;
REVOKE ALL ON FUNCTION public.geo_set_archived(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.geo_set_archived(uuid, boolean) TO authenticated, service_role;