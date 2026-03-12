import { Badge } from "@/components/ui/badge";
import { CommodityConfidenceLabel } from "@/lib/types";

interface CommodityConfidenceBadgeProps {
  label: CommodityConfidenceLabel;
}

const toneClass: Record<CommodityConfidenceLabel, string> = {
  "weak hypothesis": "border-slate-200 bg-slate-100 text-slate-700",
  "moderate hypothesis": "border-amber-200 bg-amber-50 text-amber-700",
  "strong hypothesis": "border-emerald-200 bg-emerald-50 text-emerald-700",
};

export function CommodityConfidenceBadge({ label }: CommodityConfidenceBadgeProps) {
  return <Badge className={toneClass[label]}>{label}</Badge>;
}
