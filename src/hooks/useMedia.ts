import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { uploadMediaFile, getMediaType } from "@/lib/supabase-helpers";
import { useEstablishmentContext } from "@/contexts/EstablishmentContext";

export function useMedia() {
  const queryClient = useQueryClient();
  const { currentEstablishmentId, isGlobalAdmin } = useEstablishmentContext();

  const { data: media = [], isLoading } = useQuery({
    queryKey: ["media", currentEstablishmentId],
    queryFn: async () => {
      let query = supabase.from("media").select("*").order("created_at", { ascending: false });
      if (currentEstablishmentId) {
        query = query.eq("establishment_id", currentEstablishmentId);
      } else if (!isGlobalAdmin) {
        // Non-admin without establishment sees nothing
        return [];
      }
      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
  });

  const uploadMutation = useMutation({
    mutationFn: async ({ file, onProgress }: { file: File; onProgress?: (p: number) => void }) => {
      const url = await uploadMediaFile(file, onProgress);
      const type = getMediaType(file);
      const { error } = await supabase.from("media").insert({
        name: file.name,
        type,
        url,
        duration: type === 'image' ? 10 : 30,
        user_id: null,
        establishment_id: currentEstablishmentId,
      } as any);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["media"] }),
  });

  const addIframeMutation = useMutation({
    mutationFn: async ({ name, url }: { name: string; url: string }) => {
      const { error } = await supabase.from("media").insert({
        name,
        type: 'iframe',
        url,
        duration: 30,
        user_id: null,
        establishment_id: currentEstablishmentId,
      } as any);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["media"] }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("media").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["media"] }),
  });

  const assignEstablishmentMutation = useMutation({
    mutationFn: async ({ id, establishmentId }: { id: string; establishmentId: string | null }) => {
      const { error } = await supabase
        .from("media")
        .update({ establishment_id: establishmentId } as any)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["media"] });
      queryClient.invalidateQueries({ queryKey: ["est_dashboard_media"] });
    },
  });

  return { media, isLoading, uploadMutation, addIframeMutation, deleteMutation, assignEstablishmentMutation };
}
