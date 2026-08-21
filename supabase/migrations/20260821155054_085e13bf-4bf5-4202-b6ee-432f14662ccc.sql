
ALTER TABLE public.audit_logs
  ADD COLUMN IF NOT EXISTS registre_id uuid,
  ADD COLUMN IF NOT EXISTS cooperative_id uuid,
  ADD COLUMN IF NOT EXISTS changed_by_role text;

CREATE INDEX IF NOT EXISTS idx_audit_logs_registre_id ON public.audit_logs (registre_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_cooperative_id ON public.audit_logs (cooperative_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON public.audit_logs (action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_campaign_label ON public.audit_logs (campaign_label);

-- Backfill depuis le nom de registre déjà enregistré
UPDATE public.audit_logs a
SET registre_id = r.id, cooperative_id = r.cooperative_id
FROM public.registres r
WHERE a.registre_id IS NULL AND a.registre IS NOT NULL AND r.name = a.registre;

-- Fonction d'audit robuste (jamais bloquante)
CREATE OR REPLACE FUNCTION public.log_audit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_old jsonb; v_new jsonb; v_row jsonb;
  v_record_id text;
  v_registre_id uuid; v_registre text; v_coop_id uuid;
  v_campaign_label text; v_email text; v_role text;
BEGIN
  BEGIN
    IF TG_OP = 'DELETE' THEN
      v_old := to_jsonb(OLD); v_new := NULL;
    ELSIF TG_OP = 'INSERT' THEN
      v_old := NULL; v_new := to_jsonb(NEW);
    ELSE
      v_old := to_jsonb(OLD); v_new := to_jsonb(NEW);
    END IF;
    v_row := COALESCE(v_new, v_old);
    v_record_id := COALESCE(v_row->>'id', '');

    BEGIN v_registre_id := NULLIF(v_row->>'registre_id','')::uuid; EXCEPTION WHEN others THEN v_registre_id := NULL; END;

    IF v_registre_id IS NOT NULL THEN
      SELECT r.name, r.cooperative_id INTO v_registre, v_coop_id
      FROM public.registres r WHERE r.id = v_registre_id;
    END IF;

    IF v_coop_id IS NULL THEN
      BEGIN
        v_coop_id := CASE
          WHEN TG_TABLE_NAME = 'cooperatives' THEN NULLIF(v_row->>'id','')::uuid
          ELSE NULLIF(v_row->>'cooperative_id','')::uuid
        END;
      EXCEPTION WHEN others THEN v_coop_id := NULL; END;
    END IF;

    v_campaign_label := v_row->>'campaign_label';

    BEGIN
      SELECT u.email INTO v_email FROM auth.users u WHERE u.id = auth.uid();
    EXCEPTION WHEN others THEN v_email := NULL; END;

    BEGIN
      SELECT ur.role::text INTO v_role FROM public.user_roles ur WHERE ur.user_id = auth.uid() LIMIT 1;
    EXCEPTION WHEN others THEN v_role := NULL; END;

    INSERT INTO public.audit_logs (
      table_name, record_id, action, old_data, new_data,
      changed_by, changed_by_email, changed_by_role,
      registre, registre_id, cooperative_id, campaign_label
    ) VALUES (
      TG_TABLE_NAME, v_record_id, TG_OP, v_old, v_new,
      auth.uid(), v_email, v_role,
      v_registre, v_registre_id, v_coop_id, v_campaign_label
    );
  EXCEPTION WHEN others THEN
    RAISE WARNING '[log_audit] échec audit sur % (%): %', TG_TABLE_NAME, TG_OP, SQLERRM;
  END;

  RETURN COALESCE(NEW, OLD);
END;
$function$;

-- Déclencheurs en double
DROP TRIGGER IF EXISTS trg_subscriptions_audit ON public.subscriptions;
DROP TRIGGER IF EXISTS trg_deliveries_campaign ON public.deliveries;
DROP TRIGGER IF EXISTS trg_producers_campaign ON public.producers;
DROP TRIGGER IF EXISTS trg_producer_registry_campaign ON public.producer_registry;
DROP TRIGGER IF EXISTS trg_shipments_campaign ON public.shipments;
DROP TRIGGER IF EXISTS trg_pbr_campaign ON public.producer_bonus_results;

-- Audit sur les tables métier manquantes
DROP TRIGGER IF EXISTS audit_trg ON public.projects;
CREATE TRIGGER audit_trg AFTER INSERT OR UPDATE OR DELETE ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.log_audit();
DROP TRIGGER IF EXISTS audit_trg ON public.shipment_excel_templates;
CREATE TRIGGER audit_trg AFTER INSERT OR UPDATE OR DELETE ON public.shipment_excel_templates
  FOR EACH ROW EXECUTE FUNCTION public.log_audit();
DROP TRIGGER IF EXISTS audit_trg ON public.registres;
CREATE TRIGGER audit_trg AFTER INSERT OR UPDATE OR DELETE ON public.registres
  FOR EACH ROW EXECUTE FUNCTION public.log_audit();
DROP TRIGGER IF EXISTS audit_trg ON public.disabled_sections;
CREATE TRIGGER audit_trg AFTER INSERT OR UPDATE OR DELETE ON public.disabled_sections
  FOR EACH ROW EXECUTE FUNCTION public.log_audit();
DROP TRIGGER IF EXISTS audit_trg ON public.user_roles;
CREATE TRIGGER audit_trg AFTER INSERT OR UPDATE OR DELETE ON public.user_roles
  FOR EACH ROW EXECUTE FUNCTION public.log_audit();
DROP TRIGGER IF EXISTS audit_trg ON public.producer_bonus_settings;
CREATE TRIGGER audit_trg AFTER INSERT OR UPDATE OR DELETE ON public.producer_bonus_settings
  FOR EACH ROW EXECUTE FUNCTION public.log_audit();

-- Lecture : super_admin partout, coop_admin sur sa coopérative
DROP POLICY IF EXISTS "Admins read audit logs" ON public.audit_logs;
CREATE POLICY "Super admin reads all audit logs"
  ON public.audit_logs FOR SELECT TO authenticated
  USING (public.is_super_admin());
CREATE POLICY "Coop admin reads own cooperative audit logs"
  ON public.audit_logs FOR SELECT TO authenticated
  USING (
    public.is_coop_admin()
    AND cooperative_id IS NOT NULL
    AND cooperative_id = ANY (public.my_cooperative_ids())
  );
