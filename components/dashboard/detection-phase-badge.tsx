import { Badge } from "@/components/ui/badge";
import { DetectionPhase } from "@/lib/types";

interface DetectionPhaseBadgeProps {
  phase: DetectionPhase;
}

const phaseClass: Record<DetectionPhase, string> = {
  departure_detected: "border-slate-200 bg-slate-100 text-slate-700",
  morocco_bound_suspected: "border-sky-200 bg-sky-50 text-sky-700",
  morocco_bound_likely: "border-blue-200 bg-blue-50 text-blue-700",
  agri_cargo_likely: "border-emerald-200 bg-emerald-50 text-emerald-700",
  commodity_hypothesis: "border-lime-200 bg-lime-50 text-lime-700",
  near_arrival_confirmed: "border-violet-200 bg-violet-50 text-violet-700",
};

function label(phase: DetectionPhase) {
  return phase.replaceAll("_", " ");
}

export function DetectionPhaseBadge({ phase }: DetectionPhaseBadgeProps) {
  return <Badge className={phaseClass[phase]}>{label(phase)}</Badge>;
}
