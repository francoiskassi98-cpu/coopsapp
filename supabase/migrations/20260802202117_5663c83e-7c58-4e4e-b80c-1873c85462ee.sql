
-- 1) dédoublonnage + unicité
DELETE FROM public.user_cooperatives a
USING public.user_cooperatives b
WHERE a.ctid < b.ctid AND a.user_id = b.user_id AND a.cooperative_id = b.cooperative_id;

ALTER TABLE public.user_cooperatives
  ADD CONSTRAINT user_cooperatives_user_id_cooperative_id_key UNIQUE (user_id, cooperative_id);

-- 2) synchronisation automatique registre -> coopérative
CREATE OR REPLACE FUNCTION public.sync_user_cooperative_from_registre()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_coop uuid;
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT cooperative_id INTO v_coop FROM public.registres WHERE id = NEW.registre_id;
    IF v_coop IS NOT NULL THEN
      INSERT INTO public.user_cooperatives (user_id, cooperative_id)
      VALUES (NEW.user_id, v_coop)
      ON CONFLICT (user_id, cooperative_id) DO NOTHING;
    END IF;
    RETURN NEW;
  ELSE
    SELECT cooperative_id INTO v_coop FROM public.registres WHERE id = OLD.registre_id;
    IF v_coop IS NOT NULL
       AND NOT EXISTS (
         SELECT 1 FROM public.user_registres ur
         JOIN public.registres r ON r.id = ur.registre_id
         WHERE ur.user_id = OLD.user_id AND r.cooperative_id = v_coop
       )
       AND NOT EXISTS (
         SELECT 1 FROM public.user_roles x
         WHERE x.user_id = OLD.user_id AND x.role IN ('coop_admin','super_admin')
       )
    THEN
      DELETE FROM public.user_cooperatives
      WHERE user_id = OLD.user_id AND cooperative_id = v_coop;
    END IF;
    RETURN OLD;
  END IF;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_user_cooperative_ins ON public.user_registres;
CREATE TRIGGER trg_sync_user_cooperative_ins
AFTER INSERT ON public.user_registres
FOR EACH ROW EXECUTE FUNCTION public.sync_user_cooperative_from_registre();

DROP TRIGGER IF EXISTS trg_sync_user_cooperative_del ON public.user_registres;
CREATE TRIGGER trg_sync_user_cooperative_del
AFTER DELETE ON public.user_registres
FOR EACH ROW EXECUTE FUNCTION public.sync_user_cooperative_from_registre();

REVOKE EXECUTE ON FUNCTION public.sync_user_cooperative_from_registre() FROM PUBLIC, anon, authenticated;

-- 3) réparation des liaisons existantes
INSERT INTO public.user_cooperatives (user_id, cooperative_id)
SELECT DISTINCT ur.user_id, r.cooperative_id
FROM public.user_registres ur
JOIN public.registres r ON r.id = ur.registre_id
ON CONFLICT (user_id, cooperative_id) DO NOTHING;
