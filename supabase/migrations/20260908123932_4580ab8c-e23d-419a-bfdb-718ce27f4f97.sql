ALTER TABLE public.producers ADD COLUMN IF NOT EXISTS carte_ccc text;
ALTER TABLE public.producer_registry ADD COLUMN IF NOT EXISTS carte_ccc text;
COMMENT ON COLUMN public.producers.carte_ccc IS 'Numéro de Carte CCC du producteur (texte brut, zéros initiaux conservés).';