import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEstablishmentContext } from "@/contexts/EstablishmentContext";

export interface Playlist {
  id: string;
  name: string;
  user_id: string | null;
  establishment_id: string | null;
  created_at: string;
}

export function usePlaylists() {
  const queryClient = useQueryClient();
  const { currentEstablishmentId, isGlobalAdmin } = useEstablishmentContext();
  const queryKey = ["playlists", currentEstablishmentId, isGlobalAdmin];

  const { data: playlists = [], isLoading } = useQuery({
    queryKey,
    queryFn: async () => {
      let q = supabase.from("playlists").select("*").order("created_at", { ascending: false });
      if (currentEstablishmentId) {
        q = q.eq("establishment_id", currentEstablishmentId);
      } else if (!isGlobalAdmin) {
        return [];
      }
      const { data, error } = await q;
      if (error) throw error;
      return data as Playlist[];
    },
  });

  const addPlaylist = useMutation({
    mutationFn: async (name: string) => {
      const { data, error } = await supabase.from("playlists").insert({
        name,
        user_id: null,
        establishment_id: currentEstablishmentId || null,
      }).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["playlists"] }),
  });

  const deletePlaylist = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("playlists").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["playlists"] }),
  });

  const renamePlaylist = useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      const { error } = await supabase.from("playlists").update({ name }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["playlists"] }),
  });

  const assignEstablishment = useMutation({
    mutationFn: async ({ id, establishmentId }: { id: string; establishmentId: string | null }) => {
      const { error } = await supabase
        .from("playlists")
        .update({ establishment_id: establishmentId } as any)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["playlists"] });
      queryClient.invalidateQueries({ queryKey: ["est_dashboard_playlists"] });
    },
  });

  return { playlists, isLoading, addPlaylist, deletePlaylist, renamePlaylist, assignEstablishment };
}
