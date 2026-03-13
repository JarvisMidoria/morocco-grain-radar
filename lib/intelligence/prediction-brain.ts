import { CommodityScores, CommodityType } from "@/lib/types";

export type VoyageState =
  | "ballast_arrival"
  | "port_waiting"
  | "loading_in_progress"
  | "laden_departure"
  | "voyage_confirmed";

export type EvidenceConfidence = "low" | "medium" | "high";
export type PredictionConfidenceBand = "weak" | "moderate" | "strong";

export interface VesselHistoricalCommercialProfile {
  exportPortVisitCounts: Record<string, number>;
  moroccoPortVisitCounts: Record<string, number>;
  corridorCounts: Record<string, number>;
  voyageTemplateCounts: Record<string, number>;
  historicalCommodityDistribution: Record<CommodityType, number>;
  vesselRouteRepetitionScore: number;
}

export interface DestinationEvolutionAssessment {
  destinationEvolutionScore: number;
  destinationMoroccoConfidence: number;
  destinationContradictionScore: number;
  destinationConsistencyScore: number;
  destinationEvolutionReasons: string[];
}

export interface VoyageStateAssessment {
  vesselVoyageState: VoyageState;
  voyageStateConfidence: EvidenceConfidence;
  voyageStateReasons: string[];
}

export interface ContradictionAssessment {
  contradictionScore: number;
  contradictionReasons: string[];
}

export interface EnsembleEvidenceBreakdown {
  routeEvidence: number;
  loadingEvidence: number;
  portKnowledgeEvidence: number;
  historicalEvidence: number;
  destinationEvidence: number;
  flowPriorEvidence: number;
  contradictionEvidence: number;
  overallSupportScore: number;
}

export interface ConfidenceCalibrationAssessment {
  dataCompletenessScore: number;
  missingCriticalPredictionSignals: string[];
  confidencePenalty: number;
  predictionConfidenceBand: PredictionConfidenceBand;
}

export interface CommodityProbabilityDistribution {
  wheat: number;
  barley: number;
  corn: number;
  soybeanMeal: number;
}

export interface CommodityEvidenceAdjustments {
  routeEvidence: CommodityScores;
  loadingEvidence: CommodityScores;
  historicalEvidence: CommodityScores;
  destinationEvidence: CommodityScores;
  flowPriorEvidence: CommodityScores;
  contradictionEvidence: CommodityScores;
  voyageHypothesisEvidence: CommodityScores;
  seasonalEvidence: CommodityScores;
  commercialPatternEvidence: CommodityScores;
}

export interface InformationValueSignal {
  signal: string;
  value: number;
  reason: string;
  currentlyMissing: boolean;
}

export interface ProbabilisticCommodityModelInput {
  heuristicCommodityScores: CommodityScores;
  commodityPriorScores: CommodityScores;
  routeEvidence: number;
  loadingEvidence: number;
  historicalEvidence: number;
  destinationEvidence: number;
  flowPriorEvidence: number;
  contradictionEvidence: number;
  vesselHistoricalProfile: VesselHistoricalCommercialProfile;
  topVoyageHypothesis: string;
  topVoyageHypothesisScore: number;
  voyageTemplatePosteriorProbabilities?: Record<string, number>;
  corridorClassification?: string | null;
  terminalType?: string | null;
  destinationMoroccoConfidence: number;
  hasDraftObservation: boolean;
  hasDepartureSignal: boolean;
  observationCount: number;
  originCluster?: "western_europe" | "black_sea" | "us_gulf" | "south_atlantic" | "unknown";
  referenceDate?: Date;
}

export interface ProbabilisticCommodityModelResult {
  commodityPriorProbabilities: CommodityProbabilityDistribution;
  commodityPosteriorProbabilities: CommodityProbabilityDistribution;
  commodityEvidenceAdjustments: CommodityEvidenceAdjustments;
  predictionEntropy: number;
  evidenceCoverageScore: number;
  uncertaintyPenalty: number;
  seasonalAdjustmentScore: number;
  seasonalReasoning: string[];
  commercialPatternSimilarityScore: number;
  informationValueSignals: InformationValueSignal[];
  missingInformationValueRanking: InformationValueSignal[];
}

const MOROCCO_TOKENS = [
  "morocco",
  "casablanca",
  "jorf",
  "agadir",
  "tanger",
  "nador",
  "safi",
  "ma",
  "macas",
  "majlf",
];

function clampScore(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function normalizeText(value: string | null | undefined) {
  return (value ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .toUpperCase();
}

function compactText(value: string | null | undefined) {
  return normalizeText(value).replace(/[^A-Z0-9]/g, "");
}

function hasMoroccoHint(value: string | null | undefined) {
  const normalized = normalizeText(value).toLowerCase();
  if (!normalized) {
    return false;
  }
  return MOROCCO_TOKENS.some((token) => normalized.includes(token));
}

function toProbabilityDistributionFromScores(
  scores: CommodityScores,
): CommodityProbabilityDistribution {
  const weights = {
    wheat: Math.max(0.01, scores.wheatScore),
    barley: Math.max(0.01, scores.barleyScore),
    corn: Math.max(0.01, scores.cornScore),
    soybeanMeal: Math.max(0.01, scores.soybeanMealScore),
  };
  const total = weights.wheat + weights.barley + weights.corn + weights.soybeanMeal;
  return {
    wheat: weights.wheat / total,
    barley: weights.barley / total,
    corn: weights.corn / total,
    soybeanMeal: weights.soybeanMeal / total,
  };
}

function toCommodityScoresFromProbabilityDistribution(
  distribution: CommodityProbabilityDistribution,
) {
  return {
    wheatScore: clampScore(distribution.wheat * 100),
    barleyScore: clampScore(distribution.barley * 100),
    cornScore: clampScore(distribution.corn * 100),
    soybeanMealScore: clampScore(distribution.soybeanMeal * 100),
  };
}

function normalizeProbabilityDistribution(
  distribution: CommodityProbabilityDistribution,
): CommodityProbabilityDistribution {
  const epsilon = 1e-9;
  const wheat = Math.max(epsilon, distribution.wheat);
  const barley = Math.max(epsilon, distribution.barley);
  const corn = Math.max(epsilon, distribution.corn);
  const soybeanMeal = Math.max(epsilon, distribution.soybeanMeal);
  const total = wheat + barley + corn + soybeanMeal;
  return {
    wheat: wheat / total,
    barley: barley / total,
    corn: corn / total,
    soybeanMeal: soybeanMeal / total,
  };
}

function blendCommodityScores(base: CommodityScores, overlay: CommodityScores, weight: number): CommodityScores {
  const capped = Math.max(0, Math.min(1, weight));
  return {
    wheatScore: clampScore(base.wheatScore * (1 - capped) + overlay.wheatScore * capped),
    barleyScore: clampScore(base.barleyScore * (1 - capped) + overlay.barleyScore * capped),
    cornScore: clampScore(base.cornScore * (1 - capped) + overlay.cornScore * capped),
    soybeanMealScore: clampScore(
      base.soybeanMealScore * (1 - capped) + overlay.soybeanMealScore * capped,
    ),
  };
}

function addCommodityScores(target: CommodityScores, source: CommodityScores, factor = 1) {
  target.wheatScore += source.wheatScore * factor;
  target.barleyScore += source.barleyScore * factor;
  target.cornScore += source.cornScore * factor;
  target.soybeanMealScore += source.soybeanMealScore * factor;
}

function inferOriginClusterFromContext(input: ProbabilisticCommodityModelInput) {
  if (input.originCluster && input.originCluster !== "unknown") {
    return input.originCluster;
  }
  const corridor = (input.corridorClassification ?? "").toLowerCase();
  if (corridor.includes("black_sea")) {
    return "black_sea" as const;
  }
  if (corridor.includes("us_gulf")) {
    return "us_gulf" as const;
  }
  if (corridor.includes("south_atlantic")) {
    return "south_atlantic" as const;
  }
  if (corridor.includes("western_europe") || corridor.includes("gibraltar")) {
    return "western_europe" as const;
  }
  return "unknown" as const;
}

function seasonalCommodityAdjustment(params: {
  originCluster: "western_europe" | "black_sea" | "us_gulf" | "south_atlantic" | "unknown";
  month: number;
}) {
  const bias: CommodityScores = {
    wheatScore: 0,
    barleyScore: 0,
    cornScore: 0,
    soybeanMealScore: 0,
  };
  const reasons: string[] = [];

  if (params.originCluster === "black_sea") {
    if (params.month >= 7 && params.month <= 10) {
      bias.wheatScore += 4;
      bias.barleyScore += 3;
      bias.cornScore += 2;
      reasons.push("Seasonal prior: Black Sea harvest window slightly supports wheat/barley.");
    } else if (params.month >= 11 || params.month <= 2) {
      bias.wheatScore += 2;
      bias.barleyScore += 1;
      reasons.push("Seasonal prior: post-harvest Black Sea wheat availability remains supportive.");
    }
  } else if (params.originCluster === "western_europe") {
    if (params.month >= 7 && params.month <= 10) {
      bias.wheatScore += 3;
      bias.barleyScore += 3;
      reasons.push("Seasonal prior: Western Europe cereal season supports wheat/barley.");
    }
  } else if (params.originCluster === "us_gulf") {
    if (params.month >= 9 || params.month <= 1) {
      bias.cornScore += 3;
      bias.soybeanMealScore += 3;
      reasons.push("Seasonal prior: US Gulf export season supports corn/soymeal.");
    }
  } else if (params.originCluster === "south_atlantic") {
    if (params.month >= 2 && params.month <= 6) {
      bias.cornScore += 3;
      bias.soybeanMealScore += 4;
      reasons.push("Seasonal prior: South Atlantic harvest season supports soymeal/corn.");
    }
  }

  return {
    bias,
    score: clampScore(
      (Math.abs(bias.wheatScore) +
        Math.abs(bias.barleyScore) +
        Math.abs(bias.cornScore) +
        Math.abs(bias.soybeanMealScore)) *
        6,
    ),
    reasons,
  };
}

function normalizeEntropy(distribution: CommodityProbabilityDistribution) {
  const probabilities = [
    distribution.wheat,
    distribution.barley,
    distribution.corn,
    distribution.soybeanMeal,
  ];
  let entropy = 0;
  for (const probability of probabilities) {
    const value = Math.max(1e-9, probability);
    entropy += -value * Math.log(value);
  }
  const maxEntropy = Math.log(4);
  return clampScore((entropy / maxEntropy) * 100);
}

function mapTemplateToCommodityAdjustment(template: string, probability: number): CommodityScores {
  const weight = Math.max(0, Math.min(1, probability));
  if (template.includes("western_europe_wheat")) {
    return {
      wheatScore: 10 * weight,
      barleyScore: 5 * weight,
      cornScore: 1 * weight,
      soybeanMealScore: 0,
    };
  }
  if (template.includes("western_europe_feed")) {
    return {
      wheatScore: 2 * weight,
      barleyScore: 5 * weight,
      cornScore: 5 * weight,
      soybeanMealScore: 4 * weight,
    };
  }
  if (template.includes("black_sea")) {
    return {
      wheatScore: 6 * weight,
      barleyScore: 7 * weight,
      cornScore: 6 * weight,
      soybeanMealScore: 1 * weight,
    };
  }
  if (template.includes("south_atlantic_feed")) {
    return {
      wheatScore: 1 * weight,
      barleyScore: 1 * weight,
      cornScore: 6 * weight,
      soybeanMealScore: 8 * weight,
    };
  }
  if (template.includes("us_gulf_feed")) {
    return {
      wheatScore: 1 * weight,
      barleyScore: 1 * weight,
      cornScore: 8 * weight,
      soybeanMealScore: 7 * weight,
    };
  }
  if (template.includes("ambiguous")) {
    return {
      wheatScore: -4 * weight,
      barleyScore: -4 * weight,
      cornScore: -4 * weight,
      soybeanMealScore: -4 * weight,
    };
  }
  return {
    wheatScore: 0,
    barleyScore: 0,
    cornScore: 0,
    soybeanMealScore: 0,
  };
}

function buildInformationValueSignals(params: {
  hasDraftObservation: boolean;
  hasDepartureSignal: boolean;
  destinationMoroccoConfidence: number;
  observationCount: number;
  contradictionEvidence: number;
  loadingEvidence: number;
  historicalEvidence: number;
  evidenceCoverageScore: number;
}): InformationValueSignal[] {
  const candidates: InformationValueSignal[] = [
    {
      signal: "new_draft_observation",
      value: params.hasDraftObservation ? 5 : 28,
      reason: params.hasDraftObservation
        ? "Draft already available; incremental value is limited."
        : "A new draft datapoint would strongly improve loading certainty.",
      currentlyMissing: !params.hasDraftObservation,
    },
    {
      signal: "clearer_destination_text",
      value: params.destinationMoroccoConfidence >= 60 ? 8 : 24,
      reason:
        params.destinationMoroccoConfidence >= 60
          ? "Destination trajectory is already moderately clear."
          : "Cleaner destination evolution would materially reduce ambiguity.",
      currentlyMissing: params.destinationMoroccoConfidence < 60,
    },
    {
      signal: "additional_ais_observation",
      value: params.observationCount >= 4 ? 7 : 18,
      reason:
        params.observationCount >= 4
          ? "Observation depth is acceptable."
          : "More AIS points would improve route and trend confidence.",
      currentlyMissing: params.observationCount < 4,
    },
    {
      signal: "confirmed_departure_port",
      value: params.hasDepartureSignal ? 6 : 20,
      reason: params.hasDepartureSignal
        ? "Departure signal exists but could still be refined."
        : "Confirmed departure context would significantly sharpen priors.",
      currentlyMissing: !params.hasDepartureSignal,
    },
    {
      signal: "historical_route_match",
      value: params.historicalEvidence >= 45 ? 8 : 17,
      reason:
        params.historicalEvidence >= 45
          ? "Historical route profile is already informative."
          : "Additional historical route matches would improve recurrence confidence.",
      currentlyMissing: params.historicalEvidence < 45,
    },
    {
      signal: "loading_signal_refresh",
      value: params.loadingEvidence >= 55 ? 6 : 16,
      reason:
        params.loadingEvidence >= 55
          ? "Loading evidence is already supportive."
          : "Fresh loading evidence would reduce commodity ambiguity quickly.",
      currentlyMissing: params.loadingEvidence < 55,
    },
    {
      signal: "resolve_route_contradictions",
      value: params.contradictionEvidence >= 35 ? 19 : 6,
      reason:
        params.contradictionEvidence >= 35
          ? "Resolving contradictions would materially improve confidence."
          : "Contradictions are currently limited.",
      currentlyMissing: params.contradictionEvidence >= 35,
    },
  ];

  if (params.evidenceCoverageScore < 45) {
    candidates.push({
      signal: "broader_evidence_coverage",
      value: 18,
      reason: "Coverage is sparse; any new orthogonal signal would improve the posterior.",
      currentlyMissing: true,
    });
  }

  return candidates
    .map((item) => ({ ...item, value: clampScore(item.value) }))
    .sort((a, b) => b.value - a.value);
}

function average(values: number[]) {
  if (values.length === 0) {
    return 0;
  }
  return values.reduce((sum, item) => sum + item, 0) / values.length;
}

function mapMaxCount(map: Record<string, number>) {
  let max = 0;
  for (const value of Object.values(map)) {
    if (value > max) {
      max = value;
    }
  }
  return max;
}

function mapTotalCount(map: Record<string, number>) {
  return Object.values(map).reduce((sum, value) => sum + value, 0);
}

export function emptyHistoricalCommercialProfile(): VesselHistoricalCommercialProfile {
  return {
    exportPortVisitCounts: {},
    moroccoPortVisitCounts: {},
    corridorCounts: {},
    voyageTemplateCounts: {},
    historicalCommodityDistribution: {
      wheat: 0,
      barley: 0,
      corn: 0,
      soybeanMeal: 0,
    },
    vesselRouteRepetitionScore: 0,
  };
}

export function cloneHistoricalCommercialProfile(
  profile?: VesselHistoricalCommercialProfile | null,
): VesselHistoricalCommercialProfile {
  const source = profile ?? emptyHistoricalCommercialProfile();
  return {
    exportPortVisitCounts: { ...source.exportPortVisitCounts },
    moroccoPortVisitCounts: { ...source.moroccoPortVisitCounts },
    corridorCounts: { ...source.corridorCounts },
    voyageTemplateCounts: { ...source.voyageTemplateCounts },
    historicalCommodityDistribution: {
      wheat: source.historicalCommodityDistribution.wheat ?? 0,
      barley: source.historicalCommodityDistribution.barley ?? 0,
      corn: source.historicalCommodityDistribution.corn ?? 0,
      soybeanMeal: source.historicalCommodityDistribution.soybeanMeal ?? 0,
    },
    vesselRouteRepetitionScore: clampScore(source.vesselRouteRepetitionScore ?? 0),
  };
}

function incrementCount(map: Record<string, number>, key: string, increment = 1) {
  const normalizedKey = key.trim();
  if (!normalizedKey) {
    return;
  }
  map[normalizedKey] = (map[normalizedKey] ?? 0) + increment;
}

function inferMoroccoPortLabel(destinationText: string) {
  const normalized = destinationText.toLowerCase();
  if (normalized.includes("casablanca") || normalized.includes("macas")) {
    return "Casablanca";
  }
  if (normalized.includes("jorf") || normalized.includes("majlf")) {
    return "Jorf Lasfar";
  }
  if (normalized.includes("agadir") || normalized.includes("maaga")) {
    return "Agadir";
  }
  if (normalized.includes("tanger") || normalized.includes("tangier") || normalized.includes("matng")) {
    return "Tanger Med";
  }
  if (normalized.includes("nador") || normalized.includes("mandr")) {
    return "Nador";
  }
  if (normalized.includes("safi") || normalized.includes("masfi")) {
    return "Safi";
  }
  return "Morocco (unspecified)";
}

export function applyHistoricalObservation(
  profile: VesselHistoricalCommercialProfile,
  observation: {
    exportPortName?: string | null;
    exportPortRelevant?: boolean;
    destinationText?: string | null;
    destinationMoroccoRelevant?: boolean;
    corridor?: string | null;
    voyageTemplate?: string | null;
    mostLikelyCommodity?: CommodityType | null;
  },
) {
  const next = cloneHistoricalCommercialProfile(profile);

  if (observation.exportPortRelevant && observation.exportPortName) {
    incrementCount(next.exportPortVisitCounts, observation.exportPortName);
  }

  if (observation.destinationMoroccoRelevant) {
    const label = inferMoroccoPortLabel(observation.destinationText ?? "Morocco");
    incrementCount(next.moroccoPortVisitCounts, label);
  }

  if (observation.corridor) {
    incrementCount(next.corridorCounts, observation.corridor);
  }

  if (observation.voyageTemplate) {
    incrementCount(next.voyageTemplateCounts, observation.voyageTemplate);
  }

  if (observation.mostLikelyCommodity) {
    next.historicalCommodityDistribution[observation.mostLikelyCommodity] += 1;
  }

  const templateTotal = mapTotalCount(next.voyageTemplateCounts);
  const corridorTotal = mapTotalCount(next.corridorCounts);
  const commodityTotal =
    next.historicalCommodityDistribution.wheat +
    next.historicalCommodityDistribution.barley +
    next.historicalCommodityDistribution.corn +
    next.historicalCommodityDistribution.soybeanMeal;

  const templateRatio = templateTotal > 0 ? mapMaxCount(next.voyageTemplateCounts) / templateTotal : 0;
  const corridorRatio = corridorTotal > 0 ? mapMaxCount(next.corridorCounts) / corridorTotal : 0;
  const commodityRatio =
    commodityTotal > 0
      ? Math.max(
          next.historicalCommodityDistribution.wheat,
          next.historicalCommodityDistribution.barley,
          next.historicalCommodityDistribution.corn,
          next.historicalCommodityDistribution.soybeanMeal,
        ) / commodityTotal
      : 0;

  next.vesselRouteRepetitionScore = clampScore(
    templateRatio * 40 + corridorRatio * 35 + commodityRatio * 25,
  );

  return next;
}

export function evaluateDestinationEvolution(params: {
  destinationHistory: string[];
  currentDestinationText: string;
}) : DestinationEvolutionAssessment {
  const normalizedHistory = params.destinationHistory
    .map((item) => normalizeText(item))
    .filter(Boolean)
    .slice(-20);
  const current = normalizeText(params.currentDestinationText);
  if (!current && normalizedHistory.length === 0) {
    return {
      destinationEvolutionScore: 12,
      destinationMoroccoConfidence: 0,
      destinationContradictionScore: 0,
      destinationConsistencyScore: 0,
      destinationEvolutionReasons: ["Destination history unavailable."],
    };
  }

  const stream = [...normalizedHistory, current].filter(Boolean);
  const unique = Array.from(new Set(stream));
  const moroccoCount = stream.filter((item) => hasMoroccoHint(item)).length;
  const moroccoRatio = moroccoCount / Math.max(1, stream.length);

  let contradictionTransitions = 0;
  let consistencyPairs = 0;
  for (let index = 1; index < stream.length; index += 1) {
    const previous = stream[index - 1] ?? "";
    const next = stream[index] ?? "";
    if (!previous || !next) {
      continue;
    }
    if (compactText(previous) === compactText(next)) {
      consistencyPairs += 1;
      continue;
    }
    const previousMorocco = hasMoroccoHint(previous);
    const nextMorocco = hasMoroccoHint(next);
    if (previousMorocco !== nextMorocco) {
      contradictionTransitions += 1;
    }
  }

  const consistencyScore = clampScore(
    stream.length <= 1
      ? moroccoRatio * 70
      : (consistencyPairs / Math.max(1, stream.length - 1)) * 100,
  );
  const contradictionScore = clampScore(contradictionTransitions * 26 + (unique.length > 6 ? 8 : 0));

  let evolutionScore = 20;
  evolutionScore += moroccoRatio * 42;
  evolutionScore += consistencyScore * 0.28;
  evolutionScore -= contradictionScore * 0.34;

  if (unique.length >= 3 && moroccoRatio >= 0.35) {
    evolutionScore += 6;
  }

  const reasons: string[] = [];
  if (moroccoRatio >= 0.66) {
    reasons.push("Destination evolution repeatedly points to Morocco-related values.");
  } else if (moroccoRatio >= 0.33) {
    reasons.push("Destination evolution intermittently supports Morocco trajectory.");
  } else {
    reasons.push("Destination evolution provides limited Morocco support.");
  }

  if (contradictionTransitions > 0) {
    reasons.push("Destination text has contradictory transitions over time.");
  }
  if (consistencyScore >= 65) {
    reasons.push("Destination values remain reasonably consistent across observations.");
  }

  return {
    destinationEvolutionScore: clampScore(evolutionScore),
    destinationMoroccoConfidence: clampScore(moroccoRatio * 100 + (hasMoroccoHint(current) ? 10 : 0)),
    destinationContradictionScore: contradictionScore,
    destinationConsistencyScore: consistencyScore,
    destinationEvolutionReasons: reasons,
  };
}

export function derivePortCommodityPriorScores(
  commodityBias: CommodityScores,
  corridorHint?: CommodityScores | null,
): { scores: CommodityScores; reasons: string[] } {
  const withCorridor = {
    wheatScore: commodityBias.wheatScore + (corridorHint?.wheatScore ?? 0),
    barleyScore: commodityBias.barleyScore + (corridorHint?.barleyScore ?? 0),
    cornScore: commodityBias.cornScore + (corridorHint?.cornScore ?? 0),
    soybeanMealScore: commodityBias.soybeanMealScore + (corridorHint?.soybeanMealScore ?? 0),
  };

  const scores: CommodityScores = {
    wheatScore: clampScore(20 + withCorridor.wheatScore * 1.8),
    barleyScore: clampScore(20 + withCorridor.barleyScore * 1.8),
    cornScore: clampScore(20 + withCorridor.cornScore * 1.8),
    soybeanMealScore: clampScore(20 + withCorridor.soybeanMealScore * 1.8),
  };

  const reasons: string[] = [];
  const sorted = [
    { commodity: "wheat", score: scores.wheatScore },
    { commodity: "barley", score: scores.barleyScore },
    { commodity: "corn", score: scores.cornScore },
    { commodity: "soybeanMeal", score: scores.soybeanMealScore },
  ].sort((a, b) => b.score - a.score);

  if (sorted[0] && sorted[0].score >= 56) {
    reasons.push(`Flow priors favor ${sorted[0].commodity} from origin/corridor context.`);
  } else {
    reasons.push("Flow priors remain weak and are treated as supportive only.");
  }

  return { scores, reasons };
}

export function evaluateVoyageState(params: {
  dryBulkCompatible: boolean;
  speed: number;
  routeTowardMorocco: boolean;
  destinationMoroccoHint: boolean;
  nearSeededExportArea: boolean;
  repeatedNearSeededExportArea: boolean;
  lowSpeedDurationNearSeededPortHours: number;
  portStayHours: number | null;
  draftDelta: number | null;
  loadingSignalScore: number;
  loadingConfidence: EvidenceConfidence;
  timeSinceDepartureHours: number;
  observationCount: number;
}): VoyageStateAssessment {
  const reasons: string[] = [];
  const nearPort = params.nearSeededExportArea || params.repeatedNearSeededExportArea;
  const lowSpeed = params.speed <= 1.8;
  const sustainedWaiting =
    params.lowSpeedDurationNearSeededPortHours >= 6 ||
    (typeof params.portStayHours === "number" && params.portStayHours >= 8);
  const hasDraftLift = typeof params.draftDelta === "number" && params.draftDelta >= 0.8;
  const loadingLikely =
    params.loadingSignalScore >= 58 ||
    (params.loadingSignalScore >= 45 && params.loadingConfidence !== "low");

  let state: VoyageState = "ballast_arrival";

  if (nearPort && lowSpeed && sustainedWaiting && !loadingLikely) {
    state = "port_waiting";
    reasons.push("Low-speed dwell near seeded export area suggests waiting at/near port.");
  }

  if (nearPort && sustainedWaiting && (loadingLikely || hasDraftLift)) {
    state = "loading_in_progress";
    reasons.push("Port dwell + draft/loading signals suggest loading in progress.");
  }

  if (!nearPort && params.speed >= 2.4 && (hasDraftLift || params.loadingSignalScore >= 62)) {
    state = "laden_departure";
    reasons.push("Departure movement after loading signals suggests laden departure.");
  }

  if (
    params.speed >= 4.5 &&
    (params.routeTowardMorocco || params.destinationMoroccoHint) &&
    (params.loadingSignalScore >= 55 || hasDraftLift) &&
    params.timeSinceDepartureHours >= 6
  ) {
    state = "voyage_confirmed";
    reasons.push("Route and loading evidence indicate confirmed voyage state.");
  }

  if (state === "ballast_arrival") {
    reasons.push("Insufficient loading/departure confirmation; vessel treated as ballast arrival.");
  }

  let alignedSignals = 0;
  if (params.dryBulkCompatible) {
    alignedSignals += 1;
  }
  if (nearPort) {
    alignedSignals += 1;
  }
  if (sustainedWaiting) {
    alignedSignals += 1;
  }
  if (hasDraftLift || loadingLikely) {
    alignedSignals += 1;
  }
  if (params.routeTowardMorocco || params.destinationMoroccoHint) {
    alignedSignals += 1;
  }
  if (params.observationCount >= 3) {
    alignedSignals += 1;
  }

  const voyageStateConfidence: EvidenceConfidence =
    alignedSignals >= 5 ? "high" : alignedSignals >= 3 ? "medium" : "low";

  return {
    vesselVoyageState: state,
    voyageStateConfidence,
    voyageStateReasons: reasons,
  };
}

export function evaluateContradiction(params: {
  dryBulkCompatible: boolean;
  corridorRelevant: boolean;
  routeTowardMorocco: boolean;
  exportPortRelevant: boolean;
  destinationMoroccoHint: boolean;
  destinationContradictionScore: number;
  loadingSignalScore: number;
  portStayHours: number | null;
  vesselRouteRepetitionScore: number;
  topVoyageHypothesis: string;
  topVoyageHypothesisScore: number;
}): ContradictionAssessment {
  let score = 0;
  const reasons: string[] = [];

  if (!params.dryBulkCompatible) {
    score += 40;
    reasons.push("Contradiction: vessel class is not dry-bulk compatible.");
  }

  if (!params.corridorRelevant && !params.routeTowardMorocco) {
    score += 18;
    reasons.push("Contradiction: route/corridor is not Morocco-compatible.");
  }

  if (!params.exportPortRelevant && !params.destinationMoroccoHint) {
    score += 12;
    reasons.push("Contradiction: no export-origin or Morocco destination support.");
  }

  if (
    typeof params.portStayHours === "number" &&
    params.portStayHours >= 12 &&
    params.loadingSignalScore < 25
  ) {
    score += 10;
    reasons.push("Contradiction: long port stay without loading evidence.");
  }

  if (params.destinationContradictionScore >= 45) {
    score += 14;
    reasons.push("Contradiction: destination evolution is inconsistent.");
  } else if (params.destinationContradictionScore >= 25) {
    score += 8;
  }

  if (
    params.topVoyageHypothesis === "ambiguous_dry_bulk_non_morocco" &&
    params.topVoyageHypothesisScore >= 58
  ) {
    score += 10;
    reasons.push("Contradiction: top voyage hypothesis remains ambiguous non-Morocco.");
  }

  if (params.vesselRouteRepetitionScore < 25) {
    score += 5;
  }

  return {
    contradictionScore: clampScore(score),
    contradictionReasons: reasons,
  };
}

export function buildEnsembleEvidenceBreakdown(params: {
  routeEvidence: number;
  loadingEvidence: number;
  portKnowledgeEvidence: number;
  historicalEvidence: number;
  destinationEvidence: number;
  flowPriorEvidence: number;
  contradictionEvidence: number;
}): EnsembleEvidenceBreakdown {
  const routeEvidence = clampScore(params.routeEvidence);
  const loadingEvidence = clampScore(params.loadingEvidence);
  const portKnowledgeEvidence = clampScore(params.portKnowledgeEvidence);
  const historicalEvidence = clampScore(params.historicalEvidence);
  const destinationEvidence = clampScore(params.destinationEvidence);
  const flowPriorEvidence = clampScore(params.flowPriorEvidence);
  const contradictionEvidence = clampScore(params.contradictionEvidence);

  const weightedPositive =
    routeEvidence * 0.22 +
    loadingEvidence * 0.22 +
    portKnowledgeEvidence * 0.16 +
    historicalEvidence * 0.14 +
    destinationEvidence * 0.16 +
    flowPriorEvidence * 0.1;
  const weightedNegative = contradictionEvidence * 0.28;

  return {
    routeEvidence,
    loadingEvidence,
    portKnowledgeEvidence,
    historicalEvidence,
    destinationEvidence,
    flowPriorEvidence,
    contradictionEvidence,
    overallSupportScore: clampScore(weightedPositive - weightedNegative + 15),
  };
}

export function calibratePredictionConfidence(params: {
  hasDestinationText: boolean;
  hasEta: boolean;
  hasDepartureSignal: boolean;
  hasDraft: boolean;
  hasLoadingEvidence: boolean;
  hasHistoricalEvidence: boolean;
  hasKnowledgeEvidence: boolean;
  hasRouteEvidence: boolean;
  observationCount: number;
  contradictionScore: number;
  ensembleSupportScore: number;
  additionalMissingSignals?: string[];
}): ConfidenceCalibrationAssessment {
  const missing: string[] = [];
  if (!params.hasDestinationText) {
    missing.push("Destination text history");
  }
  if (!params.hasEta) {
    missing.push("ETA evidence");
  }
  if (!params.hasDepartureSignal) {
    missing.push("Departure inference");
  }
  if (!params.hasDraft) {
    missing.push("Draft observations");
  }
  if (!params.hasLoadingEvidence) {
    missing.push("Loading-event evidence");
  }
  if (!params.hasHistoricalEvidence) {
    missing.push("Historical vessel behavior");
  }
  if (!params.hasKnowledgeEvidence) {
    missing.push("Commodity knowledge support");
  }
  if (!params.hasRouteEvidence) {
    missing.push("Route-corridor support");
  }

  for (const signal of params.additionalMissingSignals ?? []) {
    if (signal && !missing.includes(signal)) {
      missing.push(signal);
    }
  }

  let completeness = 0;
  completeness += params.hasDestinationText ? 13 : 0;
  completeness += params.hasEta ? 12 : 0;
  completeness += params.hasDepartureSignal ? 13 : 0;
  completeness += params.hasDraft ? 12 : 0;
  completeness += params.hasLoadingEvidence ? 14 : 0;
  completeness += params.hasHistoricalEvidence ? 12 : 0;
  completeness += params.hasKnowledgeEvidence ? 12 : 0;
  completeness += params.hasRouteEvidence ? 12 : 0;

  const observationBoost = Math.min(8, Math.max(0, params.observationCount - 1) * 1.5);
  completeness = clampScore(completeness + observationBoost);

  const penalty = clampScore(
    missing.length * 4 + params.contradictionScore * 0.2 + (params.observationCount < 2 ? 6 : 0),
  );

  const calibratedConfidence = clampScore(
    params.ensembleSupportScore * 0.65 + completeness * 0.35 - penalty * 0.5,
  );

  const predictionConfidenceBand: PredictionConfidenceBand =
    calibratedConfidence >= 72 && penalty <= 30
      ? "strong"
      : calibratedConfidence >= 48
        ? "moderate"
        : "weak";

  return {
    dataCompletenessScore: completeness,
    missingCriticalPredictionSignals: missing,
    confidencePenalty: penalty,
    predictionConfidenceBand,
  };
}

export function averageCommodityScore(scores: CommodityScores) {
  return clampScore(average([scores.wheatScore, scores.barleyScore, scores.cornScore, scores.soybeanMealScore]));
}

export function inferProbabilisticCommodityModel(
  input: ProbabilisticCommodityModelInput,
): ProbabilisticCommodityModelResult {
  const priorDistribution = normalizeProbabilityDistribution(
    toProbabilityDistributionFromScores(input.commodityPriorScores),
  );
  const seasonal = seasonalCommodityAdjustment({
    originCluster: inferOriginClusterFromContext(input),
    month: (input.referenceDate ?? new Date()).getUTCMonth() + 1,
  });

  const routeAdjustments: CommodityScores = {
    wheatScore: 0,
    barleyScore: 0,
    cornScore: 0,
    soybeanMealScore: 0,
  };
  const loadingAdjustments: CommodityScores = {
    wheatScore: 0,
    barleyScore: 0,
    cornScore: 0,
    soybeanMealScore: 0,
  };
  const historicalAdjustments: CommodityScores = {
    wheatScore: 0,
    barleyScore: 0,
    cornScore: 0,
    soybeanMealScore: 0,
  };
  const destinationAdjustments: CommodityScores = {
    wheatScore: 0,
    barleyScore: 0,
    cornScore: 0,
    soybeanMealScore: 0,
  };
  const flowPriorAdjustments: CommodityScores = {
    wheatScore: input.commodityPriorScores.wheatScore - 50,
    barleyScore: input.commodityPriorScores.barleyScore - 50,
    cornScore: input.commodityPriorScores.cornScore - 50,
    soybeanMealScore: input.commodityPriorScores.soybeanMealScore - 50,
  };
  const contradictionAdjustments: CommodityScores = {
    wheatScore: 0,
    barleyScore: 0,
    cornScore: 0,
    soybeanMealScore: 0,
  };
  const voyageAdjustments: CommodityScores = {
    wheatScore: 0,
    barleyScore: 0,
    cornScore: 0,
    soybeanMealScore: 0,
  };
  const commercialPatternAdjustments: CommodityScores = {
    wheatScore: 0,
    barleyScore: 0,
    cornScore: 0,
    soybeanMealScore: 0,
  };

  const corridor = (input.corridorClassification ?? "").toLowerCase();
  const routeFactor = Math.max(0, Math.min(1, input.routeEvidence / 100));
  if (corridor.includes("black_sea")) {
    routeAdjustments.wheatScore += 8 * routeFactor;
    routeAdjustments.barleyScore += 7 * routeFactor;
    routeAdjustments.cornScore += 6 * routeFactor;
  } else if (corridor.includes("south_atlantic")) {
    routeAdjustments.cornScore += 7 * routeFactor;
    routeAdjustments.soybeanMealScore += 8 * routeFactor;
  } else if (corridor.includes("us_gulf")) {
    routeAdjustments.cornScore += 8 * routeFactor;
    routeAdjustments.soybeanMealScore += 7 * routeFactor;
  } else {
    routeAdjustments.wheatScore += 6 * routeFactor;
    routeAdjustments.barleyScore += 5 * routeFactor;
    routeAdjustments.cornScore += 4 * routeFactor;
  }

  const loadingFactor = Math.max(0, Math.min(1, input.loadingEvidence / 100));
  loadingAdjustments.wheatScore += 4 * loadingFactor;
  loadingAdjustments.barleyScore += 4 * loadingFactor;
  loadingAdjustments.cornScore += 4 * loadingFactor;
  loadingAdjustments.soybeanMealScore += 4 * loadingFactor;
  if ((input.terminalType ?? "").includes("feed")) {
    loadingAdjustments.cornScore += 3 * loadingFactor;
    loadingAdjustments.soybeanMealScore += 4 * loadingFactor;
  }
  if ((input.terminalType ?? "").includes("grain")) {
    loadingAdjustments.wheatScore += 3 * loadingFactor;
    loadingAdjustments.barleyScore += 2 * loadingFactor;
  }

  const historicalFactor = Math.max(0, Math.min(1, input.historicalEvidence / 100));
  const historicalTotal =
    input.vesselHistoricalProfile.historicalCommodityDistribution.wheat +
    input.vesselHistoricalProfile.historicalCommodityDistribution.barley +
    input.vesselHistoricalProfile.historicalCommodityDistribution.corn +
    input.vesselHistoricalProfile.historicalCommodityDistribution.soybeanMeal;
  if (historicalTotal > 0) {
    historicalAdjustments.wheatScore +=
      (input.vesselHistoricalProfile.historicalCommodityDistribution.wheat / historicalTotal) *
      12 *
      historicalFactor;
    historicalAdjustments.barleyScore +=
      (input.vesselHistoricalProfile.historicalCommodityDistribution.barley / historicalTotal) *
      12 *
      historicalFactor;
    historicalAdjustments.cornScore +=
      (input.vesselHistoricalProfile.historicalCommodityDistribution.corn / historicalTotal) *
      12 *
      historicalFactor;
    historicalAdjustments.soybeanMealScore +=
      (input.vesselHistoricalProfile.historicalCommodityDistribution.soybeanMeal / historicalTotal) *
      12 *
      historicalFactor;
  }

  const destinationFactor = Math.max(0, Math.min(1, input.destinationEvidence / 100));
  if (input.destinationMoroccoConfidence >= 60) {
    destinationAdjustments.wheatScore += 4 * destinationFactor;
    destinationAdjustments.barleyScore += 3 * destinationFactor;
    destinationAdjustments.cornScore += 4 * destinationFactor;
    destinationAdjustments.soybeanMealScore += 3 * destinationFactor;
  } else if (input.destinationMoroccoConfidence >= 35) {
    destinationAdjustments.wheatScore += 2 * destinationFactor;
    destinationAdjustments.barleyScore += 2 * destinationFactor;
    destinationAdjustments.cornScore += 2 * destinationFactor;
    destinationAdjustments.soybeanMealScore += 2 * destinationFactor;
  }

  const contradictionFactor = Math.max(0, Math.min(1, input.contradictionEvidence / 100));
  contradictionAdjustments.wheatScore -= 10 * contradictionFactor;
  contradictionAdjustments.barleyScore -= 10 * contradictionFactor;
  contradictionAdjustments.cornScore -= 10 * contradictionFactor;
  contradictionAdjustments.soybeanMealScore -= 10 * contradictionFactor;

  const templateProbabilities = input.voyageTemplatePosteriorProbabilities ?? {
    [input.topVoyageHypothesis]: Math.max(0.01, Math.min(1, input.topVoyageHypothesisScore / 100)),
  };
  for (const [template, probability] of Object.entries(templateProbabilities)) {
    addCommodityScores(voyageAdjustments, mapTemplateToCommodityAdjustment(template, probability), 1);
  }

  addCommodityScores(commercialPatternAdjustments, historicalAdjustments, 0.45);
  if (input.vesselHistoricalProfile.vesselRouteRepetitionScore >= 55) {
    addCommodityScores(commercialPatternAdjustments, voyageAdjustments, 0.35);
  }

  const commercialPatternSimilarityScore = clampScore(
    input.vesselHistoricalProfile.vesselRouteRepetitionScore * 0.6 +
      Math.max(0, input.topVoyageHypothesisScore - 50) * 0.4,
  );

  const combinedLikelihoodAdjustments: CommodityScores = {
    wheatScore: 0,
    barleyScore: 0,
    cornScore: 0,
    soybeanMealScore: 0,
  };
  addCommodityScores(combinedLikelihoodAdjustments, routeAdjustments, 1);
  addCommodityScores(combinedLikelihoodAdjustments, loadingAdjustments, 1);
  addCommodityScores(combinedLikelihoodAdjustments, historicalAdjustments, 1);
  addCommodityScores(combinedLikelihoodAdjustments, destinationAdjustments, 1);
  addCommodityScores(combinedLikelihoodAdjustments, flowPriorAdjustments, 0.35);
  addCommodityScores(combinedLikelihoodAdjustments, voyageAdjustments, 1);
  addCommodityScores(combinedLikelihoodAdjustments, seasonal.bias, 1);
  addCommodityScores(combinedLikelihoodAdjustments, commercialPatternAdjustments, 0.7);
  addCommodityScores(combinedLikelihoodAdjustments, contradictionAdjustments, 1);

  let coverage = 0;
  coverage += input.hasDraftObservation ? 16 : 0;
  coverage += input.hasDepartureSignal ? 14 : 0;
  coverage += input.observationCount >= 3 ? 14 : input.observationCount >= 2 ? 8 : 0;
  coverage += input.loadingEvidence >= 40 ? 14 : input.loadingEvidence >= 25 ? 7 : 0;
  coverage += input.routeEvidence >= 40 ? 12 : 0;
  coverage += input.historicalEvidence >= 30 ? 12 : 0;
  coverage += input.destinationEvidence >= 30 ? 12 : 0;
  coverage += input.flowPriorEvidence >= 30 ? 10 : 0;
  const evidenceCoverageScore = clampScore(coverage);
  const priorScores = toCommodityScoresFromProbabilityDistribution(priorDistribution);
  const blendedHeuristicScores = blendCommodityScores(
    input.heuristicCommodityScores,
    priorScores,
    0.15,
  );

  // Adaptive temperature keeps sparse evidence conservative while allowing aligned evidence to
  // produce clearer posterior separation.
  const likelihoodTemperature = Math.max(
    14,
    Math.min(24, 23 - evidenceCoverageScore * 0.08 + input.contradictionEvidence * 0.03),
  );

  const unnormalizedPosterior = {
    wheat:
      Math.max(1e-9, priorDistribution.wheat) *
      Math.exp(
        (combinedLikelihoodAdjustments.wheatScore + blendedHeuristicScores.wheatScore * 0.08 - 6) /
          likelihoodTemperature,
      ),
    barley:
      Math.max(1e-9, priorDistribution.barley) *
      Math.exp(
        (combinedLikelihoodAdjustments.barleyScore + blendedHeuristicScores.barleyScore * 0.08 - 6) /
          likelihoodTemperature,
      ),
    corn:
      Math.max(1e-9, priorDistribution.corn) *
      Math.exp(
        (combinedLikelihoodAdjustments.cornScore + blendedHeuristicScores.cornScore * 0.08 - 6) /
          likelihoodTemperature,
      ),
    soybeanMeal:
      Math.max(1e-9, priorDistribution.soybeanMeal) *
      Math.exp(
        (combinedLikelihoodAdjustments.soybeanMealScore +
          blendedHeuristicScores.soybeanMealScore * 0.08 -
          6) /
          likelihoodTemperature,
      ),
  };
  const posteriorDistribution = normalizeProbabilityDistribution(unnormalizedPosterior);
  const predictionEntropy = normalizeEntropy(posteriorDistribution);

  const uncertaintyPenalty = clampScore(
    predictionEntropy * 0.42 +
      (100 - evidenceCoverageScore) * 0.28 +
      input.contradictionEvidence * 0.3,
  );

  const informationValueSignals = buildInformationValueSignals({
    hasDraftObservation: input.hasDraftObservation,
    hasDepartureSignal: input.hasDepartureSignal,
    destinationMoroccoConfidence: input.destinationMoroccoConfidence,
    observationCount: input.observationCount,
    contradictionEvidence: input.contradictionEvidence,
    loadingEvidence: input.loadingEvidence,
    historicalEvidence: input.historicalEvidence,
    evidenceCoverageScore,
  });

  return {
    commodityPriorProbabilities: priorDistribution,
    commodityPosteriorProbabilities: posteriorDistribution,
    commodityEvidenceAdjustments: {
      routeEvidence: routeAdjustments,
      loadingEvidence: loadingAdjustments,
      historicalEvidence: historicalAdjustments,
      destinationEvidence: destinationAdjustments,
      flowPriorEvidence: flowPriorAdjustments,
      contradictionEvidence: contradictionAdjustments,
      voyageHypothesisEvidence: voyageAdjustments,
      seasonalEvidence: seasonal.bias,
      commercialPatternEvidence: commercialPatternAdjustments,
    },
    predictionEntropy,
    evidenceCoverageScore,
    uncertaintyPenalty,
    seasonalAdjustmentScore: seasonal.score,
    seasonalReasoning:
      seasonal.reasons.length > 0
        ? seasonal.reasons
        : ["Seasonal priors neutral for current origin/time context."],
    commercialPatternSimilarityScore,
    informationValueSignals,
    missingInformationValueRanking: informationValueSignals.filter((item) => item.currentlyMissing),
  };
}
