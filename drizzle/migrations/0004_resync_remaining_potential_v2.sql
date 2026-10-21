GRANT EXECUTE ON FUNCTION public.sync_producer_potential() TO authenticated;
GRANT EXECUTE ON FUNCTION public.recompute_producer_potential(uuid) TO authenticated;
DROP TRIGGER IF EXISTS trg_sync_producer_potential ON public.deliveries;
CREATE TRIGGER trg_sync_producer_potential AFTER INSERT OR UPDATE OR DELETE ON public.deliveries FOR EACH ROW EXECUTE FUNCTION public.sync_producer_potential();
UPDATE public.producers p SET remaining_potential = GREATEST(COALESCE(p.delivery_potential,0) - COALESCE((SELECT SUM(d.net_weight) FROM public.deliveries d WHERE d.producer_id = p.id),0),0)
WHERE p.remaining_potential IS DISTINCT FROM GREATEST(COALESCE(p.delivery_potential,0) - COALESCE((SELECT SUM(d.net_weight) FROM public.deliveries d WHERE d.producer_id = p.id),0),0);