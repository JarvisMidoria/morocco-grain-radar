import { LoadingBehaviorSample, LoadingConfidence } from "@/lib/intelligence/loading-event";
import { TerminalType } from "@/lib/data/live-intelligence-config";

export type OperationalEvidenceConfidence = "low" | "medium" | "high";

export interface OperationalSeededArea {
  name: string;
  code: string | null;
  distanceKm: number | null;
}

export interface OperationalIntelligenceInput {
  dryBulkCompatible: boolean;
  currentSpeed: number;
  routeTowardMorocco: boolean;
  timeSinceDepartureHours: number | null;
  matchedTerminalType: TerminalType;
  loadingSignalScore: number;
  loadingConfidence: LoadingConfidence;
  draftDelta: number | null;
  portStayHours: number | null;
  seededArea: OperationalSeededArea | null;
  relevantNearbyVesselCount: number;
  historicalSamples: LoadingBehaviorSample[];
}

export interface OperationalIntelligenceAssessment {
  operationalSupportScore: number;
  portCongestionSignal: number;
  berthProximitySignal: number;
  waitingPatternSignal: number;
  loadingQueuePlausibility: number;
  operationalEvidenceConfidence: OperationalEvidenceConfidence;
  repeatedObservedNearSeededExportArea: boolean;
  lowSpeedDurationNearSeededPortHours: number;
  relevantNearbyVesselCount: number;
  operationalSeededExportArea: string | null;
  operationalReasons: string[];
}

function clampScore(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function estimateLowSpeedNearPortHours(samples: LoadingBehaviorSample[]) {
  const lowSpeedNearPort = samples
    .filter((sample) => sample.nearDeparturePort && typeof sample.speed === "number" && sample.speed <= 1.5)
    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

  if (lowSpeedNearPort.length === 0) {
    return 0;
  }
  if (lowSpeedNearPort.length === 1) {
    return 0.8;
  }

  const first = new Date(lowSpeedNearPort[0].timestamp).getTime();
  const last = new Date(lowSpeedNearPort[lowSpeedNearPort.length - 1].timestamp).getTime();
  const spanHours = Math.max(0, (last - first) / 3_600_000);
  const continuityBonus = Math.min(4, lowSpeedNearPort.length * 0.4);
  return Number(Math.min(72, spanHours + continuityBonus).toFixed(1));
}

function buildBerthProximity(params: {
  seededArea: OperationalSeededArea | null;
  matchedTerminalType: TerminalType;
  lowSpeedNearPortHours: number;
  repeatedNearSeededExportArea: boolean;
  reasons: string[];
}) {
  if (!params.seededArea) {
    params.reasons.push("Operational signal: no seeded export-port area anchor.");
    return 0;
  }

  let score = 8;
  const distanceKm = params.seededArea.distanceKm;
  if (typeof distanceKm === "number") {
    if (distanceKm <= 2.5) {
      score += 42;
      params.reasons.push(
        `Operational signal: very close to seeded export area (${distanceKm.toFixed(1)} km).`,
      );
    } else if (distanceKm <= 6) {
      score += 32;
      params.reasons.push(
        `Operational signal: close to seeded export area (${distanceKm.toFixed(1)} km).`,
      );
    } else if (distanceKm <= 12) {
      score += 22;
      params.reasons.push(
        `Operational signal: moderate berth proximity (${distanceKm.toFixed(1)} km).`,
      );
    } else if (distanceKm <= 25) {
      score += 12;
      params.reasons.push(
        `Operational signal: in seeded port area zone (${distanceKm.toFixed(1)} km).`,
      );
    } else {
      score -= 4;
    }
  }

  if (
    params.matchedTerminalType === "grain_terminal" ||
    params.matchedTerminalType === "feed_terminal"
  ) {
    score += 14;
    params.reasons.push("Operational signal: matched dedicated grain/feed terminal profile.");
  } else if (
    params.matchedTerminalType === "agri_bulk_terminal" ||
    params.matchedTerminalType === "mixed_bulk_terminal"
  ) {
    score += 8;
    params.reasons.push("Operational signal: matched agri/mixed bulk terminal context.");
  }

  if (params.repeatedNearSeededExportArea) {
    score += 8;
    params.reasons.push("Operational signal: repeated observations near seeded export area.");
  }

  if (params.lowSpeedNearPortHours >= 6) {
    score += 8;
  } else if (params.lowSpeedNearPortHours >= 2) {
    score += 4;
  }

  return clampScore(score);
}

function buildWaitingPattern(params: {
  dryBulkCompatible: boolean;
  currentSpeed: number;
  seededArea: OperationalSeededArea | null;
  lowSpeedNearPortHours: number;
  repeatedNearSeededExportArea: boolean;
  timeSinceDepartureHours: number | null;
  reasons: string[];
}) {
  if (!params.seededArea) {
    return 0;
  }

  let score = params.dryBulkCompatible ? 8 : 2;

  if (params.lowSpeedNearPortHours >= 20) {
    score += 34;
    params.reasons.push(
      `Operational signal: long low-speed dwell near seeded export port (${params.lowSpeedNearPortHours} h).`,
    );
  } else if (params.lowSpeedNearPortHours >= 12) {
    score += 24;
    params.reasons.push(
      `Operational signal: meaningful low-speed dwell near seeded export port (${params.lowSpeedNearPortHours} h).`,
    );
  } else if (params.lowSpeedNearPortHours >= 6) {
    score += 16;
  } else if (params.lowSpeedNearPortHours >= 2) {
    score += 9;
  } else if (params.lowSpeedNearPortHours > 0) {
    score += 4;
  }

  if (params.repeatedNearSeededExportArea) {
    score += 10;
  }

  if (params.currentSpeed <= 1.2) {
    score += 8;
    if (
      params.timeSinceDepartureHours !== null &&
      params.timeSinceDepartureHours <= 36 &&
      params.currentSpeed <= 1
    ) {
      score += 5;
    }
  }

  if (params.currentSpeed >= 4 && params.lowSpeedNearPortHours < 1 && params.timeSinceDepartureHours !== null && params.timeSinceDepartureHours > 48) {
    score -= 6;
  }

  return clampScore(score);
}

function buildCongestion(params: {
  relevantNearbyVesselCount: number;
  repeatedNearSeededExportArea: boolean;
  waitingPatternSignal: number;
  reasons: string[];
}) {
  let score = 0;
  const count = params.relevantNearbyVesselCount;
  if (count >= 10) {
    score = 42;
  } else if (count >= 7) {
    score = 34;
  } else if (count >= 5) {
    score = 26;
  } else if (count >= 3) {
    score = 18;
  } else if (count >= 2) {
    score = 10;
  } else if (params.waitingPatternSignal >= 35) {
    score = 6;
  }

  if (score > 0) {
    params.reasons.push(
      `Operational signal: ${count} relevant vessel(s) observed in the same seeded port area.`,
    );
  }

  if (params.repeatedNearSeededExportArea && count >= 3) {
    score += 4;
  }

  return clampScore(score);
}

function buildLoadingQueuePlausibility(params: {
  dryBulkCompatible: boolean;
  routeTowardMorocco: boolean;
  currentSpeed: number;
  timeSinceDepartureHours: number | null;
  loadingSignalScore: number;
  loadingConfidence: LoadingConfidence;
  draftDelta: number | null;
  portStayHours: number | null;
  waitingPatternSignal: number;
  berthProximitySignal: number;
  congestionSignal: number;
  reasons: string[];
}) {
  let score = 0;
  if (params.waitingPatternSignal >= 55) {
    score += 22;
  } else if (params.waitingPatternSignal >= 40) {
    score += 14;
  } else if (params.waitingPatternSignal >= 25) {
    score += 8;
  }

  if (params.berthProximitySignal >= 50) {
    score += 16;
  } else if (params.berthProximitySignal >= 35) {
    score += 10;
  }

  if (params.congestionSignal >= 26) {
    score += 14;
  } else if (params.congestionSignal >= 14) {
    score += 8;
  }

  if (typeof params.draftDelta === "number") {
    if (params.draftDelta >= 1.0) {
      score += 22;
      params.reasons.push(
        `Operational signal: draft increase after waiting supports loading queue (${params.draftDelta.toFixed(2)}m).`,
      );
    } else if (params.draftDelta >= 0.6) {
      score += 14;
    } else if (params.draftDelta >= 0.3) {
      score += 7;
    }
  }

  if (typeof params.portStayHours === "number") {
    if (params.portStayHours >= 12) {
      score += 14;
    } else if (params.portStayHours >= 7) {
      score += 9;
    } else if (params.portStayHours >= 4) {
      score += 5;
    }
  }

  if (
    params.currentSpeed >= 4 &&
    params.waitingPatternSignal >= 35 &&
    params.timeSinceDepartureHours !== null &&
    params.timeSinceDepartureHours <= 48
  ) {
    score += 10;
    params.reasons.push("Operational signal: departure after waiting pattern increases queue plausibility.");
  }

  if (params.routeTowardMorocco) {
    score += 6;
  }

  if (params.loadingSignalScore >= 55) {
    score += 10;
  } else if (params.loadingSignalScore >= 40) {
    score += 5;
  }

  if (params.loadingConfidence === "low" && params.draftDelta === null) {
    score -= 8;
  }
  if (!params.dryBulkCompatible) {
    score -= 20;
  }
  if (params.waitingPatternSignal < 20 && params.berthProximitySignal < 20) {
    score -= 6;
  }

  return clampScore(score);
}

function inferOperationalEvidenceConfidence(params: {
  operationalSupportScore: number;
  loadingQueuePlausibility: number;
  waitingPatternSignal: number;
  berthProximitySignal: number;
}): OperationalEvidenceConfidence {
  if (params.operationalSupportScore >= 70 && params.loadingQueuePlausibility >= 60) {
    return "high";
  }
  if (
    params.operationalSupportScore >= 45 &&
    (params.waitingPatternSignal >= 30 || params.berthProximitySignal >= 30)
  ) {
    return "medium";
  }
  return "low";
}

export function assessOperationalSignals(
  input: OperationalIntelligenceInput,
): OperationalIntelligenceAssessment {
  const reasons: string[] = [];
  const lowSpeedNearPortHours = estimateLowSpeedNearPortHours(input.historicalSamples);
  const repeatedNearSeededExportArea =
    input.historicalSamples.filter((sample) => sample.nearDeparturePort).length >= 2;

  const berthProximitySignal = buildBerthProximity({
    seededArea: input.seededArea,
    matchedTerminalType: input.matchedTerminalType,
    lowSpeedNearPortHours,
    repeatedNearSeededExportArea,
    reasons,
  });
  const waitingPatternSignal = buildWaitingPattern({
    dryBulkCompatible: input.dryBulkCompatible,
    currentSpeed: input.currentSpeed,
    seededArea: input.seededArea,
    lowSpeedNearPortHours,
    repeatedNearSeededExportArea,
    timeSinceDepartureHours: input.timeSinceDepartureHours,
    reasons,
  });
  const portCongestionSignal = buildCongestion({
    relevantNearbyVesselCount: input.relevantNearbyVesselCount,
    repeatedNearSeededExportArea,
    waitingPatternSignal,
    reasons,
  });
  const loadingQueuePlausibility = buildLoadingQueuePlausibility({
    dryBulkCompatible: input.dryBulkCompatible,
    routeTowardMorocco: input.routeTowardMorocco,
    currentSpeed: input.currentSpeed,
    timeSinceDepartureHours: input.timeSinceDepartureHours,
    loadingSignalScore: input.loadingSignalScore,
    loadingConfidence: input.loadingConfidence,
    draftDelta: input.draftDelta,
    portStayHours: input.portStayHours,
    waitingPatternSignal,
    berthProximitySignal,
    congestionSignal: portCongestionSignal,
    reasons,
  });

  const operationalSupportScore = clampScore(
    waitingPatternSignal * 0.28 +
      berthProximitySignal * 0.24 +
      portCongestionSignal * 0.14 +
      loadingQueuePlausibility * 0.34,
  );
  const operationalEvidenceConfidence = inferOperationalEvidenceConfidence({
    operationalSupportScore,
    loadingQueuePlausibility,
    waitingPatternSignal,
    berthProximitySignal,
  });

  if (operationalSupportScore >= 65) {
    reasons.push("Operational signal: overall loading-queue evidence is strong.");
  } else if (operationalSupportScore >= 45) {
    reasons.push("Operational signal: overall loading-queue evidence is moderate.");
  } else {
    reasons.push("Operational signal: overall loading-queue evidence is limited.");
  }

  return {
    operationalSupportScore,
    portCongestionSignal,
    berthProximitySignal,
    waitingPatternSignal,
    loadingQueuePlausibility,
    operationalEvidenceConfidence,
    repeatedObservedNearSeededExportArea: repeatedNearSeededExportArea,
    lowSpeedDurationNearSeededPortHours: lowSpeedNearPortHours,
    relevantNearbyVesselCount: input.relevantNearbyVesselCount,
    operationalSeededExportArea: input.seededArea?.name ?? null,
    operationalReasons: reasons.slice(0, 14),
  };
}
