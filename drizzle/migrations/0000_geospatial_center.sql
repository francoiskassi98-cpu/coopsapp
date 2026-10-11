
CREATE TABLE public.geospatial_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cooperative_id uuid NOT NULL REFERENCES public.cooperatives(id) ON DELETE CASCADE,
  created_by uuid NOT NULL DEFAULT auth.uid(),
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 200),
  description text CHECK (description IS NULL OR char_length(description) <= 5000),
  status text NOT NULL DEFAULT 'en_attente' CHECK (status IN ('en_attente','en_cours','traite','publie','rejete')),
  return_comment text CHECK (return_comment IS NULL OR char_length(return_comment) <= 5000),
  published_at timestamptz,
  published_by uuid,
  is_archived boolean NOT NULL DEFAULT false,
  submission_notified_at timestamptz,
  publication_notified_at timestamptz,
  notification_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.geospatial_requests TO authenticated;
GRANT ALL ON public.geospatial_requests TO service_role;
ALTER TABLE public.geospatial_requests ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_geo_req_coop ON public.geospatial_requests(cooperative_id, created_at DESC);

CREATE POLICY geo_req_select ON public.geospatial_requests FOR SELECT TO authenticated
  USING (public.is_super_admin() OR cooperative_id = ANY(public.my_cooperative_ids()));
CREATE POLICY geo_req_insert ON public.geospatial_requests FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid() AND status = 'en_attente' AND is_archived = false
    AND published_at IS NULL AND return_comment IS NULL
    AND (public.is_super_admin() OR cooperative_id = ANY(public.my_cooperative_ids())));
CREATE POLICY geo_req_update ON public.geospatial_requests FOR UPDATE TO authenticated
  USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());
CREATE POLICY geo_req_delete ON public.geospatial_requests FOR DELETE TO authenticated
  USING (public.is_super_admin());

CREATE TRIGGER trg_geo_req_updated BEFORE UPDATE ON public.geospatial_requests
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.geospatial_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES public.geospatial_requests(id) ON DELETE CASCADE,
  file_category text NOT NULL CHECK (file_category IN ('original','treated')),
  file_name text NOT NULL CHECK (char_length(file_name) BETWEEN 1 AND 255),
  storage_path text NOT NULL UNIQUE,
  file_size_bytes bigint NOT NULL CHECK (file_size_bytes > 0),
  detected_format text NOT NULL,
  mime_type text,
  comment text CHECK (comment IS NULL OR char_length(comment) <= 2000),
  uploaded_by uuid NOT NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, DELETE ON public.geospatial_files TO authenticated;
GRANT ALL ON public.geospatial_files TO service_role;
ALTER TABLE public.geospatial_files ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_geo_files_req ON public.geospatial_files(request_id);

CREATE POLICY geo_files_select ON public.geospatial_files FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.geospatial_requests r WHERE r.id = request_id
    AND (public.is_super_admin() OR (r.cooperative_id = ANY(public.my_cooperative_ids())
      AND (file_category = 'original' OR r.status = 'publie')))));
CREATE POLICY geo_files_insert ON public.geospatial_files FOR INSERT TO authenticated
  WITH CHECK (uploaded_by = auth.uid() AND (
    public.is_super_admin()
    OR (file_category = 'original' AND EXISTS (SELECT 1 FROM public.geospatial_requests r
        WHERE r.id = request_id AND r.created_by = auth.uid() AND r.status = 'en_attente'
          AND r.cooperative_id = ANY(public.my_cooperative_ids())))));
CREATE POLICY geo_files_delete ON public.geospatial_files FOR DELETE TO authenticated
  USING (public.is_super_admin());

CREATE TABLE public.geospatial_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES public.geospatial_requests(id) ON DELETE CASCADE,
  author_id uuid NOT NULL DEFAULT auth.uid(),
  author_role text,
  content text NOT NULL CHECK (char_length(content) BETWEEN 1 AND 5000),
  is_internal boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.geospatial_comments TO authenticated;
GRANT ALL ON public.geospatial_comments TO service_role;
ALTER TABLE public.geospatial_comments ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_geo_comments_req ON public.geospatial_comments(request_id, created_at);

CREATE POLICY geo_comments_select ON public.geospatial_comments FOR SELECT TO authenticated
  USING (public.is_super_admin() OR (is_internal = false AND EXISTS (SELECT 1 FROM public.geospatial_requests r
    WHERE r.id = request_id AND r.cooperative_id = ANY(public.my_cooperative_ids()))));
CREATE POLICY geo_comments_insert ON public.geospatial_comments FOR INSERT TO authenticated
  WITH CHECK (author_id = auth.uid() AND (public.is_super_admin() OR (is_internal = false AND EXISTS (
    SELECT 1 FROM public.geospatial_requests r WHERE r.id = request_id AND r.cooperative_id = ANY(public.my_cooperative_ids())))));

CREATE OR REPLACE FUNCTION public.set_geo_comment_role() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  NEW.author_role := (SELECT role::text FROM public.user_roles WHERE user_id = NEW.author_id LIMIT 1);
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.set_geo_comment_role() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER trg_geo_comment_role BEFORE INSERT ON public.geospatial_comments
  FOR EACH ROW EXECUTE FUNCTION public.set_geo_comment_role();

CREATE TABLE public.geospatial_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES public.geospatial_requests(id) ON DELETE CASCADE,
  actor_id uuid DEFAULT auth.uid(),
  action text NOT NULL,
  details jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.geospatial_history TO authenticated;
GRANT ALL ON public.geospatial_history TO service_role;
ALTER TABLE public.geospatial_history ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_geo_hist_req ON public.geospatial_history(request_id, created_at);

CREATE POLICY geo_hist_select ON public.geospatial_history FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.geospatial_requests r WHERE r.id = request_id
    AND (public.is_super_admin() OR r.cooperative_id = ANY(public.my_cooperative_ids()))));
CREATE POLICY geo_hist_insert ON public.geospatial_history FOR INSERT TO authenticated
  WITH CHECK (actor_id = auth.uid() AND action IN ('telechargement','soumission_fichiers','commentaire') AND EXISTS (
    SELECT 1 FROM public.geospatial_requests r WHERE r.id = request_id
    AND (public.is_super_admin() OR r.cooperative_id = ANY(public.my_cooperative_ids()))));

CREATE OR REPLACE FUNCTION public.log_geo_request_history() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.geospatial_history(request_id, actor_id, action, details) VALUES (NEW.id, auth.uid(), 'creation', jsonb_build_object('title', NEW.title));
  ELSE
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      INSERT INTO public.geospatial_history(request_id, actor_id, action, details)
      VALUES (NEW.id, auth.uid(), CASE WHEN NEW.status = 'publie' THEN 'publication' ELSE 'changement_statut' END,
        jsonb_build_object('from', OLD.status, 'to', NEW.status));
    END IF;
    IF NEW.is_archived IS DISTINCT FROM OLD.is_archived THEN
      INSERT INTO public.geospatial_history(request_id, actor_id, action) VALUES (NEW.id, auth.uid(), CASE WHEN NEW.is_archived THEN 'archivage' ELSE 'restauration' END);
    END IF;
  END IF;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.log_geo_request_history() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER trg_geo_req_hist AFTER INSERT OR UPDATE ON public.geospatial_requests
  FOR EACH ROW EXECUTE FUNCTION public.log_geo_request_history();

CREATE OR REPLACE FUNCTION public.log_geo_file_history() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.file_category = 'treated' THEN
    INSERT INTO public.geospatial_history(request_id, actor_id, action, details)
    VALUES (NEW.request_id, auth.uid(), 'depot_fichier_traite', jsonb_build_object('file', NEW.file_name, 'size', NEW.file_size_bytes));
  END IF;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.log_geo_file_history() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER trg_geo_file_hist AFTER INSERT ON public.geospatial_files
  FOR EACH ROW EXECUTE FUNCTION public.log_geo_file_history();

CREATE POLICY geo_storage_select ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'geospatial-files' AND EXISTS (
    SELECT 1 FROM public.geospatial_files f JOIN public.geospatial_requests r ON r.id = f.request_id
    WHERE f.storage_path = storage.objects.name
      AND (public.is_super_admin() OR (r.cooperative_id = ANY(public.my_cooperative_ids())
        AND (f.file_category = 'original' OR r.status = 'publie')))));
CREATE POLICY geo_storage_insert ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'geospatial-files' AND (
    public.is_super_admin()
    OR ((storage.foldername(name))[1] = 'originals' AND EXISTS (
      SELECT 1 FROM public.geospatial_requests r
      WHERE r.id::text = (storage.foldername(name))[3]
        AND r.cooperative_id::text = (storage.foldername(name))[2]
        AND r.created_by = auth.uid() AND r.status = 'en_attente'
        AND r.cooperative_id = ANY(public.my_cooperative_ids())))));
CREATE POLICY geo_storage_delete ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'geospatial-files' AND public.is_super_admin());
