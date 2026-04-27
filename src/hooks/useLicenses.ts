import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface License {
  id: string;
  license_key: string;
  screen_id: string | null;
  created_by: string | null;
  valid_from: string;
  valid_until: string;
  is_active: boolean;
  activated_at: string | null;
  created_at: string;
  source: string;
  establishment_id: string | null;
  establishment_name?: string;
}

function generateLicenseKey(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const segments = 4;
  const segLen = 4;
  const parts: string[] = [];
  for (let s = 0; s < segments; s++) {
    let seg = "";
    for (let i = 0; i < segLen; i++) {
      seg += chars[Math.floor(Math.random() * chars.length)];
    }
    parts.push(seg);
  }
  return parts.join("-");
}

export function useLicenses() {
  const queryClient = useQueryClient();

  const { data: licenses = [], isLoading } = useQuery({
    queryKey: ["licenses"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("licenses")
        .select("*, establishment:establishments(name)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return ((data || []) as any[]).map((l: any) => ({
        ...l,
        establishment_name: l.establishment?.name || null,
      })) as unknown as License[];
    },
  });

  const createLicense = useMutation({
    mutationFn: async ({ screenId, durationDays, establishmentId }: { screenId?: string; durationDays: number; establishmentId?: string }) => {
      const validUntil = new Date();
      validUntil.setDate(validUntil.getDate() + durationDays);

      const { error } = await supabase
        .from("licenses")
        .insert({
          license_key: generateLicenseKey(),
          screen_id: screenId || null,
          created_by: null,
          valid_until: validUntil.toISOString(),
          is_active: true,
          establishment_id: establishmentId || null,
        } as any);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["licenses"] }),
  });

  const toggleLicense = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase
        .from("licenses")
        .update({ is_active } as any)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["licenses"] }),
  });

  const deleteLicense = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("licenses")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["licenses"] }),
  });

  const assignScreen = useMutation({
    mutationFn: async ({ id, screen_id }: { id: string; screen_id: string }) => {
      const { error } = await supabase
        .from("licenses")
        .update({ screen_id, activated_at: new Date().toISOString() } as any)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["licenses"] }),
  });

  const renewLicense = useMutation({
    mutationFn: async ({ id, durationDays }: { id: string; durationDays: number }) => {
      const validUntil = new Date();
      validUntil.setDate(validUntil.getDate() + durationDays);
      const { error } = await supabase
        .from("licenses")
        .update({ valid_until: validUntil.toISOString(), is_active: true } as any)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["licenses"] }),
  });

  return { licenses, isLoading, createLicense, toggleLicense, deleteLicense, assignScreen, renewLicense };
}

// Validate a license key for a specific screen (used by Player)
export async function validateLicense(screenId: string): Promise<{ valid: boolean; message?: string }> {
  const { data, error } = await supabase
    .from("licenses")
    .select("*")
    .eq("screen_id", screenId)
    .eq("is_active", true);

  if (error) return { valid: false, message: "Erreur de validation" };

  const licenses = (data || []) as unknown as License[];
  if (licenses.length === 0) return { valid: false, message: "Aucune licence associée à cet écran" };

  const now = new Date();
  const validLicense = licenses.find(
    (l) => new Date(l.valid_from) <= now && new Date(l.valid_until) >= now
  );

  if (!validLicense) return { valid: false, message: "Licence expirée" };

  return { valid: true };
}

// Activate a license by key for a specific screen (used by Player manual entry)
export async function activateLicenseByKey(licenseKey: string, screenId: string): Promise<{ valid: boolean; message?: string }> {
  // Find the license by key
  const { data, error } = await supabase
    .from("licenses")
    .select("*")
    .eq("license_key", licenseKey.trim().toUpperCase())
    .eq("is_active", true)
    .single();

  if (error || !data) return { valid: false, message: "Clé de licence introuvable ou désactivée" };

  const license = data as unknown as License;

  // Check expiry
  const now = new Date();
  if (new Date(license.valid_until) < now) return { valid: false, message: "Cette licence est expirée" };

  // Check if already assigned to another screen
  if (license.screen_id && license.screen_id !== screenId) {
    return { valid: false, message: "Cette licence est déjà assignée à un autre écran" };
  }

  // Check establishment match: license's establishment must match screen's establishment
  if (license.establishment_id) {
    const { data: screenData } = await supabase
      .from("screens")
      .select("establishment_id")
      .eq("id", screenId)
      .single();

    if (screenData && screenData.establishment_id !== license.establishment_id) {
      return { valid: false, message: "Cette licence appartient à un autre établissement" };
    }
  }

  // Assign to this screen if not yet assigned
  if (!license.screen_id) {
    const { error: updateError } = await supabase
      .from("licenses")
      .update({ screen_id: screenId, activated_at: new Date().toISOString() } as any)
      .eq("id", license.id);

    if (updateError) return { valid: false, message: "Erreur lors de l'activation" };
  }

  return { valid: true };
}
