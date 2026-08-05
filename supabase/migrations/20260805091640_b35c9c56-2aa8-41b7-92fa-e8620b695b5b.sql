CREATE OR REPLACE FUNCTION public.apply_shipment_potentials(p_lines jsonb)
RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE v_count integer;
BEGIN
  WITH lines AS (
    SELECT (elem->>'producer_id')::uuid AS producer_id,
           (elem->>'weight')::numeric   AS weight
    FROM jsonb_array_elements(p_lines) AS elem
  ), agg AS (
    SELECT producer_id, SUM(weight) AS weight
    FROM lines
    WHERE producer_id IS NOT NULL
    GROUP BY producer_id
  )
  UPDATE public.producers p
  SET remaining_potential = GREATEST(p.remaining_potential - agg.weight, 0)
  FROM agg
  WHERE p.id = agg.producer_id;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.apply_shipment_potentials(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apply_shipment_potentials(jsonb) TO authenticated;