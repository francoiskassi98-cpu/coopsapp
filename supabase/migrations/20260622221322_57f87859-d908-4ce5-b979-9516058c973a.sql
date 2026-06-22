
-- Soft delete columns
ALTER TABLE public.cooperatives ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE public.producers ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE public.shipments ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

-- Login events
CREATE TABLE IF NOT EXISTS public.login_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  email text,
  user_agent text,
  ip text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.login_events TO authenticated;
GRANT ALL ON public.login_events TO service_role;
ALTER TABLE public.login_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users_insert_own_login" ON public.login_events FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "users_read_own_login" ON public.login_events FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.is_super_admin());
CREATE INDEX IF NOT EXISTS idx_login_events_user ON public.login_events(user_id, created_at DESC);

-- Notifications
CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  title text NOT NULL,
  message text,
  link text,
  type text NOT NULL DEFAULT 'info',
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "user_manages_own_notif" ON public.notifications FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE INDEX IF NOT EXISTS idx_notif_user ON public.notifications(user_id, created_at DESC);

ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;

-- RPC to log a login event from the client
CREATE OR REPLACE FUNCTION public.log_login_event(p_user_agent text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_email text;
BEGIN
  IF auth.uid() IS NULL THEN RETURN; END IF;
  SELECT email INTO v_email FROM auth.users WHERE id = auth.uid();
  INSERT INTO public.login_events (user_id, email, user_agent)
  VALUES (auth.uid(), v_email, p_user_agent);
END;
$$;
GRANT EXECUTE ON FUNCTION public.log_login_event(text) TO authenticated;
