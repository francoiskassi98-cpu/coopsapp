CREATE OR REPLACE FUNCTION public.validate_shipment_rules()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.delivery_start > CURRENT_DATE OR NEW.delivery_end > CURRENT_DATE THEN
    RAISE EXCEPTION 'Pas possible d''effectuer un chargement avec cette date.';
  END IF;
  IF NEW.delivery_end < NEW.delivery_start THEN
    RAISE EXCEPTION 'La date de fin doit être postérieure ou égale à la date de début.';
  END IF;
  IF NEW.avg_bag_weight IS NOT NULL AND NEW.avg_bag_weight < 10 THEN
    RAISE EXCEPTION 'Poids moyen par sac trop faible — minimum 10 kg.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_shipment_rules ON public.shipments;
CREATE TRIGGER trg_validate_shipment_rules
BEFORE INSERT OR UPDATE OF delivery_start, delivery_end, avg_bag_weight ON public.shipments
FOR EACH ROW EXECUTE FUNCTION public.validate_shipment_rules();