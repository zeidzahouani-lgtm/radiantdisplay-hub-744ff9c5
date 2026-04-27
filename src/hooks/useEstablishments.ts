import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

interface EstablishmentForm {
  name: string;
  address?: string;
  description?: string;
  phone?: string;
  email?: string;
  max_screens?: number;
  logo_url?: string | null;
}

export function useEstablishments() {
  const queryClient = useQueryClient();

  const { data: establishments = [], isLoading } = useQuery({
    queryKey: ["establishments"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("establishments")
        .select("*")
        .order("name");
      if (error) throw error;
      return data;
    },
  });

  const addEstablishment = useMutation({
    mutationFn: async (form: EstablishmentForm) => {
      const { error } = await supabase
        .from("establishments")
        .insert({ ...form, created_by: null } as any);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["establishments"] }),
  });

  const updateEstablishment = useMutation({
    mutationFn: async ({ id, ...form }: EstablishmentForm & { id: string }) => {
      const { error } = await supabase
        .from("establishments")
        .update(form as any)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["establishments"] }),
  });

  const deleteEstablishment = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("establishments").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["establishments"] }),
  });

  const assignUserToEstablishment = useMutation({
    mutationFn: async ({ userId, establishmentId }: { userId: string; establishmentId: string }) => {
      const { error } = await supabase
        .from("user_establishments")
        .insert({ user_id: userId, establishment_id: establishmentId } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["establishments"] });
      queryClient.invalidateQueries({ queryKey: ["user_establishments"] });
    },
  });

  const removeUserFromEstablishment = useMutation({
    mutationFn: async ({ userId, establishmentId }: { userId: string; establishmentId: string }) => {
      const { error } = await supabase
        .from("user_establishments")
        .delete()
        .eq("user_id", userId)
        .eq("establishment_id", establishmentId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["establishments"] });
      queryClient.invalidateQueries({ queryKey: ["user_establishments"] });
    },
  });

  const assignScreenToEstablishment = useMutation({
    mutationFn: async ({ screenId, establishmentId }: { screenId: string; establishmentId: string | null }) => {
      const { error } = await supabase
        .from("screens")
        .update({ establishment_id: establishmentId } as any)
        .eq("id", screenId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["screens"] });
      queryClient.invalidateQueries({ queryKey: ["establishments"] });
      queryClient.invalidateQueries({ queryKey: ["admin_all_screens"] });
    },
  });

  return {
    establishments,
    isLoading,
    addEstablishment,
    updateEstablishment,
    deleteEstablishment,
    assignUserToEstablishment,
    removeUserFromEstablishment,
    assignScreenToEstablishment,
  };
}
