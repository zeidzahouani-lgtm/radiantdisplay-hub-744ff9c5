import { useQuery } from "@tanstack/react-query";
import { checkLocalBackendHealth } from "@/lib/local-health";

export function useLocalHealth(refetchInterval = 30000) {
  return useQuery({
    queryKey: ["local_backend_health"],
    queryFn: checkLocalBackendHealth,
    refetchInterval,
    retry: 1,
    staleTime: 10000,
  });
}