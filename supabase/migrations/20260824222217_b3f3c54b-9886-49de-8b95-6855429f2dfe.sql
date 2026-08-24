ALTER TABLE public.user_cooperatives
  ADD COLUMN IF NOT EXISTS is_primary_admin boolean NOT NULL DEFAULT false;

-- Backfill : le plus ancien coop_admin de chaque coopérative devient administrateur principal
WITH ranked AS (
  SELECT uc.id,
         ROW_NUMBER() OVER (PARTITION BY uc.cooperative_id ORDER BY uc.created_at ASC, uc.id ASC) AS rn
  FROM public.user_cooperatives uc
  JOIN public.user_roles ur ON ur.user_id = uc.user_id AND ur.role = 'coop_admin'
)
UPDATE public.user_cooperatives uc
SET is_primary_admin = true
FROM ranked r
WHERE r.id = uc.id AND r.rn = 1
  AND NOT EXISTS (
    SELECT 1 FROM public.user_cooperatives x
    WHERE x.cooperative_id = uc.cooperative_id AND x.is_primary_admin
  );

CREATE UNIQUE INDEX IF NOT EXISTS user_cooperatives_one_primary_admin
  ON public.user_cooperatives (cooperative_id)
  WHERE is_primary_admin;

CREATE OR REPLACE FUNCTION public.is_primary_coop_admin(_user_id uuid, _coop_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_cooperatives uc
    JOIN public.user_roles ur ON ur.user_id = uc.user_id AND ur.role = 'coop_admin'
    WHERE uc.user_id = _user_id
      AND uc.cooperative_id = _coop_id
      AND uc.is_primary_admin
  )
$$;

REVOKE EXECUTE ON FUNCTION public.is_primary_coop_admin(uuid, uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.is_primary_coop_admin(uuid, uuid) TO authenticated, service_role;

-- RPC de provisioning : l'admin créé avec la coopérative est l'administrateur principal
CREATE OR REPLACE FUNCTION public.create_cooperative_with_admin(p_user_id uuid, p_full_name text, p_phone text, p_coop jsonb, p_sub_start date DEFAULT NULL::date, p_sub_end date DEFAULT NULL::date, p_plan text DEFAULT 'Pilote'::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_coop_id uuid;
  v_year int := EXTRACT(YEAR FROM now());
  v_start date := COALESCE(p_sub_start, make_date(v_year, 9, 1));
  v_end date := COALESCE(p_sub_end, make_date(v_year, 11, 30));
BEGIN
  INSERT INTO public.cooperatives (
    name, acronym, rccm, tax_number, phone, address, city, country,
    official_email, logo_path, president_name, estimated_producers,
    certification_type, subscription_status
  ) VALUES (
    p_coop->>'name', p_coop->>'acronym', p_coop->>'rccm', p_coop->>'tax_number',
    p_coop->>'phone', p_coop->>'address', p_coop->>'city', p_coop->>'country',
    p_coop->>'official_email',
    COALESCE(p_coop->>'logo_path', p_coop->>'logo_url'),
    p_coop->>'president_name',
    NULLIF(p_coop->>'estimated_producers','')::integer,
    NULLIF(p_coop->>'certification_type','')::public.certification_type,
    'trial'
  ) RETURNING id INTO v_coop_id;

  UPDATE public.profiles
  SET full_name = COALESCE(p_full_name, full_name),
      phone = COALESCE(p_phone, phone)
  WHERE user_id = p_user_id;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (p_user_id, 'coop_admin')
  ON CONFLICT (user_id, role) DO NOTHING;
  DELETE FROM public.user_roles WHERE user_id = p_user_id AND role = 'agent';

  INSERT INTO public.user_cooperatives (user_id, cooperative_id, is_primary_admin)
  VALUES (p_user_id, v_coop_id, true)
  ON CONFLICT (user_id, cooperative_id) DO UPDATE SET is_primary_admin = true;

  INSERT INTO public.subscriptions (
    cooperative_id, plan_name, start_date, end_date, status, created_by
  ) VALUES (
    v_coop_id, p_plan, v_start, v_end, 'trial', p_user_id
  );

  RETURN v_coop_id;
END;
$function$;

-- RLS : écriture réservée au super_admin, lecture pour les admins de la coopérative
DROP POLICY IF EXISTS uc_admin_all ON public.user_cooperatives;
CREATE POLICY uc_super_admin_all ON public.user_cooperatives
  FOR ALL TO authenticated
  USING (is_super_admin()) WITH CHECK (is_super_admin());
CREATE POLICY uc_coop_admin_read ON public.user_cooperatives
  FOR SELECT TO authenticated
  USING (is_coop_admin() AND cooperative_id = ANY (my_cooperative_ids()));