CREATE OR REPLACE FUNCTION public.update_shipment_quantities(_shipment_id uuid, _total_weight numeric, _total_bags integer, _rows jsonb)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path TO 'public' AS $$
DECLARE r jsonb; v_old record; v_sw numeric; v_sb integer;
BEGIN
  SELECT total_weight, total_bags, registre_id INTO v_old FROM public.shipments WHERE id = _shipment_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Chargement introuvable.'; END IF;
  IF NOT public.can_write_registre(v_old.registre_id) THEN RAISE EXCEPTION 'Accès refusé.'; END IF;
  UPDATE public.shipments SET total_weight = GREATEST(v_old.total_weight, _total_weight),
    total_bags = GREATEST(v_old.total_bags, _total_bags) WHERE id = _shipment_id;
  FOR r IN SELECT * FROM jsonb_array_elements(_rows) LOOP
    IF (r->>'bags')::int <= 0 THEN
      DELETE FROM public.deliveries WHERE id = (r->>'id')::uuid AND shipment_id = _shipment_id;
    ELSE
      UPDATE public.deliveries SET net_weight = (r->>'weight')::numeric, num_bags = (r->>'bags')::int
      WHERE id = (r->>'id')::uuid AND shipment_id = _shipment_id;
    END IF;
  END LOOP;
  SELECT COALESCE(SUM(net_weight),0), COALESCE(SUM(num_bags),0) INTO v_sw, v_sb FROM public.deliveries WHERE shipment_id = _shipment_id;
  IF v_sw <> _total_weight OR v_sb <> _total_bags THEN
    RAISE EXCEPTION 'La distribution ne correspond pas exactement aux quantités déclarées.';
  END IF;
  UPDATE public.shipments SET total_weight = _total_weight, total_bags = _total_bags,
    avg_bag_weight = _total_weight / _total_bags WHERE id = _shipment_id;
END $$;
REVOKE ALL ON FUNCTION public.update_shipment_quantities(uuid, numeric, integer, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_shipment_quantities(uuid, numeric, integer, jsonb) TO authenticated, service_role;