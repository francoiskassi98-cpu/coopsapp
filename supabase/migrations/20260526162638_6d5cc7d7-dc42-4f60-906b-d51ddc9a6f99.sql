CREATE TABLE public.reports_ppt_history (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL DEFAULT auth.uid(),
  type_rapport text NOT NULL CHECK (type_rapport IN ('campaign','cooperative','shipments','tracability','eudr')),
  campaign_id uuid REFERENCES public.campaigns(id) ON DELETE SET NULL,
  campaign_name text,
  cooperatives text[] NOT NULL DEFAULT '{}',
  file_name text NOT NULL,
  params jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, DELETE ON public.reports_ppt_history TO authenticated;
GRANT ALL ON public.reports_ppt_history TO service_role;

ALTER TABLE public.reports_ppt_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY rph_select_self_or_admin ON public.reports_ppt_history
  FOR SELECT TO authenticated
  USING (public.is_admin() OR user_id = auth.uid());

CREATE POLICY rph_insert_self ON public.reports_ppt_history
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY rph_delete_self_or_admin ON public.reports_ppt_history
  FOR DELETE TO authenticated
  USING (public.is_admin() OR user_id = auth.uid());

CREATE INDEX idx_rph_user ON public.reports_ppt_history(user_id);
CREATE INDEX idx_rph_created ON public.reports_ppt_history(created_at DESC);