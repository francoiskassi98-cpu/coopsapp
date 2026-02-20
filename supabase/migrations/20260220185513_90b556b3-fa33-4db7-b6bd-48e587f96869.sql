
CREATE OR REPLACE FUNCTION public.get_max_receipt_number(p_cooperative_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$
  SELECT receipt_number
  FROM deliveries
  WHERE shipment_id IN (
    SELECT id FROM shipments WHERE cooperative_id = p_cooperative_id
  )
  AND receipt_number ~ '^\d+$'
  ORDER BY (receipt_number::bigint) DESC
  LIMIT 1;
$$;
