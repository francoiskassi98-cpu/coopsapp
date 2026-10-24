ALTER TABLE public.shipments ADD COLUMN IF NOT EXISTS trashed_deliveries jsonb;

CREATE OR REPLACE FUNCTION public.delete_shipment(_shipment_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_registre uuid; v_snap jsonb;
BEGIN
  SELECT registre_id INTO v_registre FROM public.shipments WHERE id = _shipment_id AND deleted_at IS NULL;
  IF v_registre IS NULL THEN RAISE EXCEPTION 'Chargement introuvable'; END IF;
  IF NOT public.can_write_registre(v_registre) THEN RAISE EXCEPTION 'Accès refusé sur ce registre'; END IF;
  SELECT COALESCE(jsonb_agg(to_jsonb(d)), '[]'::jsonb) INTO v_snap FROM public.deliveries d WHERE d.shipment_id = _shipment_id;
  DELETE FROM public.deliveries WHERE shipment_id = _shipment_id;
  UPDATE public.shipments SET deleted_at = now(), trashed_deliveries = v_snap WHERE id = _shipment_id;
END $$;

CREATE OR REPLACE FUNCTION public.restore_shipment(_shipment_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_registre uuid; v_snap jsonb;
BEGIN
  SELECT registre_id, trashed_deliveries INTO v_registre, v_snap FROM public.shipments WHERE id = _shipment_id AND deleted_at IS NOT NULL;
  IF v_registre IS NULL THEN RAISE EXCEPTION 'Chargement introuvable dans la corbeille'; END IF;
  IF NOT public.can_write_registre(v_registre) THEN RAISE EXCEPTION 'Accès refusé sur ce registre'; END IF;
  UPDATE public.shipments SET deleted_at = NULL, trashed_deliveries = NULL WHERE id = _shipment_id;
  IF v_snap IS NOT NULL THEN
    INSERT INTO public.deliveries (id, shipment_id, producer_id, receipt_number, delivery_date, net_weight, num_bags, created_at, registre_id, campaign_label)
    SELECT (e->>'id')::uuid, _shipment_id, (e->>'producer_id')::uuid, e->>'receipt_number', (e->>'delivery_date')::date,
           (e->>'net_weight')::numeric, (e->>'num_bags')::int, (e->>'created_at')::timestamptz, (e->>'registre_id')::uuid, e->>'campaign_label'
    FROM jsonb_array_elements(v_snap) e;
  END IF;
END $$;

REVOKE ALL ON FUNCTION public.restore_shipment(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.restore_shipment(uuid) TO authenticated;