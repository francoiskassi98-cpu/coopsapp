CREATE OR REPLACE FUNCTION public.create_registre_for_import(p_name text, p_cooperative_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_id uuid; v_name text := btrim(p_name);
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Non authentifié'; END IF;
  IF v_name IS NULL OR v_name = '' THEN RAISE EXCEPTION 'Nom de registre obligatoire'; END IF;
  IF NOT (p_cooperative_id = ANY (public.my_cooperative_ids())) THEN
    RAISE EXCEPTION 'Accès refusé à cette coopérative';
  END IF;
  IF NOT public.coop_subscription_active(p_cooperative_id) THEN
    RAISE EXCEPTION 'Abonnement inactif';
  END IF;

  SELECT id INTO v_id FROM public.registres
  WHERE cooperative_id = p_cooperative_id AND lower(btrim(name)) = lower(v_name) LIMIT 1;

  IF v_id IS NOT NULL THEN
    IF NOT public.can_access_registre(v_id) THEN
      RAISE EXCEPTION 'Le registre « % » existe déjà. Demandez à un administrateur de vous y donner accès.', v_name;
    END IF;
    RETURN v_id;
  END IF;

  INSERT INTO public.registres (name, cooperative_id, status)
  VALUES (v_name, p_cooperative_id, 'active') RETURNING id INTO v_id;

  IF NOT public.is_super_admin() AND NOT public.is_coop_admin() THEN
    INSERT INTO public.user_registres (user_id, registre_id) VALUES (auth.uid(), v_id)
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN v_id;
END $$;

REVOKE ALL ON FUNCTION public.create_registre_for_import(text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_registre_for_import(text, uuid) TO authenticated, service_role;