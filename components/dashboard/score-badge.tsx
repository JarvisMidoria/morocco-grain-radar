import { Badge } from "@/components/ui/badge";

interface ScoreBadgeProps {
  score: number;
  label?: string;
}

function scoreVariant(score: number): "high" | "medium" | "low" {
  if (score >= 80) {
    return "high";
  }

  if (score >= 60) {
    return "medium";
  }

  return "low";
}

export function ScoreBadge({ score, label }: ScoreBadgeProps) {
  const text = label ? `${label} ${score}` : String(score);
  return <Badge variant={scoreVariant(score)}>{text}</Badge>;
}
