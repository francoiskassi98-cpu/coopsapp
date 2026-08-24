ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS cooperative_id uuid REFERENCES public.cooperatives(id) ON DELETE CASCADE;

UPDATE public.projects p
SET cooperative_id = r.cooperative_id
FROM public.registres r
WHERE p.registre_id = r.id AND p.cooperative_id IS NULL;

DELETE FROM public.projects WHERE cooperative_id IS NULL AND registre_id IS NULL;

ALTER TABLE public.projects ALTER COLUMN cooperative_id SET NOT NULL;

DROP POLICY IF EXISTS "Projects visible via registre" ON public.projects;
DROP POLICY IF EXISTS "Projects update via registre" ON public.projects;
DROP POLICY IF EXISTS "Projects delete via registre" ON public.projects;
DROP POLICY IF EXISTS "Projects insert via registre" ON public.projects;

ALTER TABLE public.projects DROP COLUMN IF EXISTS registre_id;

CREATE INDEX IF NOT EXISTS idx_projects_cooperative_id ON public.projects(cooperative_id);

CREATE OR REPLACE FUNCTION public.set_project_cooperative()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_ids uuid[];
BEGIN
  IF NEW.cooperative_id IS NULL THEN
    SELECT COALESCE(array_agg(cooperative_id), ARRAY[]::uuid[]) INTO v_ids
    FROM public.user_cooperatives WHERE user_id = auth.uid();
    IF array_length(v_ids, 1) = 1 THEN
      NEW.cooperative_id := v_ids[1];
    ELSE
      RAISE EXCEPTION 'cooperative_id requis';
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_set_project_cooperative ON public.projects;
CREATE TRIGGER trg_set_project_cooperative
BEFORE INSERT ON public.projects
FOR EACH ROW EXECUTE FUNCTION public.set_project_cooperative();

CREATE POLICY "Projects select by cooperative" ON public.projects
FOR SELECT TO authenticated
USING (is_super_admin() OR cooperative_id = ANY (my_cooperative_ids()));

CREATE POLICY "Projects insert by cooperative" ON public.projects
FOR INSERT TO authenticated
WITH CHECK (
  is_super_admin()
  OR (cooperative_id = ANY (my_cooperative_ids()) AND coop_subscription_active(cooperative_id))
);

CREATE POLICY "Projects update by coop admin" ON public.projects
FOR UPDATE TO authenticated
USING (is_super_admin() OR (is_coop_admin() AND cooperative_id = ANY (my_cooperative_ids())))
WITH CHECK (is_super_admin() OR (is_coop_admin() AND cooperative_id = ANY (my_cooperative_ids())));

CREATE POLICY "Projects delete by coop admin" ON public.projects
FOR DELETE TO authenticated
USING (is_super_admin() OR (is_coop_admin() AND cooperative_id = ANY (my_cooperative_ids())));