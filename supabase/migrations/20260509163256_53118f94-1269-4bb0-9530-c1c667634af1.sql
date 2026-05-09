-- Fix authenticated creation/update rules for screens and media when records are scoped by establishment
DROP POLICY IF EXISTS "Users can insert establishment screens" ON public.screens;
CREATE POLICY "Users can insert establishment screens"
ON public.screens
FOR INSERT
TO authenticated
WITH CHECK (
  (establishment_id IS NOT NULL AND public.is_member_of(auth.uid(), establishment_id))
  OR public.has_role(auth.uid(), 'admin'::public.app_role)
);

DROP POLICY IF EXISTS "Users can update establishment screens" ON public.screens;
CREATE POLICY "Users can update establishment screens"
ON public.screens
FOR UPDATE
TO authenticated
USING (
  (establishment_id IS NOT NULL AND public.is_member_of(auth.uid(), establishment_id))
  OR public.has_role(auth.uid(), 'admin'::public.app_role)
)
WITH CHECK (
  (establishment_id IS NOT NULL AND public.is_member_of(auth.uid(), establishment_id))
  OR public.has_role(auth.uid(), 'admin'::public.app_role)
);

DROP POLICY IF EXISTS "Global admins can manage screens" ON public.screens;
CREATE POLICY "Global admins can manage screens"
ON public.screens
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::public.app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "Users can insert establishment media" ON public.media;
CREATE POLICY "Users can insert establishment media"
ON public.media
FOR INSERT
TO authenticated
WITH CHECK (
  (establishment_id IS NOT NULL AND public.is_member_of(auth.uid(), establishment_id))
  OR public.has_role(auth.uid(), 'admin'::public.app_role)
);

DROP POLICY IF EXISTS "Users can update establishment media" ON public.media;
CREATE POLICY "Users can update establishment media"
ON public.media
FOR UPDATE
TO authenticated
USING (
  (establishment_id IS NOT NULL AND public.is_member_of(auth.uid(), establishment_id))
  OR public.has_role(auth.uid(), 'admin'::public.app_role)
)
WITH CHECK (
  (establishment_id IS NOT NULL AND public.is_member_of(auth.uid(), establishment_id))
  OR public.has_role(auth.uid(), 'admin'::public.app_role)
);

DROP POLICY IF EXISTS "Global admins can manage media" ON public.media;
CREATE POLICY "Global admins can manage media"
ON public.media
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::public.app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

-- Make sure the public media bucket exists and storage uploads are allowed for authenticated dashboard users.
INSERT INTO storage.buckets (id, name, public)
VALUES ('media', 'media', true)
ON CONFLICT (id) DO UPDATE SET public = true;

DROP POLICY IF EXISTS "Authenticated users can upload media files" ON storage.objects;
CREATE POLICY "Authenticated users can upload media files"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'media');

DROP POLICY IF EXISTS "Authenticated users can update media files" ON storage.objects;
CREATE POLICY "Authenticated users can update media files"
ON storage.objects
FOR UPDATE
TO authenticated
USING (bucket_id = 'media')
WITH CHECK (bucket_id = 'media');

DROP POLICY IF EXISTS "Authenticated users can delete media files" ON storage.objects;
CREATE POLICY "Authenticated users can delete media files"
ON storage.objects
FOR DELETE
TO authenticated
USING (bucket_id = 'media');

DROP POLICY IF EXISTS "Public can read media files" ON storage.objects;
CREATE POLICY "Public can read media files"
ON storage.objects
FOR SELECT
TO anon, authenticated
USING (bucket_id = 'media');