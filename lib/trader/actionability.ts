import { buildVesselRiskSnapshot, VesselRiskSnapshot } from "@/lib/risk/assessment";
import { RadarVessel } from "@/lib/types";

export type TraderActionabilityBand = "immediate" | "high" | "developing" | "monitor";

export interface TraderActionabilitySnapshot {
  score: number;
  band: TraderActionabilityBand;
  convictionReasons: string[];
  blockers: string[];
  nextAction: string;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function uniqueNonEmpty(values: string[]) {
  return Array.from(
    new Set(
      values
        .map((value) => value.trim())
        .filter(Boolean),
    ),
  );
}

function timingWeight(estimatedDaysToMorocco: number) {
  if (estimatedDaysToMorocco <= 2) {
    return 14;
  }
  if (estimatedDaysToMorocco <= 7) {
    return 10;
  }
  if (estimatedDaysToMorocco <= 14) {
    return 6;
  }
  return 2;
}

function voyageStateWeight(voyageState: RadarVessel["vesselVoyageState"]) {
  if (voyageState === "voyage_confirmed") {
    return 10;
  }
  if (voyageState === "laden_departure") {
    return 8;
  }
  if (voyageState === "loading_in_progress") {
    return 5;
  }
  if (voyageState === "port_waiting") {
    return 3;
  }
  return 1;
}

function predictionConfidenceWeight(confidenceBand: RadarVessel["predictionConfidenceBand"]) {
  if (confidenceBand === "strong") {
    return 8;
  }
  if (confidenceBand === "moderate") {
    return 4;
  }
  return 0;
}

function actionabilityBand(score: number): TraderActionabilityBand {
  if (score >= 80) {
    return "immediate";
  }
  if (score >= 64) {
    return "high";
  }
  if (score >= 48) {
    return "developing";
  }
  return "monitor";
}

export function buildExecutionPriorityFallback(vessel: RadarVessel) {
  return clamp(
    Math.round(
      vessel.operationalSupportScore * 0.42 +
        vessel.destinationConsistencyScore * 0.2 +
        vessel.loadingSignalScore * 0.12 +
        timingWeight(vessel.estimatedDaysToMorocco) +
        voyageStateWeight(vessel.vesselVoyageState),
    ),
    0,
    100,
  );
}

function buildConvictionReasons(vessel: RadarVessel) {
  return uniqueNonEmpty([
    ...vessel.operationalReasons,
    ...vessel.moroccoBoundReasons,
    ...vessel.agriCargoReasons,
    ...vessel.destinationEvolutionReasons,
    ...vessel.knowledgeBasedCommodityReasons,
  ]).slice(0, 4);
}

function buildBlockers(vessel: RadarVessel, riskSnapshot: VesselRiskSnapshot) {
  const fromRisk = riskSnapshot.flags.map((flag) => flag.title);
  const fromSignals = vessel.missingCriticalPredictionSignals.map((signal) => `Missing signal: ${signal}`);
  const fromContradiction =
    vessel.contradictionScore >= 60 || vessel.destinationContradictionScore >= 55
      ? ["Destination contradiction remains elevated."]
      : [];

  const blockers = uniqueNonEmpty([...fromRisk, ...fromContradiction, ...fromSignals]).slice(0, 3);
  return blockers.length > 0 ? blockers : ["No material blocker is currently surfaced by the baseline heuristics."];
}

function buildNextAction(
  band: TraderActionabilityBand,
  riskSeverity: VesselRiskSnapshot["highestSeverity"],
  estimatedDaysToMorocco: number,
) {
  if (riskSeverity === "critical") {
    return "Escalate with a compliance and route review before any commercial follow-up.";
  }
  if (band === "immediate") {
    return estimatedDaysToMorocco <= 7
      ? "Escalate to the trader today and cross-check port execution immediately."
      : "Move it into the active trading shortlist and validate destination stability today.";
  }
  if (band === "high") {
    return "Keep it on the active shortlist and validate the next ETA or destination update.";
  }
  if (band === "developing") {
    return "Track for stronger loading, route, or destination confirmation before escalation.";
  }
  return "Leave it in monitoring until conviction improves or timing becomes tighter.";
}

export function buildTraderActionabilitySnapshot(
  vessel: RadarVessel,
  options?: {
    riskSnapshot?: VesselRiskSnapshot | null;
    executionPriorityScore?: number | null;
  },
): TraderActionabilitySnapshot {
  const riskSnapshot = options?.riskSnapshot ?? buildVesselRiskSnapshot(vessel);
  const executionPriorityScore = options?.executionPriorityScore ?? buildExecutionPriorityFallback(vessel);
  const score = clamp(
    Math.round(
      vessel.moroccoBoundScore * 0.26 +
        vessel.agriCargoScore * 0.22 +
        vessel.operationalSupportScore * 0.14 +
        vessel.knowledgeSupportScore * 0.08 +
        vessel.destinationConsistencyScore * 0.08 +
        executionPriorityScore * 0.14 +
        timingWeight(vessel.estimatedDaysToMorocco) +
        predictionConfidenceWeight(vessel.predictionConfidenceBand) -
        riskSnapshot.score * 0.14 -
        vessel.uncertaintyPenalty * 0.06,
    ),
    0,
    100,
  );
  const band = actionabilityBand(score);

  return {
    score,
    band,
    convictionReasons: buildConvictionReasons(vessel),
    blockers: buildBlockers(vessel, riskSnapshot),
    nextAction: buildNextAction(band, riskSnapshot.highestSeverity, vessel.estimatedDaysToMorocco),
  };
}
