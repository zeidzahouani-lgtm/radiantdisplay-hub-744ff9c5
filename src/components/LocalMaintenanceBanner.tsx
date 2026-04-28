import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLocalHealth } from "@/hooks/useLocalHealth";

export function LocalMaintenanceBanner() {
  const { data, isLoading, refetch, isFetching } = useLocalHealth();

  if (isLoading || !data || data.status === "ok") return null;

  return (
    <div className="border-b border-destructive/30 bg-destructive/10 px-4 py-2 text-destructive">
      <div className="mx-auto flex max-w-7xl flex-col gap-2 text-sm sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-2">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            <strong>Mode maintenance local.</strong> {data.message} Vérifiez le proxy local vers /rest/v1, /realtime/v1 et /storage/v1.
          </span>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching} className="h-8 shrink-0 gap-2">
          <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} />
          Réessayer
        </Button>
      </div>
    </div>
  );
}