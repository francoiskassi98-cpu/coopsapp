ALTER TABLE public.cooperatives ADD COLUMN IF NOT EXISTS subscription_price_xof integer NOT NULL DEFAULT 0 CHECK (subscription_price_xof >= 0);
ALTER TABLE public.cooperatives ADD COLUMN IF NOT EXISTS subscription_period_months integer NOT NULL DEFAULT 12 CHECK (subscription_period_months BETWEEN 1 AND 36);

CREATE SEQUENCE IF NOT EXISTS public.invoice_number_seq;

CREATE TABLE public.subscription_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cooperative_id uuid NOT NULL REFERENCES public.cooperatives(id),
  transaction_id text NOT NULL UNIQUE,
  amount_xof integer NOT NULL,
  period_months integer NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  payment_method text,
  operator_reference text,
  invoice_number text UNIQUE,
  period_start date,
  period_end date,
  paid_at timestamptz,
  invoice_sent_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.subscription_payments TO authenticated;
GRANT ALL ON public.subscription_payments TO service_role;
GRANT USAGE ON SEQUENCE public.invoice_number_seq TO service_role;
ALTER TABLE public.subscription_payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "payments_select_scoped" ON public.subscription_payments FOR SELECT TO authenticated
USING (public.is_super_admin() OR (public.is_coop_admin() AND cooperative_id = ANY (public.my_cooperative_ids())));
CREATE TRIGGER trg_subscription_payments_updated BEFORE UPDATE ON public.subscription_payments
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX idx_sub_payments_coop ON public.subscription_payments(cooperative_id, created_at DESC);