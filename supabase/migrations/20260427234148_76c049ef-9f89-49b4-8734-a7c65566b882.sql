ALTER TABLE public.establishments
ALTER COLUMN created_by DROP NOT NULL;

ALTER TABLE public.layouts
ALTER COLUMN user_id DROP NOT NULL;

ALTER TABLE public.video_walls
ALTER COLUMN user_id DROP NOT NULL;