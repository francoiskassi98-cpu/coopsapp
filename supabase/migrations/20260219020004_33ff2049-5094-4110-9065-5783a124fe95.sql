
-- Switch export functions from SECURITY DEFINER to SECURITY INVOKER
-- so they respect RLS policies instead of bypassing them

CREATE OR REPLACE FUNCTION public.export_all_deliveries()
 RETURNS TABLE(id uuid, shipment_id uuid, producer_id uuid, receipt_number text, delivery_date date, net_weight numeric, num_bags integer, created_at timestamp with time zone)
 LANGUAGE sql
 SECURITY INVOKER
 SET search_path TO 'public'
AS $$
  SELECT id, shipment_id, producer_id, receipt_number, delivery_date, net_weight, num_bags, created_at
  FROM deliveries ORDER BY receipt_number;
$$;

CREATE OR REPLACE FUNCTION public.export_all_producers()
 RETURNS TABLE(id uuid, full_name text, section text, plantation_code text, delivery_potential numeric, remaining_potential numeric, cooperative text, sexe text, is_active boolean)
 LANGUAGE sql
 SECURITY INVOKER
 SET search_path TO 'public'
AS $$
  SELECT id, full_name, section, plantation_code, delivery_potential, remaining_potential, cooperative, sexe, is_active
  FROM producers ORDER BY cooperative, section;
$$;
