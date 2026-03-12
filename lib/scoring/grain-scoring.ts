import {
  GRAIN_ORIGIN_PORT_IDS,
  MOROCCO_DESTINATION_PORT_IDS,
  MOROCCO_PORT_KEYWORDS,
} from "@/lib/data/mock-dataset";
import { detectLoadingSignal, LoadingConfidence } from "@/lib/intelligence/loading-event";
import { evaluateVoyageHypotheses, VoyageHypothesisResult } from "@/lib/intelligence/voyage-hypothesis";
import {
  deriveCommodityKnowledgeSnapshot,
  TerminalType,
} from "@/lib/data/live-intelligence-config";
import {
  CommodityConfidenceLabel,
  CommodityScores,
  CommodityType,
  ConfidenceLevel,
  DetectionPhase,
  PortRecord,
  VoyageHypothesisAlternative,
  VoyageHypothesisConfidence,
  VoyageHypothesisEvidenceStyle,
  VoyageHypothesisId,
} from "@/lib/types";

export interface IntelligenceScoringInput {
  vesselType: string;
  departurePort?: PortRecord;
  destinationPort?: PortRecord;
  destinationText: string;
  currentLat: number;
  currentLon: number;
  speed: number;
  course: number;
  deadweight: number;
  lastDraft: number;
  historicalRoutePortIds: string[];
  estimatedDaysToMorocco: number;
  currentMaritimeZone: string;
  timeSinceDepartureHours: number;
  gfwMoroccoVisitCount?: number;
  gfwExportPortVisitCount?: number;
  gfwHistoricalRouteHints?: string[];
  gfwEvidenceConfidence?: "low" | "medium" | "high";
  operationalSignals?: {
    operationalSupportScore: number;
    portCongestionSignal: number;
    berthProximitySignal: number;
    waitingPatternSignal: number;
    loadingQueuePlausibility: number;
    operationalEvidenceConfidence: "low" | "medium" | "high";
    operationalReasons?: string[];
  };
  loadingEvent?: {
    arrivalDraft?: number | null;
    departureDraft?: number | null;
    portStayHours?: number | null;
    loadingTerminalText?: string | null;
    loadingTerminalMatch?: boolean | null;
    departureDetectedAt?: string | null;
    departureAt?: string | null;
    arrivalAt?: string | null;
    timeSinceDepartureHours?: number | null;
    departureTimestampConfidence?: "low" | "medium" | "high";
    arrivalTimestampConfidence?: "low" | "medium" | "high";
    terminalMatchConfidenceHint?: "low" | "medium" | "high";
  };
}

export interface IntelligenceScoringResult {
  moroccoBoundScore: number;
  agriCargoScore: number;
  loadingSignalScore: number;
  draftDelta: number | null;
  portStayHours: number | null;
  loadingTerminalMatch: boolean;
  loadingConfidence: LoadingConfidence;
  loadingEvidenceStrength: "weak" | "moderate" | "strong";
  missingCriticalSignals: string[];
  matchedTerminalName: string | null;
  matchedTerminalType: TerminalType;
  terminalMatchConfidence: "low" | "medium" | "high";
  portStayConfidence: "low" | "medium" | "high";
  arrivalDraftEstimate: number | null;
  departureDraftEstimate: number | null;
  arrivalDraftConfidence: "low" | "medium" | "high";
  departureDraftConfidence: "low" | "medium" | "high";
  draftDeltaConfidence: "low" | "medium" | "high";
  commodityScores: CommodityScores;
  mostLikelyCommodity: CommodityType;
  commodityConfidenceLabel: CommodityConfidenceLabel;
  topVoyageHypothesis: VoyageHypothesisId;
  topVoyageHypothesisScore: number;
  topVoyageHypothesisConfidence: VoyageHypothesisConfidence;
  voyageHypothesisEvidenceStyle: VoyageHypothesisEvidenceStyle;
  voyageHypothesisReasons: string[];
  missingSignalsForVoyageConfirmation: string[];
  alternativeVoyageHypotheses: VoyageHypothesisAlternative[];
  detectionPhase: DetectionPhase;
  moroccoBoundReasons: string[];
  agriCargoReasons: string[];
  commodityReasons: string[];
  matchedCommodityKnowledgeNode: string | null;
  terminalCommodityProfile: string | null;
  vesselClassKnowledgeProfile: string;
  destinationKnowledgeProfile: string | null;
  knowledgeBasedCommodityReasons: string[];
  knowledgeSupportScore: number;
  knowledgeAgriScoreDelta: number;
  knowledgeCommodityScoreBoost: number;
  knowledgeCommodityScoreDeltas: CommodityScores;
  knowledgeMatchedTerminalIntelligence: boolean;
  knowledgeMatchedCommodityProfile: boolean;
  knowledgeDestinationIntelligenceSupport: boolean;
  confidenceLevel: ConfidenceLevel;
}

const PENALTY_TYPES = [
  { keyword: "tanker", score: -40, reason: "Penalty: tanker vessel profile" },
  { keyword: "container", score: -40, reason: "Penalty: container vessel profile" },
  { keyword: "passenger", score: -40, reason: "Penalty: passenger vessel profile" },
  { keyword: "ro-ro", score: -40, reason: "Penalty: ro-ro vessel profile" },
  { keyword: "roro", score: -40, reason: "Penalty: ro-ro vessel profile" },
];

interface KnowledgeScoringContext {
  matchedCommodityKnowledgeNode: string | null;
  terminalCommodityProfile: string | null;
  vesselClassKnowledgeProfile: string;
  destinationKnowledgeProfile: string | null;
  knowledgeBasedCommodityReasons: string[];
  knowledgeSupportScore: number;
  commodityBias: CommodityScores;
  agriSupportBoost: number;
  commoditySupportBoost: number;
  matchedTerminalIntelligence: boolean;
  matchedCommodityProfile: boolean;
  destinationIntelligenceSupport: boolean;
}

function clampScore(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function toConfidence(score: number): ConfidenceLevel {
  if (score >= 80) {
    return "High";
  }
  if (score >= 60) {
    return "Medium";
  }
  return "Low";
}

function isLikelyLoaded(deadweight: number, lastDraft: number) {
  if (deadweight >= 80_000) {
    return lastDraft >= 12.2;
  }

  if (deadweight >= 55_000) {
    return lastDraft >= 10.6;
  }

  if (deadweight >= 30_000) {
    return lastDraft >= 8.6;
  }

  return lastDraft >= 6.4;
}

function vesselClass(deadweight: number) {
  if (deadweight < 35_000) {
    return "handysize" as const;
  }

  if (deadweight < 60_000) {
    return "supramax" as const;
  }

  if (deadweight < 95_000) {
    return "panamax" as const;
  }

  return "capesize" as const;
}

function haversineDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const earthRadiusKm = 6371;
  const toRad = (degree: number) => (degree * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);

  const value =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;

  return 2 * earthRadiusKm * Math.asin(Math.sqrt(value));
}

function projectPosition(lat: number, lon: number, speed: number, course: number, hoursAhead: number) {
  const distanceNm = speed * hoursAhead;
  const courseRad = (course * Math.PI) / 180;
  const deltaLat = (distanceNm * Math.cos(courseRad)) / 60;
  const cosLat = Math.max(Math.cos((lat * Math.PI) / 180), 0.2);
  const deltaLon = (distanceNm * Math.sin(courseRad)) / (60 * cosLat);

  return {
    lat: lat + deltaLat,
    lon: lon + deltaLon,
  };
}

function isRouteTowardMorocco(
  currentLat: number,
  currentLon: number,
  speed: number,
  course: number,
  destinationPort?: PortRecord,
) {
  const referenceLat = destinationPort?.lat ?? 33.6;
  const referenceLon = destinationPort?.lon ?? -7.5;

  const projected = projectPosition(currentLat, currentLon, speed, course, 3.5);
  const nowDistance = haversineDistanceKm(currentLat, currentLon, referenceLat, referenceLon);
  const projectedDistance = haversineDistanceKm(projected.lat, projected.lon, referenceLat, referenceLon);

  return projectedDistance < nowDistance;
}

function isWestboundMediterraneanFlow(course: number) {
  return course >= 220 && course <= 300;
}

function isAtlanticMoroccoFlow(course: number) {
  return (course >= 25 && course <= 110) || (course >= 150 && course <= 220);
}

function routeDirectionSignals(
  currentMaritimeZone: string,
  course: number,
  currentLat: number,
  currentLon: number,
  speed: number,
  destinationPort?: PortRecord,
) {
  const towardMorocco = isRouteTowardMorocco(currentLat, currentLon, speed, course, destinationPort);
  const westMed = isWestboundMediterraneanFlow(course);
  const atlantic = isAtlanticMoroccoFlow(course);

  const consistent =
    (currentMaritimeZone.includes("Mediterranean") && westMed) ||
    (currentMaritimeZone.includes("Atlantic") && atlantic) ||
    (currentMaritimeZone.includes("Gibraltar") && (westMed || atlantic)) ||
    towardMorocco;

  const contradictory = !consistent && !towardMorocco;

  return { consistent, contradictory };
}

function destinationSuggestsMorocco(destinationText: string, destinationPort?: PortRecord) {
  const normalized = destinationText.toLowerCase();
  if (destinationPort?.isMoroccoDestination) {
    return true;
  }

  return MOROCCO_PORT_KEYWORDS.some((keyword) => normalized.includes(keyword));
}

function hasMoroccoHistoricalPattern(routePortIds: string[]) {
  const touchesOrigin = routePortIds.some((portId) => GRAIN_ORIGIN_PORT_IDS.has(portId));
  const touchesMorocco = routePortIds.some((portId) => MOROCCO_DESTINATION_PORT_IDS.has(portId));
  return touchesOrigin && touchesMorocco;
}

function applyTypePenalty(vesselTypeLower: string, reasons: string[]) {
  for (const penalty of PENALTY_TYPES) {
    if (vesselTypeLower.includes(penalty.keyword)) {
      reasons.push(penalty.reason);
      return penalty.score;
    }
  }

  return 0;
}

function scoreMoroccoBound(input: IntelligenceScoringInput) {
  const reasons: string[] = [];
  const vesselTypeLower = input.vesselType.toLowerCase();
  const destinationHint = destinationSuggestsMorocco(input.destinationText, input.destinationPort);
  let score = 0;

  const isDepartureRelevant = Boolean(input.departurePort?.isLikelyGrainOrigin);
  if (isDepartureRelevant) {
    if (input.timeSinceDepartureHours <= 48) {
      score += 25;
      reasons.push(`Recent departure from seeded export port (${input.departurePort?.name})`);
    } else if (input.timeSinceDepartureHours <= 96) {
      score += 18;
      reasons.push(`Departure from seeded export port (${input.departurePort?.name}) with moderate recency`);
    } else {
      score += 10;
      reasons.push(`Departure from seeded export port (${input.departurePort?.name}) but signal is older`);
    }
  } else {
    score -= 10;
    reasons.push("Penalty: irrelevant departure port for Morocco grain corridors");
  }

  if (vesselTypeLower.includes("bulk")) {
    score += 15;
    reasons.push("Bulk carrier vessel class");
  }

  if (vesselTypeLower.includes("general cargo")) {
    score += 10;
    reasons.push("General cargo vessel class");
  }

  const direction = routeDirectionSignals(
    input.currentMaritimeZone,
    input.course,
    input.currentLat,
    input.currentLon,
    input.speed,
    input.destinationPort,
  );

  if (direction.consistent) {
    score += 15;
    reasons.push("Route direction consistent with Morocco/Gibraltar corridor");
    score += 10;
    reasons.push("No contradictory route behavior");
  }

  if (direction.contradictory) {
    score -= 15;
    reasons.push("Penalty: contradictory route direction");
  }

  if (destinationHint) {
    score += 10;
    reasons.push("Destination text weakly suggests Morocco");
  }

  if (input.estimatedDaysToMorocco >= 1.2 && input.estimatedDaysToMorocco <= 10) {
    score += 10;
    reasons.push(`ETA pattern consistent with Morocco (${input.estimatedDaysToMorocco.toFixed(1)} days)`);
  } else if (input.estimatedDaysToMorocco > 10 && input.estimatedDaysToMorocco <= 16) {
    score += 6;
    reasons.push("Longer ETA still compatible with Morocco-bound routing");
  } else if (input.estimatedDaysToMorocco < 1.2) {
    score += 3;
    reasons.push("Very short ETA window; treated as late-stage signal");
  }

  if (hasMoroccoHistoricalPattern(input.historicalRoutePortIds)) {
    score += 10;
    reasons.push("Historical vessel pattern matches Morocco routes");
  }

  if (isLikelyLoaded(input.deadweight, input.lastDraft)) {
    score += 10;
    reasons.push("Loaded draft indication");
  }

  if (input.deadweight >= 15_000 && input.deadweight <= 95_000) {
    score += 5;
    reasons.push("Deadweight consistent with dry bulk grain corridors");
  }

  if (input.timeSinceDepartureHours > 24) {
    score -= 10;
    reasons.push("Penalty: departure signal is no longer fresh (>24h)");
  }

  if (input.timeSinceDepartureHours > 48) {
    score -= 12;
    reasons.push("Penalty: departure signal aging (>48h)");
  }

  if (input.timeSinceDepartureHours > 72) {
    score -= 10;
    reasons.push("Penalty: departure signal aging (>72h)");
  }

  if (input.timeSinceDepartureHours > 120) {
    score -= 10;
    reasons.push("Penalty: departure signal stale (>120h)");
  }

  // Early signals are valuable but inherently uncertain; keep them below near-certainty.
  if (input.timeSinceDepartureHours <= 12) {
    score -= 29;
    reasons.push("Uncertainty adjustment: very early-stage detection (<12h from departure)");
  } else if (input.timeSinceDepartureHours <= 24) {
    score -= 23;
    reasons.push("Uncertainty adjustment: early-stage detection (<24h from departure)");
  } else if (input.timeSinceDepartureHours <= 48) {
    score -= 13;
    reasons.push("Uncertainty adjustment: still in early transit (<48h)");
  }

  if (!destinationHint && !input.destinationPort?.isMoroccoDestination) {
    score -= 8;
    reasons.push("Penalty: destination evidence does not support Morocco");
  }

  score += applyTypePenalty(vesselTypeLower, reasons);

  return {
    score: clampScore(score),
    reasons,
    direction,
    destinationHint,
  };
}

function scoreAgriCargo(input: IntelligenceScoringInput, routeConsistent: boolean) {
  const reasons: string[] = [];
  const vesselTypeLower = input.vesselType.toLowerCase();
  const loaded = isLikelyLoaded(input.deadweight, input.lastDraft);
  const loadingSignal = detectLoadingSignal({
    vesselType: input.vesselType,
    departurePortCode: input.departurePort?.code,
    departurePortName: input.departurePort?.name,
    departurePortIsLikelyGrainOrigin: Boolean(input.departurePort?.isLikelyGrainOrigin),
    departureTerminalText: input.loadingEvent?.loadingTerminalText,
    arrivalDraft: input.loadingEvent?.arrivalDraft ?? null,
    departureDraft: input.loadingEvent?.departureDraft ?? input.lastDraft,
    portStayHours: input.loadingEvent?.portStayHours ?? null,
    routeTowardMorocco: routeConsistent,
    loadingTerminalMatchOverride: input.loadingEvent?.loadingTerminalMatch ?? null,
    departureDetectedAt: input.loadingEvent?.departureDetectedAt ?? null,
    departureAt: input.loadingEvent?.departureAt ?? null,
    arrivalAt: input.loadingEvent?.arrivalAt ?? null,
    timeSinceDepartureHours: input.loadingEvent?.timeSinceDepartureHours ?? input.timeSinceDepartureHours,
    departureTimestampConfidence: input.loadingEvent?.departureTimestampConfidence ?? "low",
    arrivalTimestampConfidence: input.loadingEvent?.arrivalTimestampConfidence ?? "low",
    terminalMatchConfidenceHint: input.loadingEvent?.terminalMatchConfidenceHint ?? "low",
  });
  const knowledge = buildKnowledgeContext(
    input,
    loadingSignal.matchedTerminalName,
    loadingSignal.matchedTerminalType,
  );
  let score = 0;
  let knowledgeAgriScoreDelta = 0;

  if (vesselTypeLower.includes("bulk")) {
    score += 28;
    reasons.push("Bulk carrier class aligns with dry agri cargos");
  }

  if (vesselTypeLower.includes("general cargo")) {
    score += 12;
    reasons.push("General cargo class can carry dry agri/feed lots");
  }

  if (input.departurePort?.isLikelyGrainOrigin) {
    score += 18;
    reasons.push(`Loading terminal signal from ${input.departurePort.name}`);
  } else {
    score -= 20;
    reasons.push("Penalty: departure terminal not grain-export oriented");
  }

  if (loaded) {
    score += 14;
    reasons.push("Departure draft indicates loaded condition");
  } else {
    score -= 12;
    reasons.push("Penalty: draft does not clearly indicate loaded dry bulk cargo");
  }

  if (hasMoroccoHistoricalPattern(input.historicalRoutePortIds)) {
    score += 10;
    reasons.push("Historical dry bulk pattern on grain/feed corridor");
  }

  if (input.destinationPort?.isMoroccoDestination) {
    const destinationId = input.destinationPort.id;
    if (destinationId === "port-casablanca" || destinationId === "port-jorf-lasfar") {
      score += 10;
      reasons.push("Destination terminal has strong grain/feed handling relevance");
    } else if (destinationId === "port-agadir" || destinationId === "port-safi") {
      score += 8;
      reasons.push("Destination terminal has moderate feed-relevant profile");
    } else {
      score += 5;
      reasons.push("Destination terminal is Morocco-compatible for dry cargo");
    }
  }

  if (knowledge.matchedCommodityProfile) {
    score += 5;
    reasons.push("Knowledge base: matched export/terminal commodity profile.");
  }

  if (knowledge.destinationIntelligenceSupport) {
    score += 4;
    reasons.push("Knowledge base: destination intelligence supports agri import relevance.");
  }

  if (routeConsistent) {
    score += 8;
    reasons.push("Maritime corridor is consistent with agri trade flow");
  } else {
    score -= 10;
    reasons.push("Penalty: corridor behavior does not support agri-flow hypothesis");
  }

  if (input.deadweight >= 15_000 && input.deadweight <= 90_000) {
    score += 6;
    reasons.push("Vessel size range aligns with common cereal/feed shipments");
  }

  if (input.deadweight < 10_000 || input.deadweight > 100_000) {
    score -= 8;
    reasons.push("Penalty: vessel size less typical for Morocco cereal/feed runs");
  }

  if (input.timeSinceDepartureHours > 72) {
    score -= 12;
    reasons.push("Penalty: agri-cargo signal aging (>72h)");
  }

  if (input.timeSinceDepartureHours > 120) {
    score -= 8;
    reasons.push("Penalty: agri-cargo signal stale (>120h)");
  }

  const operational = input.operationalSignals;
  if (operational) {
    if (
      operational.operationalSupportScore >= 65 &&
      operational.loadingQueuePlausibility >= 55 &&
      operational.operationalEvidenceConfidence !== "low"
    ) {
      score += operational.operationalEvidenceConfidence === "high" ? 9 : 6;
      reasons.push("Operational waiting/berth/queue evidence supports agri-cargo likelihood.");
    } else if (operational.operationalSupportScore >= 45) {
      score += 4;
      reasons.push("Operational evidence moderately supports agri-cargo likelihood.");
    }

    if (operational.waitingPatternSignal >= 45) {
      score += 3;
    }

    for (const reason of operational.operationalReasons ?? []) {
      reasons.push(`Operational signal: ${reason}`);
    }
  }

  if (loadingSignal.loadingSignalScore >= 75) {
    score += 20;
    reasons.push(`Loading-event signal is strong (${loadingSignal.loadingSignalScore})`);
  } else if (loadingSignal.loadingSignalScore >= 55) {
    score += 14;
    reasons.push(`Loading-event signal is moderate-high (${loadingSignal.loadingSignalScore})`);
  } else if (loadingSignal.loadingSignalScore >= 40) {
    score += 8;
    reasons.push(`Loading-event signal is moderate (${loadingSignal.loadingSignalScore})`);
  } else if (loadingSignal.loadingSignalScore <= 20) {
    score -= 8;
    reasons.push(`Penalty: loading-event signal is weak (${loadingSignal.loadingSignalScore})`);
  }

  if (loadingSignal.loadingConfidence === "low" && knowledge.knowledgeSupportScore >= 60) {
    score += 4;
    knowledgeAgriScoreDelta += 4;
    reasons.push("Knowledge interpretation: strong domain context offsets weak direct loading confidence.");
  }

  if (loadingSignal.matchedTerminalType === "mixed_bulk_terminal") {
    score -= 2;
    reasons.push("Mixed bulk terminal context reduces certainty versus dedicated grain/feed terminals.");
  }

  if (knowledge.agriSupportBoost !== 0) {
    score += knowledge.agriSupportBoost;
    knowledgeAgriScoreDelta += knowledge.agriSupportBoost;
    if (knowledge.agriSupportBoost > 0) {
      reasons.push(`Knowledge base boosted agri likelihood (+${knowledge.agriSupportBoost}).`);
    } else {
      reasons.push(`Knowledge base reduced agri likelihood (${knowledge.agriSupportBoost}).`);
    }
  }

  for (const reason of knowledge.knowledgeBasedCommodityReasons) {
    reasons.push(`Knowledge signal: ${reason}`);
  }

  for (const reason of loadingSignal.loadingSignalReasons) {
    reasons.push(`Loading signal: ${reason}`);
  }

  if (loadingSignal.loadingEvidenceStrength === "strong") {
    reasons.push("Loading evidence strength: strong");
  } else if (loadingSignal.loadingEvidenceStrength === "moderate") {
    reasons.push("Loading evidence strength: moderate");
  } else {
    reasons.push("Loading evidence strength: weak");
  }

  score += applyTypePenalty(vesselTypeLower, reasons);

  return {
    score: clampScore(score),
    reasons,
    knowledgeAgriScoreDelta,
    loaded,
    loadingSignal,
    knowledge,
  };
}

function addBias(scores: CommodityScores, bias: CommodityScores, factor = 1) {
  scores.wheatScore += bias.wheatScore * factor;
  scores.barleyScore += bias.barleyScore * factor;
  scores.cornScore += bias.cornScore * factor;
  scores.soybeanMealScore += bias.soybeanMealScore * factor;
}

function inferKnowledgeCorridor(currentMaritimeZone: string) {
  const zone = currentMaritimeZone.toLowerCase();
  if (zone.includes("gibraltar")) {
    return "gibraltar_approach_to_morocco" as const;
  }
  if (zone.includes("western mediterranean") || zone.includes("mediterranean")) {
    return "western_mediterranean_to_morocco" as const;
  }
  if (zone.includes("black sea")) {
    return "black_sea_to_morocco_via_bosphorus_and_med" as const;
  }
  if (zone.includes("north atlantic") || zone.includes("eastern atlantic")) {
    return "western_europe_to_morocco_atlantic" as const;
  }
  if (zone.includes("us gulf")) {
    return "us_gulf_to_morocco_atlantic" as const;
  }
  if (zone.includes("south atlantic")) {
    return "south_atlantic_agri_to_morocco" as const;
  }
  return null;
}

function buildKnowledgeContext(
  input: IntelligenceScoringInput,
  loadingTerminalName: string | null,
  loadingTerminalType: TerminalType,
): KnowledgeScoringContext {
  const snapshot = deriveCommodityKnowledgeSnapshot({
    departurePortId: input.departurePort?.id,
    departurePortCode: input.departurePort?.code,
    departurePortName: input.departurePort?.name,
    departureTerminalText: input.loadingEvent?.loadingTerminalText ?? null,
    matchedTerminalName: loadingTerminalName,
    destinationPortId: input.destinationPort?.id,
    destinationText: input.destinationText,
    vesselType: input.vesselType,
    deadweight: input.deadweight,
    corridorId: inferKnowledgeCorridor(input.currentMaritimeZone),
  });

  const knowledgeReasons = [...snapshot.knowledgeBasedCommodityReasons];
  if (loadingTerminalType === "mixed_bulk_terminal") {
    knowledgeReasons.push("Mixed bulk terminal profile keeps commodity inference conservative.");
  }

  return {
    matchedCommodityKnowledgeNode: snapshot.matchedCommodityKnowledgeNode,
    terminalCommodityProfile: snapshot.terminalCommodityProfile,
    vesselClassKnowledgeProfile: snapshot.vesselClassKnowledgeProfile,
    destinationKnowledgeProfile: snapshot.destinationKnowledgeProfile,
    knowledgeBasedCommodityReasons: knowledgeReasons,
    knowledgeSupportScore: snapshot.knowledgeSupportScore,
    commodityBias: snapshot.commodityBias,
    agriSupportBoost: snapshot.agriSupportBoost,
    commoditySupportBoost: snapshot.commoditySupportBoost,
    matchedTerminalIntelligence: snapshot.matchedTerminalIntelligence,
    matchedCommodityProfile: snapshot.matchedCommodityProfile,
    destinationIntelligenceSupport: snapshot.destinationIntelligenceSupport,
  };
}

function scoreCommodityHypothesis(
  input: IntelligenceScoringInput,
  moroccoBoundScore: number,
  agriCargoScore: number,
  isLoaded: boolean,
  knowledge: KnowledgeScoringContext,
  voyageHypothesis?: VoyageHypothesisResult,
) {
  const reasons: string[] = [];
  const base = agriCargoScore >= 55 ? 18 : 8;

  const scores: CommodityScores = {
    wheatScore: base,
    barleyScore: base,
    cornScore: base,
    soybeanMealScore: base,
  };
  const knowledgeCommodityScoreDeltas: CommodityScores = {
    wheatScore: 0,
    barleyScore: 0,
    cornScore: 0,
    soybeanMealScore: 0,
  };

  const departurePortId = input.departurePort?.id;
  knowledgeCommodityScoreDeltas.wheatScore += knowledge.commodityBias.wheatScore * 0.6;
  knowledgeCommodityScoreDeltas.barleyScore += knowledge.commodityBias.barleyScore * 0.6;
  knowledgeCommodityScoreDeltas.cornScore += knowledge.commodityBias.cornScore * 0.6;
  knowledgeCommodityScoreDeltas.soybeanMealScore += knowledge.commodityBias.soybeanMealScore * 0.6;
  addBias(scores, knowledge.commodityBias, 0.6);
  if (knowledge.matchedCommodityProfile) {
    reasons.push("Knowledge base: export/terminal commodity profile applied.");
  }
  if (knowledge.destinationIntelligenceSupport) {
    reasons.push("Knowledge base: Morocco destination commodity profile applied.");
  }
  reasons.push(`Knowledge base vessel class profile: ${knowledge.vesselClassKnowledgeProfile}.`);

  const klass = vesselClass(input.deadweight);
  if (klass === "handysize") {
    scores.barleyScore += 6;
    scores.soybeanMealScore += 4;
    reasons.push("Vessel class handysize tends toward smaller feed-oriented parcels");
  } else if (klass === "supramax") {
    scores.barleyScore += 5;
    scores.cornScore += 5;
    reasons.push("Vessel class supramax aligns with mixed grain/feed parcels");
  } else if (klass === "panamax") {
    scores.wheatScore += 7;
    scores.cornScore += 6;
    scores.soybeanMealScore += 5;
    reasons.push("Vessel class panamax aligns with larger cereal/feed parcels");
  } else {
    scores.wheatScore -= 6;
    scores.barleyScore -= 6;
    scores.cornScore -= 6;
    scores.soybeanMealScore -= 6;
    reasons.push("Capesize profile is less typical for Morocco cereal/feed flows");
  }

  if (isLoaded) {
    scores.wheatScore += 4;
    scores.barleyScore += 4;
    scores.cornScore += 4;
    scores.soybeanMealScore += 4;
    reasons.push("Loaded draft supports active cargo hypothesis");
  } else {
    scores.wheatScore -= 12;
    scores.barleyScore -= 12;
    scores.cornScore -= 12;
    scores.soybeanMealScore -= 12;
    reasons.push("Non-loaded draft weakens all commodity hypotheses");
  }

  if (input.currentMaritimeZone.includes("Atlantic") && departurePortId) {
    if (["port-new-orleans", "port-houston"].includes(departurePortId)) {
      scores.cornScore += 8;
      scores.soybeanMealScore += 4;
      reasons.push("US Gulf Atlantic corridor favors corn-led feed cargo hypothesis");
    }

    if (["port-santos", "port-rosario"].includes(departurePortId)) {
      scores.cornScore += 6;
      scores.soybeanMealScore += 10;
      reasons.push("South Atlantic corridor favors soybean meal and corn feed flows");
    }
  }

  if (input.currentMaritimeZone.includes("Mediterranean") || input.currentMaritimeZone.includes("Gibraltar")) {
    if (departurePortId && ["port-odessa", "port-chornomorsk", "port-constanta", "port-varna", "port-rouen"].includes(departurePortId)) {
      scores.wheatScore += 7;
      scores.barleyScore += 6;
      reasons.push("Med/Gibraltar corridor reinforces Black Sea/Europe wheat-barley flow");
    }
  }

  if (input.historicalRoutePortIds.some((portId) => ["port-santos", "port-rosario"].includes(portId))) {
    scores.soybeanMealScore += 8;
    scores.cornScore += 5;
    reasons.push("Historical route pattern suggests soybean meal/corn repetition");
  }

  if (input.historicalRoutePortIds.some((portId) => ["port-rouen", "port-odessa", "port-chornomorsk", "port-thunder-bay"].includes(portId))) {
    scores.wheatScore += 8;
    scores.barleyScore += 4;
    reasons.push("Historical route pattern suggests recurring wheat-oriented runs");
  }

  if (moroccoBoundScore < 55 || agriCargoScore < 55) {
    scores.wheatScore -= 10;
    scores.barleyScore -= 10;
    scores.cornScore -= 10;
    scores.soybeanMealScore -= 10;
    reasons.push("Morocco/agri confidence is moderate-low, commodity scores kept conservative");
  }

  if (moroccoBoundScore < 40 || agriCargoScore < 40) {
    scores.wheatScore -= 12;
    scores.barleyScore -= 12;
    scores.cornScore -= 12;
    scores.soybeanMealScore -= 12;
    reasons.push("Weak upstream confidence; strong commodity claim intentionally suppressed");
  }

  if (voyageHypothesis && voyageHypothesis.topVoyageHypothesisScore >= 58) {
    const confidenceMultiplier =
      voyageHypothesis.topVoyageHypothesisConfidence === "strong"
        ? 1
        : voyageHypothesis.topVoyageHypothesisConfidence === "moderate"
          ? 0.8
          : 0.6;

    const adjust = (value: number) => Math.round(value * confidenceMultiplier);
    const top = voyageHypothesis.topVoyageHypothesis;
    if (top === "western_europe_wheat_to_morocco" || top === "western_europe_grain_morocco_candidate") {
      scores.wheatScore += adjust(6);
      scores.barleyScore += adjust(3);
      reasons.push("Voyage hypothesis supports western-Europe wheat-led pattern.");
    } else if (top === "western_europe_feed_to_morocco") {
      scores.barleyScore += adjust(4);
      scores.cornScore += adjust(4);
      scores.soybeanMealScore += adjust(4);
      reasons.push("Voyage hypothesis supports western-Europe feed blend pattern.");
    } else if (
      top === "black_sea_mixed_grain_to_morocco" ||
      top === "black_sea_grain_morocco_candidate"
    ) {
      scores.wheatScore += adjust(4);
      scores.barleyScore += adjust(5);
      scores.cornScore += adjust(5);
      reasons.push("Voyage hypothesis supports Black Sea mixed-grain pattern.");
    } else if (
      top === "south_atlantic_feed_to_morocco" ||
      top === "south_atlantic_feed_morocco_candidate"
    ) {
      scores.cornScore += adjust(5);
      scores.soybeanMealScore += adjust(7);
      reasons.push("Voyage hypothesis supports South Atlantic feed pattern.");
    } else if (top === "us_gulf_feed_to_morocco") {
      scores.cornScore += adjust(7);
      scores.soybeanMealScore += adjust(6);
      reasons.push("Voyage hypothesis supports US Gulf feed pattern.");
    } else if (top === "ambiguous_dry_bulk_non_morocco") {
      scores.wheatScore -= adjust(4);
      scores.barleyScore -= adjust(4);
      scores.cornScore -= adjust(4);
      scores.soybeanMealScore -= adjust(4);
      reasons.push("Voyage hypothesis remains ambiguous; commodity certainty kept conservative.");
    }
  }

  if (knowledge.commoditySupportBoost !== 0) {
    scores.wheatScore += knowledge.commoditySupportBoost * 0.22;
    scores.barleyScore += knowledge.commoditySupportBoost * 0.16;
    scores.cornScore += knowledge.commoditySupportBoost * 0.16;
    scores.soybeanMealScore += knowledge.commoditySupportBoost * 0.22;
    knowledgeCommodityScoreDeltas.wheatScore += knowledge.commoditySupportBoost * 0.22;
    knowledgeCommodityScoreDeltas.barleyScore += knowledge.commoditySupportBoost * 0.16;
    knowledgeCommodityScoreDeltas.cornScore += knowledge.commoditySupportBoost * 0.16;
    knowledgeCommodityScoreDeltas.soybeanMealScore += knowledge.commoditySupportBoost * 0.22;
    reasons.push(`Knowledge base commodity support adjustment (${knowledge.commoditySupportBoost >= 0 ? "+" : ""}${knowledge.commoditySupportBoost}).`);
  }

  scores.wheatScore = clampScore(scores.wheatScore);
  scores.barleyScore = clampScore(scores.barleyScore);
  scores.cornScore = clampScore(scores.cornScore);
  scores.soybeanMealScore = clampScore(scores.soybeanMealScore);

  const entries = [
    { commodity: "wheat" as const, score: scores.wheatScore },
    { commodity: "barley" as const, score: scores.barleyScore },
    { commodity: "corn" as const, score: scores.cornScore },
    { commodity: "soybeanMeal" as const, score: scores.soybeanMealScore },
  ].sort((a, b) => b.score - a.score);

  const top = entries[0];
  const second = entries[1];
  const gap = top.score - second.score;

  let commodityConfidenceLabel: CommodityConfidenceLabel = "weak hypothesis";
  if (top.score >= 70 && gap >= 16 && agriCargoScore >= 70 && moroccoBoundScore >= 70) {
    commodityConfidenceLabel = "strong hypothesis";
  } else if (top.score >= 60 && gap >= 12 && agriCargoScore >= 62 && moroccoBoundScore >= 60) {
    commodityConfidenceLabel = "moderate hypothesis";
  }

  reasons.push(
    `Most likely commodity: ${top.commodity} (${top.score}) with ${commodityConfidenceLabel}`,
  );

  for (const reason of knowledge.knowledgeBasedCommodityReasons) {
    reasons.push(`Knowledge detail: ${reason}`);
  }

  return {
    scores,
    knowledgeCommodityScoreDeltas: {
      wheatScore: Number(knowledgeCommodityScoreDeltas.wheatScore.toFixed(1)),
      barleyScore: Number(knowledgeCommodityScoreDeltas.barleyScore.toFixed(1)),
      cornScore: Number(knowledgeCommodityScoreDeltas.cornScore.toFixed(1)),
      soybeanMealScore: Number(knowledgeCommodityScoreDeltas.soybeanMealScore.toFixed(1)),
    },
    mostLikelyCommodity: top.commodity,
    commodityConfidenceLabel,
    reasons,
  };
}

function determineDetectionPhase(params: {
  estimatedDaysToMorocco: number;
  moroccoBoundScore: number;
  agriCargoScore: number;
  commodityConfidenceLabel: CommodityConfidenceLabel;
  timeSinceDepartureHours: number;
  destinationPort?: PortRecord;
}) {
  const destinationMorocco = Boolean(params.destinationPort?.isMoroccoDestination);

  if (
    destinationMorocco &&
    params.estimatedDaysToMorocco <= 0.8 &&
    params.timeSinceDepartureHours > 72 &&
    params.moroccoBoundScore >= 90 &&
    params.agriCargoScore >= 90
  ) {
    return "near_arrival_confirmed" as const;
  }

  if (
    params.commodityConfidenceLabel === "strong hypothesis" &&
    params.moroccoBoundScore >= 72 &&
    params.agriCargoScore >= 90
  ) {
    return "commodity_hypothesis" as const;
  }

  if (params.moroccoBoundScore < 45) {
    return "departure_detected" as const;
  }

  if (params.moroccoBoundScore < 76) {
    return "morocco_bound_suspected" as const;
  }

  if (params.moroccoBoundScore >= 84 && params.agriCargoScore >= 90) {
    return "agri_cargo_likely" as const;
  }

  return "morocco_bound_likely" as const;
}

export function scoreVesselIntelligence(input: IntelligenceScoringInput): IntelligenceScoringResult {
  const morocco = scoreMoroccoBound(input);
  const agri = scoreAgriCargo(input, morocco.direction.consistent);
  const preliminaryVoyageHypothesis = evaluateVoyageHypotheses({
    vesselType: input.vesselType,
    deadweight: input.deadweight,
    departurePortId: input.departurePort?.id,
    departurePortCode: input.departurePort?.code,
    departurePortName: input.departurePort?.name,
    destinationPortId: input.destinationPort?.id,
    destinationText: input.destinationText,
    matchedTerminalType: agri.loadingSignal.matchedTerminalType,
    corridorId: inferKnowledgeCorridor(input.currentMaritimeZone),
    currentMaritimeZone: input.currentMaritimeZone,
    loadingSignalScore: agri.loadingSignal.loadingSignalScore,
    loadingConfidence: agri.loadingSignal.loadingConfidence,
    moroccoBoundScore: morocco.score,
    agriCargoScore: agri.score,
    knowledgeSupportScore: agri.knowledge.knowledgeSupportScore,
    historicalRoutePortIds: input.historicalRoutePortIds,
    routeConsistent: morocco.direction.consistent,
    timeSinceDepartureHours: input.timeSinceDepartureHours,
    gfwMoroccoVisitCount: input.gfwMoroccoVisitCount,
    gfwExportPortVisitCount: input.gfwExportPortVisitCount,
    gfwHistoricalRouteHints: input.gfwHistoricalRouteHints,
    gfwEvidenceConfidence: input.gfwEvidenceConfidence,
    operationalSupportScore: input.operationalSignals?.operationalSupportScore,
    waitingPatternSignal: input.operationalSignals?.waitingPatternSignal,
    berthProximitySignal: input.operationalSignals?.berthProximitySignal,
    loadingQueuePlausibility: input.operationalSignals?.loadingQueuePlausibility,
    operationalEvidenceConfidence: input.operationalSignals?.operationalEvidenceConfidence,
  });
  const commodity = scoreCommodityHypothesis(
    input,
    morocco.score,
    agri.score,
    agri.loaded,
    agri.knowledge,
    preliminaryVoyageHypothesis,
  );
  const finalVoyageHypothesis = evaluateVoyageHypotheses({
    vesselType: input.vesselType,
    deadweight: input.deadweight,
    departurePortId: input.departurePort?.id,
    departurePortCode: input.departurePort?.code,
    departurePortName: input.departurePort?.name,
    destinationPortId: input.destinationPort?.id,
    destinationText: input.destinationText,
    matchedTerminalType: agri.loadingSignal.matchedTerminalType,
    corridorId: inferKnowledgeCorridor(input.currentMaritimeZone),
    currentMaritimeZone: input.currentMaritimeZone,
    loadingSignalScore: agri.loadingSignal.loadingSignalScore,
    loadingConfidence: agri.loadingSignal.loadingConfidence,
    moroccoBoundScore: morocco.score,
    agriCargoScore: agri.score,
    knowledgeSupportScore: agri.knowledge.knowledgeSupportScore,
    commodityScores: commodity.scores,
    mostLikelyCommodity: commodity.mostLikelyCommodity,
    historicalRoutePortIds: input.historicalRoutePortIds,
    routeConsistent: morocco.direction.consistent,
    timeSinceDepartureHours: input.timeSinceDepartureHours,
    gfwMoroccoVisitCount: input.gfwMoroccoVisitCount,
    gfwExportPortVisitCount: input.gfwExportPortVisitCount,
    gfwHistoricalRouteHints: input.gfwHistoricalRouteHints,
    gfwEvidenceConfidence: input.gfwEvidenceConfidence,
    operationalSupportScore: input.operationalSignals?.operationalSupportScore,
    waitingPatternSignal: input.operationalSignals?.waitingPatternSignal,
    berthProximitySignal: input.operationalSignals?.berthProximitySignal,
    loadingQueuePlausibility: input.operationalSignals?.loadingQueuePlausibility,
    operationalEvidenceConfidence: input.operationalSignals?.operationalEvidenceConfidence,
  });

  let moroccoBoundScore = morocco.score;
  let agriCargoScore = agri.score;
  const moroccoReasons = [...morocco.reasons];
  const agriReasons = [...agri.reasons];

  if (
    finalVoyageHypothesis.topVoyageHypothesis !== "ambiguous_dry_bulk_non_morocco" &&
    finalVoyageHypothesis.topVoyageHypothesisScore >= 68
  ) {
    agriCargoScore = clampScore(agriCargoScore + 3);
    agriReasons.push(
      `Voyage hypothesis support: ${finalVoyageHypothesis.topVoyageHypothesis.replaceAll("_", " ")} (+3 agri).`,
    );
  }

  if (
    finalVoyageHypothesis.voyageHypothesisEvidenceStyle === "candidate_pre_confirmation" &&
    finalVoyageHypothesis.topVoyageHypothesisScore >= 66 &&
    !morocco.destinationHint &&
    finalVoyageHypothesis.topVoyageHypothesis !== "ambiguous_dry_bulk_non_morocco"
  ) {
    moroccoBoundScore = clampScore(moroccoBoundScore + 4);
    moroccoReasons.push(
      "Voyage hypothesis candidate evidence supports pre-confirmation Morocco routing (+4).",
    );
  }

  if (
    finalVoyageHypothesis.topVoyageHypothesis === "ambiguous_dry_bulk_non_morocco" &&
    finalVoyageHypothesis.topVoyageHypothesisScore >= 64
  ) {
    moroccoBoundScore = clampScore(moroccoBoundScore - 4);
    agriCargoScore = clampScore(agriCargoScore - 3);
    moroccoReasons.push("Ambiguous non-Morocco voyage pattern keeps Morocco-bound score conservative.");
    agriReasons.push("Ambiguous non-Morocco voyage pattern keeps agri-cargo score conservative.");
  }

  const detectionPhase = determineDetectionPhase({
    estimatedDaysToMorocco: input.estimatedDaysToMorocco,
    moroccoBoundScore,
    agriCargoScore,
    commodityConfidenceLabel: commodity.commodityConfidenceLabel,
    timeSinceDepartureHours: input.timeSinceDepartureHours,
    destinationPort: input.destinationPort,
  });

  return {
    moroccoBoundScore,
    agriCargoScore,
    loadingSignalScore: agri.loadingSignal.loadingSignalScore,
    draftDelta: agri.loadingSignal.draftDelta,
    portStayHours: agri.loadingSignal.portStayHours,
    loadingTerminalMatch: agri.loadingSignal.loadingTerminalMatch,
    loadingConfidence: agri.loadingSignal.loadingConfidence,
    loadingEvidenceStrength: agri.loadingSignal.loadingEvidenceStrength,
    missingCriticalSignals: agri.loadingSignal.missingCriticalSignals,
    matchedTerminalName: agri.loadingSignal.matchedTerminalName,
    matchedTerminalType: agri.loadingSignal.matchedTerminalType,
    terminalMatchConfidence: agri.loadingSignal.terminalMatchConfidence,
    portStayConfidence: agri.loadingSignal.portStayConfidence,
    arrivalDraftEstimate: agri.loadingSignal.arrivalDraftEstimate,
    departureDraftEstimate: agri.loadingSignal.departureDraftEstimate,
    arrivalDraftConfidence: agri.loadingSignal.arrivalDraftConfidence,
    departureDraftConfidence: agri.loadingSignal.departureDraftConfidence,
    draftDeltaConfidence: agri.loadingSignal.draftDeltaConfidence,
    commodityScores: commodity.scores,
    knowledgeCommodityScoreDeltas: commodity.knowledgeCommodityScoreDeltas,
    mostLikelyCommodity: commodity.mostLikelyCommodity,
    commodityConfidenceLabel: commodity.commodityConfidenceLabel,
    topVoyageHypothesis: finalVoyageHypothesis.topVoyageHypothesis,
    topVoyageHypothesisScore: finalVoyageHypothesis.topVoyageHypothesisScore,
    topVoyageHypothesisConfidence: finalVoyageHypothesis.topVoyageHypothesisConfidence,
    voyageHypothesisEvidenceStyle: finalVoyageHypothesis.voyageHypothesisEvidenceStyle,
    voyageHypothesisReasons: finalVoyageHypothesis.voyageHypothesisReasons,
    missingSignalsForVoyageConfirmation: finalVoyageHypothesis.missingSignalsForVoyageConfirmation,
    alternativeVoyageHypotheses: finalVoyageHypothesis.alternativeVoyageHypotheses,
    detectionPhase,
    moroccoBoundReasons: moroccoReasons,
    agriCargoReasons: agriReasons,
    commodityReasons: commodity.reasons,
    matchedCommodityKnowledgeNode: agri.knowledge.matchedCommodityKnowledgeNode,
    terminalCommodityProfile: agri.knowledge.terminalCommodityProfile,
    vesselClassKnowledgeProfile: agri.knowledge.vesselClassKnowledgeProfile,
    destinationKnowledgeProfile: agri.knowledge.destinationKnowledgeProfile,
    knowledgeBasedCommodityReasons: agri.knowledge.knowledgeBasedCommodityReasons,
    knowledgeSupportScore: agri.knowledge.knowledgeSupportScore,
    knowledgeAgriScoreDelta: agri.knowledgeAgriScoreDelta,
    knowledgeCommodityScoreBoost: agri.knowledge.commoditySupportBoost,
    knowledgeMatchedTerminalIntelligence: agri.knowledge.matchedTerminalIntelligence,
    knowledgeMatchedCommodityProfile: agri.knowledge.matchedCommodityProfile,
    knowledgeDestinationIntelligenceSupport: agri.knowledge.destinationIntelligenceSupport,
    confidenceLevel: toConfidence(moroccoBoundScore),
  };
}

export function formatDetectionPhase(phase: DetectionPhase) {
  return phase.replaceAll("_", " ");
}
