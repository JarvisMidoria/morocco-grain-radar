import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatEta } from "@/lib/formatters";
import { VesselExecutionAssessment } from "@/lib/operations/morocco-execution";

interface VesselExecutionPanelProps {
  assessment: VesselExecutionAssessment | null;
}

function stageVariant(value: "monitor" | "arrival_watch" | "prepare_berth" | "immediate_attention") {
  if (value === "immediate_attention") {
    return "low";
  }
  if (value === "prepare_berth") {
    return "medium";
  }
  if (value === "arrival_watch") {
    return "high";
  }
  return "default";
}

function readinessVariant(value: "low" | "medium" | "high") {
  if (value === "high") {
    return "high";
  }
  if (value === "medium") {
    return "medium";
  }
  return "default";
}

function pressureVariant(value: "low" | "medium" | "high") {
  if (value === "high") {
    return "low";
  }
  if (value === "medium") {
    return "medium";
  }
  return "high";
}

export function VesselExecutionPanel({ assessment }: VesselExecutionPanelProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Morocco Execution View</CardTitle>
        <CardDescription>
          Operational interpretation of the arrival, distinct from the raw AIS ETA.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {assessment ? (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={stageVariant(assessment.arrivalStage)}>
                {assessment.arrivalStage.replaceAll("_", " ")}
              </Badge>
              <Badge variant={readinessVariant(assessment.dischargeReadiness)}>
                ready {assessment.dischargeReadiness}
              </Badge>
              <Badge variant={pressureVariant(assessment.queuePressure)}>
                queue {assessment.queuePressure}
              </Badge>
              <div className="text-sm text-slate-600">priority {assessment.executionPriorityScore}</div>
            </div>

            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3">
                <div className="text-xs uppercase tracking-[0.08em] text-slate-500">AIS ETA</div>
                <div className="mt-1 font-medium text-slate-900">{formatEta(assessment.eta)}</div>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3">
                <div className="text-xs uppercase tracking-[0.08em] text-slate-500">Operational ETA from</div>
                <div className="mt-1 font-medium text-slate-900">{formatEta(assessment.operationalEtaWindow.earliestEta)}</div>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3">
                <div className="text-xs uppercase tracking-[0.08em] text-slate-500">Operational ETA to</div>
                <div className="mt-1 font-medium text-slate-900">{formatEta(assessment.operationalEtaWindow.latestEta)}</div>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3">
                <div className="text-xs uppercase tracking-[0.08em] text-slate-500">Window width</div>
                <div className="mt-1 font-medium text-slate-900">
                  {assessment.operationalEtaWindow.rangeHours} h · {assessment.operationalEtaWindow.confidenceBand}
                </div>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-lg border border-slate-200 px-3 py-3">
                <div className="text-xs uppercase tracking-[0.08em] text-slate-500">Days to Morocco</div>
                <div className="mt-1 font-medium text-slate-900">{assessment.estimatedDaysToMorocco.toFixed(1)} d</div>
              </div>
              <div className="rounded-lg border border-slate-200 px-3 py-3">
                <div className="text-xs uppercase tracking-[0.08em] text-slate-500">Destination fit</div>
                <div className="mt-1 font-medium text-slate-900">{assessment.destinationFit}</div>
              </div>
              <div className="rounded-lg border border-slate-200 px-3 py-3">
                <div className="text-xs uppercase tracking-[0.08em] text-slate-500">Queue score</div>
                <div className="mt-1 font-medium text-slate-900">{assessment.queuePressureScore}</div>
              </div>
              <div className="rounded-lg border border-slate-200 px-3 py-3">
                <div className="text-xs uppercase tracking-[0.08em] text-slate-500">Conviction</div>
                <div className="mt-1 font-medium text-slate-900">
                  Morocco {assessment.moroccoBoundScore} · Agri {assessment.agriCargoScore}
                </div>
              </div>
            </div>

            <div className="space-y-2">
              {assessment.notes.map((note) => (
                <div key={note} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                  {note}
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-600">
            This vessel is not currently being treated as a Morocco-destination operational arrival case.
          </div>
        )}
      </CardContent>
    </Card>
  );
}
