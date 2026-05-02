import { buildMoroccoExecutionDashboard } from "@/lib/operations/morocco-execution";
import { buildVesselRiskSnapshot, VesselRiskSnapshot } from "@/lib/risk/assessment";
import {
  buildExecutionPriorityFallback,
  buildTraderActionabilitySnapshot,
  TraderActionabilitySnapshot,
} from "@/lib/trader/actionability";
import { RadarFeed, RadarVessel } from "@/lib/types";
import { WorkflowDashboardPayload, WorkflowVesselChangeEvent } from "@/lib/workflow/types";

export interface TraderOpportunity extends TraderActionabilitySnapshot {
  vesselId: string;
  vesselName: string;
  destinationPort: string;
  mostLikelyCommodity: RadarVessel["mostLikelyCommodity"];
  detectionPhase: RadarVessel["detectionPhase"];
  eta: string;
  estimatedDaysToMorocco: number;
  executionPriorityScore: number;
  arrivalStage: "monitor" | "arrival_watch" | "prepare_berth" | "immediate_attention" | null;
  queuePressure: "low" | "medium" | "high" | null;
  dischargeReadiness: "low" | "medium" | "high" | null;
  riskSeverity: VesselRiskSnapshot["highestSeverity"];
  riskScore: number;
  isFavorite?: boolean;
}

export interface TraderOpportunityBoardPayload {
  generatedAt: string;
  sourceLabel: string;
  summary: {
    immediateDeskActions: number;
    highPriorityCases: number;
    developingCases: number;
    monitorCases: number;
    averageActionabilityScore: number | null;
    openAlerts: number;
    recentChangesLast24Hours: number;
  };
  opportunities: TraderOpportunity[];
  recentChanges: WorkflowVesselChangeEvent[];
  notes: string[];
}

export function buildTraderOpportunityBoard(
  feed: RadarFeed,
  workflowDashboard?: WorkflowDashboardPayload | null,
): TraderOpportunityBoardPayload {
  const executionDashboard = buildMoroccoExecutionDashboard(feed);
  const executionByVesselId = new Map(
    executionDashboard.nearTermArrivals.map((entry) => [entry.vesselId, entry] as const),
  );

  const opportunities = feed.vessels
    .map((vessel) => {
      const riskSnapshot = buildVesselRiskSnapshot(vessel);
      const execution = executionByVesselId.get(vessel.id) ?? null;
      const snapshot = buildTraderActionabilitySnapshot(vessel, {
        riskSnapshot,
        executionPriorityScore: execution?.executionPriorityScore ?? null,
      });

      return {
        vesselId: vessel.id,
        vesselName: vessel.name,
        destinationPort: vessel.destinationPort,
        mostLikelyCommodity: vessel.mostLikelyCommodity,
        detectionPhase: vessel.detectionPhase,
        eta: vessel.eta,
        estimatedDaysToMorocco: vessel.estimatedDaysToMorocco,
        executionPriorityScore: execution?.executionPriorityScore ?? buildExecutionPriorityFallback(vessel),
        arrivalStage: execution?.arrivalStage ?? null,
        queuePressure: execution?.queuePressure ?? null,
        dischargeReadiness: execution?.dischargeReadiness ?? null,
        riskSeverity: riskSnapshot.highestSeverity,
        riskScore: riskSnapshot.score,
        isFavorite: vessel.isFavorite,
        ...snapshot,
      } satisfies TraderOpportunity;
    })
    .sort((a, b) => {
      if (b.score !== a.score) {
        return b.score - a.score;
      }
      if (a.estimatedDaysToMorocco !== b.estimatedDaysToMorocco) {
        return a.estimatedDaysToMorocco - b.estimatedDaysToMorocco;
      }
      return b.executionPriorityScore - a.executionPriorityScore;
    });

  const recentChanges = (workflowDashboard?.recentChanges ?? [])
    .filter((event) => Date.now() - new Date(event.createdAt).getTime() <= 24 * 3_600_000)
    .slice(0, 12);

  const averageActionabilityScore =
    opportunities.length > 0
      ? Number(
          (
            opportunities.reduce((sum, entry) => sum + entry.score, 0) /
            Math.max(1, opportunities.length)
          ).toFixed(1),
        )
      : null;

  const notes: string[] = [];
  if (recentChanges.length > 0) {
    notes.push(`${recentChanges.length} vessel changes were recorded in the last 24 hours.`);
  }
  if ((workflowDashboard?.alerts ?? []).some((alert) => alert.severity === "critical")) {
    notes.push("At least one critical workflow alert is still open and should stay on the desk agenda.");
  }
  if (opportunities.some((entry) => entry.band === "immediate")) {
    notes.push("The desk has immediate-action cases where commercial follow-up should not wait for the next refresh.");
  }
  if (notes.length === 0) {
    notes.push("No immediate desk escalation is visible right now; the radar remains in monitoring mode.");
  }

  return {
    generatedAt: new Date().toISOString(),
    sourceLabel: feed.source.label,
    summary: {
      immediateDeskActions: opportunities.filter((entry) => entry.band === "immediate").length,
      highPriorityCases: opportunities.filter((entry) => entry.band === "high").length,
      developingCases: opportunities.filter((entry) => entry.band === "developing").length,
      monitorCases: opportunities.filter((entry) => entry.band === "monitor").length,
      averageActionabilityScore,
      openAlerts: workflowDashboard?.alerts.length ?? 0,
      recentChangesLast24Hours: recentChanges.length,
    },
    opportunities: opportunities.slice(0, 24),
    recentChanges,
    notes,
  };
}
