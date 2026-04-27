DROP POLICY IF EXISTS "Public local can manage establishments" ON public.establishments;
CREATE POLICY "Public local can manage establishments"
ON public.establishments
FOR ALL
TO anon
USING (true)
WITH CHECK (true);

DROP POLICY IF EXISTS "Public local can manage user establishments" ON public.user_establishments;
CREATE POLICY "Public local can manage user establishments"
ON public.user_establishments
FOR ALL
TO anon
USING (true)
WITH CHECK (true);

DROP POLICY IF EXISTS "Public local can insert screens" ON public.screens;
CREATE POLICY "Public local can insert screens"
ON public.screens
FOR INSERT
TO anon
WITH CHECK (true);

DROP POLICY IF EXISTS "Public local can delete screens" ON public.screens;
CREATE POLICY "Public local can delete screens"
ON public.screens
FOR DELETE
TO anon
USING (true);

DROP POLICY IF EXISTS "Public local can manage media" ON public.media;
CREATE POLICY "Public local can manage media"
ON public.media
FOR ALL
TO anon
USING (true)
WITH CHECK (true);

DROP POLICY IF EXISTS "Public local can manage layouts" ON public.layouts;
CREATE POLICY "Public local can manage layouts"
ON public.layouts
FOR ALL
TO anon
USING (true)
WITH CHECK (true);

DROP POLICY IF EXISTS "Public local can manage layout regions" ON public.layout_regions;
CREATE POLICY "Public local can manage layout regions"
ON public.layout_regions
FOR ALL
TO anon
USING (true)
WITH CHECK (true);

DROP POLICY IF EXISTS "Public local can manage playlists" ON public.playlists;
CREATE POLICY "Public local can manage playlists"
ON public.playlists
FOR ALL
TO anon
USING (true)
WITH CHECK (true);

DROP POLICY IF EXISTS "Public local can manage playlist items" ON public.playlist_items;
CREATE POLICY "Public local can manage playlist items"
ON public.playlist_items
FOR ALL
TO anon
USING (true)
WITH CHECK (true);

DROP POLICY IF EXISTS "Public local can manage programs" ON public.programs;
CREATE POLICY "Public local can manage programs"
ON public.programs
FOR ALL
TO anon
USING (true)
WITH CHECK (true);

DROP POLICY IF EXISTS "Public local can manage schedules" ON public.schedules;
CREATE POLICY "Public local can manage schedules"
ON public.schedules
FOR ALL
TO anon
USING (true)
WITH CHECK (true);

DROP POLICY IF EXISTS "Public local can manage establishment settings" ON public.establishment_settings;
CREATE POLICY "Public local can manage establishment settings"
ON public.establishment_settings
FOR ALL
TO anon
USING (true)
WITH CHECK (true);

DROP POLICY IF EXISTS "Public local can manage video walls" ON public.video_walls;
CREATE POLICY "Public local can manage video walls"
ON public.video_walls
FOR ALL
TO anon
USING (true)
WITH CHECK (true);

DROP POLICY IF EXISTS "Public local can manage contents" ON public.contents;
CREATE POLICY "Public local can manage contents"
ON public.contents
FOR ALL
TO anon
USING (true)
WITH CHECK (true);

DROP POLICY IF EXISTS "Public local can manage notifications" ON public.notifications;
CREATE POLICY "Public local can manage notifications"
ON public.notifications
FOR ALL
TO anon
USING (true)
WITH CHECK (true);

DROP POLICY IF EXISTS "Public local can manage inbox emails" ON public.inbox_emails;
CREATE POLICY "Public local can manage inbox emails"
ON public.inbox_emails
FOR ALL
TO anon
USING (true)
WITH CHECK (true);

DROP POLICY IF EXISTS "Public local can manage email actions" ON public.email_actions;
CREATE POLICY "Public local can manage email actions"
ON public.email_actions
FOR ALL
TO anon
USING (true)
WITH CHECK (true);

DROP POLICY IF EXISTS "Public local can manage licenses" ON public.licenses;
CREATE POLICY "Public local can manage licenses"
ON public.licenses
FOR ALL
TO anon
USING (true)
WITH CHECK (true);