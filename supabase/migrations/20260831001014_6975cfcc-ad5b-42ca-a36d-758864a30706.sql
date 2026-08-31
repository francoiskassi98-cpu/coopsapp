-- 1) Entiers stricts (nouvelles lignes uniquement, l'historique existant reste inchangé)
ALTER TABLE public.deliveries
  ADD CONSTRAINT deliveries_integer_amounts_chk
  CHECK (net_weight > 0 AND net_weight = trunc(net_weight) AND num_bags > 0) NOT VALID;

ALTER TABLE public.shipments
  ADD CONSTRAINT shipments_integer_amounts_chk
  CHECK (total_weight > 0 AND total_weight = trunc(total_weight) AND total_bags > 0) NOT VALID;

-- 2) La somme distribuée ne peut jamais dépasser les quantités déclarées du chargement
CREATE OR REPLACE FUNCTION public.validate_delivery_totals()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total_weight numeric;
  v_total_bags integer;
  v_sum_weight numeric;
  v_sum_bags integer;
BEGIN
  SELECT s.total_weight, s.total_bags INTO v_total_weight, v_total_bags
  FROM public.shipments s WHERE s.id = NEW.shipment_id;

  IF v_total_weight IS NULL THEN
    RAISE EXCEPTION 'Chargement introuvable pour cette livraison.';
  END IF;

  SELECT COALESCE(SUM(d.net_weight), 0), COALESCE(SUM(d.num_bags), 0)
  INTO v_sum_weight, v_sum_bags
  FROM public.deliveries d WHERE d.shipment_id = NEW.shipment_id;

  IF v_sum_weight > v_total_weight THEN
    RAISE EXCEPTION 'La distribution ne correspond pas exactement aux quantités déclarées (poids distribué % kg > poids déclaré % kg).', v_sum_weight, v_total_weight;
  END IF;

  IF v_sum_bags > v_total_bags THEN
    RAISE EXCEPTION 'La distribution ne correspond pas exactement aux quantités déclarées (sacs distribués % > sacs déclarés %).', v_sum_bags, v_total_bags;
  END IF;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_delivery_totals ON public.deliveries;
CREATE TRIGGER trg_validate_delivery_totals
AFTER INSERT OR UPDATE OF net_weight, num_bags, shipment_id ON public.deliveries
FOR EACH ROW EXECUTE FUNCTION public.validate_delivery_totals();

REVOKE EXECUTE ON FUNCTION public.validate_delivery_totals() FROM PUBLIC, anon;