CREATE OR REPLACE FUNCTION public.update_shipment_quantities(_shipment_id uuid, _total_weight numeric, _total_bags integer, _rows jsonb)
 RETURNS void LANGUAGE plpgsql SET search_path TO 'public'
AS $function$
DECLARE r record; v_old record; v_sw numeric; v_sb integer;
BEGIN
  SELECT total_weight, total_bags, registre_id INTO v_old FROM public.shipments WHERE id = _shipment_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Chargement introuvable.'; END IF;
  IF NOT public.can_write_registre(v_old.registre_id) THEN RAISE EXCEPTION 'Accès refusé.'; END IF;
  UPDATE public.shipments SET total_weight = GREATEST(v_old.total_weight, _total_weight),
    total_bags = GREATEST(v_old.total_bags, _total_bags) WHERE id = _shipment_id;
  -- Suppressions et baisses d'abord, hausses ensuite : les sommes intermédiaires ne dépassent jamais le total.
  FOR r IN
    SELECT (e->>'id')::uuid AS id, (e->>'weight')::numeric AS w, (e->>'bags')::int AS b,
           ((e->>'weight')::numeric - d.net_weight) AS dw, ((e->>'bags')::int - d.num_bags) AS db
    FROM jsonb_array_elements(_rows) e
    JOIN public.deliveries d ON d.id = (e->>'id')::uuid AND d.shipment_id = _shipment_id
    ORDER BY (CASE WHEN (e->>'bags')::int <= 0 THEN 0 ELSE 1 END), GREATEST(((e->>'weight')::numeric - d.net_weight), 0) + GREATEST(((e->>'bags')::int - d.num_bags), 0)
  LOOP
    IF r.b <= 0 THEN
      DELETE FROM public.deliveries WHERE id = r.id;
    ELSE
      UPDATE public.deliveries SET net_weight = r.w, num_bags = r.b WHERE id = r.id;
    END IF;
  END LOOP;
  SELECT COALESCE(SUM(net_weight),0), COALESCE(SUM(num_bags),0) INTO v_sw, v_sb FROM public.deliveries WHERE shipment_id = _shipment_id;
  IF v_sw <> _total_weight OR v_sb <> _total_bags THEN
    RAISE EXCEPTION 'La distribution ne correspond pas exactement aux quantités déclarées.';
  END IF;
  UPDATE public.shipments SET total_weight = _total_weight, total_bags = _total_bags,
    avg_bag_weight = _total_weight / _total_bags WHERE id = _shipment_id;
END $function$;