import { Radar, Compass, TrendingUp, Wheat, FlaskConical } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DashboardMetrics } from "@/lib/types";
import { formatNumber } from "@/lib/formatters";

interface KpiCardsProps {
  metrics: DashboardMetrics;
}

const cards = [
  {
    key: "recentDeparturesDetected",
    label: "Recent Departures Detected",
    icon: Radar,
    tone: "text-slate-700",
  },
  {
    key: "moroccoBoundSuspected",
    label: "Morocco-Bound Suspected",
    icon: Compass,
    tone: "text-sky-600",
  },
  {
    key: "moroccoBoundLikely",
    label: "Morocco-Bound Likely",
    icon: TrendingUp,
    tone: "text-blue-600",
  },
  {
    key: "agriCargoLikely",
    label: "Agri Cargo Likely",
    icon: Wheat,
    tone: "text-emerald-600",
  },
  {
    key: "commodityHypothesesAvailable",
    label: "Commodity Hypotheses",
    icon: FlaskConical,
    tone: "text-amber-600",
  },
] as const;

export function KpiCards({ metrics }: KpiCardsProps) {
  return (
    <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
      {cards.map((card) => {
        const Icon = card.icon;

        return (
          <Card key={card.key} className="relative overflow-hidden">
            <div className="pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full bg-slate-100" />
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center justify-between text-xs">
                <span>{card.label}</span>
                <Icon className={`h-4 w-4 ${card.tone}`} />
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-semibold text-slate-900">{formatNumber(metrics[card.key])}</div>
            </CardContent>
          </Card>
        );
      })}
    </section>
  );
}
