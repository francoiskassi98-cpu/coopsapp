ALTER TABLE public.partners DROP CONSTRAINT partners_name_key;

CREATE UNIQUE INDEX partners_coop_name_unique
  ON public.partners (cooperative_id, lower(name))
  WHERE deleted_at IS NULL;