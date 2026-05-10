ALTER TABLE public.layout_regions
  ADD COLUMN IF NOT EXISTS widget_type text,
  ADD COLUMN IF NOT EXISTS widget_config jsonb;