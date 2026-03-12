import { AISProvider } from "@/lib/ais/provider";
import {
  HybridAISProvider,
  HybridEvaluationSnapshot,
  HybridNormalizationDebugRecord,
  HybridRollingMemoryMetrics,
  HybridWatchlistMetrics,
} from "@/lib/ais/hybrid-provider";
import { getAISProvider, getAISProviderForSelection, getMockAISProvider } from "@/lib/ais/factory";
import { MOROCCO_PORT_KEYWORDS } from "@/lib/data/mock-dataset";
import { persistLiveRadarSnapshot } from "@/lib/radar/live-persistence";
import { getRadarRuntimeConfig, getRuntimeSourceLabel } from "@/lib/radar/runtime-config";
import { IntelligenceScoringResult, scoreVesselIntelligence } from "@/lib/scoring/grain-scoring";
import { getFavoriteVesselIds } from "@/lib/settings/store";
import {
  AnalyticsPayload,
  CommodityConfidenceLabel,
  CommodityType,
  ConfidenceLevel,
  DashboardMetrics,
  DetectionPhase,
  MapMode,
  PortCallRecord,
  PortRecord,
  PortOverview,
  RadarDataSource,
  RadarFeed,
  RadarVessel,
  VesselRecord,
  VoyageRecord,
} from "@/lib/types";

export interface VesselFilters {
  detectionPhase?: DetectionPhase | "All";
  destinationPortCode?: string | "All";
  departurePortCode?: string | "All";
  departureCountry?: string | "All";
  maritimeZone?: string | "All";
  maxEstimatedDaysToMorocco?: number | null;
  mostLikelyCommodity?: CommodityType | "All";
  commodityConfidenceLabel?: CommodityConfidenceLabel | "All";
  onlyRecentDepartures?: boolean;
  onlyHighAgriCargo?: boolean;
  mapMode?: MapMode;
  search?: string;
}

export interface LiveDataQualitySummary {
  liveVesselsRetrieved: number;
  admittedToRadar: number;
  excludedFromRadar: number;
  withDestinationText: number;
  withNormalizedMoroccoDestination: number;
  withDeparturePortInferred: number;
  withDraftPresent: number;
  withEtaPresent: number;
  withWeakEvidenceOnly: number;
}

export interface LiveAcquisitionSummary {
  rawStreamDetections: number;
  screenedDetections: number;
  dryBulkCompatibleDetections: number;
  corridorRelevantDetections: number;
  exportPortRelevantDetections: number;
  moroccoRelevantDetections: number;
  enrichedCandidates: number;
  admittedCandidates: number;
  vesselsMatchedKnownTerminalIntelligence: number;
  vesselsMatchedKnownCommodityProfiles: number;
  vesselsWithDestinationIntelligenceSupport: number;
  vesselsCommodityScoreImprovedByKnowledgeBase: number;
  exportKnowledgeMatchedByExactAlias: number;
  exportKnowledgeMatchedByFuzzyOrToken: number;
  exportKnowledgeMatchedByCode: number;
  terminalMatchedPortFallbackOnly: number;
  exportKnowledgeAliasGapFailures: number;
  gfwEnrichmentAttemptedCount: number;
  gfwEnrichmentSuccessCount: number;
  gfwVesselsWithExportHistory: number;
  gfwVesselsWithMoroccoHistory: number;
  gfwVesselsWithRouteHints: number;
  gfwVesselsWithSupportiveEvidence: number;
}

export interface LiveLoadingEvidenceSummary {
  vesselsWithTerminalMatch: number;
  vesselsWithGrainTerminalMatch: number;
  vesselsWithUsablePortStayEstimate: number;
  vesselsWithUsableDraftDeltaEstimate: number;
  vesselsWithModerateOrStrongLoadingSignal: number;
}

export interface LiveRollingWindowSummary {
  rollingWindowHours: number;
  vesselsTrackedInMemory: number;
  vesselsRetainedInRollingWindow: number;
  vesselsUpdatedMultipleTimes: number;
  vesselsWithUsableDraftHistory: number;
  vesselsWithUsableLoadingTrend: number;
  vesselsConfidenceImprovedOverTime: number;
}

export interface LiveKnowledgeSummary {
  vesselsMatchedKnownTerminalIntelligence: number;
  vesselsMatchedKnownCommodityProfiles: number;
  vesselsWithDestinationIntelligenceSupport: number;
  vesselsCommodityScoreImprovedByKnowledgeBase: number;
}

export interface LiveWatchlistSummary {
  vesselsAcquired: number;
  vesselsInWatchlist: number;
  vesselsEnrichedFromWatchlist: number;
  vesselsPromotedToRadar: number;
  vesselsDroppedFromWatchlist: number;
  averageWatchlistDurationHours: number;
  vesselsImprovedOverTimeWhileInWatchlist: number;
  averageWatchlistEvidenceAgeHours: number;
  averageReEnrichmentCount: number;
  vesselsWithImprovingEvidence: number;
  vesselsWithWeakeningEvidence: number;
}

export interface LiveGfwSummary {
  enrichmentAttempted: number;
  enrichmentSuccess: number;
  withHistoricalPortMatches: number;
  withMoroccoVisitHistory: number;
  withExportVisitHistory: number;
  withRouteHints: number;
  supportiveEvidenceCount: number;
  helpedVoyageHypothesisCount: number;
}

export interface LiveOperationalSummary {
  vesselsWithOperationalSupport: number;
  vesselsWithWaitingPattern: number;
  vesselsWithBerthProximity: number;
  vesselsWithPortCongestionSignal: number;
  vesselsWithQueuePlausibility: number;
  repeatedObservedNearSeededExportArea: number;
}

export interface LiveVesselValidationEntry {
  vesselId: string;
  vesselName: string;
  rawDestinationText: string | null;
  normalizedDestinationText: string;
  rawVesselType: string | null;
  normalizedVesselType: string;
  rawEta: string | null;
  normalizedEta: string;
  rawDraft: number | null;
  normalizedDraft: number;
  rawDeparturePortData: { name: string | null; code: string | null };
  rawPreviousPortData: { name: string | null; code: string | null };
  exportMatchedAlias: string | null;
  exportMatchedBy:
    | "code"
    | "alias_exact"
    | "alias_compact"
    | "loose_inclusion"
    | "token_overlap"
    | "none";
  exportMatchConfidenceBand: "exact" | "high" | "medium" | "low";
  matchedAlias: string | null;
  matchedBy:
    | "code"
    | "alias_exact"
    | "alias_compact"
    | "loose_inclusion"
    | "token_overlap"
    | "terminal_alias_exact"
    | "terminal_alias_compact"
    | "terminal_loose_inclusion"
    | "terminal_token_overlap"
    | "terminal_partial"
    | "port_fallback"
    | "none";
  matchConfidenceBand: "exact" | "high" | "medium" | "low";
  fallbackLevel: "terminal" | "port" | "none";
  terminalMatchedAlias: string | null;
  terminalMatchedBy:
    | "terminal_alias_exact"
    | "terminal_alias_compact"
    | "terminal_loose_inclusion"
    | "terminal_token_overlap"
    | "terminal_partial"
    | "port_fallback"
    | "none";
  terminalMatchConfidenceBand: "exact" | "high" | "medium" | "low";
  terminalFallbackLevel: "terminal" | "port" | "none";
  inferredDeparturePort: string;
  inferredDepartureConfidence: "high" | "medium" | "low";
  inferredDepartureReason: string;
  normalizedVesselClass: string;
  corridorClassification: string;
  corridorRelevant: boolean;
  routeCorridorCompatible: boolean;
  exportPortRelevant: boolean;
  destinationTextMoroccoHint: boolean;
  historicalMoroccoRouteRelevant: boolean;
  operationallyRelevant: boolean;
  acquisitionDecision: "selected" | "rejected";
  acquisitionReasons: string[];
  acquisitionDryBulkCompatible: boolean;
  acquisitionCorridorRelevant: boolean;
  acquisitionExportPortRelevant: boolean;
  acquisitionMoroccoRelevant: boolean;
  enrichmentAttempted: boolean;
  enrichmentSkipped: boolean;
  enrichmentSkipReason: string | null;
  gfwEnrichmentAttempted: boolean;
  gfwEnrichmentSuccess: boolean;
  gfwEndpointUsed: string | null;
  gfwHistoricalPortMatches: string[];
  gfwMoroccoVisitCount: number;
  gfwExportPortVisitCount: number;
  gfwHistoricalRouteHints: string[];
  gfwEvidenceConfidence: "low" | "medium" | "high";
  gfwReasons: string[];
  mostLikelyCommodity: CommodityType;
  commodityConfidenceLabel: CommodityConfidenceLabel;
  operationalSupportScore: number;
  portCongestionSignal: number;
  berthProximitySignal: number;
  waitingPatternSignal: number;
  loadingQueuePlausibility: number;
  operationalEvidenceConfidence: "low" | "medium" | "high";
  operationalReasons: string[];
  repeatedObservedNearSeededExportArea: boolean;
  lowSpeedDurationNearSeededPortHours: number;
  relevantNearbyVesselCount: number;
  operationalSeededExportArea: string | null;
  admissionScore: number;
  admissionDecision: "included" | "excluded";
  exclusionReasons: string[];
  normalizedMoroccoDestination: boolean;
  scoringReasons: {
    moroccoBound: string[];
    agriCargo: string[];
  };
  loadingSignalReasons: string[];
  topVoyageHypothesis: string;
  topVoyageHypothesisScore: number;
  topVoyageHypothesisConfidence: "weak" | "moderate" | "strong";
  topVoyageHypothesisProbability: number;
  voyageHypothesisEvidenceStyle: "explicit_morocco_support" | "candidate_pre_confirmation";
  voyageHypothesisReasons: string[];
  alternativeVoyageHypotheses: Array<{
    id: string;
    label: string;
    score: number;
    confidence: "weak" | "moderate" | "strong";
  }>;
  missingSignalsForVoyageConfirmation: string[];
  loadingSignalScore: number;
  draftDelta: number | null;
  portStayHours: number | null;
  loadingTerminalMatch: boolean;
  loadingConfidence: "low" | "medium" | "high";
  loadingEvidenceStrength: "weak" | "moderate" | "strong";
  missingCriticalSignals: string[];
  matchedTerminalName: string | null;
  matchedTerminalType:
    | "grain_terminal"
    | "feed_terminal"
    | "agri_bulk_terminal"
    | "mixed_bulk_terminal"
    | "unknown_terminal";
  terminalMatchConfidence: "low" | "medium" | "high";
  portStayConfidence: "low" | "medium" | "high";
  arrivalDraftEstimate: number | null;
  departureDraftEstimate: number | null;
  arrivalDraftConfidence: "low" | "medium" | "high";
  departureDraftConfidence: "low" | "medium" | "high";
  draftDeltaConfidence: "low" | "medium" | "high";
  grainTerminalMatch: boolean;
  firstSeenAt: string | null;
  lastSeenAt: string | null;
  firstRelevantSeenAt: string | null;
  lastRelevantSeenAt: string | null;
  observationCount: number;
  historicalDraftSamplesCount: number;
  historicalCorridorSamplesCount: number;
  historicalDestinationSamplesCount: number;
  scoreTrend: "up" | "flat" | "down";
  scoreTrendDelta: number;
  loadingSignalTrend: "up" | "flat" | "down";
  loadingSignalTrendDelta: number;
  confidenceImprovedOverTime: boolean;
  rollingWindowRetained: boolean;
  rollingRetentionReason: string;
  temporalAdjustmentReasons: string[];
  watchlistDecision: "not_eligible" | "entered" | "retained" | "promoted" | "dropped";
  watchlistReasons: string[];
  watchlistEnteredAt: string | null;
  watchlistLastUpdatedAt: string | null;
  watchlistRetentionRemainingHours: number | null;
  reEnrichmentCount: number;
  watchlistPriorityScore: number;
  watchlistPriorityReasons: string[];
  promotionReadinessScore: number;
  promotionReadinessReasons: string[];
  missingSignalsForPromotion: string[];
  scoreTrendDirection: "up" | "flat" | "down";
  confidenceTrendDirection: "up" | "flat" | "down";
  evidenceImproving: boolean;
  evidenceWeakening: boolean;
  moroccoBoundTrend: "up" | "flat" | "down";
  agriCargoTrend: "up" | "flat" | "down";
  commodityTrend: "up" | "flat" | "down";
  matchedCommodityKnowledgeNode: string | null;
  terminalCommodityProfile: string | null;
  vesselClassKnowledgeProfile: string;
  destinationKnowledgeProfile: string | null;
  knowledgeBasedCommodityReasons: string[];
  knowledgeSupportScore: number;
  knowledgeAgriScoreDelta: number;
  knowledgeCommodityScoreBoost: number;
  knowledgeCommodityScoreDeltas: {
    wheatScore: number;
    barleyScore: number;
    cornScore: number;
    soybeanMealScore: number;
  };
  knowledgeMatchedTerminalIntelligence: boolean;
  knowledgeMatchedCommodityProfile: boolean;
  knowledgeDestinationIntelligenceSupport: boolean;
  promotionEligible: boolean;
  promotionReason: string | null;
  dropReason: string | null;
  commodityHypothesisReasons: string[];
  vesselHistoricalProfile: {
    exportPortVisitCounts: Record<string, number>;
    moroccoPortVisitCounts: Record<string, number>;
    corridorCounts: Record<string, number>;
    voyageTemplateCounts: Record<string, number>;
    historicalCommodityDistribution: Record<CommodityType, number>;
    vesselRouteRepetitionScore: number;
  };
  vesselVoyageState:
    | "ballast_arrival"
    | "port_waiting"
    | "loading_in_progress"
    | "laden_departure"
    | "voyage_confirmed";
  voyageStateConfidence: "low" | "medium" | "high";
  voyageStateReasons: string[];
  historicalDestinationSeries: string[];
  destinationEvolutionScore: number;
  destinationMoroccoConfidence: number;
  destinationContradictionScore: number;
  destinationConsistencyScore: number;
  destinationEvolutionReasons: string[];
  portCommodityPriorScores: {
    wheatScore: number;
    barleyScore: number;
    cornScore: number;
    soybeanMealScore: number;
  };
  portCommodityPriorReasons: string[];
  contradictionScore: number;
  contradictionReasons: string[];
  ensembleEvidenceBreakdown: {
    routeEvidence: number;
    loadingEvidence: number;
    portKnowledgeEvidence: number;
    historicalEvidence: number;
    destinationEvidence: number;
    flowPriorEvidence: number;
    contradictionEvidence: number;
    overallSupportScore: number;
  };
  dataCompletenessScore: number;
  confidencePenalty: number;
  predictionConfidenceBand: "weak" | "moderate" | "strong";
  missingCriticalPredictionSignals: string[];
  commodityPriorProbabilities: {
    wheat: number;
    barley: number;
    corn: number;
    soybeanMeal: number;
  };
  commodityPosteriorProbabilities: {
    wheat: number;
    barley: number;
    corn: number;
    soybeanMeal: number;
  };
  commodityEvidenceAdjustments: {
    routeEvidence: {
      wheatScore: number;
      barleyScore: number;
      cornScore: number;
      soybeanMealScore: number;
    };
    loadingEvidence: {
      wheatScore: number;
      barleyScore: number;
      cornScore: number;
      soybeanMealScore: number;
    };
    historicalEvidence: {
      wheatScore: number;
      barleyScore: number;
      cornScore: number;
      soybeanMealScore: number;
    };
    destinationEvidence: {
      wheatScore: number;
      barleyScore: number;
      cornScore: number;
      soybeanMealScore: number;
    };
    flowPriorEvidence: {
      wheatScore: number;
      barleyScore: number;
      cornScore: number;
      soybeanMealScore: number;
    };
    contradictionEvidence: {
      wheatScore: number;
      barleyScore: number;
      cornScore: number;
      soybeanMealScore: number;
    };
    voyageHypothesisEvidence: {
      wheatScore: number;
      barleyScore: number;
      cornScore: number;
      soybeanMealScore: number;
    };
    seasonalEvidence: {
      wheatScore: number;
      barleyScore: number;
      cornScore: number;
      soybeanMealScore: number;
    };
    commercialPatternEvidence: {
      wheatScore: number;
      barleyScore: number;
      cornScore: number;
      soybeanMealScore: number;
    };
  };
  predictionEntropy: number;
  evidenceCoverageScore: number;
  uncertaintyPenalty: number;
  voyageTemplatePosteriorProbabilities: Record<string, number>;
  voyageTemplateEntropy: number;
  informationValueSignals: Array<{
    signal: string;
    value: number;
    reason: string;
    currentlyMissing: boolean;
  }>;
  missingInformationValueRanking: Array<{
    signal: string;
    value: number;
    reason: string;
    currentlyMissing: boolean;
  }>;
  seasonalAdjustmentScore: number;
  seasonalReasoning: string[];
  commercialPatternSimilarityScore: number;
  evidenceMissingCount: number;
  weakEvidenceOnly: boolean;
}

export interface LiveValidationPayload {
  mode: "mock" | "live";
  provider: string;
  generatedAt: string;
  acquisition: LiveAcquisitionSummary | null;
  rollingWindow: LiveRollingWindowSummary | null;
  watchlist: LiveWatchlistSummary | null;
  gfw: LiveGfwSummary;
  operational: LiveOperationalSummary;
  knowledge: LiveKnowledgeSummary;
  loadingEvidence: LiveLoadingEvidenceSummary;
  quality: LiveDataQualitySummary;
  vessels: LiveVesselValidationEntry[];
  rawDetections: LiveVesselValidationEntry[];
  watchlistTopCandidates: LiveVesselValidationEntry[];
}

interface LiveEvaluationReasonCount {
  reason: string;
  count: number;
}

interface LiveEvaluationGapSummary {
  gapType: "alias_gap" | "terminal_gap" | "terminal_port_fallback";
  gapKey: string;
  count: number;
  vesselExamples: string[];
}

interface LiveEvaluationWatchlistCandidate {
  vesselId: string;
  vesselName: string;
  observationCount: number;
  lastSeenAt: string;
  watchlistPriorityScore: number;
  promotionReadinessScore: number;
  reEnrichmentCount: number;
  missingSignalsForPromotion: string[];
  watchlistReasons: string[];
}

interface LiveEvaluationPromotedVessel {
  vesselId: string;
  vesselName: string;
  observationCount: number;
  admissionCount: number;
  maxAdmissionScore: number;
  promoted: boolean;
  lastSeenAt: string;
  matchedCommodityKnowledgeNode: string | null;
}

interface LiveEvaluationKnowledgeCase {
  vesselId: string;
  vesselName: string;
  maxKnowledgeSupportScore: number;
  maxCommodityBoost: number;
  maxAgriDelta: number;
  matchedCommodityKnowledgeNode: string | null;
  reasons: string[];
}

interface LiveEvaluationGfwImpactCase {
  vesselId: string;
  vesselName: string;
  gfwEvidenceConfidence: "low" | "medium" | "high";
  gfwMoroccoVisitCount: number;
  gfwExportPortVisitCount: number;
  gfwHistoricalRouteHints: string[];
  topVoyageHypothesis: string;
  topVoyageHypothesisScore: number;
  reasons: string[];
}

interface LiveEvaluationOperationalPortPattern {
  portName: string;
  observations: number;
  averageWaitingPatternSignal: number;
  averagePortCongestionSignal: number;
}

interface LiveEvaluationOperationalDepartureCase {
  vesselId: string;
  vesselName: string;
  portName: string | null;
  waitingPatternSignal: number;
  loadingQueuePlausibility: number;
  draftDelta: number | null;
  reasons: string[];
}

interface LiveEvaluationVoyageHypothesisSummary {
  hypothesisId: string;
  count: number;
  averageScore: number;
  strongCount: number;
  candidateStyleCount: number;
}

interface LiveEvaluationVoyageClarityCase {
  vesselId: string;
  vesselName: string;
  topVoyageHypothesis: string;
  topVoyageHypothesisScore: number;
  topVoyageHypothesisConfidence: "weak" | "moderate" | "strong";
  evidenceStyle: "explicit_morocco_support" | "candidate_pre_confirmation";
  observationCount: number;
  evidenceImproving: boolean;
  reasons: string[];
}

export interface LiveEvaluationPayload {
  mode: "mock" | "live";
  provider: string;
  generatedAt: string;
  windowHours: number;
  windowStart: string;
  totals: {
    totalRawDetections: number;
    dryBulkCompatibleDetections: number;
    watchlistEntries: number;
    reEnrichments: number;
    promotedVessels: number;
    admittedRadarVessels: number;
    excludedVesselsByReason: LiveEvaluationReasonCount[];
    vesselsWithExportKnowledgeMatch: number;
    vesselsWithTerminalMatch: number;
    vesselsWithDestinationIntelligence: number;
    vesselsWithUsableLoadingEvidence: number;
    vesselsWithImprovingEvidenceOverTime: number;
    vesselsImprovedByGfwHistoricalEvidence: number;
    vesselsWithRepeatedExportPatternViaGfw: number;
    vesselsWithRepeatedMoroccoPatternViaGfw: number;
    vesselsImprovedByOperationalSignals: number;
    operationalSignalsHelpedWatchlistPriorityCount: number;
    operationalSignalsHelpedPromotionReadinessCount: number;
  };
  timeMetrics: {
    trackedVessels: number;
    averageObservationCountPerTrackedVessel: number;
    averageWatchlistDurationHours: number;
    averageReEnrichmentCount: number;
    averageEvidenceAgeHours: number;
    confidenceImprovedVessels: number;
    confidenceWeakenedVessels: number;
  };
  rankedOutputs: {
    topWatchlistCandidates: LiveEvaluationWatchlistCandidate[];
    topPromotedOrAdmittedVessels: LiveEvaluationPromotedVessel[];
    topBlockersPreventingPromotion: LiveEvaluationReasonCount[];
    topMissingAliasOrTerminalGaps: LiveEvaluationGapSummary[];
    topKnowledgeImpactCases: LiveEvaluationKnowledgeCase[];
    topVoyageHypothesesObserved: LiveEvaluationVoyageHypothesisSummary[];
    voyageHypothesesImprovedOverTime: LiveEvaluationVoyageClarityCase[];
    vesselsWithClearerInterpretationFromVoyageHypothesis: LiveEvaluationVoyageClarityCase[];
    mostCommonMissingSignalsForVoyageConfirmation: LiveEvaluationReasonCount[];
    gfwClarifiedVoyageHypothesisCases: LiveEvaluationGfwImpactCase[];
    portsWithWaitingOrCongestionPatterns: LiveEvaluationOperationalPortPattern[];
    departuresMadeMeaningfulAfterWaiting: LiveEvaluationOperationalDepartureCase[];
  };
  notes: string[];
}

const PHASE_PRIORITY: Record<DetectionPhase, number> = {
  departure_detected: 1,
  morocco_bound_suspected: 2,
  morocco_bound_likely: 3,
  agri_cargo_likely: 4,
  commodity_hypothesis: 5,
  near_arrival_confirmed: 6,
};

const PHASE_LABELS: Record<DetectionPhase, string> = {
  departure_detected: "Departure detected",
  morocco_bound_suspected: "Morocco-bound suspected",
  morocco_bound_likely: "Morocco-bound likely",
  agri_cargo_likely: "Agri cargo likely",
  commodity_hypothesis: "Commodity hypothesis",
  near_arrival_confirmed: "Near arrival confirmed",
};

const LIVE_CACHE_TTL_MS = Number(process.env.RADAR_LIVE_CACHE_TTL_SECONDS ?? 300) * 1000;
const LIVE_PORT_CALLS_CACHE_TTL_MS = Number(process.env.RADAR_LIVE_PORT_CALLS_TTL_MINUTES ?? 360) * 60 * 1000;
const LOW_USAGE_MOROCCO_PORT_CODES = new Set(["MACAS", "MAJLF", "MAAGA"]);

let liveCache: { fetchedAt: number; vessels: RadarVessel[]; warning?: string } | null = null;
let liveRefreshPromise: Promise<{ fetchedAt: number; vessels: RadarVessel[]; warning?: string }> | null = null;
let livePortCallsCache: { fetchedAt: number; calls: PortCallRecord[] } | null = null;
let dbUnavailableLogged = false;

const DETECTION_PHASE_ORDER: DetectionPhase[] = [
  "departure_detected",
  "morocco_bound_suspected",
  "morocco_bound_likely",
  "agri_cargo_likely",
  "commodity_hypothesis",
  "near_arrival_confirmed",
];

function getUsageProfile() {
  return (process.env.RADAR_LIVE_USAGE_PROFILE ?? "low").toLowerCase() === "medium" ? "medium" : "low";
}

function toPhaseLabel(phase: DetectionPhase) {
  return PHASE_LABELS[phase];
}

function normalizeSearch(value?: string) {
  return value?.trim().toLowerCase() ?? "";
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

function inferMaritimeZone(lat: number, lon: number) {
  if (lat >= 34.8 && lat <= 36.8 && lon >= -6.8 && lon <= -3.5) {
    return "Gibraltar Strait";
  }

  if (lat >= 26 && lat <= 39 && lon >= -19 && lon <= -5) {
    return "Atlantic Morocco Corridor";
  }

  if (lat >= 30 && lat <= 46 && lon >= -2 && lon <= 30) {
    return "Western Mediterranean";
  }

  if (lat >= 15 && lat <= 45 && lon >= -55 && lon < -19) {
    return "North Atlantic Transit";
  }

  if (lon <= -55) {
    return "Western Atlantic";
  }

  if (lat < 15 && lon < -10) {
    return "South Atlantic";
  }

  return "Open Ocean Transit";
}

function inferDestinationRegion(destinationPortName: string, destinationCountry: string, destinationText: string) {
  const normalizedText = destinationText.toLowerCase();

  if (destinationCountry === "Morocco") {
    if (destinationPortName === "Tanger Med" || destinationPortName === "Nador") {
      return "Morocco Mediterranean";
    }

    return "Morocco Atlantic";
  }

  if (MOROCCO_PORT_KEYWORDS.some((keyword) => normalizedText.includes(keyword))) {
    return "Morocco suspected";
  }

  if (destinationCountry === "Spain" || destinationCountry === "France") {
    return "Western Europe / Iberia";
  }

  if (destinationCountry === "United Arab Emirates") {
    return "Middle East";
  }

  return "Unknown / open routing";
}

function estimateDaysToMorocco(
  currentLat: number,
  currentLon: number,
  speedKnots: number,
  moroccoPorts: Array<{ id: string; name: string; lat: number; lon: number }>,
) {
  const nearest = moroccoPorts
    .map((port) => ({
      port,
      distanceKm: haversineDistanceKm(currentLat, currentLon, port.lat, port.lon),
    }))
    .sort((a, b) => a.distanceKm - b.distanceKm)[0];

  if (!nearest) {
    return { estimatedDays: 0, nearestMoroccoPort: null as string | null };
  }

  const effectiveSpeed = speedKnots > 3 ? speedKnots : 10;
  const kmPerDay = effectiveSpeed * 1.852 * 24;
  const estimatedDays = nearest.distanceKm / kmPerDay;

  return {
    estimatedDays: Number(Math.max(0.1, estimatedDays).toFixed(1)),
    nearestMoroccoPort: nearest.port.name,
  };
}

function sortVessels(a: RadarVessel, b: RadarVessel) {
  const phaseDelta = PHASE_PRIORITY[b.detectionPhase] - PHASE_PRIORITY[a.detectionPhase];
  if (phaseDelta !== 0) {
    return phaseDelta;
  }

  if (b.moroccoBoundScore !== a.moroccoBoundScore) {
    return b.moroccoBoundScore - a.moroccoBoundScore;
  }

  return a.timeSinceDepartureHours - b.timeSinceDepartureHours;
}

function mapModeMatch(vessel: RadarVessel, mapMode: MapMode) {
  if (mapMode === "all_tracked_vessels") {
    return true;
  }

  if (mapMode === "early_detected_only") {
    return (
      vessel.detectionPhase === "departure_detected" ||
      vessel.detectionPhase === "morocco_bound_suspected" ||
      vessel.timeSinceDepartureHours <= 24
    );
  }

  if (mapMode === "approaching_morocco_only") {
    return vessel.detectionPhase === "near_arrival_confirmed" || vessel.estimatedDaysToMorocco <= 2.5;
  }

  if (mapMode === "agri_cargo_likely_only") {
    return vessel.agriCargoScore >= 65;
  }

  return true;
}

function applyFilters(vessels: RadarVessel[], filters: VesselFilters = {}) {
  const search = normalizeSearch(filters.search);
  const maxDays = filters.maxEstimatedDaysToMorocco;

  return vessels.filter((vessel) => {
    if (filters.detectionPhase && filters.detectionPhase !== "All" && vessel.detectionPhase !== filters.detectionPhase) {
      return false;
    }

    if (
      filters.destinationPortCode &&
      filters.destinationPortCode !== "All" &&
      vessel.destinationPortCode !== filters.destinationPortCode
    ) {
      return false;
    }

    if (filters.departurePortCode && filters.departurePortCode !== "All" && vessel.departurePortCode !== filters.departurePortCode) {
      return false;
    }

    if (
      filters.departureCountry &&
      filters.departureCountry !== "All" &&
      vessel.departureCountry !== filters.departureCountry
    ) {
      return false;
    }

    if (filters.maritimeZone && filters.maritimeZone !== "All" && vessel.currentMaritimeZone !== filters.maritimeZone) {
      return false;
    }

    if (typeof maxDays === "number" && vessel.estimatedDaysToMorocco > maxDays) {
      return false;
    }

    if (
      filters.mostLikelyCommodity &&
      filters.mostLikelyCommodity !== "All" &&
      vessel.mostLikelyCommodity !== filters.mostLikelyCommodity
    ) {
      return false;
    }

    if (
      filters.commodityConfidenceLabel &&
      filters.commodityConfidenceLabel !== "All" &&
      vessel.commodityConfidenceLabel !== filters.commodityConfidenceLabel
    ) {
      return false;
    }

    if (filters.onlyRecentDepartures && vessel.timeSinceDepartureHours > 24) {
      return false;
    }

    if (filters.onlyHighAgriCargo && vessel.agriCargoScore < 70) {
      return false;
    }

    if (filters.mapMode && !mapModeMatch(vessel, filters.mapMode)) {
      return false;
    }

    if (!search) {
      return true;
    }

    const haystack = [
      vessel.name,
      vessel.vesselType,
      vessel.departurePort,
      vessel.departureCountry,
      vessel.currentMaritimeZone,
      vessel.suspectedDestinationRegion,
      vessel.destinationPort,
      vessel.mostLikelyCommodity,
      vessel.detectionPhase,
    ]
      .join(" ")
      .toLowerCase();

    return haystack.includes(search);
  });
}

function annotateFavorites(vessels: RadarVessel[]) {
  const favoriteIds = getFavoriteVesselIds();
  return vessels.map((vessel) => ({
    ...vessel,
    isFavorite: favoriteIds.has(vessel.id),
  }));
}

function prioritizeFavorites(vessels: RadarVessel[]) {
  return vessels
    .map((vessel, index) => ({ vessel, index }))
    .sort((a, b) => {
      if (Boolean(b.vessel.isFavorite) !== Boolean(a.vessel.isFavorite)) {
        return Number(Boolean(b.vessel.isFavorite)) - Number(Boolean(a.vessel.isFavorite));
      }
      return a.index - b.index;
    })
    .map((entry) => entry.vessel);
}

function applyFavoritesAndFilters(vessels: RadarVessel[], filters: VesselFilters = {}) {
  const withFavorites = annotateFavorites(vessels);
  const filtered = applyFilters(withFavorites, filters);
  return prioritizeFavorites(filtered);
}

function hasValue(value: string | null | undefined) {
  if (!value) {
    return false;
  }

  const normalized = value.trim().toLowerCase();
  return normalized.length > 0 && normalized !== "unknown";
}

function fallbackWeakEvidence(vessel: RadarVessel) {
  return (
    vessel.detectionPhase === "departure_detected" &&
    vessel.moroccoBoundScore < 35 &&
    vessel.agriCargoScore < 40
  );
}

function clampScore(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function toConfidenceLevel(score: number): ConfidenceLevel {
  if (score >= 80) {
    return "High";
  }
  if (score >= 60) {
    return "Medium";
  }
  return "Low";
}

function downgradePhase(phase: DetectionPhase, steps: number) {
  const index = DETECTION_PHASE_ORDER.indexOf(phase);
  if (index <= 0) {
    return "departure_detected" as const;
  }

  return DETECTION_PHASE_ORDER[Math.max(0, index - Math.max(1, steps))];
}

function hasValidIsoDate(value: string | null | undefined) {
  if (!hasValue(value)) {
    return false;
  }

  const timestamp = new Date(value as string).getTime();
  return Number.isFinite(timestamp);
}

function isUnknownPortCode(value: string | null | undefined) {
  const code = value?.trim().toUpperCase() ?? "";
  return !code || code.startsWith("UNK");
}

function detectSparseLiveSignals(params: {
  destinationText: string;
  eta: string;
  departurePortCode: string;
  previousPortCode: string;
  deadweight: number;
  draft: number;
}) {
  const missingSignals: string[] = [];

  if (!hasValue(params.destinationText)) {
    missingSignals.push("missing destination text");
  }

  if (!hasValidIsoDate(params.eta)) {
    missingSignals.push("missing ETA");
  }

  if (isUnknownPortCode(params.departurePortCode)) {
    missingSignals.push("unknown departure port");
  }

  if (isUnknownPortCode(params.previousPortCode)) {
    missingSignals.push("unknown previous port");
  }

  if (!(params.deadweight > 0)) {
    missingSignals.push("missing deadweight");
  }

  if (!(params.draft > 0)) {
    missingSignals.push("missing draft");
  }

  return missingSignals;
}

function applySparseDataGuard(
  scoring: IntelligenceScoringResult,
  missingSignals: string[],
): IntelligenceScoringResult {
  if (missingSignals.length < 2) {
    return scoring;
  }

  const sparseReason = `Sparse live evidence guard applied (${missingSignals.join(", ")}).`;
  const moroccoPenalty = missingSignals.length >= 4 ? 24 : missingSignals.length === 3 ? 16 : 10;
  const agriPenalty = missingSignals.length >= 4 ? 20 : missingSignals.length === 3 ? 14 : 8;
  const commodityPenalty = missingSignals.length >= 4 ? 18 : missingSignals.length === 3 ? 12 : 8;

  let moroccoBoundScore = clampScore(scoring.moroccoBoundScore - moroccoPenalty);
  let agriCargoScore = clampScore(scoring.agriCargoScore - agriPenalty);

  if (missingSignals.length >= 3) {
    moroccoBoundScore = Math.min(moroccoBoundScore, missingSignals.length >= 4 ? 58 : 68);
    agriCargoScore = Math.min(agriCargoScore, missingSignals.length >= 4 ? 52 : 62);
  }

  const commodityScores = {
    wheatScore: clampScore(scoring.commodityScores.wheatScore - commodityPenalty),
    barleyScore: clampScore(scoring.commodityScores.barleyScore - commodityPenalty),
    cornScore: clampScore(scoring.commodityScores.cornScore - commodityPenalty),
    soybeanMealScore: clampScore(scoring.commodityScores.soybeanMealScore - commodityPenalty),
  };

  const ranked = [
    { commodity: "wheat" as const, score: commodityScores.wheatScore },
    { commodity: "barley" as const, score: commodityScores.barleyScore },
    { commodity: "corn" as const, score: commodityScores.cornScore },
    { commodity: "soybeanMeal" as const, score: commodityScores.soybeanMealScore },
  ].sort((a, b) => b.score - a.score);

  const [top, second] = ranked;
  const gap = top.score - second.score;

  let commodityConfidenceLabel = scoring.commodityConfidenceLabel;
  if (missingSignals.length >= 4) {
    commodityConfidenceLabel = "weak hypothesis";
  } else if (
    missingSignals.length >= 3 &&
    commodityConfidenceLabel === "strong hypothesis"
  ) {
    commodityConfidenceLabel = "moderate hypothesis";
  }

  if (
    commodityConfidenceLabel !== "weak hypothesis" &&
    (top.score < 60 || gap < 10 || moroccoBoundScore < 60 || agriCargoScore < 60)
  ) {
    commodityConfidenceLabel = "weak hypothesis";
  }

  let detectionPhase = scoring.detectionPhase;
  if (missingSignals.length >= 4) {
    detectionPhase = downgradePhase(detectionPhase, 2);
  } else if (missingSignals.length >= 3) {
    detectionPhase = downgradePhase(detectionPhase, 1);
  }

  if (detectionPhase === "near_arrival_confirmed" && missingSignals.length >= 2) {
    detectionPhase = "morocco_bound_likely";
  }

  if (detectionPhase === "commodity_hypothesis" && commodityConfidenceLabel === "weak hypothesis") {
    detectionPhase = "agri_cargo_likely";
  }

  let loadingSignalScore = clampScore(scoring.loadingSignalScore - Math.round(agriPenalty * 0.7));
  let loadingConfidence = scoring.loadingConfidence;
  const loadingMissingSignals = new Set(scoring.missingCriticalSignals);
  if (!hasValue(scoring.matchedTerminalName)) {
    loadingMissingSignals.add("missing_terminal_context");
  }
  if (missingSignals.length >= 4) {
    loadingSignalScore = Math.min(loadingSignalScore, 35);
    loadingConfidence = "low";
    loadingMissingSignals.add("missing_port_stay");
    loadingMissingSignals.add("missing_draft_delta");
  } else if (missingSignals.length >= 3) {
    loadingSignalScore = Math.min(loadingSignalScore, 48);
    if (loadingConfidence === "high") {
      loadingConfidence = "medium";
    }
  }

  let topVoyageHypothesisScore = clampScore(scoring.topVoyageHypothesisScore - Math.round(commodityPenalty * 0.8));
  let topVoyageHypothesisConfidence = scoring.topVoyageHypothesisConfidence;
  if (missingSignals.length >= 4) {
    topVoyageHypothesisConfidence = "weak";
    topVoyageHypothesisScore = Math.min(topVoyageHypothesisScore, 45);
  } else if (missingSignals.length >= 3 && topVoyageHypothesisConfidence === "strong") {
    topVoyageHypothesisConfidence = "moderate";
  }
  const voyageHypothesisReasons = [...scoring.voyageHypothesisReasons, sparseReason];
  const missingSignalsForVoyageConfirmation = Array.from(
    new Set([
      ...scoring.missingSignalsForVoyageConfirmation,
      ...missingSignals.map((signal) => `Missing live signal: ${signal}`),
    ]),
  ).slice(0, 8);

  return {
    ...scoring,
    moroccoBoundScore,
    agriCargoScore,
    loadingSignalScore,
    loadingConfidence,
    loadingEvidenceStrength:
      loadingSignalScore >= 75 && loadingConfidence === "high"
        ? "strong"
        : loadingSignalScore >= 50
          ? "moderate"
          : "weak",
    missingCriticalSignals: Array.from(loadingMissingSignals),
    commodityScores,
    mostLikelyCommodity: top.commodity,
    commodityConfidenceLabel,
    topVoyageHypothesisScore,
    topVoyageHypothesisConfidence,
    voyageHypothesisReasons,
    missingSignalsForVoyageConfirmation,
    detectionPhase,
    confidenceLevel: toConfidenceLevel(moroccoBoundScore),
    moroccoBoundReasons: [...scoring.moroccoBoundReasons, sparseReason],
    agriCargoReasons: [...scoring.agriCargoReasons, sparseReason],
    commodityReasons: [...scoring.commodityReasons, sparseReason],
  };
}

function upgradePhase(phase: DetectionPhase, steps: number) {
  const index = DETECTION_PHASE_ORDER.indexOf(phase);
  if (index < 0 || index >= DETECTION_PHASE_ORDER.length - 1) {
    return phase;
  }
  return DETECTION_PHASE_ORDER[Math.min(DETECTION_PHASE_ORDER.length - 1, index + Math.max(1, steps))];
}

function applyTemporalEvidenceAdjustment(
  scoring: IntelligenceScoringResult,
  voyage: VoyageRecord,
): IntelligenceScoringResult {
  const observationCount = voyage.observationCount ?? 1;
  if (observationCount < 2) {
    return scoring;
  }

  const relevantCount = voyage.relevantObservationCount ?? 0;
  const corridorSamples = voyage.corridorSampleCount ?? 0;
  const loadingSamples = voyage.loadingSignalSampleCount ?? 0;
  const draftSamples = voyage.draftSampleCount ?? 0;
  const scoreTrend = voyage.scoreTrend ?? "flat";
  const loadingTrend = voyage.loadingTrend ?? "flat";
  const scoreTrendDelta = voyage.scoreTrendDelta ?? 0;
  const loadingTrendDelta = voyage.loadingTrendDelta ?? 0;
  const relevanceRatio = relevantCount > 0 ? relevantCount / Math.max(1, observationCount) : 0;
  const corridorRatio = corridorSamples > 0 ? corridorSamples / Math.max(1, observationCount) : 0;

  let moroccoDelta = 0;
  let agriDelta = 0;
  let loadingDelta = 0;
  let commodityTopDelta = 0;
  let voyageDelta = 0;
  const temporalReasons: string[] = [];

  if (observationCount >= 3 && relevanceRatio >= 0.6) {
    moroccoDelta += 6;
    agriDelta += 4;
    temporalReasons.push("Rolling evidence: relevance persisted across multiple observations.");
  } else if (observationCount >= 2 && relevanceRatio >= 0.5) {
    moroccoDelta += 3;
    temporalReasons.push("Rolling evidence: vessel stayed partially relevant over time.");
  }

  if (observationCount >= 3 && corridorRatio >= 0.6) {
    moroccoDelta += 4;
    temporalReasons.push("Rolling evidence: route corridor consistency remained stable.");
  }

  if (loadingSamples >= 2 && loadingTrend === "up" && loadingTrendDelta >= 4) {
    agriDelta += 4;
    loadingDelta += 6;
    commodityTopDelta += 3;
    temporalReasons.push("Rolling evidence: loading signal improved over repeated observations.");
  } else if (loadingSamples >= 2 && loadingTrend === "down" && loadingTrendDelta <= -4) {
    agriDelta -= 3;
    loadingDelta -= 4;
    temporalReasons.push("Rolling evidence: loading signal weakened over repeated observations.");
  }

  if (draftSamples >= 2) {
    agriDelta += 2;
    temporalReasons.push("Rolling evidence: draft history available across multiple snapshots.");
  }

  if (scoreTrend === "up" && scoreTrendDelta >= 6) {
    moroccoDelta += 3;
    voyageDelta += 4;
    temporalReasons.push("Rolling evidence: confidence trend improved over time.");
  } else if (scoreTrend === "down" && scoreTrendDelta <= -6) {
    moroccoDelta -= 4;
    agriDelta -= 2;
    voyageDelta -= 5;
    temporalReasons.push("Rolling evidence: confidence trend weakened over time.");
  }

  if (observationCount >= 4 && relevanceRatio < 0.35) {
    moroccoDelta -= 6;
    agriDelta -= 4;
    voyageDelta -= 6;
    temporalReasons.push("Rolling evidence: repeated contradictory relevance reduced confidence.");
  }

  if (temporalReasons.length === 0) {
    return scoring;
  }

  const moroccoBoundScore = clampScore(scoring.moroccoBoundScore + moroccoDelta);
  const agriCargoScore = clampScore(scoring.agriCargoScore + agriDelta);
  const loadingSignalScore = clampScore(scoring.loadingSignalScore + loadingDelta);
  const topVoyageHypothesisScore = clampScore(scoring.topVoyageHypothesisScore + voyageDelta);

  const rankedCommodity = [
    { key: "wheatScore" as const, value: scoring.commodityScores.wheatScore },
    { key: "barleyScore" as const, value: scoring.commodityScores.barleyScore },
    { key: "cornScore" as const, value: scoring.commodityScores.cornScore },
    { key: "soybeanMealScore" as const, value: scoring.commodityScores.soybeanMealScore },
  ].sort((a, b) => b.value - a.value);
  const topCommodity = rankedCommodity[0]?.key ?? "wheatScore";

  const commodityScores = {
    ...scoring.commodityScores,
    [topCommodity]: clampScore(scoring.commodityScores[topCommodity] + commodityTopDelta),
  };

  const commodityRanking = [
    { commodity: "wheat" as const, score: commodityScores.wheatScore },
    { commodity: "barley" as const, score: commodityScores.barleyScore },
    { commodity: "corn" as const, score: commodityScores.cornScore },
    { commodity: "soybeanMeal" as const, score: commodityScores.soybeanMealScore },
  ].sort((a, b) => b.score - a.score);

  const top = commodityRanking[0];
  const second = commodityRanking[1];
  const commodityGap = (top?.score ?? 0) - (second?.score ?? 0);

  let commodityConfidenceLabel = scoring.commodityConfidenceLabel;
  if (
    loadingSamples >= 3 &&
    loadingTrend === "up" &&
    agriCargoScore >= 65 &&
    moroccoBoundScore >= 60 &&
    (top?.score ?? 0) >= 60 &&
    commodityGap >= 10 &&
    commodityConfidenceLabel === "weak hypothesis"
  ) {
    commodityConfidenceLabel = "moderate hypothesis";
  }

  if (
    loadingTrend === "down" &&
    loadingTrendDelta <= -6 &&
    commodityConfidenceLabel === "strong hypothesis"
  ) {
    commodityConfidenceLabel = "moderate hypothesis";
  }

  let topVoyageHypothesisConfidence = scoring.topVoyageHypothesisConfidence;
  if (
    topVoyageHypothesisScore >= 78 &&
    topVoyageHypothesisConfidence === "moderate" &&
    scoring.topVoyageHypothesis !== "ambiguous_dry_bulk_non_morocco"
  ) {
    topVoyageHypothesisConfidence = "strong";
  } else if (
    topVoyageHypothesisScore < 58 &&
    topVoyageHypothesisConfidence !== "weak"
  ) {
    topVoyageHypothesisConfidence = "weak";
  }

  const voyageHypothesisReasons = [...scoring.voyageHypothesisReasons, ...temporalReasons];
  const missingSignalsForVoyageConfirmation =
    voyageDelta >= 2
      ? scoring.missingSignalsForVoyageConfirmation.filter(
          (signal) =>
            !signal.toLowerCase().includes("corridor") &&
            !signal.toLowerCase().includes("candidate-level"),
        )
      : scoring.missingSignalsForVoyageConfirmation;

  let detectionPhase = scoring.detectionPhase;
  if (observationCount >= 3 && relevanceRatio >= 0.6 && moroccoBoundScore >= 60) {
    detectionPhase = upgradePhase(detectionPhase, 1);
  }
  if (loadingSamples >= 3 && loadingTrend === "up" && agriCargoScore >= 65) {
    detectionPhase = upgradePhase(detectionPhase, 1);
  }
  if (relevanceRatio < 0.35 && observationCount >= 4) {
    detectionPhase = downgradePhase(detectionPhase, 1);
  }

  return {
    ...scoring,
    moroccoBoundScore,
    agriCargoScore,
    loadingSignalScore,
    loadingConfidence:
      loadingSignalScore >= 75
        ? "high"
        : loadingSignalScore >= 50
          ? "medium"
          : "low",
    loadingEvidenceStrength:
      loadingSignalScore >= 75
        ? "strong"
        : loadingSignalScore >= 50
          ? "moderate"
          : "weak",
    commodityScores,
    mostLikelyCommodity: top?.commodity ?? scoring.mostLikelyCommodity,
    commodityConfidenceLabel,
    topVoyageHypothesisScore,
    topVoyageHypothesisConfidence,
    voyageHypothesisReasons,
    missingSignalsForVoyageConfirmation,
    detectionPhase,
    confidenceLevel: toConfidenceLevel(moroccoBoundScore),
    moroccoBoundReasons: [...scoring.moroccoBoundReasons, ...temporalReasons],
    agriCargoReasons: [...scoring.agriCargoReasons, ...temporalReasons],
    commodityReasons: [...scoring.commodityReasons, ...temporalReasons],
  };
}

function inferMoroccoFromText(destinationText: string) {
  const normalized = destinationText.toLowerCase();
  return (
    normalized.includes("morocco") ||
    normalized.includes("casablanca") ||
    normalized.includes("jorf") ||
    normalized.includes("agadir") ||
    normalized.includes("tanger") ||
    normalized.includes("nador") ||
    normalized.includes("safi")
  );
}

function countMissingEvidence(entry: {
  normalizedDestinationText: string;
  normalizedEta: string;
  normalizedDraft: number;
  inferredDepartureConfidence: "high" | "medium" | "low";
  rawPreviousPortData: { name: string | null; code: string | null };
}) {
  let missing = 0;

  if (!hasValue(entry.normalizedDestinationText)) {
    missing += 1;
  }

  if (!hasValidIsoDate(entry.normalizedEta)) {
    missing += 1;
  }

  if (!(entry.normalizedDraft > 0)) {
    missing += 1;
  }

  if (entry.inferredDepartureConfidence === "low") {
    missing += 1;
  }

  if (!hasValue(entry.rawPreviousPortData.name) && !hasValue(entry.rawPreviousPortData.code)) {
    missing += 1;
  }

  return missing;
}

function getHybridDebugRecords(provider: AISProvider) {
  if (!(provider instanceof HybridAISProvider)) {
    return [];
  }

  return provider.getNormalizationDebug();
}

function getHybridAcquisitionSummary(provider: AISProvider): LiveAcquisitionSummary | null {
  if (!(provider instanceof HybridAISProvider)) {
    return null;
  }

  return provider.getAcquisitionMetrics();
}

function getHybridRollingSummary(provider: AISProvider): HybridRollingMemoryMetrics | null {
  if (!(provider instanceof HybridAISProvider)) {
    return null;
  }

  return provider.getRollingMemoryMetrics();
}

function getHybridWatchlistSummary(provider: AISProvider): HybridWatchlistMetrics | null {
  if (!(provider instanceof HybridAISProvider)) {
    return null;
  }

  return provider.getWatchlistMetrics();
}

function normalizeEvaluationWindowHours(windowHours?: number) {
  const requested = typeof windowHours === "number" && Number.isFinite(windowHours) ? Math.round(windowHours) : 48;
  if (requested <= 24) {
    return 24;
  }
  if (requested <= 48) {
    return 48;
  }
  return 72;
}

function getHybridEvaluationSnapshot(
  provider: AISProvider,
  windowHours: number,
): HybridEvaluationSnapshot | null {
  if (!(provider instanceof HybridAISProvider)) {
    return null;
  }

  return provider.getEvaluationSnapshot(windowHours);
}

function buildValidationEntryFromDebug(
  debug: HybridNormalizationDebugRecord,
  vessel: RadarVessel | undefined,
): LiveVesselValidationEntry {
  const normalizedMoroccoDestination =
    debug.normalizedMoroccoDestination ?? inferMoroccoFromText(debug.normalizedDestinationText);

  const entry: LiveVesselValidationEntry = {
    vesselId: debug.vesselId,
    vesselName: vessel?.name ?? debug.vesselName,
    rawDestinationText: debug.rawDestinationText,
    normalizedDestinationText: debug.normalizedDestinationText,
    rawVesselType: debug.rawVesselType,
    normalizedVesselType: debug.normalizedVesselType,
    rawEta: debug.rawEta,
    normalizedEta: debug.normalizedEta,
    rawDraft: debug.rawDraft,
    normalizedDraft: debug.normalizedDraft,
    rawDeparturePortData: {
      name: debug.rawDeparturePortName,
      code: debug.rawDeparturePortCode,
    },
    rawPreviousPortData: {
      name: debug.rawPreviousPortName,
      code: debug.rawPreviousPortCode,
    },
    exportMatchedAlias: debug.exportMatchedAlias ?? null,
    exportMatchedBy: debug.exportMatchedBy ?? "none",
    exportMatchConfidenceBand: debug.exportMatchConfidenceBand ?? "low",
    matchedAlias: debug.matchedAlias ?? null,
    matchedBy: debug.matchedBy ?? "none",
    matchConfidenceBand: debug.matchConfidenceBand ?? "low",
    fallbackLevel: debug.fallbackLevel ?? "none",
    terminalMatchedAlias: debug.terminalMatchedAlias ?? null,
    terminalMatchedBy: debug.terminalMatchedBy ?? "none",
    terminalMatchConfidenceBand: debug.terminalMatchConfidenceBand ?? "low",
    terminalFallbackLevel: debug.terminalFallbackLevel ?? "none",
    inferredDeparturePort: debug.inferredDeparturePort,
    inferredDepartureConfidence: debug.inferredDepartureConfidence,
    inferredDepartureReason: debug.inferredDepartureReason,
    normalizedVesselClass: debug.normalizedVesselClass,
    corridorClassification: debug.corridorClassification,
    corridorRelevant: debug.corridorRelevant,
    routeCorridorCompatible: debug.routeCorridorCompatible,
    exportPortRelevant: debug.exportPortRelevant,
    destinationTextMoroccoHint: debug.destinationTextMoroccoHint,
    historicalMoroccoRouteRelevant: debug.historicalMoroccoRouteRelevant,
    operationallyRelevant: debug.operationallyRelevant,
    acquisitionDecision: debug.acquisitionDecision,
    acquisitionReasons: debug.acquisitionReasons ?? [],
    acquisitionDryBulkCompatible: debug.acquisitionDryBulkCompatible,
    acquisitionCorridorRelevant: debug.acquisitionCorridorRelevant,
    acquisitionExportPortRelevant: debug.acquisitionExportPortRelevant,
    acquisitionMoroccoRelevant: debug.acquisitionMoroccoRelevant,
    enrichmentAttempted: debug.enrichmentAttempted,
    enrichmentSkipped: debug.enrichmentSkipped,
    enrichmentSkipReason: debug.enrichmentSkipReason,
    gfwEnrichmentAttempted: debug.gfwEnrichmentAttempted ?? false,
    gfwEnrichmentSuccess: debug.gfwEnrichmentSuccess ?? false,
    gfwEndpointUsed: debug.gfwEndpointUsed ?? null,
    gfwHistoricalPortMatches: debug.gfwHistoricalPortMatches ?? [],
    gfwMoroccoVisitCount: debug.gfwMoroccoVisitCount ?? 0,
    gfwExportPortVisitCount: debug.gfwExportPortVisitCount ?? 0,
    gfwHistoricalRouteHints: debug.gfwHistoricalRouteHints ?? [],
    gfwEvidenceConfidence: debug.gfwEvidenceConfidence ?? "low",
    gfwReasons: debug.gfwReasons ?? [],
    mostLikelyCommodity: vessel?.mostLikelyCommodity ?? debug.mostLikelyCommodity ?? "wheat",
    commodityConfidenceLabel:
      vessel?.commodityConfidenceLabel ?? debug.commodityConfidenceLabel ?? "weak hypothesis",
    operationalSupportScore: debug.operationalSupportScore ?? 0,
    portCongestionSignal: debug.portCongestionSignal ?? 0,
    berthProximitySignal: debug.berthProximitySignal ?? 0,
    waitingPatternSignal: debug.waitingPatternSignal ?? 0,
    loadingQueuePlausibility: debug.loadingQueuePlausibility ?? 0,
    operationalEvidenceConfidence: debug.operationalEvidenceConfidence ?? "low",
    operationalReasons: debug.operationalReasons ?? [],
    repeatedObservedNearSeededExportArea:
      debug.repeatedObservedNearSeededExportArea ?? false,
    lowSpeedDurationNearSeededPortHours:
      debug.lowSpeedDurationNearSeededPortHours ?? 0,
    relevantNearbyVesselCount: debug.relevantNearbyVesselCount ?? 0,
    operationalSeededExportArea: debug.operationalSeededExportArea ?? null,
    admissionScore: debug.admissionScore,
    admissionDecision: debug.admissionDecision,
    exclusionReasons: debug.exclusionReasons,
    normalizedMoroccoDestination,
    scoringReasons: {
      moroccoBound: vessel?.moroccoBoundReasons ?? [],
      agriCargo: vessel?.agriCargoReasons ?? [],
    },
    loadingSignalReasons: debug.loadingSignalReasons ?? [],
    topVoyageHypothesis:
      vessel?.topVoyageHypothesis ?? debug.topVoyageHypothesis ?? "ambiguous_dry_bulk_non_morocco",
    topVoyageHypothesisScore:
      vessel?.topVoyageHypothesisScore ?? debug.topVoyageHypothesisScore ?? 0,
    topVoyageHypothesisConfidence:
      vessel?.topVoyageHypothesisConfidence ?? debug.topVoyageHypothesisConfidence ?? "weak",
    topVoyageHypothesisProbability:
      vessel?.topVoyageHypothesisProbability ?? debug.topVoyageHypothesisProbability ?? 0,
    voyageHypothesisEvidenceStyle:
      vessel?.voyageHypothesisEvidenceStyle ??
      debug.voyageHypothesisEvidenceStyle ??
      "candidate_pre_confirmation",
    voyageHypothesisReasons:
      vessel?.voyageHypothesisReasons ?? debug.voyageHypothesisReasons ?? [],
    alternativeVoyageHypotheses:
      vessel?.alternativeVoyageHypotheses ?? debug.alternativeVoyageHypotheses ?? [],
    missingSignalsForVoyageConfirmation:
      vessel?.missingSignalsForVoyageConfirmation ??
      debug.missingSignalsForVoyageConfirmation ??
      [],
    loadingSignalScore: vessel?.loadingSignalScore ?? debug.loadingSignalScore ?? 0,
    draftDelta: vessel?.draftDelta ?? debug.draftDelta ?? null,
    portStayHours: vessel?.portStayHours ?? debug.portStayHours ?? null,
    loadingTerminalMatch: vessel?.loadingTerminalMatch ?? debug.loadingTerminalMatch ?? false,
    loadingConfidence: vessel?.loadingConfidence ?? debug.loadingConfidence ?? "low",
    loadingEvidenceStrength: vessel?.loadingEvidenceStrength ?? debug.loadingEvidenceStrength ?? "weak",
    missingCriticalSignals: vessel?.missingCriticalSignals ?? debug.missingCriticalSignals ?? [],
    matchedTerminalName: vessel?.matchedTerminalName ?? debug.matchedTerminalName ?? null,
    matchedTerminalType: vessel?.matchedTerminalType ?? debug.matchedTerminalType ?? "unknown_terminal",
    terminalMatchConfidence: vessel?.terminalMatchConfidence ?? debug.terminalMatchConfidence ?? "low",
    portStayConfidence: vessel?.portStayConfidence ?? debug.portStayConfidence ?? "low",
    arrivalDraftEstimate: vessel?.arrivalDraftEstimate ?? debug.arrivalDraftEstimate ?? null,
    departureDraftEstimate: vessel?.departureDraftEstimate ?? debug.departureDraftEstimate ?? null,
    arrivalDraftConfidence: vessel?.arrivalDraftConfidence ?? debug.arrivalDraftConfidence ?? "low",
    departureDraftConfidence: vessel?.departureDraftConfidence ?? debug.departureDraftConfidence ?? "low",
    draftDeltaConfidence: vessel?.draftDeltaConfidence ?? debug.draftDeltaConfidence ?? "low",
    grainTerminalMatch: vessel?.matchedTerminalType === "grain_terminal" || vessel?.matchedTerminalType === "feed_terminal" || vessel?.matchedTerminalType === "agri_bulk_terminal"
      || vessel?.matchedTerminalType === "mixed_bulk_terminal"
      ? true
      : (debug.grainTerminalMatch ?? false),
    firstSeenAt: vessel?.firstSeenAt ?? debug.firstSeenAt ?? null,
    lastSeenAt: vessel?.lastSeenAt ?? debug.lastSeenAt ?? null,
    firstRelevantSeenAt: vessel?.firstRelevantSeenAt ?? debug.firstRelevantSeenAt ?? null,
    lastRelevantSeenAt: vessel?.lastRelevantSeenAt ?? debug.lastRelevantSeenAt ?? null,
    observationCount: vessel?.observationCount ?? debug.observationCount ?? 1,
    historicalDraftSamplesCount: debug.historicalDraftSamplesCount ?? 0,
    historicalCorridorSamplesCount: debug.historicalCorridorSamplesCount ?? 0,
    historicalDestinationSamplesCount: debug.historicalDestinationSamplesCount ?? 0,
    scoreTrend: vessel?.scoreTrend ?? debug.scoreTrend ?? "flat",
    scoreTrendDelta: debug.scoreTrendDelta ?? 0,
    loadingSignalTrend: vessel?.loadingTrend ?? debug.loadingSignalTrend ?? "flat",
    loadingSignalTrendDelta: debug.loadingSignalTrendDelta ?? 0,
    confidenceImprovedOverTime:
      vessel?.confidenceImprovedOverTime ?? debug.confidenceImprovedOverTime ?? false,
    rollingWindowRetained: debug.rollingWindowRetained ?? false,
    rollingRetentionReason:
      vessel?.rollingRetentionReason ??
      debug.rollingRetentionReason ??
      "Tracked in current live snapshot.",
    temporalAdjustmentReasons: debug.temporalAdjustmentReasons ?? [],
    watchlistDecision: debug.watchlistDecision ?? "not_eligible",
    watchlistReasons: debug.watchlistReasons ?? [],
    watchlistEnteredAt: debug.watchlistEnteredAt ?? null,
    watchlistLastUpdatedAt: debug.watchlistLastUpdatedAt ?? null,
    watchlistRetentionRemainingHours: debug.watchlistRetentionRemainingHours ?? null,
    reEnrichmentCount: debug.reEnrichmentCount ?? 0,
    watchlistPriorityScore: debug.watchlistPriorityScore ?? 0,
    watchlistPriorityReasons: debug.watchlistPriorityReasons ?? [],
    promotionReadinessScore: debug.promotionReadinessScore ?? 0,
    promotionReadinessReasons: debug.promotionReadinessReasons ?? [],
    missingSignalsForPromotion: debug.missingSignalsForPromotion ?? [],
    scoreTrendDirection: debug.scoreTrendDirection ?? debug.scoreTrend ?? "flat",
    confidenceTrendDirection: debug.confidenceTrendDirection ?? "flat",
    evidenceImproving: debug.evidenceImproving ?? false,
    evidenceWeakening: debug.evidenceWeakening ?? false,
    moroccoBoundTrend: debug.moroccoBoundTrend ?? debug.scoreTrend ?? "flat",
    agriCargoTrend: debug.agriCargoTrend ?? "flat",
    commodityTrend: debug.commodityTrend ?? "flat",
    matchedCommodityKnowledgeNode:
      vessel?.matchedCommodityKnowledgeNode ?? debug.matchedCommodityKnowledgeNode ?? null,
    terminalCommodityProfile:
      vessel?.terminalCommodityProfile ?? debug.terminalCommodityProfile ?? null,
    vesselClassKnowledgeProfile:
      vessel?.vesselClassKnowledgeProfile ?? debug.vesselClassKnowledgeProfile ?? "Other/Unknown",
    destinationKnowledgeProfile:
      vessel?.destinationKnowledgeProfile ?? debug.destinationKnowledgeProfile ?? null,
    knowledgeBasedCommodityReasons:
      vessel?.knowledgeBasedCommodityReasons ??
      debug.knowledgeBasedCommodityReasons ??
      [],
    knowledgeSupportScore:
      vessel?.knowledgeSupportScore ?? debug.knowledgeSupportScore ?? 0,
    knowledgeAgriScoreDelta:
      vessel?.knowledgeAgriScoreDelta ?? debug.knowledgeAgriScoreDelta ?? 0,
    knowledgeCommodityScoreBoost:
      vessel?.knowledgeCommodityScoreBoost ?? debug.knowledgeCommodityScoreBoost ?? 0,
    knowledgeCommodityScoreDeltas:
      vessel?.knowledgeCommodityScoreDeltas ??
      debug.knowledgeCommodityScoreDeltas ?? {
        wheatScore: 0,
        barleyScore: 0,
        cornScore: 0,
        soybeanMealScore: 0,
      },
    knowledgeMatchedTerminalIntelligence:
      vessel?.knowledgeMatchedTerminalIntelligence ??
      debug.knowledgeMatchedTerminalIntelligence ??
      false,
    knowledgeMatchedCommodityProfile:
      vessel?.knowledgeMatchedCommodityProfile ??
      debug.knowledgeMatchedCommodityProfile ??
      false,
    knowledgeDestinationIntelligenceSupport:
      vessel?.knowledgeDestinationIntelligenceSupport ??
      debug.knowledgeDestinationIntelligenceSupport ??
      false,
    promotionEligible: debug.promotionEligible ?? false,
    promotionReason: debug.promotionReason ?? null,
    dropReason: debug.dropReason ?? null,
    commodityHypothesisReasons: vessel?.commodityReasons ?? [],
    vesselHistoricalProfile:
      vessel?.vesselHistoricalProfile ??
      debug.vesselHistoricalProfile ?? {
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
      },
    vesselVoyageState:
      vessel?.vesselVoyageState ??
      debug.vesselVoyageState ??
      "ballast_arrival",
    voyageStateConfidence:
      vessel?.voyageStateConfidence ??
      debug.voyageStateConfidence ??
      "low",
    voyageStateReasons:
      vessel?.voyageStateReasons ??
      debug.voyageStateReasons ??
      [],
    historicalDestinationSeries: debug.historicalDestinationSeries ?? [],
    destinationEvolutionScore:
      vessel?.destinationEvolutionScore ??
      debug.destinationEvolutionScore ??
      0,
    destinationMoroccoConfidence:
      vessel?.destinationMoroccoConfidence ??
      debug.destinationMoroccoConfidence ??
      0,
    destinationContradictionScore:
      vessel?.destinationContradictionScore ??
      debug.destinationContradictionScore ??
      0,
    destinationConsistencyScore:
      vessel?.destinationConsistencyScore ??
      debug.destinationConsistencyScore ??
      0,
    destinationEvolutionReasons:
      vessel?.destinationEvolutionReasons ??
      debug.destinationEvolutionReasons ??
      [],
    portCommodityPriorScores:
      vessel?.portCommodityPriorScores ??
      debug.portCommodityPriorScores ?? {
        wheatScore: 0,
        barleyScore: 0,
        cornScore: 0,
        soybeanMealScore: 0,
      },
    portCommodityPriorReasons:
      vessel?.portCommodityPriorReasons ??
      debug.portCommodityPriorReasons ??
      [],
    contradictionScore:
      vessel?.contradictionScore ??
      debug.contradictionScore ??
      0,
    contradictionReasons:
      vessel?.contradictionReasons ??
      debug.contradictionReasons ??
      [],
    ensembleEvidenceBreakdown:
      vessel?.ensembleEvidenceBreakdown ??
      debug.ensembleEvidenceBreakdown ?? {
        routeEvidence: 0,
        loadingEvidence: 0,
        portKnowledgeEvidence: 0,
        historicalEvidence: 0,
        destinationEvidence: 0,
        flowPriorEvidence: 0,
        contradictionEvidence: 0,
        overallSupportScore: 0,
      },
    dataCompletenessScore:
      vessel?.dataCompletenessScore ??
      debug.dataCompletenessScore ??
      0,
    confidencePenalty:
      vessel?.confidencePenalty ??
      debug.confidencePenalty ??
      0,
    predictionConfidenceBand:
      vessel?.predictionConfidenceBand ??
      debug.predictionConfidenceBand ??
      "weak",
    missingCriticalPredictionSignals:
      vessel?.missingCriticalPredictionSignals ??
      debug.missingCriticalPredictionSignals ??
      [],
    commodityPriorProbabilities: vessel?.commodityPriorProbabilities ?? {
      wheat: 0.25,
      barley: 0.25,
      corn: 0.25,
      soybeanMeal: 0.25,
    },
    commodityPosteriorProbabilities: vessel?.commodityPosteriorProbabilities ?? {
      wheat: 0.25,
      barley: 0.25,
      corn: 0.25,
      soybeanMeal: 0.25,
    },
    commodityEvidenceAdjustments: vessel?.commodityEvidenceAdjustments ?? {
      routeEvidence: { wheatScore: 0, barleyScore: 0, cornScore: 0, soybeanMealScore: 0 },
      loadingEvidence: { wheatScore: 0, barleyScore: 0, cornScore: 0, soybeanMealScore: 0 },
      historicalEvidence: { wheatScore: 0, barleyScore: 0, cornScore: 0, soybeanMealScore: 0 },
      destinationEvidence: { wheatScore: 0, barleyScore: 0, cornScore: 0, soybeanMealScore: 0 },
      flowPriorEvidence: { wheatScore: 0, barleyScore: 0, cornScore: 0, soybeanMealScore: 0 },
      contradictionEvidence: { wheatScore: 0, barleyScore: 0, cornScore: 0, soybeanMealScore: 0 },
      voyageHypothesisEvidence: { wheatScore: 0, barleyScore: 0, cornScore: 0, soybeanMealScore: 0 },
      seasonalEvidence: { wheatScore: 0, barleyScore: 0, cornScore: 0, soybeanMealScore: 0 },
      commercialPatternEvidence: { wheatScore: 0, barleyScore: 0, cornScore: 0, soybeanMealScore: 0 },
    },
    predictionEntropy: vessel?.predictionEntropy ?? 100,
    evidenceCoverageScore: vessel?.evidenceCoverageScore ?? 0,
    uncertaintyPenalty: vessel?.uncertaintyPenalty ?? 20,
    voyageTemplatePosteriorProbabilities:
      vessel?.voyageTemplatePosteriorProbabilities ??
      debug.voyageTemplatePosteriorProbabilities ??
      {},
    voyageTemplateEntropy: vessel?.voyageTemplateEntropy ?? debug.voyageTemplateEntropy ?? 100,
    informationValueSignals: vessel?.informationValueSignals ?? [],
    missingInformationValueRanking: vessel?.missingInformationValueRanking ?? [],
    seasonalAdjustmentScore: vessel?.seasonalAdjustmentScore ?? 0,
    seasonalReasoning: vessel?.seasonalReasoning ?? [],
    commercialPatternSimilarityScore: vessel?.commercialPatternSimilarityScore ?? 0,
    evidenceMissingCount: 0,
    weakEvidenceOnly: debug.weakEvidenceOnly ?? (vessel ? fallbackWeakEvidence(vessel) : false),
  };

  entry.evidenceMissingCount = countMissingEvidence(entry);
  entry.weakEvidenceOnly = entry.weakEvidenceOnly || entry.evidenceMissingCount >= 4;

  return entry;
}

function buildFallbackValidationEntry(vessel: RadarVessel): LiveVesselValidationEntry {
  const entry: LiveVesselValidationEntry = {
    vesselId: vessel.id,
    vesselName: vessel.name,
    rawDestinationText: null,
    normalizedDestinationText: vessel.destinationText,
    rawVesselType: null,
    normalizedVesselType: vessel.vesselType,
    rawEta: null,
    normalizedEta: vessel.eta,
    rawDraft: null,
    normalizedDraft: vessel.lastDraft,
    rawDeparturePortData: { name: null, code: null },
    rawPreviousPortData: { name: null, code: null },
    exportMatchedAlias: null,
    exportMatchedBy: "none",
    exportMatchConfidenceBand: "low",
    matchedAlias: null,
    matchedBy: "none",
    matchConfidenceBand: "low",
    fallbackLevel: "none",
    terminalMatchedAlias: null,
    terminalMatchedBy: "none",
    terminalMatchConfidenceBand: "low",
    terminalFallbackLevel: "none",
    inferredDeparturePort: vessel.departurePort,
    inferredDepartureConfidence: "low",
    inferredDepartureReason:
      "Provider normalization debug is unavailable for this vessel/provider.",
    normalizedVesselClass: "unknown",
    corridorClassification: vessel.currentMaritimeZone,
    corridorRelevant: true,
    routeCorridorCompatible: true,
    exportPortRelevant: false,
    destinationTextMoroccoHint: inferMoroccoFromText(vessel.destinationText),
    historicalMoroccoRouteRelevant: false,
    operationallyRelevant: vessel.speed >= 1.5,
    acquisitionDecision: "selected",
    acquisitionReasons: ["Fallback validation entry derived from admitted radar vessel."],
    acquisitionDryBulkCompatible: true,
    acquisitionCorridorRelevant: true,
    acquisitionExportPortRelevant: false,
    acquisitionMoroccoRelevant: true,
    enrichmentAttempted: true,
    enrichmentSkipped: false,
    enrichmentSkipReason: null,
    gfwEnrichmentAttempted: false,
    gfwEnrichmentSuccess: false,
    gfwEndpointUsed: null,
    gfwHistoricalPortMatches: [],
    gfwMoroccoVisitCount: 0,
    gfwExportPortVisitCount: 0,
    gfwHistoricalRouteHints: [],
    gfwEvidenceConfidence: "low",
    gfwReasons: [],
    mostLikelyCommodity: vessel.mostLikelyCommodity,
    commodityConfidenceLabel: vessel.commodityConfidenceLabel,
    operationalSupportScore: 0,
    portCongestionSignal: 0,
    berthProximitySignal: 0,
    waitingPatternSignal: 0,
    loadingQueuePlausibility: 0,
    operationalEvidenceConfidence: "low",
    operationalReasons: [],
    repeatedObservedNearSeededExportArea: false,
    lowSpeedDurationNearSeededPortHours: 0,
    relevantNearbyVesselCount: 0,
    operationalSeededExportArea: null,
    admissionScore: vessel.moroccoBoundScore,
    admissionDecision: "included",
    exclusionReasons: [],
    normalizedMoroccoDestination: inferMoroccoFromText(vessel.destinationText),
    scoringReasons: {
      moroccoBound: vessel.moroccoBoundReasons,
      agriCargo: vessel.agriCargoReasons,
    },
    loadingSignalReasons: vessel.agriCargoReasons,
    topVoyageHypothesis: vessel.topVoyageHypothesis,
    topVoyageHypothesisScore: vessel.topVoyageHypothesisScore,
    topVoyageHypothesisConfidence: vessel.topVoyageHypothesisConfidence,
    topVoyageHypothesisProbability: vessel.topVoyageHypothesisProbability,
    voyageHypothesisEvidenceStyle: vessel.voyageHypothesisEvidenceStyle,
    voyageHypothesisReasons: vessel.voyageHypothesisReasons,
    alternativeVoyageHypotheses: vessel.alternativeVoyageHypotheses,
    missingSignalsForVoyageConfirmation: vessel.missingSignalsForVoyageConfirmation,
    loadingSignalScore: vessel.loadingSignalScore,
    draftDelta: vessel.draftDelta,
    portStayHours: vessel.portStayHours,
    loadingTerminalMatch: vessel.loadingTerminalMatch,
    loadingConfidence: vessel.loadingConfidence,
    loadingEvidenceStrength: vessel.loadingEvidenceStrength,
    missingCriticalSignals: vessel.missingCriticalSignals,
    matchedTerminalName: vessel.matchedTerminalName,
    matchedTerminalType: vessel.matchedTerminalType,
    terminalMatchConfidence: vessel.terminalMatchConfidence,
    portStayConfidence: vessel.portStayConfidence,
    arrivalDraftEstimate: vessel.arrivalDraftEstimate,
    departureDraftEstimate: vessel.departureDraftEstimate,
    arrivalDraftConfidence: vessel.arrivalDraftConfidence,
    departureDraftConfidence: vessel.departureDraftConfidence,
    draftDeltaConfidence: vessel.draftDeltaConfidence,
    grainTerminalMatch:
      vessel.matchedTerminalType === "grain_terminal" ||
      vessel.matchedTerminalType === "feed_terminal" ||
      vessel.matchedTerminalType === "agri_bulk_terminal" ||
      vessel.matchedTerminalType === "mixed_bulk_terminal",
    firstSeenAt: vessel.firstSeenAt ?? null,
    lastSeenAt: vessel.lastSeenAt ?? vessel.lastSignalAt,
    firstRelevantSeenAt: vessel.firstRelevantSeenAt ?? null,
    lastRelevantSeenAt: vessel.lastRelevantSeenAt ?? null,
    observationCount: vessel.observationCount ?? 1,
    historicalDraftSamplesCount: 0,
    historicalCorridorSamplesCount: 0,
    historicalDestinationSamplesCount: 0,
    scoreTrend: vessel.scoreTrend ?? "flat",
    scoreTrendDelta: vessel.scoreTrendDelta ?? 0,
    loadingSignalTrend: vessel.loadingTrend ?? "flat",
    loadingSignalTrendDelta: vessel.loadingTrendDelta ?? 0,
    confidenceImprovedOverTime: vessel.confidenceImprovedOverTime ?? false,
    rollingWindowRetained: true,
    rollingRetentionReason: vessel.rollingRetentionReason ?? "Retained from live rolling window.",
    temporalAdjustmentReasons: [],
    watchlistDecision: "not_eligible",
    watchlistReasons: [],
    watchlistEnteredAt: null,
    watchlistLastUpdatedAt: null,
    watchlistRetentionRemainingHours: null,
    reEnrichmentCount: 0,
    watchlistPriorityScore: 0,
    watchlistPriorityReasons: [],
    promotionReadinessScore: 0,
    promotionReadinessReasons: [],
    missingSignalsForPromotion: [],
    scoreTrendDirection: vessel.scoreTrend ?? "flat",
    confidenceTrendDirection: "flat",
    evidenceImproving: vessel.confidenceImprovedOverTime ?? false,
    evidenceWeakening: false,
    moroccoBoundTrend: vessel.scoreTrend ?? "flat",
    agriCargoTrend: vessel.loadingTrend ?? "flat",
    commodityTrend: "flat",
    matchedCommodityKnowledgeNode: vessel.matchedCommodityKnowledgeNode ?? null,
    terminalCommodityProfile: vessel.terminalCommodityProfile ?? null,
    vesselClassKnowledgeProfile: vessel.vesselClassKnowledgeProfile ?? "Other/Unknown",
    destinationKnowledgeProfile: vessel.destinationKnowledgeProfile ?? null,
    knowledgeBasedCommodityReasons: vessel.knowledgeBasedCommodityReasons ?? [],
    knowledgeSupportScore: vessel.knowledgeSupportScore ?? 0,
    knowledgeAgriScoreDelta: vessel.knowledgeAgriScoreDelta ?? 0,
    knowledgeCommodityScoreBoost: vessel.knowledgeCommodityScoreBoost ?? 0,
    knowledgeCommodityScoreDeltas: vessel.knowledgeCommodityScoreDeltas ?? {
      wheatScore: 0,
      barleyScore: 0,
      cornScore: 0,
      soybeanMealScore: 0,
    },
    knowledgeMatchedTerminalIntelligence: vessel.knowledgeMatchedTerminalIntelligence ?? false,
    knowledgeMatchedCommodityProfile: vessel.knowledgeMatchedCommodityProfile ?? false,
    knowledgeDestinationIntelligenceSupport:
      vessel.knowledgeDestinationIntelligenceSupport ?? false,
    promotionEligible: false,
    promotionReason: null,
    dropReason: null,
    commodityHypothesisReasons: vessel.commodityReasons,
    vesselHistoricalProfile: vessel.vesselHistoricalProfile ?? {
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
    },
    vesselVoyageState: vessel.vesselVoyageState ?? "ballast_arrival",
    voyageStateConfidence: vessel.voyageStateConfidence ?? "low",
    voyageStateReasons: vessel.voyageStateReasons ?? [],
    historicalDestinationSeries: [],
    destinationEvolutionScore: vessel.destinationEvolutionScore ?? 0,
    destinationMoroccoConfidence: vessel.destinationMoroccoConfidence ?? 0,
    destinationContradictionScore: vessel.destinationContradictionScore ?? 0,
    destinationConsistencyScore: vessel.destinationConsistencyScore ?? 0,
    destinationEvolutionReasons: vessel.destinationEvolutionReasons ?? [],
    portCommodityPriorScores: vessel.portCommodityPriorScores ?? {
      wheatScore: 0,
      barleyScore: 0,
      cornScore: 0,
      soybeanMealScore: 0,
    },
    portCommodityPriorReasons: vessel.portCommodityPriorReasons ?? [],
    contradictionScore: vessel.contradictionScore ?? 0,
    contradictionReasons: vessel.contradictionReasons ?? [],
    ensembleEvidenceBreakdown: vessel.ensembleEvidenceBreakdown ?? {
      routeEvidence: 0,
      loadingEvidence: 0,
      portKnowledgeEvidence: 0,
      historicalEvidence: 0,
      destinationEvidence: 0,
      flowPriorEvidence: 0,
      contradictionEvidence: 0,
      overallSupportScore: 0,
    },
    dataCompletenessScore: vessel.dataCompletenessScore ?? 0,
    confidencePenalty: vessel.confidencePenalty ?? 0,
    predictionConfidenceBand: vessel.predictionConfidenceBand ?? "weak",
    missingCriticalPredictionSignals: vessel.missingCriticalPredictionSignals ?? [],
    commodityPriorProbabilities: vessel.commodityPriorProbabilities ?? {
      wheat: 0.25,
      barley: 0.25,
      corn: 0.25,
      soybeanMeal: 0.25,
    },
    commodityPosteriorProbabilities: vessel.commodityPosteriorProbabilities ?? {
      wheat: 0.25,
      barley: 0.25,
      corn: 0.25,
      soybeanMeal: 0.25,
    },
    commodityEvidenceAdjustments: vessel.commodityEvidenceAdjustments ?? {
      routeEvidence: { wheatScore: 0, barleyScore: 0, cornScore: 0, soybeanMealScore: 0 },
      loadingEvidence: { wheatScore: 0, barleyScore: 0, cornScore: 0, soybeanMealScore: 0 },
      historicalEvidence: { wheatScore: 0, barleyScore: 0, cornScore: 0, soybeanMealScore: 0 },
      destinationEvidence: { wheatScore: 0, barleyScore: 0, cornScore: 0, soybeanMealScore: 0 },
      flowPriorEvidence: { wheatScore: 0, barleyScore: 0, cornScore: 0, soybeanMealScore: 0 },
      contradictionEvidence: { wheatScore: 0, barleyScore: 0, cornScore: 0, soybeanMealScore: 0 },
      voyageHypothesisEvidence: { wheatScore: 0, barleyScore: 0, cornScore: 0, soybeanMealScore: 0 },
      seasonalEvidence: { wheatScore: 0, barleyScore: 0, cornScore: 0, soybeanMealScore: 0 },
      commercialPatternEvidence: { wheatScore: 0, barleyScore: 0, cornScore: 0, soybeanMealScore: 0 },
    },
    predictionEntropy: vessel.predictionEntropy ?? 100,
    evidenceCoverageScore: vessel.evidenceCoverageScore ?? 0,
    uncertaintyPenalty: vessel.uncertaintyPenalty ?? 20,
    voyageTemplatePosteriorProbabilities: vessel.voyageTemplatePosteriorProbabilities ?? {},
    voyageTemplateEntropy: vessel.voyageTemplateEntropy ?? 100,
    informationValueSignals: vessel.informationValueSignals ?? [],
    missingInformationValueRanking: vessel.missingInformationValueRanking ?? [],
    seasonalAdjustmentScore: vessel.seasonalAdjustmentScore ?? 0,
    seasonalReasoning: vessel.seasonalReasoning ?? [],
    commercialPatternSimilarityScore: vessel.commercialPatternSimilarityScore ?? 0,
    evidenceMissingCount: 0,
    weakEvidenceOnly: fallbackWeakEvidence(vessel),
  };

  entry.evidenceMissingCount = countMissingEvidence(entry);
  return entry;
}

function summarizeLiveDataQuality(entries: LiveVesselValidationEntry[]): LiveDataQualitySummary {
  return {
    liveVesselsRetrieved: entries.length,
    admittedToRadar: entries.filter((entry) => entry.admissionDecision === "included").length,
    excludedFromRadar: entries.filter((entry) => entry.admissionDecision === "excluded").length,
    withDestinationText: entries.filter((entry) => hasValue(entry.normalizedDestinationText)).length,
    withNormalizedMoroccoDestination: entries.filter((entry) => entry.normalizedMoroccoDestination).length,
    withDeparturePortInferred: entries.filter((entry) => entry.inferredDepartureConfidence !== "low").length,
    withDraftPresent: entries.filter((entry) => typeof entry.normalizedDraft === "number" && entry.normalizedDraft > 0).length,
    withEtaPresent: entries.filter((entry) => hasValue(entry.normalizedEta)).length,
    withWeakEvidenceOnly: entries.filter((entry) => entry.weakEvidenceOnly).length,
  };
}

function summarizeLoadingEvidence(entries: LiveVesselValidationEntry[]): LiveLoadingEvidenceSummary {
  return {
    vesselsWithTerminalMatch: entries.filter((entry) => entry.loadingTerminalMatch).length,
    vesselsWithGrainTerminalMatch: entries.filter((entry) => entry.grainTerminalMatch).length,
    vesselsWithUsablePortStayEstimate: entries.filter(
      (entry) =>
        typeof entry.portStayHours === "number" &&
        entry.portStayHours > 0 &&
        (entry.portStayConfidence === "medium" || entry.portStayConfidence === "high"),
    ).length,
    vesselsWithUsableDraftDeltaEstimate: entries.filter(
      (entry) =>
        typeof entry.draftDelta === "number" &&
        entry.draftDelta !== 0 &&
        (entry.draftDeltaConfidence === "medium" || entry.draftDeltaConfidence === "high"),
    ).length,
    vesselsWithModerateOrStrongLoadingSignal: entries.filter(
      (entry) =>
        entry.loadingEvidenceStrength === "moderate" ||
        entry.loadingEvidenceStrength === "strong",
    ).length,
  };
}

function summarizeKnowledgeEvidence(entries: LiveVesselValidationEntry[]): LiveKnowledgeSummary {
  return {
    vesselsMatchedKnownTerminalIntelligence: entries.filter(
      (entry) => entry.knowledgeMatchedTerminalIntelligence,
    ).length,
    vesselsMatchedKnownCommodityProfiles: entries.filter(
      (entry) => entry.knowledgeMatchedCommodityProfile,
    ).length,
    vesselsWithDestinationIntelligenceSupport: entries.filter(
      (entry) => entry.knowledgeDestinationIntelligenceSupport,
    ).length,
    vesselsCommodityScoreImprovedByKnowledgeBase: entries.filter(
      (entry) => entry.knowledgeCommodityScoreBoost > 0,
    ).length,
  };
}

function summarizeGfwEvidence(entries: LiveVesselValidationEntry[]): LiveGfwSummary {
  return {
    enrichmentAttempted: entries.filter((entry) => entry.gfwEnrichmentAttempted).length,
    enrichmentSuccess: entries.filter((entry) => entry.gfwEnrichmentSuccess).length,
    withHistoricalPortMatches: entries.filter(
      (entry) => entry.gfwHistoricalPortMatches.length > 0,
    ).length,
    withMoroccoVisitHistory: entries.filter(
      (entry) => entry.gfwMoroccoVisitCount > 0,
    ).length,
    withExportVisitHistory: entries.filter(
      (entry) => entry.gfwExportPortVisitCount > 0,
    ).length,
    withRouteHints: entries.filter(
      (entry) => entry.gfwHistoricalRouteHints.length > 0,
    ).length,
    supportiveEvidenceCount: entries.filter(
      (entry) =>
        entry.gfwEvidenceConfidence !== "low" &&
        (entry.gfwMoroccoVisitCount > 0 ||
          entry.gfwExportPortVisitCount > 0 ||
          entry.gfwHistoricalRouteHints.length > 0),
    ).length,
    helpedVoyageHypothesisCount: entries.filter(
      (entry) =>
        entry.gfwEvidenceConfidence !== "low" &&
        entry.topVoyageHypothesis !== "ambiguous_dry_bulk_non_morocco" &&
        entry.topVoyageHypothesisScore >= 60,
    ).length,
  };
}

function summarizeOperationalEvidence(entries: LiveVesselValidationEntry[]): LiveOperationalSummary {
  return {
    vesselsWithOperationalSupport: entries.filter(
      (entry) => entry.operationalSupportScore >= 45,
    ).length,
    vesselsWithWaitingPattern: entries.filter(
      (entry) => entry.waitingPatternSignal >= 35,
    ).length,
    vesselsWithBerthProximity: entries.filter(
      (entry) => entry.berthProximitySignal >= 35,
    ).length,
    vesselsWithPortCongestionSignal: entries.filter(
      (entry) => entry.portCongestionSignal >= 20,
    ).length,
    vesselsWithQueuePlausibility: entries.filter(
      (entry) => entry.loadingQueuePlausibility >= 40,
    ).length,
    repeatedObservedNearSeededExportArea: entries.filter(
      (entry) => entry.repeatedObservedNearSeededExportArea,
    ).length,
  };
}

async function fetchTrackedVoyages(provider: AISProvider, mode: "mock" | "live") {
  const ports = await provider.getPorts();
  let targetPorts = mode === "live" ? ports.filter((port) => port.isMoroccoDestination) : ports;

  if (mode === "live" && getUsageProfile() === "low") {
    const lowCostPorts = targetPorts.filter((port) => LOW_USAGE_MOROCCO_PORT_CODES.has(port.code));
    if (lowCostPorts.length > 0) {
      targetPorts = lowCostPorts;
    }
  }

  const voyageLists = await Promise.all(targetPorts.map((port) => provider.getExpectedArrivals(port.code)));

  const voyageByVessel = new Map<string, VoyageRecord>();
  for (const voyages of voyageLists) {
    for (const voyage of voyages) {
      const current = voyageByVessel.get(voyage.vesselId);
      if (!current || new Date(voyage.eta).getTime() < new Date(current.eta).getTime()) {
        voyageByVessel.set(voyage.vesselId, voyage);
      }
    }
  }

  return Array.from(voyageByVessel.values());
}

async function hydrateVessels(
  provider: AISProvider,
  voyages: VoyageRecord[],
  mode: "mock" | "live",
): Promise<RadarVessel[]> {
  const ports = await provider.getPorts();
  const portById = new Map(ports.map((port) => [port.id, port]));
  const moroccoPorts = ports.filter((port) => port.isMoroccoDestination);

  const vesselIds = voyages.map((voyage) => voyage.vesselId);

  const [positions, detailedVoyages, vessels, routePatterns] = await Promise.all([
    provider.getLatestPositions(vesselIds),
    provider.getVoyageData(vesselIds),
    Promise.all(vesselIds.map((vesselId) => provider.getVesselDetails(vesselId))),
    Promise.all(vesselIds.map((vesselId) => provider.getHistoricalRoutePattern(vesselId))),
  ]);

  const detailedVoyageByVessel = new Map(detailedVoyages.map((voyage) => [voyage.vesselId, voyage]));
  const vesselById = new Map(
    vessels.filter((vessel): vessel is VesselRecord => Boolean(vessel)).map((vessel) => [vessel.id, vessel]),
  );
  const positionByVessel = new Map(positions.map((position) => [position.vesselId, position]));
  const historyByVessel = new Map(vesselIds.map((vesselId, index) => [vesselId, routePatterns[index] ?? []]));
  const debugByVessel =
    provider instanceof HybridAISProvider
      ? new Map(
          provider
            .getNormalizationDebug(vesselIds)
            .map((record) => [record.vesselId, record]),
        )
      : new Map<string, HybridNormalizationDebugRecord>();

  const enriched: RadarVessel[] = [];

  for (const arrivalVoyage of voyages) {
    const voyage = detailedVoyageByVessel.get(arrivalVoyage.vesselId) ?? arrivalVoyage;
    const vessel = vesselById.get(voyage.vesselId);
    if (!vessel) {
      continue;
    }

    const destinationPort = portById.get(voyage.destinationPortId);
    const previousPort = portById.get(voyage.previousPortId);
    const departurePort = portById.get(voyage.departurePortId ?? voyage.previousPortId);
    if (!previousPort || !departurePort) {
      continue;
    }

    const latestPosition = positionByVessel.get(voyage.vesselId);
    const currentLat = latestPosition?.lat ?? voyage.currentLat;
    const currentLon = latestPosition?.lon ?? voyage.currentLon;
    const speed = latestPosition?.speed ?? voyage.speed;
    const course = latestPosition?.course ?? voyage.course;
    const heading = latestPosition?.heading ?? voyage.heading;
    const lastSignalAt = latestPosition?.timestamp ?? voyage.lastSignalAt;

    const departureDetectedAt = voyage.departureDetectedAt;
    const timeSinceDepartureHours = Math.max(
      0,
      Number(((Date.now() - new Date(departureDetectedAt).getTime()) / 3_600_000).toFixed(1)),
    );

    const currentMaritimeZone = inferMaritimeZone(currentLat, currentLon);
    const estimatedMorocco = estimateDaysToMorocco(currentLat, currentLon, speed, moroccoPorts);

    const suspectedDestinationRegion = inferDestinationRegion(
      destinationPort?.name ?? "Unknown",
      destinationPort?.country ?? "Unknown",
      voyage.destinationText,
    );
    const debugRecord = debugByVessel.get(vessel.id);

    let scoring = scoreVesselIntelligence({
      vesselType: vessel.vesselType,
      departurePort,
      destinationPort,
      destinationText: voyage.destinationText,
      currentLat,
      currentLon,
      speed,
      course,
      deadweight: vessel.deadweight,
      lastDraft: vessel.lastDraft,
      historicalRoutePortIds: historyByVessel.get(vessel.id) ?? [],
      estimatedDaysToMorocco: estimatedMorocco.estimatedDays,
      currentMaritimeZone,
      timeSinceDepartureHours,
      gfwMoroccoVisitCount: debugRecord?.gfwMoroccoVisitCount,
      gfwExportPortVisitCount: debugRecord?.gfwExportPortVisitCount,
      gfwHistoricalRouteHints: debugRecord?.gfwHistoricalRouteHints,
      gfwEvidenceConfidence: debugRecord?.gfwEvidenceConfidence,
      operationalSignals: debugRecord
        ? {
            operationalSupportScore: debugRecord.operationalSupportScore,
            portCongestionSignal: debugRecord.portCongestionSignal,
            berthProximitySignal: debugRecord.berthProximitySignal,
            waitingPatternSignal: debugRecord.waitingPatternSignal,
            loadingQueuePlausibility: debugRecord.loadingQueuePlausibility,
            operationalEvidenceConfidence: debugRecord.operationalEvidenceConfidence,
            operationalReasons: debugRecord.operationalReasons,
          }
        : undefined,
      loadingEvent: {
        arrivalDraft: voyage.arrivalDraft ?? null,
        departureDraft: voyage.departureDraft ?? vessel.lastDraft ?? null,
        portStayHours: voyage.portStayHours ?? null,
        loadingTerminalText: voyage.loadingTerminalHint ?? departurePort.name,
        departureDetectedAt: voyage.departureDetectedAt,
        departureAt: voyage.departureAt ?? voyage.departureDetectedAt,
        arrivalAt: voyage.arrivalAt ?? null,
        timeSinceDepartureHours,
        departureTimestampConfidence: voyage.departureAt ? "high" : "medium",
        arrivalTimestampConfidence: voyage.arrivalAt ? "high" : "low",
        terminalMatchConfidenceHint: undefined,
      },
      historicalCommercialProfile: debugRecord?.vesselHistoricalProfile,
      destinationHistory: debugRecord?.historicalDestinationSeries ?? undefined,
      destinationEvolution:
        debugRecord &&
        typeof debugRecord.destinationEvolutionScore === "number" &&
        typeof debugRecord.destinationMoroccoConfidence === "number" &&
        typeof debugRecord.destinationContradictionScore === "number" &&
        typeof debugRecord.destinationConsistencyScore === "number"
          ? {
              destinationEvolutionScore: debugRecord.destinationEvolutionScore,
              destinationMoroccoConfidence: debugRecord.destinationMoroccoConfidence,
              destinationContradictionScore: debugRecord.destinationContradictionScore,
              destinationConsistencyScore: debugRecord.destinationConsistencyScore,
              destinationEvolutionReasons: debugRecord.destinationEvolutionReasons ?? [],
            }
          : undefined,
      portCommodityPriorScores: debugRecord?.portCommodityPriorScores,
      contradictionSignal:
        debugRecord &&
        typeof debugRecord.contradictionScore === "number"
          ? {
              contradictionScore: debugRecord.contradictionScore,
              contradictionReasons: debugRecord.contradictionReasons ?? [],
            }
          : undefined,
      voyageState:
        debugRecord && debugRecord.vesselVoyageState
          ? {
              vesselVoyageState: debugRecord.vesselVoyageState,
              voyageStateConfidence: debugRecord.voyageStateConfidence ?? "low",
              voyageStateReasons: debugRecord.voyageStateReasons ?? [],
            }
          : undefined,
    });

    if (mode === "live") {
      const missingSignals = detectSparseLiveSignals({
        destinationText: voyage.destinationText,
        eta: voyage.eta,
        departurePortCode: departurePort.code,
        previousPortCode: previousPort.code,
        deadweight: vessel.deadweight,
        draft: vessel.lastDraft,
      });
      scoring = applySparseDataGuard(scoring, missingSignals);
      scoring = applyTemporalEvidenceAdjustment(scoring, voyage);
    }

    const fallbackTarget = destinationPort ??
      moroccoPorts.find((port) => port.name === estimatedMorocco.nearestMoroccoPort) ??
      moroccoPorts[0];

    const routePoints = [
      {
        lat: departurePort.lat,
        lon: departurePort.lon,
        label: `Departure: ${departurePort.name}`,
      },
      {
        lat: currentLat,
        lon: currentLon,
        label: `Current: ${vessel.name}`,
      },
      {
        lat: fallbackTarget?.lat ?? currentLat,
        lon: fallbackTarget?.lon ?? currentLon,
        label: `Hypothesis target: ${fallbackTarget?.name ?? "Morocco"}`,
      },
    ];

    const firstSeenAt = voyage.firstSeenAt ?? null;
    const lastSeenAt = voyage.lastSeenAt ?? lastSignalAt;
    const firstRelevantSeenAt = voyage.firstRelevantSeenAt ?? null;
    const lastRelevantSeenAt = voyage.lastRelevantSeenAt ?? null;
    const observationCount = voyage.observationCount ?? 1;
    const evidenceAgeHours = firstSeenAt
      ? Math.max(0, Number(((Date.now() - new Date(firstSeenAt).getTime()) / 3_600_000).toFixed(1)))
      : 0;

    enriched.push({
      id: vessel.id,
      name: vessel.name,
      imo: vessel.imo,
      mmsi: vessel.mmsi,
      vesselType: vessel.vesselType,
      flag: vessel.flag,
      deadweight: vessel.deadweight,
      lastDraft: vessel.lastDraft,
      length: vessel.length,
      width: vessel.width,
      previousPort: previousPort.name,
      previousPortCode: previousPort.code,
      previousPortCountry: previousPort.country,
      departurePort: departurePort.name,
      departurePortCode: departurePort.code,
      departureCountry: departurePort.country,
      departureDetectedAt,
      timeSinceDepartureHours,
      destinationPort: destinationPort?.name ?? "Unknown",
      destinationPortCode: destinationPort?.code ?? "UNK",
      destinationPortCountry: destinationPort?.country ?? "Unknown",
      destinationText: voyage.destinationText,
      originCountry: voyage.originCountry,
      eta: voyage.eta,
      lastSignalAt,
      currentLat,
      currentLon,
      speed,
      course,
      heading,
      currentMaritimeZone,
      suspectedDestinationRegion,
      estimatedDaysToMorocco: estimatedMorocco.estimatedDays,
      detectionPhase: scoring.detectionPhase,
      moroccoBoundScore: scoring.moroccoBoundScore,
      agriCargoScore: scoring.agriCargoScore,
      loadingSignalScore: scoring.loadingSignalScore,
      draftDelta: scoring.draftDelta,
      portStayHours: scoring.portStayHours,
      loadingTerminalMatch: scoring.loadingTerminalMatch,
      loadingConfidence: scoring.loadingConfidence,
      loadingEvidenceStrength: scoring.loadingEvidenceStrength,
      missingCriticalSignals: scoring.missingCriticalSignals,
      matchedTerminalName: scoring.matchedTerminalName,
      matchedTerminalType: scoring.matchedTerminalType,
      terminalMatchConfidence: scoring.terminalMatchConfidence,
      portStayConfidence: scoring.portStayConfidence,
      arrivalDraftEstimate: scoring.arrivalDraftEstimate,
      departureDraftEstimate: scoring.departureDraftEstimate,
      arrivalDraftConfidence: scoring.arrivalDraftConfidence,
      departureDraftConfidence: scoring.departureDraftConfidence,
      draftDeltaConfidence: scoring.draftDeltaConfidence,
      commodityScores: scoring.commodityScores,
      mostLikelyCommodity: scoring.mostLikelyCommodity,
      commodityConfidenceLabel: scoring.commodityConfidenceLabel,
      topVoyageHypothesis: scoring.topVoyageHypothesis,
      topVoyageHypothesisScore: scoring.topVoyageHypothesisScore,
      topVoyageHypothesisConfidence: scoring.topVoyageHypothesisConfidence,
      topVoyageHypothesisProbability: scoring.topVoyageHypothesisProbability,
      voyageHypothesisEvidenceStyle: scoring.voyageHypothesisEvidenceStyle,
      voyageHypothesisReasons: scoring.voyageHypothesisReasons,
      alternativeVoyageHypotheses: scoring.alternativeVoyageHypotheses,
      missingSignalsForVoyageConfirmation: scoring.missingSignalsForVoyageConfirmation,
      voyageTemplatePosteriorProbabilities: scoring.voyageTemplatePosteriorProbabilities,
      voyageTemplateEntropy: scoring.voyageTemplateEntropy,
      matchedCommodityKnowledgeNode: scoring.matchedCommodityKnowledgeNode,
      terminalCommodityProfile: scoring.terminalCommodityProfile,
      vesselClassKnowledgeProfile: scoring.vesselClassKnowledgeProfile,
      destinationKnowledgeProfile: scoring.destinationKnowledgeProfile,
      knowledgeBasedCommodityReasons: scoring.knowledgeBasedCommodityReasons,
      knowledgeSupportScore: scoring.knowledgeSupportScore,
      knowledgeAgriScoreDelta: scoring.knowledgeAgriScoreDelta,
      knowledgeCommodityScoreBoost: scoring.knowledgeCommodityScoreBoost,
      knowledgeCommodityScoreDeltas: scoring.knowledgeCommodityScoreDeltas,
      knowledgeMatchedTerminalIntelligence: scoring.knowledgeMatchedTerminalIntelligence,
      knowledgeMatchedCommodityProfile: scoring.knowledgeMatchedCommodityProfile,
      knowledgeDestinationIntelligenceSupport: scoring.knowledgeDestinationIntelligenceSupport,
      vesselHistoricalProfile: scoring.vesselHistoricalProfile,
      vesselVoyageState: scoring.vesselVoyageState,
      voyageStateConfidence: scoring.voyageStateConfidence,
      voyageStateReasons: scoring.voyageStateReasons,
      destinationEvolutionScore: scoring.destinationEvolutionScore,
      destinationMoroccoConfidence: scoring.destinationMoroccoConfidence,
      destinationContradictionScore: scoring.destinationContradictionScore,
      destinationConsistencyScore: scoring.destinationConsistencyScore,
      destinationEvolutionReasons: scoring.destinationEvolutionReasons,
      portCommodityPriorScores: scoring.portCommodityPriorScores,
      portCommodityPriorReasons: scoring.portCommodityPriorReasons,
      contradictionScore: scoring.contradictionScore,
      contradictionReasons: scoring.contradictionReasons,
      ensembleEvidenceBreakdown: scoring.ensembleEvidenceBreakdown,
      dataCompletenessScore: scoring.dataCompletenessScore,
      confidencePenalty: scoring.confidencePenalty,
      predictionConfidenceBand: scoring.predictionConfidenceBand,
      missingCriticalPredictionSignals: scoring.missingCriticalPredictionSignals,
      commodityPriorProbabilities: scoring.commodityPriorProbabilities,
      commodityPosteriorProbabilities: scoring.commodityPosteriorProbabilities,
      commodityEvidenceAdjustments: scoring.commodityEvidenceAdjustments,
      predictionEntropy: scoring.predictionEntropy,
      evidenceCoverageScore: scoring.evidenceCoverageScore,
      uncertaintyPenalty: scoring.uncertaintyPenalty,
      informationValueSignals: scoring.informationValueSignals,
      missingInformationValueRanking: scoring.missingInformationValueRanking,
      seasonalAdjustmentScore: scoring.seasonalAdjustmentScore,
      seasonalReasoning: scoring.seasonalReasoning,
      commercialPatternSimilarityScore: scoring.commercialPatternSimilarityScore,
      moroccoBoundReasons: scoring.moroccoBoundReasons,
      agriCargoReasons: scoring.agriCargoReasons,
      commodityReasons: scoring.commodityReasons,
      routePoints,
      score: scoring.moroccoBoundScore,
      confidenceLevel: scoring.confidenceLevel,
      reasons: scoring.moroccoBoundReasons,
      firstSeenAt,
      lastSeenAt,
      firstRelevantSeenAt,
      lastRelevantSeenAt,
      observationCount,
      evidenceAgeHours,
      scoreTrend: voyage.scoreTrend ?? "flat",
      loadingTrend: voyage.loadingTrend ?? "flat",
      confidenceImprovedOverTime: voyage.confidenceImprovedOverTime ?? false,
      rollingRetentionReason: voyage.rollingRetentionReason ?? "Current live observation in rolling window.",
    });
  }

  return enriched.sort(sortVessels);
}

async function buildRadarVessels(provider: AISProvider, mode: "mock" | "live") {
  const voyages = await fetchTrackedVoyages(provider, mode);
  return hydrateVessels(provider, voyages, mode);
}

async function collectRecentPortCalls(provider: AISProvider, ports: PortRecord[]) {
  const shouldFetchPortCalls = (process.env.RADAR_LIVE_FETCH_PORT_CALLS ?? "false").toLowerCase() === "true";
  if (!shouldFetchPortCalls) {
    return [];
  }

  if (livePortCallsCache && Date.now() - livePortCallsCache.fetchedAt <= LIVE_PORT_CALLS_CACHE_TTL_MS) {
    return livePortCallsCache.calls;
  }

  const moroccoPorts = ports.filter((port) => port.isMoroccoDestination);
  const callsByPort = await Promise.allSettled(
    moroccoPorts.map((port) => provider.getPortCalls(port.code)),
  );

  const calls: PortCallRecord[] = [];
  for (const result of callsByPort) {
    if (result.status === "fulfilled") {
      calls.push(...result.value);
    }
  }

  livePortCallsCache = {
    fetchedAt: Date.now(),
    calls,
  };

  return livePortCallsCache.calls;
}

async function refreshLiveCache(provider: AISProvider, sourceProvider: string) {
  if (liveRefreshPromise) {
    return liveRefreshPromise;
  }

  liveRefreshPromise = (async () => {
    const vessels = await buildRadarVessels(provider, "live");
    const ports = await provider.getPorts();
    const portCalls = await collectRecentPortCalls(provider, ports);

    console.info(
      `[RadarUsage] live-refresh provider=${sourceProvider} usageProfile=${getUsageProfile()} vessels=${vessels.length} portCalls=${portCalls.length}`,
    );

    const persistence = await persistLiveRadarSnapshot({
      provider: sourceProvider,
      ports,
      vessels,
      portCalls,
    });

    let warning: string | undefined;
    if (!persistence.persisted) {
      if (persistence.errorCode === "DB_UNAVAILABLE") {
        if (!dbUnavailableLogged) {
          console.warn(
            `[RadarPersistence] Database unavailable; continuing live radar without persistence (${persistence.error ?? "unknown"}).`,
          );
          dbUnavailableLogged = true;
        }
      } else {
        warning = `Live AIS fetched but DB persistence failed: ${persistence.error ?? "unknown error"}`;
        console.warn(`[RadarPersistence] ${warning}`);
      }
    } else if (dbUnavailableLogged) {
      console.info("[RadarPersistence] Database connectivity restored; live snapshot persistence resumed.");
      dbUnavailableLogged = false;
    }

    const payload = {
      fetchedAt: Date.now(),
      vessels,
      warning,
    };

    liveCache = payload;
    return payload;
  })().finally(() => {
    liveRefreshPromise = null;
  });

  return liveRefreshPromise;
}

function buildSource(params: {
  mode: "mock" | "live";
  provider: string;
  fallbackToMock?: boolean;
  warning?: string;
  cacheAgeSeconds?: number;
}): RadarDataSource {
  const sourceLabel =
    params.mode === "mock"
      ? "Mock data"
      : getRuntimeSourceLabel({
          mode: "live",
          provider:
            params.provider === "hybrid" ||
            params.provider === "vesselfinder" ||
            params.provider === "marinetraffic"
              ? params.provider
              : "vesselfinder",
          liveProviderImplemented:
            params.provider === "hybrid" ||
            params.provider === "vesselfinder",
          validationError: null,
        });

  return {
    mode: params.mode,
    provider: params.provider,
    label: sourceLabel,
    fallbackToMock: Boolean(params.fallbackToMock),
    warning: params.warning,
    cacheAgeSeconds: params.cacheAgeSeconds,
  };
}

async function getRadarFeedWithRuntime(
  runtime: ReturnType<typeof getRadarRuntimeConfig>,
  filters: VesselFilters = {},
): Promise<RadarFeed> {
  const liveProvider = runtime.provider === "mock" ? "vesselfinder" : runtime.provider;

  if (runtime.mode === "mock") {
    const vessels = await buildRadarVessels(getMockAISProvider(), "mock");
    return {
      vessels: applyFavoritesAndFilters(vessels, filters),
      source: buildSource({ mode: "mock", provider: "mock" }),
    };
  }

  if (runtime.validationError) {
    const fallbackVessels = await buildRadarVessels(getMockAISProvider(), "mock");
    return {
      vessels: applyFavoritesAndFilters(fallbackVessels, filters),
      source: buildSource({
        mode: "mock",
        provider: "mock",
        fallbackToMock: true,
        warning: runtime.validationError,
      }),
      warning: runtime.validationError,
    };
  }

  try {
    const currentRuntime = getRadarRuntimeConfig();
    const provider =
      runtime.mode === currentRuntime.mode && runtime.provider === currentRuntime.provider
        ? getAISProvider()
        : getAISProviderForSelection({
            forceMode: runtime.mode,
            forceProvider: runtime.provider,
          });
    const hasFreshCache = Boolean(liveCache && Date.now() - liveCache.fetchedAt <= LIVE_CACHE_TTL_MS);
    const cachedOrFresh =
      hasFreshCache && liveCache
        ? liveCache
        : await refreshLiveCache(provider, liveProvider);

    const cacheAgeSeconds = Math.max(0, Math.round((Date.now() - cachedOrFresh.fetchedAt) / 1000));

    return {
      vessels: applyFavoritesAndFilters(cachedOrFresh.vessels, filters),
      source: buildSource({
        mode: "live",
        provider: liveProvider,
        warning: cachedOrFresh.warning,
        cacheAgeSeconds,
      }),
      warning: cachedOrFresh.warning,
    };
  } catch (error) {
    const message =
      error instanceof Error
        ? `Live AIS mode failed: ${error.message}. Falling back to mock data.`
        : "Live AIS mode failed with an unknown error. Falling back to mock data.";
    console.warn(`[RadarUsage] ${message}`);
    const fallbackVessels = await buildRadarVessels(getMockAISProvider(), "mock");
    return {
      vessels: applyFavoritesAndFilters(fallbackVessels, filters),
      source: buildSource({
        mode: "mock",
        provider: "mock",
        fallbackToMock: true,
        warning: message,
      }),
      warning: message,
    };
  }
}

export async function getRadarFeed(filters: VesselFilters = {}): Promise<RadarFeed> {
  const runtime = getRadarRuntimeConfig();
  return getRadarFeedWithRuntime(runtime, filters);
}

export async function getRadarFeedForMode(
  mode: "mock" | "live",
  filters: VesselFilters = {},
): Promise<RadarFeed> {
  const runtime = getRadarRuntimeConfig({ forceMode: mode });
  return getRadarFeedWithRuntime(runtime, filters);
}

export async function getLiveValidationPayload(feed: RadarFeed): Promise<LiveValidationPayload> {
  let debugRecords: HybridNormalizationDebugRecord[] = [];
  let acquisitionSummary: LiveAcquisitionSummary | null = null;
  let rollingSummary: LiveRollingWindowSummary | null = null;
  let watchlistSummary: LiveWatchlistSummary | null = null;

  if (feed.source.mode === "live") {
    try {
      const provider = getAISProvider();
      debugRecords = getHybridDebugRecords(provider);
      acquisitionSummary = getHybridAcquisitionSummary(provider);
      rollingSummary = getHybridRollingSummary(provider);
      watchlistSummary = getHybridWatchlistSummary(provider);
    } catch (error) {
      const message = error instanceof Error ? error.message : "unknown provider error";
      console.warn(`[RadarValidation] Unable to extract provider debug metadata: ${message}`);
    }
  }

  const vesselById = new Map(feed.vessels.map((vessel) => [vessel.id, vessel]));
  const rawEntries =
    debugRecords.length > 0
      ? debugRecords.map((record) =>
          buildValidationEntryFromDebug(record, vesselById.get(record.vesselId)),
        )
      : feed.vessels.map((vessel) => buildFallbackValidationEntry(vessel));

  const admittedEntries = rawEntries.filter(
    (entry) => entry.admissionDecision === "included",
  );
  const watchlistTopCandidates = rawEntries
    .filter(
      (entry) =>
        entry.admissionDecision === "excluded" &&
        (entry.watchlistDecision === "entered" || entry.watchlistDecision === "retained"),
    )
    .sort((a, b) => {
      if (b.watchlistPriorityScore !== a.watchlistPriorityScore) {
        return b.watchlistPriorityScore - a.watchlistPriorityScore;
      }
      if (b.promotionReadinessScore !== a.promotionReadinessScore) {
        return b.promotionReadinessScore - a.promotionReadinessScore;
      }
      return b.observationCount - a.observationCount;
    })
    .slice(0, 10);

  return {
    mode: feed.source.mode,
    provider: feed.source.provider,
    generatedAt: new Date().toISOString(),
    acquisition: acquisitionSummary,
    rollingWindow: rollingSummary,
    watchlist: watchlistSummary,
    gfw: summarizeGfwEvidence(rawEntries),
    operational: summarizeOperationalEvidence(rawEntries),
    knowledge: summarizeKnowledgeEvidence(rawEntries),
    loadingEvidence: summarizeLoadingEvidence(rawEntries),
    quality: summarizeLiveDataQuality(rawEntries),
    vessels: admittedEntries,
    rawDetections: rawEntries,
    watchlistTopCandidates,
  };
}

export async function getLiveEvaluationPayload(
  feed: RadarFeed,
  options: { windowHours?: number } = {},
): Promise<LiveEvaluationPayload> {
  const windowHours = normalizeEvaluationWindowHours(options.windowHours);
  const generatedAt = new Date().toISOString();
  const windowStart = new Date(Date.now() - windowHours * 3_600_000).toISOString();

  const emptyPayload: LiveEvaluationPayload = {
    mode: feed.source.mode,
    provider: feed.source.provider,
    generatedAt,
    windowHours,
    windowStart,
    totals: {
      totalRawDetections: 0,
      dryBulkCompatibleDetections: 0,
      watchlistEntries: 0,
      reEnrichments: 0,
      promotedVessels: 0,
      admittedRadarVessels: 0,
      excludedVesselsByReason: [],
      vesselsWithExportKnowledgeMatch: 0,
      vesselsWithTerminalMatch: 0,
      vesselsWithDestinationIntelligence: 0,
      vesselsWithUsableLoadingEvidence: 0,
      vesselsWithImprovingEvidenceOverTime: 0,
      vesselsImprovedByGfwHistoricalEvidence: 0,
      vesselsWithRepeatedExportPatternViaGfw: 0,
      vesselsWithRepeatedMoroccoPatternViaGfw: 0,
      vesselsImprovedByOperationalSignals: 0,
      operationalSignalsHelpedWatchlistPriorityCount: 0,
      operationalSignalsHelpedPromotionReadinessCount: 0,
    },
    timeMetrics: {
      trackedVessels: 0,
      averageObservationCountPerTrackedVessel: 0,
      averageWatchlistDurationHours: 0,
      averageReEnrichmentCount: 0,
      averageEvidenceAgeHours: 0,
      confidenceImprovedVessels: 0,
      confidenceWeakenedVessels: 0,
    },
    rankedOutputs: {
      topWatchlistCandidates: [],
      topPromotedOrAdmittedVessels: [],
      topBlockersPreventingPromotion: [],
      topMissingAliasOrTerminalGaps: [],
      topKnowledgeImpactCases: [],
      topVoyageHypothesesObserved: [],
      voyageHypothesesImprovedOverTime: [],
      vesselsWithClearerInterpretationFromVoyageHypothesis: [],
      mostCommonMissingSignalsForVoyageConfirmation: [],
      gfwClarifiedVoyageHypothesisCases: [],
      portsWithWaitingOrCongestionPatterns: [],
      departuresMadeMeaningfulAfterWaiting: [],
    },
    notes: [],
  };

  if (feed.source.mode !== "live") {
    return {
      ...emptyPayload,
      notes: ["Evaluation mode requires RADAR_DATA_MODE=live."],
    };
  }

  let evaluationSnapshot: HybridEvaluationSnapshot | null = null;
  let fallbackUsed = false;
  try {
    const provider = getAISProvider();
    evaluationSnapshot = getHybridEvaluationSnapshot(provider, windowHours);
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown provider error";
    console.warn(`[RadarEvaluation] Unable to load live provider evaluation snapshot: ${message}`);
  }

  const vesselById = new Map(feed.vessels.map((vessel) => [vessel.id, vessel]));

  type EventEntry = { observedAt: string; entry: LiveVesselValidationEntry };
  let eventEntries: EventEntry[] = [];
  let memoryEntries: HybridEvaluationSnapshot["memory"] = [];

  if (evaluationSnapshot) {
    eventEntries = evaluationSnapshot.events.map((event) => ({
      observedAt: event.observedAt,
      entry: buildValidationEntryFromDebug(event.record, vesselById.get(event.record.vesselId)),
    }));
    memoryEntries = evaluationSnapshot.memory;
  } else {
    fallbackUsed = true;
    const validation = await getLiveValidationPayload(feed);
    eventEntries = validation.rawDetections.map((entry) => ({
      observedAt: validation.generatedAt,
      entry,
    }));
    memoryEntries = [];
  }

  const trackedVesselIds = new Set<string>();
  const exportKnowledgeVessels = new Set<string>();
  const terminalMatchVessels = new Set<string>();
  const destinationIntelVessels = new Set<string>();
  const usableLoadingVessels = new Set<string>();
  const improvingEvidenceVessels = new Set<string>();
  const gfwImprovedVessels = new Set<string>();
  const gfwRepeatedExportPatternVessels = new Set<string>();
  const gfwRepeatedMoroccoPatternVessels = new Set<string>();
  const operationalImprovedVessels = new Set<string>();
  const promotedVesselIds = new Set<string>();
  const admittedVesselIds = new Set<string>();

  const excludedReasonCounts = new Map<string, number>();
  const blockerCounts = new Map<string, number>();

  const gapMap = new Map<
    string,
    { gapType: "alias_gap" | "terminal_gap" | "terminal_port_fallback"; gapKey: string; count: number; examples: Set<string> }
  >();

  const watchlistCandidateMap = new Map<string, LiveEvaluationWatchlistCandidate>();
  const promotedAdmittedMap = new Map<string, LiveEvaluationPromotedVessel>();
  const knowledgeCaseMap = new Map<string, LiveEvaluationKnowledgeCase>();
  const gfwImpactCaseMap = new Map<string, LiveEvaluationGfwImpactCase>();
  const operationalPortMap = new Map<
    string,
    { count: number; waitingTotal: number; congestionTotal: number }
  >();
  const operationalDepartureMap = new Map<string, LiveEvaluationOperationalDepartureCase>();
  const voyageHypothesisStats = new Map<
    string,
    { count: number; totalScore: number; strongCount: number; candidateStyleCount: number }
  >();
  const missingVoyageSignalCounts = new Map<string, number>();
  let operationalSignalsHelpedWatchlistPriorityCount = 0;
  let operationalSignalsHelpedPromotionReadinessCount = 0;
  const voyageProgressByVessel = new Map<
    string,
    {
      vesselId: string;
      vesselName: string;
      firstScore: number;
      lastScore: number;
      firstConfidence: "weak" | "moderate" | "strong";
      lastConfidence: "weak" | "moderate" | "strong";
      lastHypothesis: string;
      lastEvidenceStyle: "explicit_morocco_support" | "candidate_pre_confirmation";
      observationCount: number;
      evidenceImproving: boolean;
      reasons: string[];
    }
  >();
  const eventCountByVessel = new Map<string, number>();

  const addCount = (map: Map<string, number>, key: string) => {
    if (!key) {
      return;
    }
    map.set(key, (map.get(key) ?? 0) + 1);
  };

  const registerGap = (
    gapType: "alias_gap" | "terminal_gap" | "terminal_port_fallback",
    gapKey: string,
    vesselName: string,
  ) => {
    if (!gapKey) {
      return;
    }
    const mapKey = `${gapType}|${gapKey}`;
    const current = gapMap.get(mapKey);
    if (!current) {
      gapMap.set(mapKey, {
        gapType,
        gapKey,
        count: 1,
        examples: new Set([vesselName]),
      });
      return;
    }
    current.count += 1;
    if (current.examples.size < 3) {
      current.examples.add(vesselName);
    }
    gapMap.set(mapKey, current);
  };

  for (const { observedAt, entry } of eventEntries) {
    trackedVesselIds.add(entry.vesselId);
    eventCountByVessel.set(entry.vesselId, (eventCountByVessel.get(entry.vesselId) ?? 0) + 1);

    if (entry.exportMatchedBy !== "none") {
      exportKnowledgeVessels.add(entry.vesselId);
    }
    if (entry.loadingTerminalMatch) {
      terminalMatchVessels.add(entry.vesselId);
    }
    if (entry.knowledgeDestinationIntelligenceSupport) {
      destinationIntelVessels.add(entry.vesselId);
    }
    if (
      entry.loadingEvidenceStrength === "moderate" ||
      entry.loadingEvidenceStrength === "strong" ||
      (entry.draftDelta !== null &&
        (entry.draftDeltaConfidence === "medium" || entry.draftDeltaConfidence === "high"))
    ) {
      usableLoadingVessels.add(entry.vesselId);
    }
    if (
      entry.evidenceImproving ||
      entry.confidenceImprovedOverTime ||
      entry.scoreTrendDirection === "up" ||
      entry.confidenceTrendDirection === "up"
    ) {
      improvingEvidenceVessels.add(entry.vesselId);
    }
    if (
      entry.operationalSupportScore >= 45 &&
      (entry.loadingQueuePlausibility >= 40 ||
        entry.waitingPatternSignal >= 35 ||
        entry.berthProximitySignal >= 35)
    ) {
      operationalImprovedVessels.add(entry.vesselId);
    }
    if (
      entry.operationalSupportScore >= 45 &&
      (entry.watchlistDecision === "entered" ||
        entry.watchlistDecision === "retained" ||
        entry.watchlistDecision === "promoted" ||
        entry.watchlistPriorityScore >= 50)
    ) {
      operationalSignalsHelpedWatchlistPriorityCount += 1;
    }
    if (
      entry.operationalSupportScore >= 45 &&
      entry.promotionReadinessScore >= 55
    ) {
      operationalSignalsHelpedPromotionReadinessCount += 1;
    }
    if (entry.operationalSeededExportArea && (entry.waitingPatternSignal >= 30 || entry.portCongestionSignal >= 20)) {
      const current = operationalPortMap.get(entry.operationalSeededExportArea) ?? {
        count: 0,
        waitingTotal: 0,
        congestionTotal: 0,
      };
      current.count += 1;
      current.waitingTotal += entry.waitingPatternSignal;
      current.congestionTotal += entry.portCongestionSignal;
      operationalPortMap.set(entry.operationalSeededExportArea, current);
    }
    if (
      entry.waitingPatternSignal >= 40 &&
      entry.loadingQueuePlausibility >= 45 &&
      (typeof entry.draftDelta === "number" ? entry.draftDelta >= 0.3 : true)
    ) {
      const existing = operationalDepartureMap.get(entry.vesselId);
      if (!existing || entry.loadingQueuePlausibility > existing.loadingQueuePlausibility) {
        operationalDepartureMap.set(entry.vesselId, {
          vesselId: entry.vesselId,
          vesselName: entry.vesselName,
          portName: entry.operationalSeededExportArea,
          waitingPatternSignal: entry.waitingPatternSignal,
          loadingQueuePlausibility: entry.loadingQueuePlausibility,
          draftDelta: entry.draftDelta,
          reasons: entry.operationalReasons.slice(0, 4),
        });
      }
    }

    if (
      entry.gfwEvidenceConfidence !== "low" &&
      (entry.gfwMoroccoVisitCount > 0 ||
        entry.gfwExportPortVisitCount > 0 ||
        entry.gfwHistoricalRouteHints.length > 0)
    ) {
      gfwImprovedVessels.add(entry.vesselId);
    }
    if (entry.gfwExportPortVisitCount >= 2) {
      gfwRepeatedExportPatternVessels.add(entry.vesselId);
    }
    if (entry.gfwMoroccoVisitCount >= 2) {
      gfwRepeatedMoroccoPatternVessels.add(entry.vesselId);
    }

    const voyageCurrent = voyageHypothesisStats.get(entry.topVoyageHypothesis) ?? {
      count: 0,
      totalScore: 0,
      strongCount: 0,
      candidateStyleCount: 0,
    };
    voyageCurrent.count += 1;
    voyageCurrent.totalScore += entry.topVoyageHypothesisScore;
    if (entry.topVoyageHypothesisConfidence === "strong") {
      voyageCurrent.strongCount += 1;
    }
    if (entry.voyageHypothesisEvidenceStyle === "candidate_pre_confirmation") {
      voyageCurrent.candidateStyleCount += 1;
    }
    voyageHypothesisStats.set(entry.topVoyageHypothesis, voyageCurrent);

    for (const signal of entry.missingSignalsForVoyageConfirmation) {
      addCount(missingVoyageSignalCounts, signal);
    }

    const voyageProgress = voyageProgressByVessel.get(entry.vesselId);
    if (!voyageProgress) {
      voyageProgressByVessel.set(entry.vesselId, {
        vesselId: entry.vesselId,
        vesselName: entry.vesselName,
        firstScore: entry.topVoyageHypothesisScore,
        lastScore: entry.topVoyageHypothesisScore,
        firstConfidence: entry.topVoyageHypothesisConfidence,
        lastConfidence: entry.topVoyageHypothesisConfidence,
        lastHypothesis: entry.topVoyageHypothesis,
        lastEvidenceStyle: entry.voyageHypothesisEvidenceStyle,
        observationCount: 1,
        evidenceImproving: entry.evidenceImproving,
        reasons: entry.voyageHypothesisReasons.slice(0, 4),
      });
    } else {
      voyageProgress.lastScore = entry.topVoyageHypothesisScore;
      voyageProgress.lastConfidence = entry.topVoyageHypothesisConfidence;
      voyageProgress.lastHypothesis = entry.topVoyageHypothesis;
      voyageProgress.lastEvidenceStyle = entry.voyageHypothesisEvidenceStyle;
      voyageProgress.observationCount += 1;
      voyageProgress.evidenceImproving = voyageProgress.evidenceImproving || entry.evidenceImproving;
      if (entry.voyageHypothesisReasons.length > 0) {
        voyageProgress.reasons = entry.voyageHypothesisReasons.slice(0, 4);
      }
      voyageProgressByVessel.set(entry.vesselId, voyageProgress);
    }

    if (entry.admissionDecision === "included") {
      admittedVesselIds.add(entry.vesselId);
    }
    if (entry.watchlistDecision === "promoted" || entry.promotionEligible) {
      promotedVesselIds.add(entry.vesselId);
    }

    if (entry.admissionDecision === "excluded") {
      const reasons = entry.exclusionReasons.length > 0 ? entry.exclusionReasons : ["Excluded without explicit reason"];
      for (const reason of reasons) {
        addCount(excludedReasonCounts, reason);
        addCount(blockerCounts, reason);
      }
    }

    for (const blocker of entry.missingSignalsForPromotion) {
      addCount(blockerCounts, blocker);
    }

    for (const blocker of entry.missingCriticalPredictionSignals) {
      addCount(blockerCounts, blocker);
    }

    if (entry.contradictionScore >= 55) {
      addCount(blockerCounts, "High contradiction evidence");
    } else if (entry.contradictionScore >= 35) {
      addCount(blockerCounts, "Moderate contradiction evidence");
    }

    if (
      entry.exportMatchedBy === "none" &&
      (hasValue(entry.rawDeparturePortData.name) || hasValue(entry.rawDeparturePortData.code)) &&
      entry.acquisitionDryBulkCompatible
    ) {
      registerGap(
        "alias_gap",
        entry.rawDeparturePortData.code || entry.rawDeparturePortData.name || "unknown_export_alias",
        entry.vesselName,
      );
    }

    if (
      entry.terminalMatchedBy === "none" &&
      hasValue(entry.rawDeparturePortData.name) &&
      entry.exportPortRelevant
    ) {
      registerGap(
        "terminal_gap",
        entry.rawDeparturePortData.name ?? "unknown_terminal_alias",
        entry.vesselName,
      );
    }

    if (entry.terminalMatchedBy === "port_fallback" && entry.terminalFallbackLevel === "port") {
      registerGap(
        "terminal_port_fallback",
        entry.inferredDeparturePort || "unknown_port_fallback",
        entry.vesselName,
      );
    }

    if (
      entry.admissionDecision === "excluded" &&
      (entry.watchlistDecision === "entered" || entry.watchlistDecision === "retained")
    ) {
      const current = watchlistCandidateMap.get(entry.vesselId);
      if (!current) {
        watchlistCandidateMap.set(entry.vesselId, {
          vesselId: entry.vesselId,
          vesselName: entry.vesselName,
          observationCount: eventCountByVessel.get(entry.vesselId) ?? 1,
          lastSeenAt: observedAt,
          watchlistPriorityScore: entry.watchlistPriorityScore,
          promotionReadinessScore: entry.promotionReadinessScore,
          reEnrichmentCount: entry.reEnrichmentCount,
          missingSignalsForPromotion: entry.missingSignalsForPromotion,
          watchlistReasons: entry.watchlistReasons.slice(0, 4),
        });
      } else {
        current.observationCount = Math.max(current.observationCount, eventCountByVessel.get(entry.vesselId) ?? 1);
        if (new Date(observedAt).getTime() >= new Date(current.lastSeenAt).getTime()) {
          current.lastSeenAt = observedAt;
          current.missingSignalsForPromotion = entry.missingSignalsForPromotion;
          current.watchlistReasons = entry.watchlistReasons.slice(0, 4);
        }
        current.watchlistPriorityScore = Math.max(current.watchlistPriorityScore, entry.watchlistPriorityScore);
        current.promotionReadinessScore = Math.max(
          current.promotionReadinessScore,
          entry.promotionReadinessScore,
        );
        current.reEnrichmentCount = Math.max(current.reEnrichmentCount, entry.reEnrichmentCount);
        watchlistCandidateMap.set(entry.vesselId, current);
      }
    }

    if (entry.admissionDecision === "included" || entry.watchlistDecision === "promoted") {
      const current = promotedAdmittedMap.get(entry.vesselId);
      if (!current) {
        promotedAdmittedMap.set(entry.vesselId, {
          vesselId: entry.vesselId,
          vesselName: entry.vesselName,
          observationCount: eventCountByVessel.get(entry.vesselId) ?? 1,
          admissionCount: entry.admissionDecision === "included" ? 1 : 0,
          maxAdmissionScore: entry.admissionScore,
          promoted: entry.watchlistDecision === "promoted",
          lastSeenAt: observedAt,
          matchedCommodityKnowledgeNode: entry.matchedCommodityKnowledgeNode,
        });
      } else {
        current.observationCount = Math.max(current.observationCount, eventCountByVessel.get(entry.vesselId) ?? 1);
        current.admissionCount += entry.admissionDecision === "included" ? 1 : 0;
        current.maxAdmissionScore = Math.max(current.maxAdmissionScore, entry.admissionScore);
        current.promoted = current.promoted || entry.watchlistDecision === "promoted";
        if (new Date(observedAt).getTime() >= new Date(current.lastSeenAt).getTime()) {
          current.lastSeenAt = observedAt;
          current.matchedCommodityKnowledgeNode = entry.matchedCommodityKnowledgeNode;
        }
        promotedAdmittedMap.set(entry.vesselId, current);
      }
    }

    if (entry.knowledgeCommodityScoreBoost > 0 || entry.knowledgeAgriScoreDelta > 0) {
      const current = knowledgeCaseMap.get(entry.vesselId);
      if (!current) {
        knowledgeCaseMap.set(entry.vesselId, {
          vesselId: entry.vesselId,
          vesselName: entry.vesselName,
          maxKnowledgeSupportScore: entry.knowledgeSupportScore,
          maxCommodityBoost: entry.knowledgeCommodityScoreBoost,
          maxAgriDelta: entry.knowledgeAgriScoreDelta,
          matchedCommodityKnowledgeNode: entry.matchedCommodityKnowledgeNode,
          reasons: entry.knowledgeBasedCommodityReasons.slice(0, 4),
        });
      } else {
        current.maxKnowledgeSupportScore = Math.max(current.maxKnowledgeSupportScore, entry.knowledgeSupportScore);
        current.maxCommodityBoost = Math.max(current.maxCommodityBoost, entry.knowledgeCommodityScoreBoost);
        current.maxAgriDelta = Math.max(current.maxAgriDelta, entry.knowledgeAgriScoreDelta);
        if (!current.matchedCommodityKnowledgeNode && entry.matchedCommodityKnowledgeNode) {
          current.matchedCommodityKnowledgeNode = entry.matchedCommodityKnowledgeNode;
        }
        if (current.reasons.length === 0 && entry.knowledgeBasedCommodityReasons.length > 0) {
          current.reasons = entry.knowledgeBasedCommodityReasons.slice(0, 4);
        }
        knowledgeCaseMap.set(entry.vesselId, current);
      }
    }

    if (
      entry.gfwEvidenceConfidence !== "low" &&
      entry.topVoyageHypothesis !== "ambiguous_dry_bulk_non_morocco" &&
      entry.topVoyageHypothesisScore >= 58
    ) {
      const existing = gfwImpactCaseMap.get(entry.vesselId);
      if (!existing) {
        gfwImpactCaseMap.set(entry.vesselId, {
          vesselId: entry.vesselId,
          vesselName: entry.vesselName,
          gfwEvidenceConfidence: entry.gfwEvidenceConfidence,
          gfwMoroccoVisitCount: entry.gfwMoroccoVisitCount,
          gfwExportPortVisitCount: entry.gfwExportPortVisitCount,
          gfwHistoricalRouteHints: entry.gfwHistoricalRouteHints.slice(0, 5),
          topVoyageHypothesis: entry.topVoyageHypothesis,
          topVoyageHypothesisScore: entry.topVoyageHypothesisScore,
          reasons: entry.gfwReasons.slice(0, 4),
        });
      } else if (entry.topVoyageHypothesisScore > existing.topVoyageHypothesisScore) {
        existing.gfwEvidenceConfidence = entry.gfwEvidenceConfidence;
        existing.gfwMoroccoVisitCount = Math.max(
          existing.gfwMoroccoVisitCount,
          entry.gfwMoroccoVisitCount,
        );
        existing.gfwExportPortVisitCount = Math.max(
          existing.gfwExportPortVisitCount,
          entry.gfwExportPortVisitCount,
        );
        existing.gfwHistoricalRouteHints = entry.gfwHistoricalRouteHints.slice(0, 5);
        existing.topVoyageHypothesis = entry.topVoyageHypothesis;
        existing.topVoyageHypothesisScore = entry.topVoyageHypothesisScore;
        existing.reasons =
          entry.gfwReasons.length > 0 ? entry.gfwReasons.slice(0, 4) : existing.reasons;
        gfwImpactCaseMap.set(entry.vesselId, existing);
      }
    }
  }

  const memoryByVesselId = new Map(memoryEntries.map((item) => [item.vesselId, item]));
  for (const memory of memoryEntries) {
    trackedVesselIds.add(memory.vesselId);
    if (memory.evidenceImproving || memory.confidenceImprovedOverTime) {
      improvingEvidenceVessels.add(memory.vesselId);
    }
  }

  const observationSamples = Array.from(trackedVesselIds)
    .map((vesselId) => memoryByVesselId.get(vesselId)?.observationCount ?? eventCountByVessel.get(vesselId) ?? 0)
    .filter((value) => value > 0);
  const averageObservationCountPerTrackedVessel =
    observationSamples.length > 0
      ? Number(
          (
            observationSamples.reduce((sum, value) => sum + value, 0) /
            observationSamples.length
          ).toFixed(1),
        )
      : 0;

  const watchlistDurations = memoryEntries
    .filter((item) => item.watchlistEnteredAt)
    .map((item) => {
      const startedAtMs = item.watchlistEnteredAt ? new Date(item.watchlistEnteredAt).getTime() : Date.now();
      const endedAtMs = item.watchlistLastUpdatedAt
        ? new Date(item.watchlistLastUpdatedAt).getTime()
        : new Date(item.lastSeenAt).getTime();
      return Math.max(0, (endedAtMs - startedAtMs) / 3_600_000);
    });
  const averageWatchlistDurationHours =
    watchlistDurations.length > 0
      ? Number(
          (
            watchlistDurations.reduce((sum, value) => sum + value, 0) /
            watchlistDurations.length
          ).toFixed(1),
        )
      : 0;

  const reEnrichmentSamples = memoryEntries
    .filter((item) => item.watchlistEnteredAt)
    .map((item) => item.watchlistReEnrichmentCount);
  const averageReEnrichmentCount =
    reEnrichmentSamples.length > 0
      ? Number(
          (
            reEnrichmentSamples.reduce((sum, value) => sum + value, 0) /
            reEnrichmentSamples.length
          ).toFixed(1),
        )
      : 0;

  const evidenceAgeSamples = memoryEntries.map((item) => {
    const baseTimestamp = item.firstRelevantSeenAt ?? item.firstSeenAt;
    return Math.max(0, (Date.now() - new Date(baseTimestamp).getTime()) / 3_600_000);
  });
  const averageEvidenceAgeHours =
    evidenceAgeSamples.length > 0
      ? Number(
          (
            evidenceAgeSamples.reduce((sum, value) => sum + value, 0) / evidenceAgeSamples.length
          ).toFixed(1),
        )
      : 0;

  const confidenceImprovedVessels = memoryEntries.filter((item) => item.confidenceImprovedOverTime).length;
  const confidenceWeakenedVessels = memoryEntries.filter(
    (item) => item.evidenceWeakening || item.confidenceTrend === "down",
  ).length;

  const toSortedReasonCounts = (map: Map<string, number>) =>
    Array.from(map.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 12)
      .map(([reason, count]) => ({ reason, count }));

  const topWatchlistCandidates = Array.from(watchlistCandidateMap.values())
    .sort((a, b) => {
      if (b.watchlistPriorityScore !== a.watchlistPriorityScore) {
        return b.watchlistPriorityScore - a.watchlistPriorityScore;
      }
      if (b.promotionReadinessScore !== a.promotionReadinessScore) {
        return b.promotionReadinessScore - a.promotionReadinessScore;
      }
      return b.observationCount - a.observationCount;
    })
    .slice(0, 10);

  const topPromotedOrAdmittedVessels = Array.from(promotedAdmittedMap.values())
    .sort((a, b) => {
      if (a.promoted !== b.promoted) {
        return a.promoted ? -1 : 1;
      }
      if (b.maxAdmissionScore !== a.maxAdmissionScore) {
        return b.maxAdmissionScore - a.maxAdmissionScore;
      }
      return b.admissionCount - a.admissionCount;
    })
    .slice(0, 10);

  const topKnowledgeImpactCases = Array.from(knowledgeCaseMap.values())
    .sort((a, b) => {
      const scoreA = a.maxKnowledgeSupportScore + a.maxCommodityBoost * 1.4 + a.maxAgriDelta * 0.8;
      const scoreB = b.maxKnowledgeSupportScore + b.maxCommodityBoost * 1.4 + b.maxAgriDelta * 0.8;
      return scoreB - scoreA;
    })
    .slice(0, 10);

  const gfwClarifiedVoyageHypothesisCases = Array.from(gfwImpactCaseMap.values())
    .sort((a, b) => {
      if (b.topVoyageHypothesisScore !== a.topVoyageHypothesisScore) {
        return b.topVoyageHypothesisScore - a.topVoyageHypothesisScore;
      }
      if (b.gfwEvidenceConfidence !== a.gfwEvidenceConfidence) {
        const score = { high: 3, medium: 2, low: 1 } as const;
        return score[b.gfwEvidenceConfidence] - score[a.gfwEvidenceConfidence];
      }
      return b.gfwMoroccoVisitCount + b.gfwExportPortVisitCount - (a.gfwMoroccoVisitCount + a.gfwExportPortVisitCount);
    })
    .slice(0, 10);

  const portsWithWaitingOrCongestionPatterns = Array.from(operationalPortMap.entries())
    .map(([portName, stats]) => ({
      portName,
      observations: stats.count,
      averageWaitingPatternSignal: Number((stats.waitingTotal / Math.max(1, stats.count)).toFixed(1)),
      averagePortCongestionSignal: Number((stats.congestionTotal / Math.max(1, stats.count)).toFixed(1)),
    }))
    .sort((a, b) => {
      if (b.observations !== a.observations) {
        return b.observations - a.observations;
      }
      return (
        b.averageWaitingPatternSignal +
        b.averagePortCongestionSignal -
        (a.averageWaitingPatternSignal + a.averagePortCongestionSignal)
      );
    })
    .slice(0, 10);

  const departuresMadeMeaningfulAfterWaiting = Array.from(operationalDepartureMap.values())
    .sort((a, b) => b.loadingQueuePlausibility - a.loadingQueuePlausibility)
    .slice(0, 10);

  const topVoyageHypothesesObserved = Array.from(voyageHypothesisStats.entries())
    .map(([hypothesisId, stats]) => ({
      hypothesisId,
      count: stats.count,
      averageScore: Number((stats.totalScore / Math.max(1, stats.count)).toFixed(1)),
      strongCount: stats.strongCount,
      candidateStyleCount: stats.candidateStyleCount,
    }))
    .sort((a, b) => {
      if (b.count !== a.count) {
        return b.count - a.count;
      }
      return b.averageScore - a.averageScore;
    })
    .slice(0, 8);

  const voyageHypothesesImprovedOverTime = Array.from(voyageProgressByVessel.values())
    .filter((item) => {
      const scoreImproved = item.lastScore - item.firstScore >= 6;
      const confidenceImproved =
        (item.firstConfidence === "weak" && item.lastConfidence !== "weak") ||
        (item.firstConfidence === "moderate" && item.lastConfidence === "strong");
      return (scoreImproved || confidenceImproved || item.evidenceImproving) && item.observationCount >= 2;
    })
    .sort((a, b) => (b.lastScore - b.firstScore) - (a.lastScore - a.firstScore))
    .slice(0, 10)
    .map((item) => ({
      vesselId: item.vesselId,
      vesselName: item.vesselName,
      topVoyageHypothesis: item.lastHypothesis,
      topVoyageHypothesisScore: item.lastScore,
      topVoyageHypothesisConfidence: item.lastConfidence,
      evidenceStyle: item.lastEvidenceStyle,
      observationCount: item.observationCount,
      evidenceImproving: item.evidenceImproving,
      reasons: item.reasons,
    }));

  const vesselsWithClearerInterpretationFromVoyageHypothesis = Array.from(
    voyageProgressByVessel.values(),
  )
    .filter(
      (item) =>
        item.lastHypothesis !== "ambiguous_dry_bulk_non_morocco" &&
        (item.lastScore >= 68 ||
          item.lastConfidence === "strong" ||
          (item.lastConfidence === "moderate" && item.observationCount >= 2)),
    )
    .sort((a, b) => b.lastScore - a.lastScore)
    .slice(0, 10)
    .map((item) => ({
      vesselId: item.vesselId,
      vesselName: item.vesselName,
      topVoyageHypothesis: item.lastHypothesis,
      topVoyageHypothesisScore: item.lastScore,
      topVoyageHypothesisConfidence: item.lastConfidence,
      evidenceStyle: item.lastEvidenceStyle,
      observationCount: item.observationCount,
      evidenceImproving: item.evidenceImproving,
      reasons: item.reasons,
    }));

  const topMissingAliasOrTerminalGaps = Array.from(gapMap.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, 10)
    .map((item) => ({
      gapType: item.gapType,
      gapKey: item.gapKey,
      count: item.count,
      vesselExamples: Array.from(item.examples),
    }));

  const notes: string[] = [];
  if (fallbackUsed) {
    notes.push("Hybrid rolling evaluation snapshot unavailable; showing current live snapshot only.");
  }
  if (eventEntries.length === 0) {
    notes.push("No live detections available in the requested evaluation window.");
  }
  if (topPromotedOrAdmittedVessels.length === 0) {
    notes.push("No promoted/admitted vessels found in this window.");
  }
  if (topWatchlistCandidates.length === 0) {
    notes.push("No watchlist candidates retained in this window.");
  }
  if (portsWithWaitingOrCongestionPatterns.length === 0) {
    notes.push("No strong seeded-port waiting/congestion operational patterns detected in this window.");
  }

  return {
    mode: feed.source.mode,
    provider: feed.source.provider,
    generatedAt,
    windowHours,
    windowStart,
    totals: {
      totalRawDetections: eventEntries.length,
      dryBulkCompatibleDetections: eventEntries.filter(({ entry }) => entry.acquisitionDryBulkCompatible).length,
      watchlistEntries: eventEntries.filter(({ entry }) => entry.watchlistDecision === "entered").length,
      reEnrichments: eventEntries.filter(
        ({ entry }) =>
          (entry.watchlistDecision === "entered" || entry.watchlistDecision === "retained") &&
          entry.enrichmentAttempted &&
          !entry.promotionEligible,
      ).length,
      promotedVessels: promotedVesselIds.size,
      admittedRadarVessels: admittedVesselIds.size,
      excludedVesselsByReason: toSortedReasonCounts(excludedReasonCounts),
      vesselsWithExportKnowledgeMatch: exportKnowledgeVessels.size,
      vesselsWithTerminalMatch: terminalMatchVessels.size,
      vesselsWithDestinationIntelligence: destinationIntelVessels.size,
      vesselsWithUsableLoadingEvidence: usableLoadingVessels.size,
      vesselsWithImprovingEvidenceOverTime: improvingEvidenceVessels.size,
      vesselsImprovedByGfwHistoricalEvidence: gfwImprovedVessels.size,
      vesselsWithRepeatedExportPatternViaGfw: gfwRepeatedExportPatternVessels.size,
      vesselsWithRepeatedMoroccoPatternViaGfw: gfwRepeatedMoroccoPatternVessels.size,
      vesselsImprovedByOperationalSignals: operationalImprovedVessels.size,
      operationalSignalsHelpedWatchlistPriorityCount:
        operationalSignalsHelpedWatchlistPriorityCount,
      operationalSignalsHelpedPromotionReadinessCount:
        operationalSignalsHelpedPromotionReadinessCount,
    },
    timeMetrics: {
      trackedVessels: trackedVesselIds.size,
      averageObservationCountPerTrackedVessel,
      averageWatchlistDurationHours,
      averageReEnrichmentCount,
      averageEvidenceAgeHours,
      confidenceImprovedVessels,
      confidenceWeakenedVessels,
    },
    rankedOutputs: {
      topWatchlistCandidates,
      topPromotedOrAdmittedVessels,
      topBlockersPreventingPromotion: toSortedReasonCounts(blockerCounts),
      topMissingAliasOrTerminalGaps,
      topKnowledgeImpactCases,
      topVoyageHypothesesObserved,
      voyageHypothesesImprovedOverTime,
      vesselsWithClearerInterpretationFromVoyageHypothesis,
      mostCommonMissingSignalsForVoyageConfirmation: toSortedReasonCounts(
        missingVoyageSignalCounts,
      ),
      gfwClarifiedVoyageHypothesisCases,
      portsWithWaitingOrCongestionPatterns,
      departuresMadeMeaningfulAfterWaiting,
    },
    notes,
  };
}

export async function getRadarVessels(filters: VesselFilters = {}) {
  const feed = await getRadarFeed(filters);
  return feed.vessels;
}

export async function getRadarVesselById(vesselId: string) {
  const feed = await getRadarFeed();
  return feed.vessels.find((vessel) => vessel.id === vesselId) ?? null;
}

export function getDashboardMetrics(vessels: RadarVessel[]): DashboardMetrics {
  return {
    recentDeparturesDetected: vessels.filter((vessel) => vessel.detectionPhase === "departure_detected").length,
    moroccoBoundSuspected: vessels.filter((vessel) => vessel.detectionPhase === "morocco_bound_suspected").length,
    moroccoBoundLikely: vessels.filter((vessel) => vessel.detectionPhase === "morocco_bound_likely").length,
    agriCargoLikely: vessels.filter((vessel) => vessel.detectionPhase === "agri_cargo_likely").length,
    commodityHypothesesAvailable: vessels.filter(
      (vessel) => vessel.commodityConfidenceLabel !== "weak hypothesis",
    ).length,
  };
}

export function getEarlyDetectedCandidates(vessels: RadarVessel[]) {
  return vessels
    .filter(
      (vessel) =>
        vessel.timeSinceDepartureHours <= 72 &&
        vessel.moroccoBoundScore >= 45 &&
        vessel.agriCargoScore >= 40,
    )
    .sort((a, b) => {
      if (b.moroccoBoundScore !== a.moroccoBoundScore) {
        return b.moroccoBoundScore - a.moroccoBoundScore;
      }
      return a.timeSinceDepartureHours - b.timeSinceDepartureHours;
    });
}

export function getPortOverviews(vessels: RadarVessel[]): PortOverview[] {
  const moroccoVessels = vessels.filter((vessel) => vessel.destinationPortCountry === "Morocco");

  const grouped = new Map<string, RadarVessel[]>();
  for (const vessel of moroccoVessels) {
    const key = `${vessel.destinationPortCode}|${vessel.destinationPort}`;
    const existing = grouped.get(key) ?? [];
    existing.push(vessel);
    grouped.set(key, existing);
  }

  return Array.from(grouped.entries())
    .map(([key, group]): PortOverview => {
      const [portCode, portName] = key.split("|");

      const originCounts = new Map<string, number>();
      const commodityCounts = new Map<string, number>();

      for (const vessel of group) {
        originCounts.set(vessel.departurePort, (originCounts.get(vessel.departurePort) ?? 0) + 1);
        commodityCounts.set(
          vessel.mostLikelyCommodity,
          (commodityCounts.get(vessel.mostLikelyCommodity) ?? 0) + 1,
        );
      }

      const topOriginPorts = Array.from(originCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([name]) => name);

      const topCommodityHypotheses = Array.from(commodityCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 2)
        .map(([name]) => name);

      const nextArrival = [...group].sort((a, b) => new Date(a.eta).getTime() - new Date(b.eta).getTime())[0];
      const avgDays =
        group.reduce((sum, vessel) => sum + vessel.estimatedDaysToMorocco, 0) / Math.max(1, group.length);

      return {
        portId: portCode,
        portName,
        incomingVessels: group.length,
        earlyDetectedLikely: group.filter((vessel) => vessel.moroccoBoundScore >= 60 && vessel.timeSinceDepartureHours <= 72).length,
        topOriginPorts,
        topCommodityHypotheses,
        averageEstimatedDaysToArrival: Number(avgDays.toFixed(1)),
        nextArrivalEta: nextArrival?.eta ?? null,
      };
    })
    .sort((a, b) => b.incomingVessels - a.incomingVessels);
}

function topN(map: Map<string, number>, limit = 8) {
  return Array.from(map.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([name, value]) => ({ name, value }));
}

function agriBins(vessels: RadarVessel[]) {
  const bins = new Map<string, number>([
    ["0-24", 0],
    ["25-49", 0],
    ["50-69", 0],
    ["70-84", 0],
    ["85-100", 0],
  ]);

  for (const vessel of vessels) {
    const score = vessel.agriCargoScore;
    if (score < 25) {
      bins.set("0-24", (bins.get("0-24") ?? 0) + 1);
    } else if (score < 50) {
      bins.set("25-49", (bins.get("25-49") ?? 0) + 1);
    } else if (score < 70) {
      bins.set("50-69", (bins.get("50-69") ?? 0) + 1);
    } else if (score < 85) {
      bins.set("70-84", (bins.get("70-84") ?? 0) + 1);
    } else {
      bins.set("85-100", (bins.get("85-100") ?? 0) + 1);
    }
  }

  return Array.from(bins.entries()).map(([name, value]) => ({ name, value }));
}

export function getAnalyticsPayload(vessels: RadarVessel[]): AnalyticsPayload {
  const recentDepartures = vessels.filter((vessel) => vessel.timeSinceDepartureHours <= 72);

  const departurePorts = new Map<string, number>();
  const departureCountries = new Map<string, number>();
  const phases = new Map<string, number>();
  const commodityDistribution = new Map<string, number>();
  const corridors = new Map<string, number>();

  const daysByPhase = new Map<string, { total: number; count: number }>();

  for (const vessel of vessels) {
    departureCountries.set(vessel.departureCountry, (departureCountries.get(vessel.departureCountry) ?? 0) + 1);
    phases.set(toPhaseLabel(vessel.detectionPhase), (phases.get(toPhaseLabel(vessel.detectionPhase)) ?? 0) + 1);
    commodityDistribution.set(
      vessel.mostLikelyCommodity,
      (commodityDistribution.get(vessel.mostLikelyCommodity) ?? 0) + 1,
    );

    if (vessel.moroccoBoundScore >= 55) {
      corridors.set(vessel.currentMaritimeZone, (corridors.get(vessel.currentMaritimeZone) ?? 0) + 1);
    }

    const phaseLabel = toPhaseLabel(vessel.detectionPhase);
    const current = daysByPhase.get(phaseLabel) ?? { total: 0, count: 0 };
    current.total += vessel.estimatedDaysToMorocco;
    current.count += 1;
    daysByPhase.set(phaseLabel, current);
  }

  for (const vessel of recentDepartures) {
    departurePorts.set(vessel.departurePort, (departurePorts.get(vessel.departurePort) ?? 0) + 1);
  }

  return {
    topRecentDeparturePorts: topN(departurePorts),
    topDepartureCountries: topN(departureCountries),
    vesselsByDetectionPhase: topN(phases, 10),
    averageDaysToMoroccoByPhase: Array.from(daysByPhase.entries()).map(([name, value]) => ({
      name,
      value: Number((value.total / value.count).toFixed(1)),
    })),
    commodityDistribution: topN(commodityDistribution, 6),
    moroccoBoundByCorridor: topN(corridors, 8),
    agriCargoScoreDistribution: agriBins(vessels),
  };
}

export async function getMoroccoDestinationPorts() {
  const runtime = getRadarRuntimeConfig();
  const provider =
    runtime.mode === "live" && !runtime.validationError ? getAISProvider() : getMockAISProvider();
  const ports = await provider.getPorts();
  return ports.filter((port) => port.isMoroccoDestination);
}
