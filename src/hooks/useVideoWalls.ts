import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEstablishmentContext } from "@/contexts/EstablishmentContext";

export function useVideoWalls() {
  const queryClient = useQueryClient();
  const { currentEstablishmentId, isGlobalAdmin } = useEstablishmentContext();

  const { data: walls = [], isLoading } = useQuery({
    queryKey: ["video_walls", currentEstablishmentId, isGlobalAdmin],
    queryFn: async () => {
      let query = (supabase as any).from("video_walls").select("*").order("created_at", { ascending: false });
      if (currentEstablishmentId) query = query.eq("establishment_id", currentEstablishmentId);
      else if (!isGlobalAdmin) return [];
      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
  });

  const createWall = useMutation({
    mutationFn: async ({ name, rows, cols, mediaId, playlistId }: { name: string; rows: number; cols: number; mediaId?: string | null; playlistId?: string | null }) => {
      // Quota check
      if (currentEstablishmentId) {
        const { data: est } = await supabase
          .from("establishments")
          .select("max_screens")
          .eq("id", currentEstablishmentId)
          .single();
        const { count } = await supabase
          .from("screens")
          .select("id", { count: "exact", head: true })
          .eq("establishment_id", currentEstablishmentId);
        const max = est?.max_screens ?? 0;
        const need = rows * cols;
        if (max > 0 && (count ?? 0) + need > max) {
          throw new Error(`Quota atteint : il faut ${need} écrans, ${max - (count ?? 0)} disponible(s).`);
        }
      }

      // Create the wall
      const { data: wall, error: wallErr } = await (supabase as any)
        .from("video_walls")
        .insert({ name, rows, cols, user_id: null, establishment_id: currentEstablishmentId })
        .select()
        .single();
      if (wallErr) throw wallErr;

      // Create N screens
      const screens = [];
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const screenName = `${name} [${r + 1}-${c + 1}]`;
          const slug = `${name.toLowerCase().replace(/[^a-z0-9\s-]/g, "").replace(/\s+/g, "-")}-${r + 1}-${c + 1}`;
          screens.push({
            name: screenName,
            slug,
            user_id: null,
            establishment_id: currentEstablishmentId,
            wall_id: wall.id,
            wall_row: r,
            wall_col: c,
            current_media_id: mediaId || null,
            playlist_id: playlistId || null,
          });
        }
      }
      const { error: scrErr } = await supabase.from("screens").insert(screens as any);
      if (scrErr) throw scrErr;

      return wall;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["video_walls"] });
      queryClient.invalidateQueries({ queryKey: ["screens"] });
    },
  });

  const deleteWall = useMutation({
    mutationFn: async (id: string) => {
      // Detach screens first (ON DELETE SET NULL handles wall_id, but row/col stay — clear them)
      await supabase.from("screens").update({ wall_row: null, wall_col: null } as any).eq("wall_id", id);
      const { error } = await (supabase as any).from("video_walls").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["video_walls"] });
      queryClient.invalidateQueries({ queryKey: ["screens"] });
    },
  });

  // Assign a single source (media, playlist or layout) to ALL screens of a wall
  const assignSourceToWall = useMutation({
    mutationFn: async ({ wallId, mediaId, playlistId, layoutId }: { wallId: string; mediaId?: string | null; playlistId?: string | null; layoutId?: string | null }) => {
      const updates: any = {
        current_media_id: mediaId ?? null,
        playlist_id: playlistId ?? null,
        layout_id: layoutId ?? null,
      };
      const { error } = await supabase.from("screens").update(updates).eq("wall_id", wallId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["screens"] });
    },
  });

  // Add an existing standalone screen to a wall at a specific row/col
  const addScreenToWall = useMutation({
    mutationFn: async ({ wallId, screenId, row, col }: { wallId: string; screenId: string; row: number; col: number }) => {
      const { error } = await supabase
        .from("screens")
        .update({ wall_id: wallId, wall_row: row, wall_col: col } as any)
        .eq("id", screenId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["screens"] });
      queryClient.invalidateQueries({ queryKey: ["video_walls"] });
    },
  });

  // Move (or swap) a screen to a target row/col within a wall
  const moveScreenInWall = useMutation({
    mutationFn: async ({ wallId, screenId, row, col }: { wallId: string; screenId: string; row: number; col: number }) => {
      // Find current screen + any screen already at the target cell
      const { data: rows, error: selErr } = await supabase
        .from("screens")
        .select("id, wall_row, wall_col")
        .eq("wall_id", wallId);
      if (selErr) throw selErr;
      const moving = rows?.find((s: any) => s.id === screenId);
      const occupant = rows?.find((s: any) => s.wall_row === row && s.wall_col === col && s.id !== screenId);
      if (occupant && moving) {
        // Swap: park occupant temporarily to avoid any unique conflicts
        await supabase.from("screens").update({ wall_row: -1, wall_col: -1 } as any).eq("id", occupant.id);
        await supabase.from("screens").update({ wall_row: row, wall_col: col } as any).eq("id", screenId);
        await supabase.from("screens").update({ wall_row: moving.wall_row, wall_col: moving.wall_col } as any).eq("id", occupant.id);
      } else {
        const { error } = await supabase.from("screens").update({ wall_row: row, wall_col: col } as any).eq("id", screenId);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["screens"] });
    },
  });

  // Update orientation of a single screen (used from wall config)
  const updateScreenOrientation = useMutation({
    mutationFn: async ({ screenId, orientation }: { screenId: string; orientation: string }) => {
      const { error } = await supabase.from("screens").update({ orientation } as any).eq("id", screenId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["screens"] });
    },
  });

  // Remove a screen from a wall (detach but keep the screen)
  const removeScreenFromWall = useMutation({
    mutationFn: async (screenId: string) => {
      const { error } = await supabase
        .from("screens")
        .update({ wall_id: null, wall_row: null, wall_col: null } as any)
        .eq("id", screenId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["screens"] });
      queryClient.invalidateQueries({ queryKey: ["video_walls"] });
    },
  });

  // Resize a wall (update rows/cols)
  const resizeWall = useMutation({
    mutationFn: async ({ wallId, rows, cols }: { wallId: string; rows: number; cols: number }) => {
      const { error } = await (supabase as any).from("video_walls").update({ rows, cols }).eq("id", wallId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["video_walls"] });
    },
  });

  return { walls, isLoading, createWall, deleteWall, assignSourceToWall, addScreenToWall, moveScreenInWall, updateScreenOrientation, removeScreenFromWall, resizeWall };
}
