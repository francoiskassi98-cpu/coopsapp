
-- 1. Table audit_logs
CREATE TABLE public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name text NOT NULL,
  record_id text,
  action text NOT NULL CHECK (action IN ('INSERT','UPDATE','DELETE')),
  old_data jsonb,
  new_data jsonb,
  changed_by uuid,
  changed_by_email text,
  cooperative text,
  campaign_id uuid,
  changed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_audit_logs_changed_at ON public.audit_logs (changed_at DESC);
CREATE INDEX idx_audit_logs_table ON public.audit_logs (table_name);
CREATE INDEX idx_audit_logs_user ON public.audit_logs (changed_by);
CREATE INDEX idx_audit_logs_coop ON public.audit_logs (cooperative);
CREATE INDEX idx_audit_logs_campaign ON public.audit_logs (campaign_id);

-- 2. GRANT (lecture authentifiée, RLS restreint aux admins)
GRANT SELECT ON public.audit_logs TO authenticated;
GRANT ALL ON public.audit_logs TO service_role;

-- 3. RLS : admin lecture seule, aucune écriture/suppression côté client
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read audit logs"
  ON public.audit_logs FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Pas de policy INSERT/UPDATE/DELETE => seuls les triggers SECURITY DEFINER peuvent écrire

-- 4. Fonction générique de log
CREATE OR REPLACE FUNCTION public.log_audit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old jsonb;
  v_new jsonb;
  v_record_id text;
  v_cooperative text;
  v_campaign_id uuid;
  v_email text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_old := to_jsonb(OLD);
    v_new := NULL;
    v_record_id := COALESCE((v_old->>'id'), '');
  ELSIF TG_OP = 'INSERT' THEN
    v_old := NULL;
    v_new := to_jsonb(NEW);
    v_record_id := COALESCE((v_new->>'id'), '');
  ELSE
    v_old := to_jsonb(OLD);
    v_new := to_jsonb(NEW);
    v_record_id := COALESCE((v_new->>'id'), (v_old->>'id'), '');
  END IF;

  -- Extract cooperative/campaign best-effort
  v_cooperative := COALESCE(v_new->>'cooperative', v_old->>'cooperative');
  BEGIN
    v_campaign_id := COALESCE((v_new->>'campaign_id')::uuid, (v_old->>'campaign_id')::uuid);
  EXCEPTION WHEN others THEN
    v_campaign_id := NULL;
  END;

  -- Author email best-effort
  BEGIN
    SELECT email INTO v_email FROM auth.users WHERE id = auth.uid();
  EXCEPTION WHEN others THEN
    v_email := NULL;
  END;

  INSERT INTO public.audit_logs (
    table_name, record_id, action, old_data, new_data,
    changed_by, changed_by_email, cooperative, campaign_id
  ) VALUES (
    TG_TABLE_NAME, v_record_id, TG_OP, v_old, v_new,
    auth.uid(), v_email, v_cooperative, v_campaign_id
  );

  RETURN COALESCE(NEW, OLD);
END;
$$;

-- 5. Triggers sur les tables métier
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'producers','producer_registry','shipments','deliveries',
    'campaigns','user_cooperatives','profiles'
  ]
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS audit_trg ON public.%I', t);
    EXECUTE format(
      'CREATE TRIGGER audit_trg AFTER INSERT OR UPDATE OR DELETE ON public.%I
       FOR EACH ROW EXECUTE FUNCTION public.log_audit()', t
    );
  END LOOP;
END $$;
