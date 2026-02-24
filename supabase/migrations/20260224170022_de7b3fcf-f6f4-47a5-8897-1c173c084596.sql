
-- 1. Ajouter is_cancelled à shipments
ALTER TABLE public.shipments ADD COLUMN IF NOT EXISTS is_cancelled boolean NOT NULL DEFAULT false;

-- 2. Marquer les shipments déjà annulés (status='cancelled') comme is_cancelled=true
UPDATE public.shipments SET is_cancelled = true WHERE status = 'cancelled';

-- 3. Créer la RPC sécurisée pour annuler un connaissement
--    Elle ne supprime RIEN, ne modifie AUCUN poids/potentiel.
--    Elle met juste is_cancelled=true et insère dans cancellations.
CREATE OR REPLACE FUNCTION public.cancel_shipment(
  p_shipment_id uuid,
  p_reason text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_connaissement text;
  v_total_weight numeric;
  v_total_bags integer;
BEGIN
  -- Vérifier que le shipment existe et n'est pas déjà annulé
  SELECT connaissement, total_weight, total_bags
  INTO v_connaissement, v_total_weight, v_total_bags
  FROM shipments
  WHERE id = p_shipment_id AND is_cancelled = false;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Chargement introuvable ou déjà annulé';
  END IF;

  -- Marquer comme annulé (aucune suppression)
  UPDATE shipments
  SET is_cancelled = true, status = 'cancelled'
  WHERE id = p_shipment_id;

  -- Archiver dans cancellations
  INSERT INTO cancellations (shipment_id, connaissement, total_weight, total_bags, reason)
  VALUES (p_shipment_id, v_connaissement, v_total_weight, v_total_bags, p_reason);
END;
$$;
