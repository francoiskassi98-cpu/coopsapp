-- Drop anon access (intentional demo policies) and tighten public-role policies
DROP POLICY IF EXISTS "Anon all campaigns" ON public.campaigns;
DROP POLICY IF EXISTS "Anon select campaigns" ON public.campaigns;
DROP POLICY IF EXISTS "Anon all pr" ON public.producer_registry;

-- rapports_envoyes: policies were created without TO clause -> accessible to anon
DROP POLICY IF EXISTS "Auth select rapports" ON public.rapports_envoyes;
DROP POLICY IF EXISTS "Auth insert rapports" ON public.rapports_envoyes;

CREATE POLICY "Auth select rapports" ON public.rapports_envoyes
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Auth insert rapports" ON public.rapports_envoyes
  FOR INSERT TO authenticated WITH CHECK (true);
