
CREATE OR REPLACE FUNCTION public.log_audit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_old jsonb;
  v_new jsonb;
  v_record_id text;
  v_registre_id uuid;
  v_registre text;
  v_campaign_label text;
  v_email text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_old := to_jsonb(OLD); v_new := NULL;
    v_record_id := COALESCE((v_old->>'id'), '');
  ELSIF TG_OP = 'INSERT' THEN
    v_old := NULL; v_new := to_jsonb(NEW);
    v_record_id := COALESCE((v_new->>'id'), '');
  ELSE
    v_old := to_jsonb(OLD); v_new := to_jsonb(NEW);
    v_record_id := COALESCE((v_new->>'id'), (v_old->>'id'), '');
  END IF;

  -- Extract registre_id from row (business tables carry it)
  BEGIN
    v_registre_id := COALESCE((v_new->>'registre_id')::uuid, (v_old->>'registre_id')::uuid);
  EXCEPTION WHEN others THEN v_registre_id := NULL; END;

  IF v_registre_id IS NOT NULL THEN
    SELECT name INTO v_registre FROM public.registres WHERE id = v_registre_id;
  END IF;

  v_campaign_label := COALESCE(v_new->>'campaign_label', v_old->>'campaign_label');

  BEGIN
    SELECT email INTO v_email FROM auth.users WHERE id = auth.uid();
  EXCEPTION WHEN others THEN v_email := NULL; END;

  INSERT INTO public.audit_logs (
    table_name, record_id, action, old_data, new_data,
    changed_by, changed_by_email, registre, campaign_label
  ) VALUES (
    TG_TABLE_NAME, v_record_id, TG_OP, v_old, v_new,
    auth.uid(), v_email, v_registre, v_campaign_label
  );

  RETURN COALESCE(NEW, OLD);
END;
$function$;
