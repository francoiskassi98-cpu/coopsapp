CREATE OR REPLACE FUNCTION public.create_shipment_with_deliveries(p_shipment jsonb, p_deliveries jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE v_s public.shipments; v_id uuid; v_count integer; v_weight numeric; v_bags bigint;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Non authentifié'; END IF;
  v_s := jsonb_populate_record(NULL::public.shipments, p_shipment);
  IF v_s.client_request_id IS NULL THEN RAISE EXCEPTION 'Identifiant obligatoire'; END IF;
  IF NOT public.can_write_registre(v_s.registre_id) THEN RAISE EXCEPTION 'Accès refusé'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(v_s.client_request_id::text, 0));
  SELECT id INTO v_id FROM public.shipments WHERE client_request_id=v_s.client_request_id AND deleted_at IS NULL;
  IF v_id IS NOT NULL THEN
    SELECT count(*),coalesce(sum(net_weight),0),coalesce(sum(num_bags),0) INTO v_count,v_weight,v_bags FROM public.deliveries WHERE shipment_id=v_id;
    IF v_count=0 OR NOT EXISTS (SELECT 1 FROM public.shipments WHERE id=v_id AND total_weight=v_weight AND total_bags=v_bags) THEN RAISE EXCEPTION 'Chargement incomplet'; END IF;
    RETURN v_id;
  END IF;
  IF jsonb_typeof(p_deliveries) IS DISTINCT FROM 'array' OR jsonb_array_length(p_deliveries)=0 THEN RAISE EXCEPTION 'Livraisons obligatoires'; END IF;
  IF v_s.total_weight IS NULL OR v_s.total_bags IS NULL OR v_s.total_bags<=0 OR v_s.total_weight/v_s.total_bags NOT BETWEEN 10 AND 110 THEN RAISE EXCEPTION 'Poids par sac invalide'; END IF;
  IF EXISTS (SELECT 1 FROM jsonb_to_recordset(p_deliveries) AS d(producer_id uuid,net_weight numeric,num_bags integer)
    LEFT JOIN public.producers p ON p.id=d.producer_id
    WHERE p.id IS NULL OR p.registre_id IS DISTINCT FROM v_s.registre_id OR p.campaign_label IS DISTINCT FROM v_s.campaign_label OR NOT p.is_active OR p.deleted_at IS NOT NULL
      OR d.net_weight IS NULL OR d.num_bags IS NULL OR d.num_bags NOT BETWEEN 1 AND 15 OR d.net_weight<50 OR d.net_weight<>trunc(d.net_weight) OR d.net_weight/d.num_bags NOT BETWEEN 10 AND 110)
    THEN RAISE EXCEPTION 'Livraison invalide'; END IF;
  v_id := gen_random_uuid();
  INSERT INTO public.shipments(id,connaissement,total_weight,total_bags,avg_bag_weight,project,project_id,template_id,partner_id,zone,registre_id,destination,campaign_label,lot_number,delivery_start,delivery_end,driver_name,truck_number,trailer_number,departure_date,client_request_id)
  VALUES(v_id,v_s.connaissement,v_s.total_weight,v_s.total_bags,v_s.avg_bag_weight,v_s.project,v_s.project_id,v_s.template_id,v_s.partner_id,v_s.zone,v_s.registre_id,v_s.destination,v_s.campaign_label,v_s.lot_number,v_s.delivery_start,v_s.delivery_end,v_s.driver_name,v_s.truck_number,v_s.trailer_number,v_s.departure_date,v_s.client_request_id);
  INSERT INTO public.deliveries(shipment_id,producer_id,receipt_number,delivery_date,net_weight,num_bags,registre_id,campaign_label)
  SELECT v_id,d.producer_id,d.receipt_number,d.delivery_date,d.net_weight,d.num_bags,v_s.registre_id,v_s.campaign_label FROM jsonb_to_recordset(p_deliveries) AS d(producer_id uuid,receipt_number text,delivery_date date,net_weight numeric,num_bags integer);
  SELECT count(*),sum(net_weight),sum(num_bags) INTO v_count,v_weight,v_bags FROM public.deliveries WHERE shipment_id=v_id;
  IF v_count=0 OR v_weight<>v_s.total_weight OR v_bags<>v_s.total_bags THEN RAISE EXCEPTION 'Distribution non exacte'; END IF;
  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION public.create_shipment_with_deliveries(jsonb,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_shipment_with_deliveries(jsonb,jsonb) TO authenticated;
