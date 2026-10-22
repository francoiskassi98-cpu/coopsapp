CREATE OR REPLACE FUNCTION public.protect_subscription_price()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF (NEW.subscription_price_xof IS DISTINCT FROM OLD.subscription_price_xof
      OR NEW.subscription_period_months IS DISTINCT FROM OLD.subscription_period_months)
     AND auth.uid() IS NOT NULL AND NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Seul le super administrateur peut modifier le montant de l''abonnement.';
  END IF;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.protect_subscription_price() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER trg_protect_subscription_price BEFORE UPDATE ON public.cooperatives
FOR EACH ROW EXECUTE FUNCTION public.protect_subscription_price();