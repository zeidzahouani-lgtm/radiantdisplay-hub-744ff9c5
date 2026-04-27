import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useQuery } from "@tanstack/react-query";

interface EstablishmentMembership {
  establishment_id: string;
  role: string;
  establishment: {
    id: string;
    name: string;
    address: string | null;
  };
}

interface EstablishmentContextType {
  currentEstablishmentId: string | null;
  setCurrentEstablishmentId: (id: string | null) => void;
  memberships: EstablishmentMembership[];
  isGlobalAdmin: boolean;
  isEstablishmentAdmin: boolean;
  isMarketing: boolean;
  currentRole: string | null;
  isLoading: boolean;
}

const EstablishmentContext = createContext<EstablishmentContextType>({
  currentEstablishmentId: null,
  setCurrentEstablishmentId: () => {},
  memberships: [],
  isGlobalAdmin: false,
  isEstablishmentAdmin: false,
  isMarketing: false,
  currentRole: null,
  isLoading: true,
});

export function EstablishmentProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [currentEstablishmentId, setCurrentEstablishmentId] = useState<string | null>(null);

  const { data: publicEstablishments = [], isLoading: loadingPublicEstablishments } = useQuery({
    queryKey: ["public_establishments_single"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("establishments")
        .select("id, name, address")
        .order("created_at", { ascending: true })
        .limit(1);
      if (error) throw error;
      return (data || []).map((est: any) => ({
        establishment_id: est.id,
        role: "admin",
        establishment: est,
      })) as EstablishmentMembership[];
    },
  });

  // Check global roles
  const { data: userGlobalRoles = [], isLoading: loadingAdmin } = useQuery({
    queryKey: ["global_roles_check", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user!.id);
      return (data || []).map(r => r.role);
    },
  });

  const isGlobalAdmin = userGlobalRoles.includes("admin");
  const isMarketing = userGlobalRoles.includes("marketing" as any);

  // Fetch user's establishment memberships
  const { data: memberships = [], isLoading: loadingMemberships } = useQuery({
    queryKey: ["user_memberships", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_establishments")
        .select("establishment_id, role, establishment:establishments(id, name, address)")
        .eq("user_id", user!.id);
      if (error) throw error;
      return (data || []).map((d: any) => ({
        establishment_id: d.establishment_id,
        role: d.role,
        establishment: d.establishment,
      })) as EstablishmentMembership[];
    },
  });

  const effectiveMemberships = user ? memberships : publicEstablishments;
  const effectiveIsGlobalAdmin = user ? isGlobalAdmin : false;

  // Restore from localStorage on mount
  useEffect(() => {
    if (user?.id) {
      const saved = localStorage.getItem(`est_${user.id}`);
      if (saved === "__all__") {
        setCurrentEstablishmentId(null);
      } else if (saved) {
        setCurrentEstablishmentId(saved);
      }
    }
  }, [user?.id]);

  // Ensure selected establishment is always valid for the current non-admin user
  useEffect(() => {
    if (loadingAdmin || loadingMemberships || loadingPublicEstablishments || effectiveIsGlobalAdmin) return;

    if (effectiveMemberships.length === 0) {
      if (currentEstablishmentId !== null) setCurrentEstablishmentId(null);
      return;
    }

    const hasAccessToCurrent = currentEstablishmentId
      ? effectiveMemberships.some((m) => m.establishment_id === currentEstablishmentId)
      : false;

    if (!currentEstablishmentId || !hasAccessToCurrent) {
      setCurrentEstablishmentId(effectiveMemberships[0].establishment_id);
    }
  }, [effectiveMemberships, currentEstablishmentId, effectiveIsGlobalAdmin, loadingAdmin, loadingMemberships, loadingPublicEstablishments]);

  // Persist selection in localStorage
  useEffect(() => {
    if (user?.id) {
      localStorage.setItem(`est_${user.id}`, currentEstablishmentId || "__all__");
    }
  }, [user?.id, currentEstablishmentId]);

  const currentMembership = effectiveMemberships.find(m => m.establishment_id === currentEstablishmentId);
  const currentRole = currentMembership?.role ?? null;
  const isEstablishmentAdmin = currentRole === "admin" || effectiveIsGlobalAdmin;

  return (
    <EstablishmentContext.Provider
      value={{
        currentEstablishmentId,
        setCurrentEstablishmentId,
        memberships: effectiveMemberships,
        isGlobalAdmin: effectiveIsGlobalAdmin,
        isEstablishmentAdmin,
        isMarketing,
        currentRole,
        isLoading: loadingAdmin || loadingMemberships || loadingPublicEstablishments,
      }}
    >
      {children}
    </EstablishmentContext.Provider>
  );
}

export function useEstablishmentContext() {
  return useContext(EstablishmentContext);
}
