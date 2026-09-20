-- 1) Recalcul du potentiel restant à partir des livraisons réelles
CREATE OR REPLACE FUNCTION public.recompute_producer_potential(_producer_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.producers p
  SET remaining_potential = GREATEST(
        COALESCE(p.delivery_potential, 0)
        - COALESCE((SELECT SUM(d.net_weight) FROM public.deliveries d WHERE d.producer_id = p.id), 0),
        0)
  WHERE p.id = _producer_id;
$$;

CREATE OR REPLACE FUNCTION public.sync_producer_potential()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP <> 'INSERT' AND OLD.producer_id IS NOT NULL THEN
    PERFORM public.recompute_producer_potential(OLD.producer_id);
  END IF;
  IF TG_OP <> 'DELETE' AND NEW.producer_id IS NOT NULL THEN
    PERFORM public.recompute_producer_potential(NEW.producer_id);
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_producer_potential ON public.deliveries;
CREATE TRIGGER trg_sync_producer_potential
AFTER INSERT OR UPDATE OR DELETE ON public.deliveries
FOR EACH ROW EXECUTE FUNCTION public.sync_producer_potential();

-- 2) Recalcul global (registre / campagne optionnels)
CREATE OR REPLACE FUNCTION public.recompute_potentials(_registre_id uuid DEFAULT NULL, _campaign_label text DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_count integer;
BEGIN
  IF _registre_id IS NOT NULL AND NOT public.can_access_registre(_registre_id) THEN
    RAISE EXCEPTION 'Accès refusé sur ce registre';
  END IF;
  IF _registre_id IS NULL AND NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Accès refusé';
  END IF;

  WITH upd AS (
    UPDATE public.producers p
    SET remaining_potential = GREATEST(
          COALESCE(p.delivery_potential, 0)
          - COALESCE((SELECT SUM(d.net_weight) FROM public.deliveries d WHERE d.producer_id = p.id), 0),
          0)
    WHERE (_registre_id IS NULL OR p.registre_id = _registre_id)
      AND (_campaign_label IS NULL OR p.campaign_label = _campaign_label)
    RETURNING 1
  )
  SELECT count(*) INTO v_count FROM upd;
  RETURN v_count;
END;
$$;

-- 3) Suppression atomique d'un chargement (livraisons supprimées en cascade)
CREATE OR REPLACE FUNCTION public.delete_shipment(_shipment_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_registre uuid;
BEGIN
  SELECT registre_id INTO v_registre FROM public.shipments WHERE id = _shipment_id;
  IF v_registre IS NULL THEN
    RAISE EXCEPTION 'Chargement introuvable';
  END IF;
  IF NOT public.can_write_registre(v_registre) THEN
    RAISE EXCEPTION 'Accès refusé sur ce registre';
  END IF;

  DELETE FROM public.deliveries WHERE shipment_id = _shipment_id;
  DELETE FROM public.shipments WHERE id = _shipment_id;
END;
$$;

-- 4) Suppression d'un registre et de toutes ses données dépendantes
CREATE OR REPLACE FUNCTION public.delete_registre(_registre_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_coop uuid;
BEGIN
  SELECT cooperative_id INTO v_coop FROM public.registres WHERE id = _registre_id;
  IF v_coop IS NULL THEN
    RAISE EXCEPTION 'Registre introuvable';
  END IF;
  IF NOT (public.is_super_admin() OR (public.is_coop_admin() AND v_coop = ANY(public.my_cooperative_ids()))) THEN
    RAISE EXCEPTION 'Accès refusé sur ce registre';
  END IF;

  DELETE FROM public.deliveries WHERE registre_id = _registre_id;
  DELETE FROM public.shipments WHERE registre_id = _registre_id;
  DELETE FROM public.producer_bonus_results WHERE registre_id = _registre_id;
  DELETE FROM public.producer_bonus_settings WHERE registre_id = _registre_id;
  DELETE FROM public.disabled_sections WHERE registre_id = _registre_id;
  DELETE FROM public.lot_counters WHERE registre_id = _registre_id;
  DELETE FROM public.producer_registry WHERE registre_id = _registre_id;
  DELETE FROM public.producers WHERE registre_id = _registre_id;
  DELETE FROM public.user_registres WHERE registre_id = _registre_id;
  UPDATE public.shipment_excel_templates SET registre_id = NULL WHERE registre_id = _registre_id;
  DELETE FROM public.registres WHERE id = _registre_id;
END;
$$;

REVOKE ALL ON FUNCTION public.recompute_producer_potential(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.sync_producer_potential() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.recompute_potentials(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.delete_shipment(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.delete_registre(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.recompute_potentials(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_shipment(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_registre(uuid) TO authenticated;

-- 5) Remise à niveau des données existantes
UPDATE public.producers p
SET remaining_potential = GREATEST(
      COALESCE(p.delivery_potential, 0)
      - COALESCE((SELECT SUM(d.net_weight) FROM public.deliveries d WHERE d.producer_id = p.id), 0),
      0);