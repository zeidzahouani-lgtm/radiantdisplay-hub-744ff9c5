import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEstablishmentContext } from "@/contexts/EstablishmentContext";

export interface Program {
  id: string;
  name: string;
  user_id: string | null;
  establishment_id: string | null;
  created_at: string;
}

export function usePrograms() {
  const queryClient = useQueryClient();
  const { currentEstablishmentId, isGlobalAdmin } = useEstablishmentContext();
  const queryKey = ["programs", currentEstablishmentId, isGlobalAdmin];

  const { data: programs = [], isLoading } = useQuery({
    queryKey,
    queryFn: async () => {
      let q = supabase.from("programs").select("*").order("created_at", { ascending: false });
      if (currentEstablishmentId) {
        q = q.eq("establishment_id", currentEstablishmentId);
      } else if (!isGlobalAdmin) {
        return [];
      }
      const { data, error } = await q;
      if (error) throw error;
      return data as Program[];
    },
  });

  const addProgram = useMutation({
    mutationFn: async (name: string) => {
      const { data, error } = await supabase.from("programs").insert({
        name,
        user_id: null,
        establishment_id: currentEstablishmentId || null,
      }).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["programs"] }),
  });

  const deleteProgram = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("programs").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["programs"] }),
  });

  const renameProgram = useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      const { error } = await supabase.from("programs").update({ name }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["programs"] }),
  });

  const assignEstablishment = useMutation({
    mutationFn: async ({ id, establishmentId }: { id: string; establishmentId: string | null }) => {
      const { error } = await supabase
        .from("programs")
        .update({ establishment_id: establishmentId } as any)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["programs"] });
      queryClient.invalidateQueries({ queryKey: ["est_dashboard_programs"] });
    },
  });

  return { programs, isLoading, addProgram, deleteProgram, renameProgram, assignEstablishment };
}
