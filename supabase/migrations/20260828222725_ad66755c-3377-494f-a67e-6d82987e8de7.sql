ALTER TABLE public.shipments ADD COLUMN IF NOT EXISTS client_request_id uuid;

CREATE UNIQUE INDEX IF NOT EXISTS shipments_client_request_id_key
  ON public.shipments (client_request_id)
  WHERE client_request_id IS NOT NULL;