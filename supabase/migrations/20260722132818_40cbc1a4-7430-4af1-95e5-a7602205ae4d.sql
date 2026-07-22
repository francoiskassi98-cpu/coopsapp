
-- 1. projects table
CREATE TABLE public.projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  registre_id uuid NOT NULL REFERENCES public.registres(id) ON DELETE CASCADE,
  name text NOT NULL,
  code text,
  partner_id uuid REFERENCES public.partners(id) ON DELETE SET NULL,
  description text,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (registre_id, name)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.projects TO authenticated;
GRANT ALL ON public.projects TO service_role;

ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Projects visible via registre" ON public.projects
  FOR SELECT TO authenticated
  USING (public.is_super_admin() OR public.can_access_registre(registre_id));

CREATE POLICY "Projects insert via registre" ON public.projects
  FOR INSERT TO authenticated
  WITH CHECK (public.is_super_admin() OR public.can_access_registre(registre_id));

CREATE POLICY "Projects update via registre" ON public.projects
  FOR UPDATE TO authenticated
  USING (public.is_super_admin() OR public.can_access_registre(registre_id))
  WITH CHECK (public.is_super_admin() OR public.can_access_registre(registre_id));

CREATE POLICY "Projects delete via registre" ON public.projects
  FOR DELETE TO authenticated
  USING (public.is_super_admin() OR public.can_access_registre(registre_id));

CREATE TRIGGER update_projects_updated_at
  BEFORE UPDATE ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. shipment_excel_templates: add is_active + partner_id
ALTER TABLE public.shipment_excel_templates
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS partner_id uuid REFERENCES public.partners(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS description text;

-- 3. shipments: add optional project_id + template_id
ALTER TABLE public.shipments
  ADD COLUMN IF NOT EXISTS project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS template_id uuid REFERENCES public.shipment_excel_templates(id) ON DELETE SET NULL;
