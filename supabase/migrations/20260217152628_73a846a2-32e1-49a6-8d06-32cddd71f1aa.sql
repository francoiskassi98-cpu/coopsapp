
-- Create cooperatives table
CREATE TABLE public.cooperatives (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.cooperatives ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read cooperatives" ON public.cooperatives FOR SELECT USING (true);
CREATE POLICY "Public insert cooperatives" ON public.cooperatives FOR INSERT WITH CHECK (true);
CREATE POLICY "Public update cooperatives" ON public.cooperatives FOR UPDATE USING (true);
CREATE POLICY "Public delete cooperatives" ON public.cooperatives FOR DELETE USING (true);

-- Populate cooperatives from existing producers
INSERT INTO public.cooperatives (name)
SELECT DISTINCT cooperative FROM public.producers WHERE cooperative IS NOT NULL
ON CONFLICT (name) DO NOTHING;

-- Add cooperative_id to shipments
ALTER TABLE public.shipments ADD COLUMN cooperative_id uuid REFERENCES public.cooperatives(id);

-- Populate cooperative_id from existing zone values
UPDATE public.shipments s
SET cooperative_id = c.id
FROM public.cooperatives c
WHERE s.zone = c.name;
