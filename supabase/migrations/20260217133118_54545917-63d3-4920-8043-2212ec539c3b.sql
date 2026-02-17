
-- Add is_active to producers (default true)
ALTER TABLE public.producers ADD COLUMN is_active boolean NOT NULL DEFAULT true;

-- Create disabled_sections table to track disabled sections
CREATE TABLE public.disabled_sections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  section_name text NOT NULL UNIQUE,
  cooperative text NOT NULL,
  disabled_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.disabled_sections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read disabled_sections" ON public.disabled_sections FOR SELECT USING (true);
CREATE POLICY "Public insert disabled_sections" ON public.disabled_sections FOR INSERT WITH CHECK (true);
CREATE POLICY "Public delete disabled_sections" ON public.disabled_sections FOR DELETE USING (true);
