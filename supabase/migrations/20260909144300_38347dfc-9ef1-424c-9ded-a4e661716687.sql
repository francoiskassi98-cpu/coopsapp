ALTER TABLE public.producers
  ADD COLUMN IF NOT EXISTS nom text,
  ADD COLUMN IF NOT EXISTS prenom text;

ALTER TABLE public.producer_registry
  ADD COLUMN IF NOT EXISTS nom text,
  ADD COLUMN IF NOT EXISTS prenom text;

UPDATE public.producers
SET nom = split_part(btrim(full_name), ' ', 1),
    prenom = nullif(btrim(substr(btrim(full_name), length(split_part(btrim(full_name), ' ', 1)) + 1)), '')
WHERE nom IS NULL AND full_name IS NOT NULL AND btrim(full_name) <> '';

UPDATE public.producer_registry
SET nom = split_part(btrim(nom_complet), ' ', 1),
    prenom = nullif(btrim(substr(btrim(nom_complet), length(split_part(btrim(nom_complet), ' ', 1)) + 1)), '')
WHERE nom IS NULL AND nom_complet IS NOT NULL AND btrim(nom_complet) <> '';

CREATE OR REPLACE FUNCTION public.sync_producer_name()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.nom IS NOT NULL OR NEW.prenom IS NOT NULL THEN
    NEW.full_name := btrim(coalesce(btrim(NEW.nom), '') || ' ' || coalesce(btrim(NEW.prenom), ''));
  ELSIF NEW.full_name IS NOT NULL AND btrim(NEW.full_name) <> '' THEN
    NEW.nom := split_part(btrim(NEW.full_name), ' ', 1);
    NEW.prenom := nullif(btrim(substr(btrim(NEW.full_name), length(split_part(btrim(NEW.full_name), ' ', 1)) + 1)), '');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_producer_name ON public.producers;
CREATE TRIGGER trg_sync_producer_name
BEFORE INSERT OR UPDATE ON public.producers
FOR EACH ROW EXECUTE FUNCTION public.sync_producer_name();

CREATE OR REPLACE FUNCTION public.sync_producer_registry_name()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.nom IS NOT NULL OR NEW.prenom IS NOT NULL THEN
    NEW.nom_complet := btrim(coalesce(btrim(NEW.nom), '') || ' ' || coalesce(btrim(NEW.prenom), ''));
  ELSIF NEW.nom_complet IS NOT NULL AND btrim(NEW.nom_complet) <> '' THEN
    NEW.nom := split_part(btrim(NEW.nom_complet), ' ', 1);
    NEW.prenom := nullif(btrim(substr(btrim(NEW.nom_complet), length(split_part(btrim(NEW.nom_complet), ' ', 1)) + 1)), '');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_producer_registry_name ON public.producer_registry;
CREATE TRIGGER trg_sync_producer_registry_name
BEFORE INSERT OR UPDATE ON public.producer_registry
FOR EACH ROW EXECUTE FUNCTION public.sync_producer_registry_name();