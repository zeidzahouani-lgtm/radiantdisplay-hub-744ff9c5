import { Building2 } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useEstablishments } from "@/hooks/useEstablishments";
import { toast } from "sonner";

interface Props {
  currentEstablishmentId: string | null | undefined;
  onAssign: (establishmentId: string | null) => Promise<void>;
  className?: string;
  /** When true, render nothing if user is not a global admin */
  adminOnly?: boolean;
}

/**
 * A small select dropdown that lets a global admin reassign an entity
 * (media, layout, playlist, program...) to any establishment.
 */
export function EstablishmentAssignSelect({
  currentEstablishmentId,
  onAssign,
  className,
}: Props) {
  const { establishments } = useEstablishments();

  const handleChange = async (value: string) => {
    try {
      await onAssign(value === "__none__" ? null : value);
      toast.success("Établissement mis à jour");
    } catch {
      toast.error("Erreur d'assignation");
    }
  };

  return (
    <Select value={currentEstablishmentId || "__none__"} onValueChange={handleChange}>
      <SelectTrigger
        className={`h-7 text-[11px] bg-secondary/40 border-border/50 ${className ?? ""}`}
        onClick={(e) => e.stopPropagation()}
      >
        <Building2 className="h-3 w-3 mr-1 text-primary/60" />
        <SelectValue placeholder="Établissement..." />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="__none__">Aucun (global)</SelectItem>
        {establishments.map((e: any) => (
          <SelectItem key={e.id} value={e.id}>
            {e.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
