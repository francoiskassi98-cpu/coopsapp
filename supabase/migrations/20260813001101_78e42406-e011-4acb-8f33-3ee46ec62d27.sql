ALTER TABLE public.disabled_sections DROP CONSTRAINT IF EXISTS disabled_sections_section_name_key;

DELETE FROM public.disabled_sections a
USING public.disabled_sections b
WHERE a.ctid < b.ctid
  AND a.section_name = b.section_name
  AND a.registre_id = b.registre_id
  AND a.campaign_label = b.campaign_label;

CREATE UNIQUE INDEX IF NOT EXISTS disabled_sections_unique_scope
  ON public.disabled_sections (registre_id, campaign_label, section_name);