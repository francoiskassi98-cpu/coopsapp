ALTER TABLE public.producers DROP CONSTRAINT IF EXISTS producers_plantation_code_key;

CREATE UNIQUE INDEX IF NOT EXISTS producers_registre_campaign_plantation_uidx
  ON public.producers (registre_id, campaign_label, plantation_code)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS producers_campaign_plantation_idx
  ON public.producers (campaign_label, plantation_code);