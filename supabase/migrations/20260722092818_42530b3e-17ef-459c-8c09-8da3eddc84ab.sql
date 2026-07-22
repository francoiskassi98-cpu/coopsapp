
-- 1) next_lot_number : passer en SECURITY INVOKER pour que la RLS filtre naturellement
CREATE OR REPLACE FUNCTION public.next_lot_number(p_registre uuid, p_campaign_label text)
RETURNS text
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE v_max int; v_next int;
BEGIN
  SELECT COALESCE(MAX( NULLIF(regexp_replace(lot_number,'\D','','g'),'')::int ), 0)
    INTO v_max
  FROM public.shipments
  WHERE registre_id = p_registre AND campaign_label = p_campaign_label AND lot_number IS NOT NULL;
  v_next := v_max + 1;
  RETURN 'LOT-' || lpad(v_next::text, 4, '0');
END;
$$;

REVOKE ALL ON FUNCTION public.next_lot_number(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.next_lot_number(uuid, text) TO authenticated, service_role;

-- 2) Révoquer les droits publics/anon restant sur les autres fonctions SECURITY DEFINER
REVOKE ALL ON FUNCTION public.my_registre_ids() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_registre_ids() TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.can_access_registre(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_access_registre(uuid) TO authenticated, service_role;

-- 3) search_path verrouillé sur les 2 fonctions concernées
CREATE OR REPLACE FUNCTION public.compute_campaign_label(d timestamp with time zone)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN EXTRACT(MONTH FROM d)::int >= 9
      THEN EXTRACT(YEAR FROM d)::int::text || '-' || (EXTRACT(YEAR FROM d)::int + 1)::text
    ELSE (EXTRACT(YEAR FROM d)::int - 1)::text || '-' || EXTRACT(YEAR FROM d)::int::text
  END;
$$;

CREATE OR REPLACE FUNCTION public.set_campaign_label_from_created()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.campaign_label IS NULL THEN
    NEW.campaign_label := public.compute_campaign_label(COALESCE(NEW.created_at, now()));
  END IF;
  RETURN NEW;
END;
$$;

-- 4) Storage : cooperative-logos - lecture restreinte au super_admin ou au dossier de la coop
DROP POLICY IF EXISTS "coop_logos_read" ON storage.objects;
CREATE POLICY "coop_logos_read" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'cooperative-logos'
    AND (
      public.is_super_admin()
      OR (NULLIF((storage.foldername(name))[1], '')::uuid = ANY (public.my_cooperative_ids()))
    )
  );

-- 5) Storage : partner-logos - lecture ET écriture scopées par dossier de coopérative
DROP POLICY IF EXISTS "Auth users read partner-logos" ON storage.objects;
CREATE POLICY "partner_logos_read" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'partner-logos'
    AND (
      public.is_super_admin()
      OR (NULLIF((storage.foldername(name))[1], '')::uuid = ANY (public.my_cooperative_ids()))
    )
  );

DROP POLICY IF EXISTS "Admins upload partner-logos" ON storage.objects;
CREATE POLICY "partner_logos_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'partner-logos'
    AND (
      public.is_super_admin()
      OR (
        public.is_coop_admin()
        AND NULLIF((storage.foldername(name))[1], '')::uuid = ANY (public.my_cooperative_ids())
      )
    )
  );

DROP POLICY IF EXISTS "Admins update partner-logos" ON storage.objects;
CREATE POLICY "partner_logos_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'partner-logos'
    AND (
      public.is_super_admin()
      OR (
        public.is_coop_admin()
        AND NULLIF((storage.foldername(name))[1], '')::uuid = ANY (public.my_cooperative_ids())
      )
    )
  )
  WITH CHECK (
    bucket_id = 'partner-logos'
    AND (
      public.is_super_admin()
      OR (
        public.is_coop_admin()
        AND NULLIF((storage.foldername(name))[1], '')::uuid = ANY (public.my_cooperative_ids())
      )
    )
  );

DROP POLICY IF EXISTS "Admins delete partner-logos" ON storage.objects;
CREATE POLICY "partner_logos_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'partner-logos'
    AND (
      public.is_super_admin()
      OR (
        public.is_coop_admin()
        AND NULLIF((storage.foldername(name))[1], '')::uuid = ANY (public.my_cooperative_ids())
      )
    )
  );

-- 6) producer_bonus_results : politique SELECT explicite (en plus de la politique FOR ALL existante)
DROP POLICY IF EXISTS "pbr_registre_select" ON public.producer_bonus_results;
CREATE POLICY "pbr_registre_select" ON public.producer_bonus_results
  FOR SELECT TO authenticated
  USING (public.can_access_registre(registre_id));
