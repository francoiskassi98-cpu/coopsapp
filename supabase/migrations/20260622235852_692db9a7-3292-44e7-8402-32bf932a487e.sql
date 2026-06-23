ALTER TABLE public.shipments
  ADD COLUMN IF NOT EXISTS driver_name text,
  ADD COLUMN IF NOT EXISTS truck_number text,
  ADD COLUMN IF NOT EXISTS trailer_number text,
  ADD COLUMN IF NOT EXISTS departure_date date;