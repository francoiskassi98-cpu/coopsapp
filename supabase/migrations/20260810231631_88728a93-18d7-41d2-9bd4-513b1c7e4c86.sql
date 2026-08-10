ALTER TABLE public.partners ADD COLUMN IF NOT EXISTS cooperative_id uuid REFERENCES public.cooperatives(id);

UPDATE public.partners p
SET cooperative_id = r.cooperative_id
FROM public.registres r
WHERE p.registre_id = r.id AND p.cooperative_id IS NULL;

ALTER TABLE public.partners ALTER COLUMN cooperative_id SET NOT NULL;

DROP POLICY IF EXISTS partners_select ON public.partners;
DROP POLICY IF EXISTS partners_insert ON public.partners;
DROP POLICY IF EXISTS partners_update ON public.partners;
DROP POLICY IF EXISTS partners_delete_admin ON public.partners;

ALTER TABLE public.partners DROP COLUMN registre_id;

CREATE INDEX IF NOT EXISTS partners_cooperative_id_idx ON public.partners(cooperative_id);

CREATE POLICY partners_select ON public.partners FOR SELECT TO authenticated
USING (public.is_super_admin() OR cooperative_id = ANY (public.my_cooperative_ids()));

CREATE POLICY partners_insert ON public.partners FOR INSERT TO authenticated
WITH CHECK (public.is_super_admin() OR cooperative_id = ANY (public.my_cooperative_ids()));

CREATE POLICY partners_update ON public.partners FOR UPDATE TO authenticated
USING (public.is_super_admin() OR cooperative_id = ANY (public.my_cooperative_ids()))
WITH CHECK (public.is_super_admin() OR cooperative_id = ANY (public.my_cooperative_ids()));

CREATE POLICY partners_delete_admin ON public.partners FOR DELETE TO authenticated
USING ((public.is_super_admin() OR (public.is_coop_admin() AND cooperative_id = ANY (public.my_cooperative_ids()))));