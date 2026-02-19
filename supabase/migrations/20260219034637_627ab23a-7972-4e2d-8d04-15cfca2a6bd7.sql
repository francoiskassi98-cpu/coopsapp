
CREATE TABLE public.rapports_envoyes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  date_envoi TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  destinataires TEXT[] NOT NULL,
  statut TEXT NOT NULL DEFAULT 'succès',
  donnees_rapport JSONB,
  message_erreur TEXT
);

ALTER TABLE public.rapports_envoyes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Auth select rapports" ON public.rapports_envoyes FOR SELECT USING (true);
CREATE POLICY "Auth insert rapports" ON public.rapports_envoyes FOR INSERT WITH CHECK (true);
