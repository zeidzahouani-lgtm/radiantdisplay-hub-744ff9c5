import { useQuery } from "@tanstack/react-query";
import { checkLocalBackendHealth, discoverLocalBackends, type LocalHealthReport } from "@/lib/local-health";

export function useLocalHealth(refetchInterval = 30000) {
  return useQuery<LocalHealthReport>({
    queryKey: ["local_backend_health"],
    queryFn: async () => {
      // 1) Test de l'URL configurée (la plus rapide).
      const primary = await checkLocalBackendHealth();
      if (primary.status === "ok" || primary.restOk) return primary;

      // 2) Fallback : si l'URL configurée est KO (ex: DNS qui ne résout pas),
      //    on tente les autres candidats locaux et on remonte le meilleur.
      try {
        const candidates = await discoverLocalBackends();
        const best = candidates.find((c) => c.report.restOk);
        if (best) {
          return {
            ...best.report,
            message: `${best.report.message} (via ${best.url} — l'URL configurée ne répond pas, rebuild conseillé avec VITE_SUPABASE_URL=${best.url})`,
          };
        }
      } catch { /* ignore et retourne le primary */ }

      return primary;
    },
    refetchInterval,
    retry: 1,
    staleTime: 10000,
  });
}
