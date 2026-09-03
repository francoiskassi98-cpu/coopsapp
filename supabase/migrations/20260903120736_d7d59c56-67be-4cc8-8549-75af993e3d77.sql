CREATE OR REPLACE FUNCTION public.validate_shipment_rules()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.delivery_start > CURRENT_DATE OR NEW.delivery_end > CURRENT_DATE THEN
    RAISE EXCEPTION 'Pas possible d''effectuer un chargement avec cette date.';
  END IF;
  IF NEW.delivery_end < NEW.delivery_start THEN
    RAISE EXCEPTION 'La date de fin doit être postérieure ou égale à la date de début.';
  END IF;
  -- Le sac moyen est dynamique (poids total / nombre de sacs) : aucune limite fixe.
  RETURN NEW;
END;
$function$;