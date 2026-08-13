CREATE OR REPLACE FUNCTION public.set_disabled_section_campaign_label()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.campaign_label IS NULL OR btrim(NEW.campaign_label) = '' THEN
    NEW.campaign_label := public.compute_campaign_label(COALESCE(NEW.disabled_at, now()));
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_disabled_sections_campaign ON public.disabled_sections;
CREATE TRIGGER trg_disabled_sections_campaign
BEFORE INSERT OR UPDATE OF disabled_at, campaign_label ON public.disabled_sections
FOR EACH ROW
EXECUTE FUNCTION public.set_disabled_section_campaign_label();

REVOKE ALL ON FUNCTION public.set_disabled_section_campaign_label() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_disabled_section_campaign_label() TO service_role;