import { Badge } from "@/components/ui/badge";
import type { TraderActionabilityBand } from "@/lib/trader/actionability";

interface ActionabilityBadgeProps {
  band: TraderActionabilityBand;
  score?: number;
}

function actionabilityVariant(band: TraderActionabilityBand) {
  if (band === "immediate") {
    return "low";
  }
  if (band === "high") {
    return "medium";
  }
  if (band === "developing") {
    return "high";
  }
  return "default";
}

function actionabilityLabel(band: TraderActionabilityBand) {
  if (band === "immediate") {
    return "Immediate";
  }
  if (band === "high") {
    return "High";
  }
  if (band === "developing") {
    return "Developing";
  }
  return "Monitor";
}

export function ActionabilityBadge({ band, score }: ActionabilityBadgeProps) {
  return (
    <Badge variant={actionabilityVariant(band)}>
      {actionabilityLabel(band)}
      {typeof score === "number" ? ` ${score}` : ""}
    </Badge>
  );
}
