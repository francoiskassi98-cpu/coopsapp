
-- Partners table (modifiable list)
CREATE TABLE public.partners (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.partners ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read partners" ON public.partners FOR SELECT USING (true);
CREATE POLICY "Public insert partners" ON public.partners FOR INSERT WITH CHECK (true);
CREATE POLICY "Public update partners" ON public.partners FOR UPDATE USING (true);
CREATE POLICY "Public delete partners" ON public.partners FOR DELETE USING (true);

-- Seed default partners
INSERT INTO public.partners (name) VALUES
  ('SACO'), ('CEMOI'), ('CARGILL'), ('OLAM'), ('TOUTOU'), ('COCOASOURCE'), ('FACTA'), ('PURATOS');

-- Producers table
CREATE TABLE public.producers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  cooperative TEXT NOT NULL,
  full_name TEXT NOT NULL,
  producer_number TEXT,
  national_id TEXT,
  producer_code TEXT,
  section TEXT NOT NULL,
  total_cocoa_area NUMERIC,
  num_plots INTEGER,
  plantation_code TEXT NOT NULL UNIQUE,
  delivery_potential NUMERIC NOT NULL DEFAULT 0,
  remaining_potential NUMERIC NOT NULL DEFAULT 0,
  plantation_area NUMERIC,
  latitude NUMERIC,
  longitude NUMERIC,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.producers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read producers" ON public.producers FOR SELECT USING (true);
CREATE POLICY "Public insert producers" ON public.producers FOR INSERT WITH CHECK (true);
CREATE POLICY "Public update producers" ON public.producers FOR UPDATE USING (true);
CREATE POLICY "Public delete producers" ON public.producers FOR DELETE USING (true);

-- Shipments table
CREATE TABLE public.shipments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  connaissement TEXT,
  total_weight NUMERIC NOT NULL,
  total_bags INTEGER NOT NULL,
  avg_bag_weight NUMERIC NOT NULL,
  project TEXT NOT NULL CHECK (project IN ('Fairtrade', 'Rainforest Alliance', 'Ordinaire')),
  partner_id UUID REFERENCES public.partners(id),
  zone TEXT,
  destination TEXT NOT NULL CHECK (destination IN ('Abidjan', 'San-Pedro')),
  campaign TEXT NOT NULL,
  delivery_start DATE NOT NULL,
  delivery_end DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.shipments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read shipments" ON public.shipments FOR SELECT USING (true);
CREATE POLICY "Public insert shipments" ON public.shipments FOR INSERT WITH CHECK (true);
CREATE POLICY "Public update shipments" ON public.shipments FOR UPDATE USING (true);

-- Deliveries table (one row per producer per shipment)
CREATE TABLE public.deliveries (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  shipment_id UUID NOT NULL REFERENCES public.shipments(id) ON DELETE CASCADE,
  producer_id UUID NOT NULL REFERENCES public.producers(id),
  receipt_number TEXT NOT NULL,
  delivery_date DATE NOT NULL,
  net_weight NUMERIC NOT NULL,
  num_bags INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.deliveries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read deliveries" ON public.deliveries FOR SELECT USING (true);
CREATE POLICY "Public insert deliveries" ON public.deliveries FOR INSERT WITH CHECK (true);
CREATE POLICY "Public delete deliveries" ON public.deliveries FOR DELETE USING (true);

-- Cancellation history
CREATE TABLE public.cancellations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  shipment_id UUID NOT NULL REFERENCES public.shipments(id),
  connaissement TEXT NOT NULL,
  total_weight NUMERIC NOT NULL,
  total_bags INTEGER NOT NULL,
  reason TEXT,
  cancelled_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.cancellations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read cancellations" ON public.cancellations FOR SELECT USING (true);
CREATE POLICY "Public insert cancellations" ON public.cancellations FOR INSERT WITH CHECK (true);
