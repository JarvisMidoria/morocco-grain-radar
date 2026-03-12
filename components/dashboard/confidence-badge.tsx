import { Badge } from "@/components/ui/badge";
import { ConfidenceLevel } from "@/lib/types";

interface ConfidenceBadgeProps {
  confidence: ConfidenceLevel;
}

export function ConfidenceBadge({ confidence }: ConfidenceBadgeProps) {
  if (confidence === "High") {
    return <Badge variant="high">High</Badge>;
  }

  if (confidence === "Medium") {
    return <Badge variant="medium">Medium</Badge>;
  }

  return <Badge variant="low">Low</Badge>;
}
