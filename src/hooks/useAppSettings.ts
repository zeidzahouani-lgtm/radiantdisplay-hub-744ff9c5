import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffect } from "react";

export interface AppSettings {
  app_name: string;
  app_tagline: string;
  logo_url: string;
  favicon_url: string;
  primary_color: string;
  accent_color: string;
  welcome_message: string;
  page_title: string;
  login_video_url: string;
  default_gmt_offset: string;
  player_port: string;
}

const defaultSettings: AppSettings = {
  app_name: "ScreenFlow by Dravox",
  app_tagline: "Digital Signage CMS",
  logo_url: "/dravox-logo.jpg",
  favicon_url: "/dravox-logo.jpg",
  primary_color: "185 100% 55%",
  accent_color: "270 80% 60%",
  welcome_message: "Connectez-vous à votre tableau de bord",
  page_title: "ScreenFlow by Dravox — Digital Signage CMS",
  login_video_url: "",
  default_gmt_offset: "",
  player_port: "",
};

async function fetchSettings(): Promise<AppSettings> {
  const { data, error } = await supabase
    .from("app_settings" as any)
    .select("key, value");

  if (error || !data) return defaultSettings;

  const settings = { ...defaultSettings };
  (data as any[]).forEach((row: { key: string; value: string | null }) => {
    if (row.key in settings) {
      (settings as any)[row.key] = row.value || (defaultSettings as any)[row.key];
    }
  });
  return settings;
}

export function useAppSettings() {
  const queryClient = useQueryClient();

  const { data: settings = defaultSettings, isLoading } = useQuery({
    queryKey: ["app_settings"],
    queryFn: fetchSettings,
    staleTime: 1000 * 60 * 5,
  });

  // Apply dynamic CSS variables when settings change
  useEffect(() => {
    if (settings.primary_color) {
      document.documentElement.style.setProperty("--primary", settings.primary_color);
      document.documentElement.style.setProperty("--ring", settings.primary_color);
      document.documentElement.style.setProperty("--sidebar-primary", settings.primary_color);
      document.documentElement.style.setProperty("--sidebar-ring", settings.primary_color);
      document.documentElement.style.setProperty("--neon-cyan", settings.primary_color);
      document.documentElement.style.setProperty("--neon-cyan-glow", settings.primary_color);
    }
    if (settings.accent_color) {
      document.documentElement.style.setProperty("--accent", settings.accent_color);
      document.documentElement.style.setProperty("--sidebar-accent", settings.accent_color);
      document.documentElement.style.setProperty("--neon-violet", settings.accent_color);
      document.documentElement.style.setProperty("--neon-violet-glow", settings.accent_color);
    }
    if (settings.page_title) {
      document.title = settings.page_title;
    }
    if (settings.favicon_url) {
      let link = document.querySelector("link[rel='icon']") as HTMLLinkElement;
      if (!link) {
        link = document.createElement("link");
        link.rel = "icon";
        document.head.appendChild(link);
      }
      link.href = settings.favicon_url;
    }
  }, [settings]);

  const updateSetting = useMutation({
    mutationFn: async ({ key, value }: { key: string; value: string }) => {
      const { error } = await supabase
        .from("app_settings" as any)
        .upsert({ key, value, updated_at: new Date().toISOString() } as any, { onConflict: "key" });
      if (error) throw error;
      return { key, value };
    },
    onMutate: async ({ key, value }) => {
      await queryClient.cancelQueries({ queryKey: ["app_settings"] });
      const previous = queryClient.getQueryData<AppSettings>(["app_settings"]);
      queryClient.setQueryData<AppSettings>(["app_settings"], (old) => ({
        ...defaultSettings,
        ...(old || {}),
        [key]: value,
      }));
      return { previous };
    },
    onError: (_error, _variables, context) => {
      if (context?.previous) queryClient.setQueryData(["app_settings"], context.previous);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["app_settings"] });
    },
  });

  return { settings, isLoading, updateSetting };
}
