ALTER TABLE public.producers 
  ADD COLUMN IF NOT EXISTS num_men integer,
  ADD COLUMN IF NOT EXISTS num_women integer;

ALTER TABLE public.producer_registry 
  ADD COLUMN IF NOT EXISTS num_men integer,
  ADD COLUMN IF NOT EXISTS num_women integer;