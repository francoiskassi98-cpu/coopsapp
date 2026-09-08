ALTER TABLE public.shipment_excel_templates ADD COLUMN IF NOT EXISTS cooperative_id uuid REFERENCES public.cooperatives(id);

UPDATE public.shipment_excel_templates t
SET cooperative_id = r.cooperative_id
FROM public.registres r
WHERE t.registre_id = r.id AND t.cooperative_id IS NULL;

ALTER TABLE public.shipment_excel_templates ALTER COLUMN registre_id DROP NOT NULL;
ALTER TABLE public.shipment_excel_templates ALTER COLUMN cooperative_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_shipment_tpl_coop ON public.shipment_excel_templates(cooperative_id);

DROP POLICY IF EXISTS shipment_tpl_select ON public.shipment_excel_templates;
DROP POLICY IF EXISTS shipment_tpl_insert ON public.shipment_excel_templates;
DROP POLICY IF EXISTS shipment_tpl_update_admin ON public.shipment_excel_templates;
DROP POLICY IF EXISTS shipment_tpl_delete_admin ON public.shipment_excel_templates;

CREATE POLICY shipment_tpl_select ON public.shipment_excel_templates
FOR SELECT TO authenticated
USING (public.is_super_admin() OR cooperative_id = ANY (public.my_cooperative_ids()));

CREATE POLICY shipment_tpl_insert ON public.shipment_excel_templates
FOR INSERT TO authenticated
WITH CHECK (
  public.is_super_admin()
  OR (cooperative_id = ANY (public.my_cooperative_ids())
      AND public.is_coop_admin()
      AND public.coop_subscription_active(cooperative_id))
);

CREATE POLICY shipment_tpl_update_admin ON public.shipment_excel_templates
FOR UPDATE TO authenticated
USING (
  public.is_super_admin()
  OR (cooperative_id = ANY (public.my_cooperative_ids())
      AND public.is_coop_admin()
      AND public.coop_subscription_active(cooperative_id))
)
WITH CHECK (
  public.is_super_admin()
  OR (cooperative_id = ANY (public.my_cooperative_ids())
      AND public.is_coop_admin()
      AND public.coop_subscription_active(cooperative_id))
);

CREATE POLICY shipment_tpl_delete_admin ON public.shipment_excel_templates
FOR DELETE TO authenticated
USING (
  public.is_super_admin()
  OR (cooperative_id = ANY (public.my_cooperative_ids())
      AND public.is_coop_admin()
      AND public.coop_subscription_active(cooperative_id))
);