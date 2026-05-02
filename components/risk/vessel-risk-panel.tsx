import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { VesselRiskSnapshot } from "@/lib/risk/assessment";

interface VesselRiskPanelProps {
  snapshot: VesselRiskSnapshot;
}

function severityVariant(value: "info" | "warning" | "critical" | "none") {
  if (value === "critical") {
    return "low";
  }
  if (value === "warning") {
    return "medium";
  }
  return "default";
}

export function VesselRiskPanel({ snapshot }: VesselRiskPanelProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Risk & Compliance Watch</CardTitle>
        <CardDescription>
          Operational screening flags only. These signals should trigger review, not replace legal or trade diligence.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <Badge variant={severityVariant(snapshot.highestSeverity)}>
            {snapshot.highestSeverity === "none" ? "No watch flags" : `${snapshot.highestSeverity} watch`}
          </Badge>
          <div className="text-sm text-slate-600">Risk score {snapshot.score}</div>
        </div>

        {snapshot.flags.length > 0 ? (
          <div className="space-y-3">
            {snapshot.flags.map((flag) => (
              <div key={flag.id} className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="font-medium text-slate-900">{flag.title}</div>
                  <div className="flex gap-2">
                    <Badge variant={severityVariant(flag.severity)}>{flag.severity}</Badge>
                    <Badge variant="default">{flag.category.replaceAll("_", " ")}</Badge>
                  </div>
                </div>
                <div className="mt-2 text-sm text-slate-700">{flag.detail}</div>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-600">
            No baseline operational risk flags are currently raised for this vessel.
          </div>
        )}
      </CardContent>
    </Card>
  );
}
