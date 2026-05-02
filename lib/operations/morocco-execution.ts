import { getMoroccoDestinationKnowledgeForPort } from "@/lib/knowledge/catalog";
import { RadarFeed, RadarVessel } from "@/lib/types";

export interface OperationalEtaWindow {
  earliestEta: string;
  latestEta: string;
  rangeHours: number;
  confidenceBand: "tight" | "normal" | "wide";
}

export interface VesselExecutionAssessment {
  vesselId: string;
  vesselName: string;
  destinationPort: string;
  destinationPortCode: string;
  estimatedDaysToMorocco: number;
  moroccoBoundScore: number;
  agriCargoScore: number;
  mostLikelyCommodity: RadarVessel["mostLikelyCommodity"];
  vesselVoyageState: RadarVessel["vesselVoyageState"];
  eta: string;
  operationalEtaWindow: OperationalEtaWindow;
  arrivalStage: "monitor" | "arrival_watch" | "prepare_berth" | "immediate_attention";
  destinationFit: "high" | "medium" | "low";
  dischargeReadiness: "high" | "medium" | "low";
  queuePressure: "low" | "medium" | "high";
  queuePressureScore: number;
  executionPriorityScore: number;
  notes: string[];
}

export interface MoroccoExecutionPortAssessment {
  portId: string;
  portName: string;
  incomingVessels: number;
  highConfidenceIncoming: number;
  arrivalsNext7Days: number;
  arrivalsNext14Days: number;
  arrivalsNext30Days: number;
  averageMoroccoBoundScore: number;
  averageAgriCargoScore: number;
  queuePressure: "low" | "medium" | "high";
  queuePressureScore: number;
  grainRelevance: "high" | "medium" | "low" | null;
  feedRelevance: "high" | "medium" | "low" | null;
  likelySourceRegions: string[];
  nextOperationalEta: string | null;
  notes: string[];
}

export interface MoroccoExecutionDashboardPayload {
  generatedAt: string;
  sourceLabel: string;
  summary: {
    trackedVessels: number;
    immediateAttentionVessels: number;
    berthPreparationVessels: number;
    portsUnderHighPressure: number;
    averageEtaWindowHours: number | null;
  };
  nearTermArrivals: VesselExecutionAssessment[];
  portPressure: MoroccoExecutionPortAssessment[];
  notes: string[];
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function safeDate(isoDate: string) {
  const date = new Date(isoDate);
  return Number.isNaN(date.getTime()) ? null : date;
}

function addHours(isoDate: string, hours: number) {
  const date = safeDate(isoDate);
  if (!date) {
    return isoDate;
  }
  return new Date(date.getTime() + hours * 3_600_000).toISOString();
}

function subtractHours(isoDate: string, hours: number) {
  const date = safeDate(isoDate);
  if (!date) {
    return isoDate;
  }
  return new Date(date.getTime() - hours * 3_600_000).toISOString();
}

function rangeConfidenceBand(hours: number): OperationalEtaWindow["confidenceBand"] {
  if (hours <= 18) {
    return "tight";
  }
  if (hours <= 36) {
    return "normal";
  }
  return "wide";
}

function queuePressureBand(score: number): "low" | "medium" | "high" {
  if (score >= 60) {
    return "high";
  }
  if (score >= 30) {
    return "medium";
  }
  return "low";
}

function arrivalStageForVessel(vessel: RadarVessel): VesselExecutionAssessment["arrivalStage"] {
  if (vessel.estimatedDaysToMorocco <= 2) {
    return "immediate_attention";
  }
  if (vessel.estimatedDaysToMorocco <= 7) {
    return "prepare_berth";
  }
  if (vessel.estimatedDaysToMorocco <= 14) {
    return "arrival_watch";
  }
  return "monitor";
}

function destinationFitForVessel(vessel: RadarVessel): VesselExecutionAssessment["destinationFit"] {
  const knowledge = getMoroccoDestinationKnowledgeForPort(vessel.destinationPort);
  if (!knowledge) {
    return "low";
  }
  if (knowledge.grainRelevance === "high" || knowledge.feedRelevance === "high") {
    return "high";
  }
  if (knowledge.grainRelevance === "medium" || knowledge.feedRelevance === "medium") {
    return "medium";
  }
  return "low";
}

function buildOperationalEtaWindow(vessel: RadarVessel): OperationalEtaWindow {
  const baseRange = 18;
  const uncertaintyInflation = vessel.uncertaintyPenalty * 0.45;
  const contradictionInflation = vessel.destinationContradictionScore * 0.18;
  const confidenceCompression = vessel.destinationConsistencyScore * 0.16 + vessel.operationalSupportScore * 0.12;
  const voyageStateCompression =
    vessel.vesselVoyageState === "voyage_confirmed" || vessel.vesselVoyageState === "laden_departure" ? 8 : 0;
  const rangeHours = clamp(
    Math.round(baseRange + uncertaintyInflation + contradictionInflation - confidenceCompression - voyageStateCompression),
    10,
    72,
  );

  return {
    earliestEta: subtractHours(vessel.eta, rangeHours / 2),
    latestEta: addHours(vessel.eta, rangeHours / 2),
    rangeHours,
    confidenceBand: rangeConfidenceBand(rangeHours),
  };
}

function buildDischargeReadiness(vessel: RadarVessel): VesselExecutionAssessment["dischargeReadiness"] {
  const score =
    vessel.moroccoBoundScore * 0.26 +
    vessel.agriCargoScore * 0.22 +
    vessel.destinationMoroccoConfidence * 0.16 +
    vessel.destinationEvolutionScore * 0.1 +
    vessel.operationalSupportScore * 0.1 +
    vessel.loadingSignalScore * 0.08 +
    vessel.dataCompletenessScore * 0.08;

  if (score >= 68) {
    return "high";
  }
  if (score >= 48) {
    return "medium";
  }
  return "low";
}

function buildPortQueueScores(vessels: RadarVessel[]) {
  const grouped = new Map<
    string,
    {
      portName: string;
      vessels: RadarVessel[];
    }
  >();

  for (const vessel of vessels.filter((item) => item.destinationPortCountry === "Morocco")) {
    const key = vessel.destinationPortCode || vessel.destinationPort;
    const existing = grouped.get(key) ?? { portName: vessel.destinationPort, vessels: [] };
    existing.vessels.push(vessel);
    grouped.set(key, existing);
  }

  const scores = new Map<string, number>();

  for (const [key, group] of Array.from(grouped.entries())) {
    const arrivalsNext7 = group.vessels.filter((vessel) => vessel.estimatedDaysToMorocco <= 7).length;
    const arrivalsNext14 = group.vessels.filter((vessel) => vessel.estimatedDaysToMorocco <= 14).length;
    const highConfidence = group.vessels.filter(
      (vessel) => vessel.moroccoBoundScore >= 70 && vessel.agriCargoScore >= 65,
    ).length;
    const avgOperational = group.vessels.reduce((sum, vessel) => sum + vessel.operationalSupportScore, 0) / Math.max(1, group.vessels.length);
    const avgDays = group.vessels.reduce((sum, vessel) => sum + vessel.estimatedDaysToMorocco, 0) / Math.max(1, group.vessels.length);

    const score = clamp(
      Math.round(
        arrivalsNext7 * 14 +
          arrivalsNext14 * 5 +
          highConfidence * 7 +
          avgOperational * 0.18 +
          Math.max(0, 18 - avgDays) * 0.9,
      ),
      0,
      100,
    );

    scores.set(key, score);
  }

  return scores;
}

function buildExecutionNotes(vessel: RadarVessel, queuePressure: VesselExecutionAssessment["queuePressure"]) {
  const notes: string[] = [];

  if (vessel.operationalSupportScore >= 65) {
    notes.push("Operational loading / departure evidence is strong.");
  } else if (vessel.operationalSupportScore >= 45) {
    notes.push("Operational evidence is moderate and should still be monitored.");
  }

  if (vessel.waitingPatternSignal >= 40 || vessel.loadingQueuePlausibility >= 45) {
    notes.push("Departure-side waiting / queue pattern supports loaded-departure plausibility.");
  }

  if (queuePressure === "high") {
    notes.push("Destination port looks busy in the current radar horizon.");
  } else if (queuePressure === "medium") {
    notes.push("Destination port has moderate near-term pressure.");
  }

  if (vessel.destinationEvolutionScore >= 65 && vessel.destinationConsistencyScore >= 60) {
    notes.push("Destination pattern is stable enough for desk preparation.");
  }

  if (vessel.missingCriticalPredictionSignals.length > 0) {
    notes.push(`Watch missing signal: ${vessel.missingCriticalPredictionSignals[0]}.`);
  }

  return notes.slice(0, 4);
}

export function buildMoroccoExecutionDashboard(feed: RadarFeed): MoroccoExecutionDashboardPayload {
  const moroccoVessels = feed.vessels.filter((vessel) => vessel.destinationPortCountry === "Morocco");
  const queueScores = buildPortQueueScores(moroccoVessels);

  const nearTermArrivals = moroccoVessels
    .map((vessel) => {
      const portKey = vessel.destinationPortCode || vessel.destinationPort;
      const queuePressureScore = queueScores.get(portKey) ?? 0;
      const queuePressure = queuePressureBand(queuePressureScore);
      const operationalEtaWindow = buildOperationalEtaWindow(vessel);
      const destinationFit = destinationFitForVessel(vessel);
      const dischargeReadiness = buildDischargeReadiness(vessel);
      const arrivalStage = arrivalStageForVessel(vessel);
      const stageWeight =
        arrivalStage === "immediate_attention"
          ? 26
          : arrivalStage === "prepare_berth"
            ? 18
            : arrivalStage === "arrival_watch"
              ? 10
              : 2;

      const executionPriorityScore = clamp(
        Math.round(
          vessel.moroccoBoundScore * 0.28 +
            vessel.agriCargoScore * 0.24 +
            vessel.operationalSupportScore * 0.16 +
            vessel.destinationEvolutionScore * 0.12 +
            queuePressureScore * 0.1 +
            stageWeight,
        ),
        0,
        100,
      );

      return {
        vesselId: vessel.id,
        vesselName: vessel.name,
        destinationPort: vessel.destinationPort,
        destinationPortCode: vessel.destinationPortCode,
        estimatedDaysToMorocco: vessel.estimatedDaysToMorocco,
        moroccoBoundScore: vessel.moroccoBoundScore,
        agriCargoScore: vessel.agriCargoScore,
        mostLikelyCommodity: vessel.mostLikelyCommodity,
        vesselVoyageState: vessel.vesselVoyageState,
        eta: vessel.eta,
        operationalEtaWindow,
        arrivalStage,
        destinationFit,
        dischargeReadiness,
        queuePressure,
        queuePressureScore,
        executionPriorityScore,
        notes: buildExecutionNotes(vessel, queuePressure),
      } satisfies VesselExecutionAssessment;
    })
    .sort((a, b) => {
      if (b.executionPriorityScore !== a.executionPriorityScore) {
        return b.executionPriorityScore - a.executionPriorityScore;
      }
      return a.estimatedDaysToMorocco - b.estimatedDaysToMorocco;
    });

  const byPort = new Map<string, RadarVessel[]>();
  for (const vessel of moroccoVessels) {
    const key = vessel.destinationPortCode || vessel.destinationPort;
    const existing = byPort.get(key) ?? [];
    existing.push(vessel);
    byPort.set(key, existing);
  }

  const portPressure = Array.from(byPort.entries())
    .map(([key, vessels]) => {
      const portName = vessels[0]?.destinationPort ?? key;
      const knowledge = getMoroccoDestinationKnowledgeForPort(portName);
      const queuePressureScore = queueScores.get(key) ?? 0;
      const queuePressure = queuePressureBand(queuePressureScore);
      const assessments = vessels.map((vessel) => buildOperationalEtaWindow(vessel));
      const nextOperationalEta = assessments
        .map((item) => item.earliestEta)
        .sort((a, b) => new Date(a).getTime() - new Date(b).getTime())[0] ?? null;

      const notes: string[] = [];
      if (queuePressure === "high") {
        notes.push("Desk should actively monitor sequencing and discharge timing.");
      } else if (queuePressure === "medium") {
        notes.push("Moderate arrival clustering may affect berth planning.");
      } else {
        notes.push("Current arrival flow looks manageable from the radar side.");
      }
      if (knowledge?.likelySourceRegions.length) {
        notes.push(`Source regions in profile: ${knowledge.likelySourceRegions.join(", ")}.`);
      }

      return {
        portId: key,
        portName,
        incomingVessels: vessels.length,
        highConfidenceIncoming: vessels.filter(
          (vessel) => vessel.moroccoBoundScore >= 70 && vessel.agriCargoScore >= 65,
        ).length,
        arrivalsNext7Days: vessels.filter((vessel) => vessel.estimatedDaysToMorocco <= 7).length,
        arrivalsNext14Days: vessels.filter((vessel) => vessel.estimatedDaysToMorocco <= 14).length,
        arrivalsNext30Days: vessels.filter((vessel) => vessel.estimatedDaysToMorocco <= 30).length,
        averageMoroccoBoundScore: Number(
          (vessels.reduce((sum, vessel) => sum + vessel.moroccoBoundScore, 0) / Math.max(1, vessels.length)).toFixed(1),
        ),
        averageAgriCargoScore: Number(
          (vessels.reduce((sum, vessel) => sum + vessel.agriCargoScore, 0) / Math.max(1, vessels.length)).toFixed(1),
        ),
        queuePressure,
        queuePressureScore,
        grainRelevance: knowledge?.grainRelevance ?? null,
        feedRelevance: knowledge?.feedRelevance ?? null,
        likelySourceRegions: knowledge?.likelySourceRegions ?? [],
        nextOperationalEta,
        notes: notes.slice(0, 3),
      } satisfies MoroccoExecutionPortAssessment;
    })
    .sort((a, b) => b.queuePressureScore - a.queuePressureScore || b.incomingVessels - a.incomingVessels);

  const averageEtaWindowHours =
    nearTermArrivals.length > 0
      ? Number(
          (
            nearTermArrivals.reduce((sum, vessel) => sum + vessel.operationalEtaWindow.rangeHours, 0) /
            nearTermArrivals.length
          ).toFixed(1),
        )
      : null;

  const notes: string[] = [];
  if (nearTermArrivals.length === 0) {
    notes.push("No Morocco-destination vessels are currently active in the radar feed.");
  }
  if (portPressure.some((port) => port.queuePressure === "high")) {
    notes.push("At least one Morocco destination port is under high radar-derived arrival pressure.");
  }
  if (nearTermArrivals.some((vessel) => vessel.arrivalStage === "immediate_attention")) {
    notes.push("Immediate-attention arrivals now require an operational read, not just a detection read.");
  }

  return {
    generatedAt: new Date().toISOString(),
    sourceLabel: feed.source.label,
    summary: {
      trackedVessels: moroccoVessels.length,
      immediateAttentionVessels: nearTermArrivals.filter((vessel) => vessel.arrivalStage === "immediate_attention").length,
      berthPreparationVessels: nearTermArrivals.filter((vessel) => vessel.arrivalStage === "prepare_berth").length,
      portsUnderHighPressure: portPressure.filter((port) => port.queuePressure === "high").length,
      averageEtaWindowHours,
    },
    nearTermArrivals: nearTermArrivals.slice(0, 24),
    portPressure,
    notes,
  };
}

export function buildVesselExecutionAssessment(vessel: RadarVessel, feed: RadarFeed): VesselExecutionAssessment | null {
  if (vessel.destinationPortCountry !== "Morocco") {
    return null;
  }

  const dashboard = buildMoroccoExecutionDashboard(feed);
  return dashboard.nearTermArrivals.find((entry) => entry.vesselId === vessel.id) ?? null;
}
