CREATE TABLE IF NOT EXISTS public.lot_counters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  registre_id uuid NOT NULL REFERENCES public.registres(id) ON DELETE CASCADE,
  campaign_label text NOT NULL,
  last_lot_number integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT lot_counters_registre_campaign_key UNIQUE (registre_id, campaign_label)
);

GRANT SELECT ON public.lot_counters TO authenticated;
GRANT ALL ON public.lot_counters TO service_role;

ALTER TABLE public.lot_counters ENABLE ROW LEVEL SECURITY;

CREATE POLICY "lot_counters_select_scoped" ON public.lot_counters
  FOR SELECT TO authenticated
  USING (public.can_access_registre(registre_id));

CREATE TRIGGER update_lot_counters_updated_at
  BEFORE UPDATE ON public.lot_counters
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Initialisation depuis les numéros de lot déjà utilisés
INSERT INTO public.lot_counters (registre_id, campaign_label, last_lot_number)
SELECT s.registre_id,
       s.campaign_label,
       COALESCE(MAX(NULLIF(regexp_replace(s.lot_number, '\D', '', 'g'), '')::int), 0)
FROM public.shipments s
WHERE s.lot_number IS NOT NULL AND s.campaign_label IS NOT NULL
GROUP BY s.registre_id, s.campaign_label
ON CONFLICT (registre_id, campaign_label) DO NOTHING;

-- Attribution atomique du prochain numéro de lot
CREATE OR REPLACE FUNCTION public.allocate_lot_number(p_registre uuid, p_campaign_label text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_next integer;
BEGIN
  IF p_registre IS NULL OR p_campaign_label IS NULL OR p_campaign_label = '' THEN
    RAISE EXCEPTION 'Registre et campagne obligatoires';
  END IF;

  IF NOT public.can_write_registre(p_registre) THEN
    RAISE EXCEPTION 'Accès refusé sur ce registre';
  END IF;

  INSERT INTO public.lot_counters (registre_id, campaign_label, last_lot_number)
  VALUES (p_registre, p_campaign_label, 1)
  ON CONFLICT (registre_id, campaign_label)
  DO UPDATE SET last_lot_number = public.lot_counters.last_lot_number + 1,
                updated_at = now()
  RETURNING last_lot_number INTO v_next;

  RETURN v_next;
END;
$$;

REVOKE ALL ON FUNCTION public.allocate_lot_number(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.allocate_lot_number(uuid, text) TO authenticated, service_role;

-- L'ancienne logique MAX+1 ne doit plus être utilisée
DROP FUNCTION IF EXISTS public.next_lot_number(uuid, text);