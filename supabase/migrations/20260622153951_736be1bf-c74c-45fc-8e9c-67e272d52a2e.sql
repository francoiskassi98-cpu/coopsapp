
-- =========================================================================
-- 1) ENUM app_role : admin -> super_admin, ajout coop_admin
-- =========================================================================
ALTER TABLE public.user_roles ALTER COLUMN role DROP DEFAULT;

CREATE TYPE public.app_role_new AS ENUM ('super_admin', 'coop_admin', 'agent');

ALTER TABLE public.user_roles
  ALTER COLUMN role TYPE public.app_role_new
  USING (CASE role::text WHEN 'admin' THEN 'super_admin' ELSE role::text END::public.app_role_new);

DROP TYPE public.app_role CASCADE;
ALTER TYPE public.app_role_new RENAME TO app_role;

ALTER TABLE public.user_roles ALTER COLUMN role SET DEFAULT 'agent'::public.app_role;

-- =========================================================================
-- 2) Fonctions de rôle
-- =========================================================================
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id=_user_id AND role=_role); $$;

CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id=auth.uid() AND role='super_admin'); $$;

CREATE OR REPLACE FUNCTION public.is_coop_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id=auth.uid() AND role='coop_admin'); $$;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT public.is_super_admin(); $$;

-- =========================================================================
-- 3) Recréer les policies que CASCADE a supprimées
-- =========================================================================
CREATE POLICY "Admins read audit logs" ON public.audit_logs
  FOR SELECT USING (public.is_super_admin());

CREATE POLICY "Admins can view all profiles" ON public.profiles
  FOR SELECT USING (public.is_super_admin());
CREATE POLICY "Admins can insert profiles" ON public.profiles
  FOR INSERT WITH CHECK (public.is_super_admin() OR auth.uid() = user_id);
CREATE POLICY "Admins can delete profiles" ON public.profiles
  FOR DELETE USING (public.is_super_admin());

CREATE POLICY "Admins can view all roles" ON public.user_roles
  FOR SELECT USING (public.is_super_admin());
CREATE POLICY "Admins can manage roles" ON public.user_roles
  FOR ALL USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());

-- =========================================================================
-- 4) Enums métier
-- =========================================================================
CREATE TYPE public.certification_type AS ENUM ('fairtrade', 'rainforest', 'eudr', 'ordinaire');
CREATE TYPE public.subscription_status AS ENUM ('trial', 'active', 'suspended', 'expired');

-- =========================================================================
-- 5) cooperatives : extension
-- =========================================================================
ALTER TABLE public.cooperatives
  ADD COLUMN IF NOT EXISTS acronym text,
  ADD COLUMN IF NOT EXISTS rccm text,
  ADD COLUMN IF NOT EXISTS tax_number text,
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS address text,
  ADD COLUMN IF NOT EXISTS city text,
  ADD COLUMN IF NOT EXISTS country text,
  ADD COLUMN IF NOT EXISTS official_email text,
  ADD COLUMN IF NOT EXISTS logo_url text,
  ADD COLUMN IF NOT EXISTS president_name text,
  ADD COLUMN IF NOT EXISTS estimated_producers integer,
  ADD COLUMN IF NOT EXISTS certification_type public.certification_type,
  ADD COLUMN IF NOT EXISTS subscription_status public.subscription_status NOT NULL DEFAULT 'trial',
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE UNIQUE INDEX IF NOT EXISTS cooperatives_official_email_key
  ON public.cooperatives (lower(official_email)) WHERE official_email IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS cooperatives_name_key
  ON public.cooperatives (lower(name));

-- =========================================================================
-- 6) profiles : extension
-- =========================================================================
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS full_name text,
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS active boolean NOT NULL DEFAULT true;

-- =========================================================================
-- 7) user_cooperatives : migration texte -> uuid
-- =========================================================================
ALTER TABLE public.user_cooperatives
  ADD COLUMN IF NOT EXISTS cooperative_id uuid REFERENCES public.cooperatives(id) ON DELETE CASCADE;

INSERT INTO public.cooperatives (name)
SELECT DISTINCT uc.cooperative
FROM public.user_cooperatives uc
LEFT JOIN public.cooperatives c ON lower(c.name) = lower(uc.cooperative)
WHERE c.id IS NULL AND uc.cooperative IS NOT NULL;

UPDATE public.user_cooperatives uc
SET cooperative_id = c.id
FROM public.cooperatives c
WHERE lower(c.name) = lower(uc.cooperative)
  AND uc.cooperative_id IS NULL;

ALTER TABLE public.user_cooperatives ALTER COLUMN cooperative_id SET NOT NULL;
ALTER TABLE public.user_cooperatives DROP COLUMN cooperative;

CREATE UNIQUE INDEX IF NOT EXISTS user_cooperatives_user_coop_unique
  ON public.user_cooperatives (user_id, cooperative_id);

CREATE OR REPLACE FUNCTION public.my_cooperative_ids()
RETURNS uuid[] LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT COALESCE(array_agg(cooperative_id), ARRAY[]::uuid[])
  FROM public.user_cooperatives WHERE user_id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.my_cooperative_names()
RETURNS text[] LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT COALESCE(array_agg(lower(c.name)), ARRAY[]::text[])
  FROM public.user_cooperatives uc
  JOIN public.cooperatives c ON c.id = uc.cooperative_id
  WHERE uc.user_id = auth.uid();
$$;

-- =========================================================================
-- 8) handle_new_user (full_name, phone)
-- =========================================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (user_id, username, email, full_name, phone)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'username', split_part(NEW.email, '@', 1)),
    NEW.email,
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'phone'
  );
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'agent');
  RETURN NEW;
END;
$$;

-- =========================================================================
-- 9) subscriptions
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cooperative_id uuid NOT NULL REFERENCES public.cooperatives(id) ON DELETE CASCADE,
  plan_name text NOT NULL,
  amount numeric(12,2),
  payment_date date,
  start_date date NOT NULL,
  end_date date NOT NULL,
  status public.subscription_status NOT NULL DEFAULT 'trial',
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.subscriptions TO authenticated;
GRANT ALL ON public.subscriptions TO service_role;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "subs_super_admin_all" ON public.subscriptions
  FOR ALL USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());

CREATE POLICY "subs_member_read" ON public.subscriptions
  FOR SELECT USING (cooperative_id = ANY (public.my_cooperative_ids()));

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger LANGUAGE plpgsql SET search_path = public
AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER trg_subscriptions_updated
  BEFORE UPDATE ON public.subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_cooperatives_updated
  BEFORE UPDATE ON public.cooperatives
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_subscriptions_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.log_audit();

-- =========================================================================
-- 10) RPC create_cooperative_with_admin
-- =========================================================================
CREATE OR REPLACE FUNCTION public.create_cooperative_with_admin(
  p_user_id uuid,
  p_full_name text,
  p_phone text,
  p_coop jsonb
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_coop_id uuid;
  v_year int := EXTRACT(YEAR FROM now());
BEGIN
  INSERT INTO public.cooperatives (
    name, acronym, rccm, tax_number, phone, address, city, country,
    official_email, logo_url, president_name, estimated_producers,
    certification_type, subscription_status
  ) VALUES (
    p_coop->>'name', p_coop->>'acronym', p_coop->>'rccm', p_coop->>'tax_number',
    p_coop->>'phone', p_coop->>'address', p_coop->>'city', p_coop->>'country',
    p_coop->>'official_email', p_coop->>'logo_url', p_coop->>'president_name',
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

  INSERT INTO public.user_cooperatives (user_id, cooperative_id)
  VALUES (p_user_id, v_coop_id)
  ON CONFLICT DO NOTHING;

  INSERT INTO public.subscriptions (
    cooperative_id, plan_name, start_date, end_date, status, created_by
  ) VALUES (
    v_coop_id, 'Pilote',
    make_date(v_year, 9, 1),
    make_date(v_year, 11, 30),
    'trial', p_user_id
  );

  RETURN v_coop_id;
END; $$;

REVOKE ALL ON FUNCTION public.create_cooperative_with_admin(uuid, text, text, jsonb) FROM public;
GRANT EXECUTE ON FUNCTION public.create_cooperative_with_admin(uuid, text, text, jsonb) TO service_role;
