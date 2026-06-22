
-- Partners: cooperative scoping + logo + soft delete
ALTER TABLE public.partners
  ADD COLUMN IF NOT EXISTS logo_url text,
  ADD COLUMN IF NOT EXISTS cooperative_id uuid REFERENCES public.cooperatives(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS contact text,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- Shipments: lot_number + soft delete
ALTER TABLE public.shipments
  ADD COLUMN IF NOT EXISTS lot_number text,
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS shipments_lot_unique
  ON public.shipments(cooperative_id, campaign_id, lot_number)
  WHERE lot_number IS NOT NULL;

-- Cooperatives + producers: soft delete
ALTER TABLE public.cooperatives ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE public.producers ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

-- RPC: next lot number
CREATE OR REPLACE FUNCTION public.next_lot_number(p_coop uuid, p_campaign uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_max int;
  v_next int;
BEGIN
  SELECT COALESCE(MAX( NULLIF(regexp_replace(lot_number, '\D','','g'),'')::int ), 0)
    INTO v_max
  FROM public.shipments
  WHERE cooperative_id = p_coop AND campaign_id = p_campaign AND lot_number IS NOT NULL;
  v_next := v_max + 1;
  RETURN 'LOT-' || lpad(v_next::text, 4, '0');
END;
$$;

-- RPC create_cooperative_with_admin: paramétrable dates + plan
CREATE OR REPLACE FUNCTION public.create_cooperative_with_admin(
  p_user_id uuid,
  p_full_name text,
  p_phone text,
  p_coop jsonb,
  p_sub_start date DEFAULT NULL,
  p_sub_end date DEFAULT NULL,
  p_plan text DEFAULT 'Pilote'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_coop_id uuid;
  v_year int := EXTRACT(YEAR FROM now());
  v_start date := COALESCE(p_sub_start, make_date(v_year, 9, 1));
  v_end date := COALESCE(p_sub_end, make_date(v_year, 11, 30));
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
    v_coop_id, p_plan, v_start, v_end, 'trial', p_user_id
  );

  RETURN v_coop_id;
END;
$$;

-- Triggers updated_at
DROP TRIGGER IF EXISTS partners_updated_at ON public.partners;
CREATE TRIGGER partners_updated_at BEFORE UPDATE ON public.partners
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Triggers audit (idempotent recreate)
DROP TRIGGER IF EXISTS audit_partners ON public.partners;
CREATE TRIGGER audit_partners
  AFTER INSERT OR UPDATE OR DELETE ON public.partners
  FOR EACH ROW EXECUTE FUNCTION public.log_audit();

DROP TRIGGER IF EXISTS audit_cooperatives ON public.cooperatives;
CREATE TRIGGER audit_cooperatives
  AFTER INSERT OR UPDATE OR DELETE ON public.cooperatives
  FOR EACH ROW EXECUTE FUNCTION public.log_audit();

DROP TRIGGER IF EXISTS audit_subscriptions ON public.subscriptions;
CREATE TRIGGER audit_subscriptions
  AFTER INSERT OR UPDATE OR DELETE ON public.subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.log_audit();

-- Reset RLS partners (scoped to coop + super_admin)
DROP POLICY IF EXISTS "partners select" ON public.partners;
DROP POLICY IF EXISTS "partners insert" ON public.partners;
DROP POLICY IF EXISTS "partners update" ON public.partners;
DROP POLICY IF EXISTS "partners delete" ON public.partners;

CREATE POLICY "partners select" ON public.partners FOR SELECT TO authenticated
  USING (public.is_super_admin() OR cooperative_id = ANY(public.my_cooperative_ids()));
CREATE POLICY "partners insert" ON public.partners FOR INSERT TO authenticated
  WITH CHECK (public.is_super_admin() OR cooperative_id = ANY(public.my_cooperative_ids()));
CREATE POLICY "partners update" ON public.partners FOR UPDATE TO authenticated
  USING (public.is_super_admin() OR cooperative_id = ANY(public.my_cooperative_ids()));
CREATE POLICY "partners delete" ON public.partners FOR DELETE TO authenticated
  USING (public.is_super_admin() OR cooperative_id = ANY(public.my_cooperative_ids()));
