
-- Rename logo URL columns to logo_path (stocke des paths internes Storage, plus des URLs)
ALTER TABLE public.cooperatives RENAME COLUMN logo_url TO logo_path;
ALTER TABLE public.partners RENAME COLUMN logo_url TO logo_path;
ALTER TABLE public.shipment_excel_templates RENAME COLUMN coop_logo_url TO coop_logo_path;
ALTER TABLE public.shipment_excel_templates RENAME COLUMN partner_logo_url TO partner_logo_path;

-- Met à jour la RPC create_cooperative_with_admin pour utiliser logo_path
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
$function$;
