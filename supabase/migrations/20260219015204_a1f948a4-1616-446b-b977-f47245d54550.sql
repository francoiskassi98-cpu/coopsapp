
-- Drop all existing public policies and replace with authenticated-only

-- CANCELLATIONS
DROP POLICY IF EXISTS "Public insert cancellations" ON public.cancellations;
DROP POLICY IF EXISTS "Public read cancellations" ON public.cancellations;

CREATE POLICY "Auth select cancellations" ON public.cancellations FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth insert cancellations" ON public.cancellations FOR INSERT TO authenticated WITH CHECK (true);

-- COOPERATIVES
DROP POLICY IF EXISTS "Public delete cooperatives" ON public.cooperatives;
DROP POLICY IF EXISTS "Public insert cooperatives" ON public.cooperatives;
DROP POLICY IF EXISTS "Public read cooperatives" ON public.cooperatives;
DROP POLICY IF EXISTS "Public update cooperatives" ON public.cooperatives;

CREATE POLICY "Auth select cooperatives" ON public.cooperatives FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth insert cooperatives" ON public.cooperatives FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Auth update cooperatives" ON public.cooperatives FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Auth delete cooperatives" ON public.cooperatives FOR DELETE TO authenticated USING (true);

-- DELIVERIES
DROP POLICY IF EXISTS "Public delete deliveries" ON public.deliveries;
DROP POLICY IF EXISTS "Public insert deliveries" ON public.deliveries;
DROP POLICY IF EXISTS "Public read deliveries" ON public.deliveries;

CREATE POLICY "Auth select deliveries" ON public.deliveries FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth insert deliveries" ON public.deliveries FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Auth delete deliveries" ON public.deliveries FOR DELETE TO authenticated USING (true);

-- DISABLED_SECTIONS
DROP POLICY IF EXISTS "Public delete disabled_sections" ON public.disabled_sections;
DROP POLICY IF EXISTS "Public insert disabled_sections" ON public.disabled_sections;
DROP POLICY IF EXISTS "Public read disabled_sections" ON public.disabled_sections;

CREATE POLICY "Auth select disabled_sections" ON public.disabled_sections FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth insert disabled_sections" ON public.disabled_sections FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Auth delete disabled_sections" ON public.disabled_sections FOR DELETE TO authenticated USING (true);

-- PARTNERS
DROP POLICY IF EXISTS "Public delete partners" ON public.partners;
DROP POLICY IF EXISTS "Public insert partners" ON public.partners;
DROP POLICY IF EXISTS "Public read partners" ON public.partners;
DROP POLICY IF EXISTS "Public update partners" ON public.partners;

CREATE POLICY "Auth select partners" ON public.partners FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth insert partners" ON public.partners FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Auth update partners" ON public.partners FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Auth delete partners" ON public.partners FOR DELETE TO authenticated USING (true);

-- PRODUCERS
DROP POLICY IF EXISTS "Public delete producers" ON public.producers;
DROP POLICY IF EXISTS "Public insert producers" ON public.producers;
DROP POLICY IF EXISTS "Public read producers" ON public.producers;
DROP POLICY IF EXISTS "Public update producers" ON public.producers;

CREATE POLICY "Auth select producers" ON public.producers FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth insert producers" ON public.producers FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Auth update producers" ON public.producers FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Auth delete producers" ON public.producers FOR DELETE TO authenticated USING (true);

-- SHIPMENTS
DROP POLICY IF EXISTS "Public insert shipments" ON public.shipments;
DROP POLICY IF EXISTS "Public read shipments" ON public.shipments;
DROP POLICY IF EXISTS "Public update shipments" ON public.shipments;

CREATE POLICY "Auth select shipments" ON public.shipments FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth insert shipments" ON public.shipments FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Auth update shipments" ON public.shipments FOR UPDATE TO authenticated USING (true);

-- RPC FUNCTIONS FOR UNLIMITED EXPORTS
CREATE OR REPLACE FUNCTION public.export_all_deliveries()
RETURNS TABLE (
  id uuid,
  shipment_id uuid,
  producer_id uuid,
  receipt_number text,
  delivery_date date,
  net_weight numeric,
  num_bags integer,
  created_at timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id, shipment_id, producer_id, receipt_number, delivery_date, net_weight, num_bags, created_at
  FROM deliveries ORDER BY receipt_number;
$$;

CREATE OR REPLACE FUNCTION public.export_all_producers()
RETURNS TABLE (
  id uuid,
  full_name text,
  section text,
  plantation_code text,
  delivery_potential numeric,
  remaining_potential numeric,
  cooperative text,
  sexe text,
  is_active boolean
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id, full_name, section, plantation_code, delivery_potential, remaining_potential, cooperative, sexe, is_active
  FROM producers ORDER BY cooperative, section;
$$;
