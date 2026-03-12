import { AISProvider } from "@/lib/ais/provider";
import {
  GfwHistoricalProfile,
  GlobalFishingWatchProvider,
} from "@/lib/ais/global-fishing-watch-provider";
import { isPrismaAvailable, prisma } from "@/lib/db/prisma";
import { MOROCCO_PORT_KEYWORDS, PORTS } from "@/lib/data/mock-dataset";
import {
  AISSTREAM_SEEDED_BOUNDING_BOXES,
  deriveCommodityKnowledgeSnapshot,
  destinationLooksMorocco,
  destinationMatchesMoroccoCode,
  isSeededExportUnlocode,
  matchSeededExportPort,
  MOROCCO_PORT_VARIANTS_BY_CODE,
  normalizeLooseText,
  SeededCorridorId,
  SEEDED_CORRIDORS,
  SEEDED_EXPORT_PORTS,
} from "@/lib/data/live-intelligence-config";
import {
  detectLoadingSignal,
  LoadingBehaviorSample,
  LoadingConfidence,
} from "@/lib/intelligence/loading-event";
import {
  assessOperationalSignals,
  OperationalEvidenceConfidence,
} from "@/lib/intelligence/operational-intelligence";
import { evaluateVoyageHypotheses } from "@/lib/intelligence/voyage-hypothesis";
import {
  CommodityConfidenceLabel,
  CommodityType,
  ConfidenceLevel,
  LatestPosition,
  PortCallRecord,
  PortRecord,
  VesselRecord,
  VoyageRecord,
} from "@/lib/types";

const AISSTREAM_URL = "wss://stream.aisstream.io/v0/stream";
const DATALASTIC_BASE_URL = "https://api.datalastic.com/api/v0";
const UNKNOWN_COORDINATE = 0;
const WS_STATE_CONNECTING = 0;
const WS_STATE_OPEN = 1;

const DEFAULT_BOUNDING_BOXES: Array<[[number, number], [number, number]]> = AISSTREAM_SEEDED_BOUNDING_BOXES;

const MOROCCO_DESTINATION_CODES = new Set(
  PORTS.filter((port) => port.isMoroccoDestination).map((port) => port.code.toUpperCase()),
);

const GRAIN_ORIGIN_CODES = new Set(
  PORTS.filter((port) => port.isLikelyGrainOrigin).map((port) => port.code.toUpperCase()),
);

interface CacheSnapshot {
  fetchedAt: number;
  vesselsById: Map<string, VesselRecord>;
  voyagesByVessel: Map<string, VoyageRecord>;
  positionsByVessel: Map<string, LatestPosition>;
  historyByVessel: Map<string, string[]>;
  ports: PortRecord[];
}

interface AISDetection {
  mmsi: string;
  lat: number;
  lon: number;
  speed: number;
  course: number;
  heading: number;
  lastSeenAt: string;
  shipName?: string;
}

interface DatalasticMeta {
  success?: boolean;
  message?: unknown;
  endpoint?: string;
}

interface DatalasticResponse<T> {
  data: T;
  meta?: DatalasticMeta;
}

interface DatalasticVesselPro {
  uuid?: string;
  name?: string | null;
  mmsi?: string | number | null;
  imo?: string | number | null;
  country_iso?: string | null;
  type?: string | null;
  type_specific?: string | null;
  lat?: number | null;
  lon?: number | null;
  speed?: number | null;
  course?: number | null;
  heading?: number | null;
  current_draught?: number | null;
  destination?: string | null;
  dest_port?: string | null;
  dest_port_unlocode?: string | null;
  dep_port?: string | null;
  dep_port_unlocode?: string | null;
  last_position_UTC?: string | null;
  eta_UTC?: string | null;
  atd_UTC?: string | null;
  ata_UTC?: string | null;
  arrival_draught?: number | null;
  arr_draught?: number | null;
  draught_arrival?: number | null;
  dep_terminal?: string | null;
}

interface DatalasticVesselInfo {
  deadweight?: number | null;
  length?: number | null;
  breadth?: number | null;
  draught_avg?: number | null;
  country_iso?: string | null;
}

interface DatalasticPort {
  uuid?: string;
  port_name?: string;
  country_iso?: string;
  country_name?: string;
  unlocode?: string;
  lat?: number;
  lon?: number;
}

export type InferredDepartureConfidence = "high" | "medium" | "low";
export type HybridAdmissionDecision = "included" | "excluded";
export type HybridAcquisitionDecision = "selected" | "rejected";
export type HybridVesselClass =
  | "bulk_carrier"
  | "general_cargo"
  | "dry_cargo_other"
  | "excluded_container"
  | "excluded_tanker"
  | "excluded_tug"
  | "excluded_inland"
  | "excluded_local"
  | "excluded_passenger"
  | "excluded_other";

export type HybridCorridorClassification =
  | SeededCorridorId
  | "irrelevant_pacific_oceania"
  | "irrelevant_inland_europe"
  | "irrelevant_other";

export interface HybridAcquisitionMetrics {
  rawStreamDetections: number;
  screenedDetections: number;
  dryBulkCompatibleDetections: number;
  corridorRelevantDetections: number;
  exportPortRelevantDetections: number;
  moroccoRelevantDetections: number;
  enrichedCandidates: number;
  admittedCandidates: number;
  vesselsWithTerminalMatch: number;
  vesselsWithGrainTerminalMatch: number;
  vesselsWithUsablePortStayEstimate: number;
  vesselsWithUsableDraftDeltaEstimate: number;
  vesselsWithModerateOrStrongLoadingSignal: number;
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

export interface HybridRollingMemoryMetrics {
  rollingWindowHours: number;
  vesselsTrackedInMemory: number;
  vesselsRetainedInRollingWindow: number;
  vesselsUpdatedMultipleTimes: number;
  vesselsWithUsableDraftHistory: number;
  vesselsWithUsableLoadingTrend: number;
  vesselsConfidenceImprovedOverTime: number;
}

export type HybridWatchlistDecision =
  | "not_eligible"
  | "entered"
  | "retained"
  | "promoted"
  | "dropped";

export interface HybridWatchlistMetrics {
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

export interface HybridEvaluationEvent {
  observedAt: string;
  record: HybridNormalizationDebugRecord;
}

export interface HybridRollingMemoryEvaluationEntry {
  vesselId: string;
  vesselName: string;
  firstSeenAt: string;
  lastSeenAt: string;
  firstRelevantSeenAt: string | null;
  lastRelevantSeenAt: string | null;
  observationCount: number;
  relevantObservationCount: number;
  watchlistActive: boolean;
  watchlistEnteredAt: string | null;
  watchlistLastUpdatedAt: string | null;
  watchlistReEnrichmentCount: number;
  watchlistPriorityScore: number;
  promotionReadinessScore: number;
  confidenceImprovedOverTime: boolean;
  evidenceImproving: boolean;
  evidenceWeakening: boolean;
  scoreTrend: TrendDirection;
  confidenceTrend: TrendDirection;
  rollingRetentionReason: string;
}

export interface HybridEvaluationSnapshot {
  generatedAt: string;
  windowHours: number;
  events: HybridEvaluationEvent[];
  memory: HybridRollingMemoryEvaluationEntry[];
}

type TrendDirection = "up" | "flat" | "down";

interface RollingAdmissionSample {
  timestamp: string;
  score: number;
  decision: HybridAdmissionDecision;
}

interface RollingVesselMemory {
  key: string;
  vesselId: string;
  imo: string | null;
  mmsi: string;
  firstSeenAt: string;
  lastSeenAt: string;
  firstRelevantSeenAt: string | null;
  lastRelevantSeenAt: string | null;
  detectionCount: number;
  relevantDetectionCount: number;
  corridorRelevantCount: number;
  destinationSampleCount: number;
  exportRelevantCount: number;
  moroccoRelevantCount: number;
  contradictoryRouteCount: number;
  terminalMatchCount: number;
  grainTerminalMatchCount: number;
  draftSampleCount: number;
  loadingSignalSampleCount: number;
  firstIncludedAt: string | null;
  lastIncludedAt: string | null;
  includedCount: number;
  destinationHistory: string[];
  corridorHistory: HybridCorridorClassification[];
  draftHistory: Array<{ timestamp: string; draft: number | null; draftDelta: number | null }>;
  loadingHistory: Array<{ timestamp: string; score: number }>;
  agriCargoHistory: Array<{ timestamp: string; score: number }>;
  commodityHistory: Array<{ timestamp: string; score: number }>;
  confidenceHistory: Array<{ timestamp: string; score: number }>;
  admissionHistory: RollingAdmissionSample[];
  lastConfidenceLevel: ConfidenceLevel;
  confidenceImprovedOverTime: boolean;
  scoreTrend: TrendDirection;
  loadingTrend: TrendDirection;
  agriCargoTrend: TrendDirection;
  commodityTrend: TrendDirection;
  confidenceTrend: TrendDirection;
  scoreTrendDelta: number;
  loadingTrendDelta: number;
  agriCargoTrendDelta: number;
  commodityTrendDelta: number;
  confidenceTrendDelta: number;
  evidenceImproving: boolean;
  evidenceWeakening: boolean;
  weakEvidenceStreak: number;
  latestDebug: HybridNormalizationDebugRecord | null;
  latestVessel: VesselRecord | null;
  latestVoyage: VoyageRecord | null;
  latestPosition: LatestPosition | null;
  latestRouteHistory: string[];
  rollingRetentionReason: string;
  watchlistActive: boolean;
  watchlistEnteredAt: string | null;
  watchlistLastUpdatedAt: string | null;
  watchlistExpiresAt: string | null;
  watchlistReasons: string[];
  watchlistDropReason: string | null;
  watchlistPromotionReason: string | null;
  watchlistLastEnrichedAt: string | null;
  watchlistReEnrichmentCount: number;
  watchlistPriorityScore: number;
  watchlistPriorityReasons: string[];
  promotionReadinessScore: number;
  promotionReadinessReasons: string[];
  missingSignalsForPromotion: string[];
  watchlistDecision: HybridWatchlistDecision;
  promotedToRadarCount: number;
  droppedFromWatchlistCount: number;
}

interface TemporalAdmissionAdjustment {
  delta: number;
  reasons: string[];
}

interface SeededAreaAnchor {
  name: string;
  code: string | null;
  lat: number;
  lon: number;
}

interface WatchlistEvaluationContext {
  decision: HybridWatchlistDecision;
  reasons: string[];
  enteredAt: string | null;
  lastUpdatedAt: string | null;
  retentionRemainingHours: number | null;
  reEnrichmentCount: number;
  promotionEligible: boolean;
  promotionReason: string | null;
  dropReason: string | null;
}

export interface HybridNormalizationDebugRecord {
  vesselId: string;
  vesselName: string;
  rollingKey: string;
  sourceMmsi: string;
  rawDestinationText: string | null;
  normalizedDestinationText: string;
  rawVesselType: string | null;
  normalizedVesselType: string;
  normalizedVesselClass: HybridVesselClass;
  rawEta: string | null;
  normalizedEta: string;
  rawDraft: number | null;
  normalizedDraft: number;
  rawDeparturePortName: string | null;
  rawDeparturePortCode: string | null;
  rawPreviousPortName: string | null;
  rawPreviousPortCode: string | null;
  exportMatchedAlias: string | null;
  exportMatchedBy:
    | "code"
    | "alias_exact"
    | "alias_compact"
    | "loose_inclusion"
    | "token_overlap"
    | "none";
  exportMatchConfidenceBand: "exact" | "high" | "medium" | "low";
  inferredDeparturePort: string;
  inferredDepartureConfidence: InferredDepartureConfidence;
  inferredDepartureReason: string;
  corridorClassification: HybridCorridorClassification;
  corridorRelevant: boolean;
  routeCorridorCompatible: boolean;
  exportPortRelevant: boolean;
  destinationTextMoroccoHint: boolean;
  historicalMoroccoRouteRelevant: boolean;
  operationallyRelevant: boolean;
  acquisitionDecision: HybridAcquisitionDecision;
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
  operationalEvidenceConfidence: OperationalEvidenceConfidence;
  operationalReasons: string[];
  repeatedObservedNearSeededExportArea: boolean;
  lowSpeedDurationNearSeededPortHours: number;
  relevantNearbyVesselCount: number;
  operationalSeededExportArea: string | null;
  admissionScore: number;
  admissionDecision: HybridAdmissionDecision;
  exclusionReasons: string[];
  normalizedMoroccoDestination: boolean;
  earlyMoroccoSuspect: boolean;
  weakEvidenceOnly: boolean;
  loadingSignalReasons: string[];
  topVoyageHypothesis: string;
  topVoyageHypothesisScore: number;
  topVoyageHypothesisConfidence: "weak" | "moderate" | "strong";
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
  loadingConfidence: LoadingConfidence;
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
  terminalMatchConfidenceBand: "exact" | "high" | "medium" | "low";
  terminalMatchedAlias: string | null;
  terminalMatchedBy:
    | "terminal_alias_exact"
    | "terminal_alias_compact"
    | "terminal_loose_inclusion"
    | "terminal_token_overlap"
    | "terminal_partial"
    | "port_fallback"
    | "none";
  terminalFallbackLevel: "terminal" | "port" | "none";
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
  portStayConfidence: "low" | "medium" | "high";
  arrivalDraftEstimate: number | null;
  departureDraftEstimate: number | null;
  arrivalDraftConfidence: "low" | "medium" | "high";
  departureDraftConfidence: "low" | "medium" | "high";
  draftDeltaConfidence: "low" | "medium" | "high";
  grainTerminalMatch: boolean;
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
  firstSeenAt: string | null;
  lastSeenAt: string | null;
  firstRelevantSeenAt: string | null;
  lastRelevantSeenAt: string | null;
  observationCount: number;
  historicalDraftSamplesCount: number;
  historicalCorridorSamplesCount: number;
  historicalDestinationSamplesCount: number;
  scoreTrend: TrendDirection;
  scoreTrendDelta: number;
  loadingSignalTrend: TrendDirection;
  loadingSignalTrendDelta: number;
  confidenceImprovedOverTime: boolean;
  rollingWindowRetained: boolean;
  rollingRetentionReason: string;
  temporalAdjustmentReasons: string[];
  watchlistDecision: HybridWatchlistDecision;
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
  scoreTrendDirection: TrendDirection;
  confidenceTrendDirection: TrendDirection;
  evidenceImproving: boolean;
  evidenceWeakening: boolean;
  moroccoBoundTrend: TrendDirection;
  agriCargoTrend: TrendDirection;
  commodityTrend: TrendDirection;
  promotionEligible: boolean;
  promotionReason: string | null;
  dropReason: string | null;
  currentLat: number;
  currentLon: number;
  speed: number;
  course: number;
  heading: number;
  lastSignalAt: string;
}

function toNumber(value: unknown, fallback = 0) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return fallback;
}

function toInteger(value: unknown, fallback = 0) {
  return Math.round(toNumber(value, fallback));
}

function toDateOrNull(value: unknown) {
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed;
}

function toISOStringOrNow(value: unknown) {
  return toDateOrNull(value)?.toISOString() ?? new Date().toISOString();
}

function hoursAgoIso(hours: number) {
  return new Date(Date.now() - Math.max(0, hours) * 3_600_000).toISOString();
}

function hoursFromNowIso(hours: number) {
  return new Date(Date.now() + Math.max(0, hours) * 3_600_000).toISOString();
}

function normalizePortCode(value: string) {
  return value.trim().toUpperCase();
}

function normalizeName(value: string) {
  return normalizeLooseText(value);
}

function slug(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

function cleanString(value: unknown, fallback = "") {
  if (typeof value !== "string") {
    return fallback;
  }

  const cleaned = value.trim();
  return cleaned || fallback;
}

function normalizeDestinationText(value: string) {
  return value.trim().replace(/\s+/g, " ").toUpperCase();
}

function isMoroccoHint(value: string) {
  const normalized = value.toLowerCase();
  return (
    destinationLooksMorocco(value) ||
    MOROCCO_PORT_KEYWORDS.some((keyword) => normalized.includes(keyword))
  );
}

function hasAnyKeyword(value: string, keywords: string[]) {
  return keywords.some((keyword) => value.includes(keyword));
}

interface VesselClassNormalization {
  normalizedVesselType: string;
  normalizedVesselClass: HybridVesselClass;
  dryBulkCompatible: boolean;
  exclusionReason: string | null;
}

function normalizeVesselClass(value: string): VesselClassNormalization {
  const normalized = value.toLowerCase();

  if (hasAnyKeyword(normalized, ["container"])) {
    return {
      normalizedVesselType: "Container Ship",
      normalizedVesselClass: "excluded_container",
      dryBulkCompatible: false,
      exclusionReason: "Container vessel class excluded.",
    };
  }

  if (hasAnyKeyword(normalized, ["tanker", "lng", "lpg", "chemical"])) {
    return {
      normalizedVesselType: "Tanker",
      normalizedVesselClass: "excluded_tanker",
      dryBulkCompatible: false,
      exclusionReason: "Tanker/liquid-gas vessel class excluded.",
    };
  }

  if (hasAnyKeyword(normalized, ["tug", "pusher", "tow", "towing"])) {
    return {
      normalizedVesselType: "Tug",
      normalizedVesselClass: "excluded_tug",
      dryBulkCompatible: false,
      exclusionReason: "Tug/pusher/towing class excluded.",
    };
  }

  if (hasAnyKeyword(normalized, ["inland", "river", "barge", "canal"])) {
    return {
      normalizedVesselType: "Inland Cargo",
      normalizedVesselClass: "excluded_inland",
      dryBulkCompatible: false,
      exclusionReason: "Inland-only vessel class excluded.",
    };
  }

  if (hasAnyKeyword(normalized, ["local vessel", "harbor", "pilot", "port service"])) {
    return {
      normalizedVesselType: "Local Vessel",
      normalizedVesselClass: "excluded_local",
      dryBulkCompatible: false,
      exclusionReason: "Local harbor/service vessel class excluded.",
    };
  }

  if (hasAnyKeyword(normalized, ["passenger", "cruise"])) {
    return {
      normalizedVesselType: "Passenger",
      normalizedVesselClass: "excluded_passenger",
      dryBulkCompatible: false,
      exclusionReason: "Passenger class excluded.",
    };
  }

  if (hasAnyKeyword(normalized, ["bulk"])) {
    return {
      normalizedVesselType: "Bulk Carrier",
      normalizedVesselClass: "bulk_carrier",
      dryBulkCompatible: true,
      exclusionReason: null,
    };
  }

  if (hasAnyKeyword(normalized, ["general cargo"])) {
    return {
      normalizedVesselType: "General Cargo",
      normalizedVesselClass: "general_cargo",
      dryBulkCompatible: true,
      exclusionReason: null,
    };
  }

  if (
    hasAnyKeyword(normalized, ["dry cargo", "cargo", "freighter"]) &&
    !hasAnyKeyword(normalized, ["fishing", "reefer", "service", "offshore", "support"])
  ) {
    return {
      normalizedVesselType: "Dry Cargo",
      normalizedVesselClass: "dry_cargo_other",
      dryBulkCompatible: true,
      exclusionReason: null,
    };
  }

  if (
    hasAnyKeyword(normalized, [
      "roro",
      "ro-ro",
      "fishing",
      "trawler",
      "dredger",
      "offshore",
      "supply",
      "service",
      "patrol",
      "research",
      "naval",
      "yacht",
      "pleasure",
    ])
  ) {
    return {
      normalizedVesselType: "Excluded Other",
      normalizedVesselClass: "excluded_other",
      dryBulkCompatible: false,
      exclusionReason: "Non dry-bulk operational class excluded.",
    };
  }

  return {
    normalizedVesselType: value || "Unknown",
    normalizedVesselClass: "excluded_other",
    dryBulkCompatible: false,
    exclusionReason: "Unknown/unsupported vessel class excluded.",
  };
}

function classifyCorridor(lat: number, lon: number): {
  classification: HybridCorridorClassification;
  relevant: boolean;
  moroccoCompatible: boolean;
} {
  for (const corridor of SEEDED_CORRIDORS) {
    const inCorridor = corridor.boundingBoxes.some((boundingBox) => {
      const [[minLat, minLon], [maxLat, maxLon]] = boundingBox;
      return lat >= minLat && lat <= maxLat && lon >= minLon && lon <= maxLon;
    });

    if (inCorridor) {
      return {
        classification: corridor.id,
        relevant: true,
        moroccoCompatible: true,
      };
    }
  }

  if (lon >= 100 || lon <= -130) {
    return {
      classification: "irrelevant_pacific_oceania",
      relevant: false,
      moroccoCompatible: false,
    };
  }

  if (lat >= 46 && lat <= 55 && lon >= 5 && lon <= 20) {
    return {
      classification: "irrelevant_inland_europe",
      relevant: false,
      moroccoCompatible: false,
    };
  }

  return {
    classification: "irrelevant_other",
    relevant: false,
    moroccoCompatible: false,
  };
}

function buildDestinationText(...parts: Array<string | null | undefined>) {
  return parts
    .map((part) => cleanString(part, ""))
    .filter(Boolean)
    .join(" ")
    .trim();
}

function toMmsiString(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(Math.trunc(value));
  }

  if (typeof value === "string") {
    const cleaned = value.trim();
    if (cleaned) {
      return cleaned;
    }
  }

  return "";
}

function mmsiToVesselId(mmsi: string, imo?: string, uuid?: string) {
  const cleanedImo = cleanString(imo, "");
  if (cleanedImo) {
    return `live-vsl-imo-${cleanedImo}`;
  }

  if (mmsi) {
    return `live-vsl-mmsi-${mmsi}`;
  }

  const cleanedUuid = cleanString(uuid, "");
  if (cleanedUuid) {
    return `live-vsl-uuid-${slug(cleanedUuid)}`;
  }

  return `live-vsl-unknown-${Date.now()}`;
}

function hasMoroccoDestinationCode(code: string) {
  return MOROCCO_DESTINATION_CODES.has(code.toUpperCase());
}

function parseAisTimestamp(value: unknown) {
  const candidate = cleanString(value, "");
  if (!candidate) {
    return new Date().toISOString();
  }

  const withZ = candidate.includes(" UTC")
    ? candidate.replace(" +0000 UTC", "Z").replace(" UTC", "Z")
    : candidate;

  const parsed = new Date(withZ);
  if (Number.isNaN(parsed.getTime())) {
    return new Date().toISOString();
  }

  return parsed.toISOString();
}

function clampAdmissionScore(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function toConfidenceLevelFromScore(score: number): ConfidenceLevel {
  if (score >= 80) {
    return "High";
  }
  if (score >= 60) {
    return "Medium";
  }
  return "Low";
}

function toConfidenceScore(level: ConfidenceLevel) {
  if (level === "High") {
    return 100;
  }
  if (level === "Medium") {
    return 65;
  }
  return 30;
}

function clampScore(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function toCommodityConfidenceLabelFromScore(score: number): CommodityConfidenceLabel {
  if (score >= 75) {
    return "strong hypothesis";
  }

  if (score >= 58) {
    return "moderate hypothesis";
  }

  return "weak hypothesis";
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

function deriveKnowledgeCommodityScoreDeltas(snapshot: {
  commodityBias: {
    wheatScore: number;
    barleyScore: number;
    cornScore: number;
    soybeanMealScore: number;
  };
  commoditySupportBoost: number;
}) {
  return {
    wheatScore: Number((snapshot.commodityBias.wheatScore * 0.6 + snapshot.commoditySupportBoost * 0.22).toFixed(1)),
    barleyScore: Number((snapshot.commodityBias.barleyScore * 0.6 + snapshot.commoditySupportBoost * 0.16).toFixed(1)),
    cornScore: Number((snapshot.commodityBias.cornScore * 0.6 + snapshot.commoditySupportBoost * 0.16).toFixed(1)),
    soybeanMealScore: Number((snapshot.commodityBias.soybeanMealScore * 0.6 + snapshot.commoditySupportBoost * 0.22).toFixed(1)),
  };
}

function computeTrendFromSamples(values: number[]) {
  if (values.length < 2) {
    return { direction: "flat" as TrendDirection, delta: 0 };
  }

  const latest = values[values.length - 1] ?? 0;
  const previous = values.slice(0, -1);
  const baseline = previous.reduce((sum, item) => sum + item, 0) / Math.max(1, previous.length);
  const delta = Number((latest - baseline).toFixed(1));

  if (delta >= 4) {
    return { direction: "up" as TrendDirection, delta };
  }
  if (delta <= -4) {
    return { direction: "down" as TrendDirection, delta };
  }
  return { direction: "flat" as TrendDirection, delta };
}

interface WatchlistLayerScores {
  moroccoBoundScore: number;
  agriCargoScore: number;
  commodityScore: number;
}

interface GfwSupportSummary {
  supportScore: number;
  admissionDelta: number;
  reasons: string[];
}

function computeWatchlistLayerScores(params: {
  admissionScore: number;
  dryBulkCompatible: boolean;
  exportPortRelevant: boolean;
  routeCorridorCompatible: boolean;
  corridorRelevant: boolean;
  moroccoHint: boolean;
  historicalMoroccoRouteRelevant: boolean;
  operationallyRelevant: boolean;
  draft: number | null;
  loadingSignalScore: number;
  destinationText: string;
}) {
  const moroccoBoundScore = clampAdmissionScore(params.admissionScore);

  let agriCargoScore = 0;
  if (params.dryBulkCompatible) {
    agriCargoScore += 34;
  } else {
    agriCargoScore -= 42;
  }
  if (params.exportPortRelevant) {
    agriCargoScore += 22;
  }
  if (params.routeCorridorCompatible || params.corridorRelevant) {
    agriCargoScore += 10;
  }
  if (params.moroccoHint) {
    agriCargoScore += 8;
  }
  if (params.loadingSignalScore >= 65) {
    agriCargoScore += 20;
  } else if (params.loadingSignalScore >= 45) {
    agriCargoScore += 13;
  } else if (params.loadingSignalScore >= 25) {
    agriCargoScore += 7;
  }
  if (typeof params.draft === "number" && params.draft >= 7) {
    agriCargoScore += 7;
  }
  if (!params.operationallyRelevant) {
    agriCargoScore -= 16;
  }

  const destinationLower = params.destinationText.toLowerCase();
  let commodityScore = 8;
  if (params.exportPortRelevant) {
    commodityScore += 16;
  }
  if (params.loadingSignalScore >= 65) {
    commodityScore += 18;
  } else if (params.loadingSignalScore >= 45) {
    commodityScore += 12;
  } else if (params.loadingSignalScore >= 25) {
    commodityScore += 6;
  }
  if (params.routeCorridorCompatible || params.corridorRelevant) {
    commodityScore += 8;
  }
  if (params.moroccoHint || params.historicalMoroccoRouteRelevant) {
    commodityScore += 10;
  }
  if (
    hasAnyKeyword(destinationLower, [
      "grain",
      "wheat",
      "barley",
      "corn",
      "maize",
      "soy",
      "meal",
      "feed",
    ])
  ) {
    commodityScore += 14;
  }
  if (!params.dryBulkCompatible) {
    commodityScore -= 22;
  }
  if (!params.operationallyRelevant) {
    commodityScore -= 10;
  }

  return {
    moroccoBoundScore,
    agriCargoScore: clampScore(agriCargoScore),
    commodityScore: clampScore(commodityScore),
  } satisfies WatchlistLayerScores;
}

function summarizeGfwSupport(params: {
  dryBulkCompatible: boolean;
  corridorRelevant: boolean;
  routeCorridorCompatible: boolean;
  explicitMoroccoSignals: boolean;
  profile: GfwHistoricalProfile;
}): GfwSupportSummary {
  if (!params.profile.enrichmentAttempted || !params.profile.enrichmentSuccess) {
    return {
      supportScore: 0,
      admissionDelta: 0,
      reasons: params.profile.gfwReasons.slice(0, 2),
    };
  }

  let supportScore = 0;
  const reasons: string[] = [];

  if (params.profile.gfwExportPortVisitCount >= 2) {
    supportScore += 22;
    reasons.push(
      `GFW: repeated seeded export-port visits (${params.profile.gfwExportPortVisitCount}).`,
    );
  } else if (params.profile.gfwExportPortVisitCount >= 1) {
    supportScore += 12;
    reasons.push("GFW: at least one seeded export-port visit.");
  }

  if (params.profile.gfwMoroccoVisitCount >= 2) {
    supportScore += 22;
    reasons.push(
      `GFW: repeated Morocco port visits (${params.profile.gfwMoroccoVisitCount}).`,
    );
  } else if (params.profile.gfwMoroccoVisitCount >= 1) {
    supportScore += 12;
    reasons.push("GFW: at least one Morocco port visit.");
  }

  if (params.profile.gfwHistoricalRouteHints.length > 0) {
    supportScore += Math.min(16, params.profile.gfwHistoricalRouteHints.length * 4);
    reasons.push("GFW: historical corridor hints present.");
  }

  if (params.profile.gfwEvidenceConfidence === "high") {
    supportScore += 12;
  } else if (params.profile.gfwEvidenceConfidence === "medium") {
    supportScore += 6;
  }

  supportScore = clampScore(supportScore);

  let admissionDelta = 0;
  if (supportScore >= 65 && params.dryBulkCompatible && (params.corridorRelevant || params.routeCorridorCompatible)) {
    admissionDelta = params.explicitMoroccoSignals ? 7 : 4;
  } else if (
    supportScore >= 45 &&
    params.dryBulkCompatible &&
    (params.corridorRelevant || params.routeCorridorCompatible)
  ) {
    admissionDelta = params.explicitMoroccoSignals ? 4 : 2;
  }

  if (admissionDelta > 0) {
    reasons.push(`GFW supportive historical evidence adjusted admission (+${admissionDelta}).`);
  }

  return {
    supportScore,
    admissionDelta,
    reasons: reasons.slice(0, 8),
  };
}

interface PromotionReadinessResult {
  score: number;
  reasons: string[];
  missingSignals: string[];
}

function computePromotionReadiness(params: {
  dryBulkCompatible: boolean;
  corridorRelevant: boolean;
  explicitMoroccoSignals: boolean;
  operationallyRelevant: boolean;
  admissionScore: number;
  loadingSignalScore: number;
  observationCount: number;
  knowledgeSupportScore: number;
  hasTerminalKnowledge: boolean;
  hasDestinationKnowledge: boolean;
  topVoyageHypothesis: string;
  topVoyageHypothesisScore: number;
  topVoyageHypothesisConfidence: "weak" | "moderate" | "strong";
  voyageHypothesisEvidenceStyle: "explicit_morocco_support" | "candidate_pre_confirmation";
  gfwSupportScore: number;
  gfwMoroccoVisitCount: number;
  gfwExportPortVisitCount: number;
  gfwEvidenceConfidence: "low" | "medium" | "high";
  operationalSupportScore: number;
  waitingPatternSignal: number;
  loadingQueuePlausibility: number;
  operationalEvidenceConfidence: OperationalEvidenceConfidence;
}) {
  let score = 0;
  const reasons: string[] = [];
  const missingSignals: string[] = [];

  if (params.dryBulkCompatible) {
    score += 20;
    reasons.push("Dry-bulk vessel class is compatible.");
  } else {
    missingSignals.push("Dry-bulk compatible vessel class");
  }

  if (params.corridorRelevant) {
    score += 18;
    reasons.push("Vessel remains in relevant Morocco trade corridors.");
  } else {
    missingSignals.push("Corridor relevance");
  }

  if (params.explicitMoroccoSignals) {
    score += 20;
    reasons.push("Morocco/export routing signals are present.");
  } else {
    missingSignals.push("Morocco/export relevance signal");
  }

  if (params.operationallyRelevant) {
    score += 15;
    reasons.push("Operational behavior indicates an active voyage.");
  } else {
    missingSignals.push("Operational voyage relevance");
  }

  const normalizedAdmission = clampAdmissionScore(params.admissionScore);
  const thresholdGap = Math.max(0, 50 - normalizedAdmission);
  const thresholdContribution = Math.max(0, 27 - thresholdGap * 1.6);
  score += thresholdContribution;
  if (thresholdGap <= 0) {
    reasons.push("Admission score reached strict threshold.");
  } else {
    missingSignals.push(`Admission score threshold (needs +${Math.ceil(thresholdGap)} points)`);
  }

  if (params.loadingSignalScore >= 60) {
    score += 4;
    reasons.push("Loading signal is supportive.");
  } else if (params.loadingSignalScore < 25) {
    missingSignals.push("Stronger loading signal evidence");
  }

  if (params.observationCount >= 4) {
    score += 3;
    reasons.push("Repeated observations reduce one-off noise risk.");
  }

  if (params.knowledgeSupportScore >= 70) {
    score += 9;
    reasons.push("Commodity knowledge base provides strong domain support.");
  } else if (params.knowledgeSupportScore >= 50) {
    score += 5;
    reasons.push("Commodity knowledge base provides moderate support.");
  } else if (params.knowledgeSupportScore < 30) {
    missingSignals.push("Stronger commodity knowledge support");
  }

  if (!params.hasTerminalKnowledge) {
    missingSignals.push("Known export terminal commodity profile");
  }

  if (!params.hasDestinationKnowledge) {
    missingSignals.push("Morocco destination intelligence support");
  }

  if (params.gfwSupportScore >= 65) {
    const gfwBoost = params.gfwEvidenceConfidence === "high" ? 10 : 7;
    score += gfwBoost;
    reasons.push("GFW historical evidence supports repeated export-to-Morocco behavior.");
  } else if (params.gfwSupportScore >= 45) {
    score += 5;
    reasons.push("GFW historical evidence is moderately supportive.");
  } else if (
    params.explicitMoroccoSignals &&
    params.gfwMoroccoVisitCount === 0 &&
    params.gfwExportPortVisitCount === 0
  ) {
    missingSignals.push("Corroborating historical export/Morocco visits");
  }

  if (
    params.topVoyageHypothesis !== "ambiguous_dry_bulk_non_morocco" &&
    params.topVoyageHypothesisScore >= 68
  ) {
    const voyageBonus =
      params.topVoyageHypothesisConfidence === "strong"
        ? 9
        : params.topVoyageHypothesisConfidence === "moderate"
          ? 6
          : 3;
    score += voyageBonus;
    reasons.push(
      `Voyage hypothesis supports promotable pattern (${params.topVoyageHypothesis.replaceAll("_", " ")}).`,
    );
  } else if (
    params.topVoyageHypothesis === "ambiguous_dry_bulk_non_morocco" &&
    params.topVoyageHypothesisScore >= 60
  ) {
    score -= 8;
    missingSignals.push("Clearer Morocco-oriented voyage pattern");
  }

  if (
    params.voyageHypothesisEvidenceStyle === "candidate_pre_confirmation" &&
    !params.explicitMoroccoSignals &&
    params.topVoyageHypothesisScore >= 65
  ) {
    score += 3;
    reasons.push("Candidate-style voyage evidence offsets missing explicit destination.");
  }

  if (params.operationalSupportScore >= 65 && params.loadingQueuePlausibility >= 55) {
    score += params.operationalEvidenceConfidence === "high" ? 10 : 7;
    reasons.push("Operational loading-queue evidence supports promotion readiness.");
  } else if (params.operationalSupportScore >= 45) {
    score += 4;
    reasons.push("Operational evidence moderately supports promotion readiness.");
  } else if (params.loadingQueuePlausibility < 30) {
    missingSignals.push("Operational loading-queue evidence");
  }

  if (params.waitingPatternSignal >= 45) {
    score += 3;
  }

  return {
    score: clampScore(score),
    reasons,
    missingSignals,
  } satisfies PromotionReadinessResult;
}

function computeWatchlistPriority(params: {
  dryBulkCompatible: boolean;
  exportPortRelevant: boolean;
  corridorRelevant: boolean;
  routeCorridorCompatible: boolean;
  moroccoHint: boolean;
  historicalMoroccoRouteRelevant: boolean;
  operationallyRelevant: boolean;
  loadingSignalScore: number;
  agriCargoScore: number;
  commodityScore: number;
  draftDelta: number | null;
  destinationChanged: boolean;
  observationCount: number;
  relevantObservationCount: number;
  scoreTrendDirection: TrendDirection;
  confidenceTrendDirection: TrendDirection;
  weakEvidenceStreak: number;
  missingSignalsForPromotionCount: number;
  promotionReadinessScore: number;
  knowledgeSupportScore: number;
  hasTerminalKnowledge: boolean;
  hasDestinationKnowledge: boolean;
  topVoyageHypothesis: string;
  topVoyageHypothesisScore: number;
  topVoyageHypothesisConfidence: "weak" | "moderate" | "strong";
  voyageHypothesisEvidenceStyle: "explicit_morocco_support" | "candidate_pre_confirmation";
  missingSignalsForVoyageConfirmationCount: number;
  gfwSupportScore: number;
  gfwMoroccoVisitCount: number;
  gfwExportPortVisitCount: number;
  gfwEvidenceConfidence: "low" | "medium" | "high";
  operationalSupportScore: number;
  portCongestionSignal: number;
  berthProximitySignal: number;
  waitingPatternSignal: number;
  loadingQueuePlausibility: number;
  operationalEvidenceConfidence: OperationalEvidenceConfidence;
}) {
  let score = 0;
  const reasons: string[] = [];

  if (params.dryBulkCompatible) {
    score += 20;
    reasons.push("Dry-bulk compatible class.");
  } else {
    score -= 40;
    reasons.push("Non dry-bulk class sharply reduces watchlist priority.");
  }

  if (params.exportPortRelevant) {
    score += 16;
    reasons.push("Seeded export-port relevance.");
  }

  if (params.routeCorridorCompatible || params.corridorRelevant) {
    score += 14;
    reasons.push("Movement through relevant corridor.");
  }

  if (params.moroccoHint || params.historicalMoroccoRouteRelevant) {
    score += 16;
    reasons.push("Morocco relevance signal detected.");
  }

  if (params.loadingSignalScore >= 65) {
    score += 14;
    reasons.push("Strong loading signal.");
  } else if (params.loadingSignalScore >= 45) {
    score += 9;
    reasons.push("Moderate loading signal.");
  } else if (params.loadingSignalScore >= 25) {
    score += 5;
  }

  if (params.agriCargoScore >= 70) {
    score += 6;
  } else if (params.agriCargoScore < 35) {
    score -= 6;
  }

  if (params.commodityScore >= 55) {
    score += 4;
  }

  if (typeof params.draftDelta === "number" && params.draftDelta >= 0.8) {
    score += 8;
    reasons.push("Meaningful draft change observed.");
  }

  if (params.destinationChanged) {
    score += 6;
    reasons.push("Destination evolution detected, re-check prioritized.");
  }

  if (params.observationCount >= 3) {
    score += 6;
  }
  if (params.observationCount >= 6) {
    score += 4;
    reasons.push("Repeated observations in rolling memory.");
  }

  const relevanceRatio =
    params.observationCount > 0 ? params.relevantObservationCount / params.observationCount : 0;
  if (relevanceRatio >= 0.6) {
    score += 6;
  } else if (relevanceRatio < 0.35 && params.observationCount >= 3) {
    score -= 8;
    reasons.push("Relevance persistence remains weak.");
  }

  if (params.scoreTrendDirection === "up") {
    score += 5;
  } else if (params.scoreTrendDirection === "down") {
    score -= 8;
    reasons.push("Morocco-bound trend is weakening.");
  }

  if (params.confidenceTrendDirection === "up") {
    score += 4;
  } else if (params.confidenceTrendDirection === "down") {
    score -= 6;
    reasons.push("Confidence trend is weakening.");
  }

  score += Math.round((params.promotionReadinessScore - 50) * 0.2);

  if (!params.operationallyRelevant) {
    score -= 10;
    reasons.push("Low operational relevance.");
  }

  if (params.weakEvidenceStreak >= 3) {
    score -= Math.min(16, params.weakEvidenceStreak * 3);
    reasons.push("Repeated weak-evidence snapshots lowered priority.");
  }

  if (params.missingSignalsForPromotionCount >= 3) {
    score -= 8;
  }

  if (params.knowledgeSupportScore >= 70) {
    score += 9;
    reasons.push("Strong knowledge-base support.");
  } else if (params.knowledgeSupportScore >= 50) {
    score += 5;
    reasons.push("Moderate knowledge-base support.");
  } else if (params.knowledgeSupportScore < 25) {
    score -= 6;
    reasons.push("Knowledge-base support remains weak.");
  }

  if (!params.hasTerminalKnowledge) {
    score -= 3;
  }
  if (!params.hasDestinationKnowledge) {
    score -= 2;
  }

  if (
    params.topVoyageHypothesis !== "ambiguous_dry_bulk_non_morocco" &&
    params.topVoyageHypothesisScore >= 64
  ) {
    const voyageWeight =
      params.topVoyageHypothesisConfidence === "strong"
        ? 10
        : params.topVoyageHypothesisConfidence === "moderate"
          ? 7
          : 4;
    score += voyageWeight;
    reasons.push(
      `Voyage hypothesis priority support: ${params.topVoyageHypothesis.replaceAll("_", " ")}.`,
    );
  } else if (
    params.topVoyageHypothesis === "ambiguous_dry_bulk_non_morocco" &&
    params.topVoyageHypothesisScore >= 58
  ) {
    score -= 9;
    reasons.push("Ambiguous non-Morocco voyage hypothesis lowers watchlist priority.");
  }

  if (
    params.voyageHypothesisEvidenceStyle === "candidate_pre_confirmation" &&
    params.topVoyageHypothesisScore >= 62
  ) {
    score += 3;
    reasons.push("Candidate-style voyage evidence supports continued watchlist monitoring.");
  }

  if (params.missingSignalsForVoyageConfirmationCount >= 3) {
    score -= 5;
  }

  if (params.gfwSupportScore >= 65) {
    score += params.gfwEvidenceConfidence === "high" ? 11 : 8;
    reasons.push("GFW historical profile supports recurring export/Morocco pattern.");
  } else if (params.gfwSupportScore >= 45) {
    score += 5;
    reasons.push("GFW historical profile provides moderate route support.");
  } else if (params.gfwSupportScore > 0) {
    score += 2;
  }

  if (params.gfwMoroccoVisitCount >= 2 && params.gfwExportPortVisitCount >= 2) {
    score += 4;
  }

  if (params.operationalSupportScore >= 65 && params.loadingQueuePlausibility >= 55) {
    score += params.operationalEvidenceConfidence === "high" ? 11 : 8;
    reasons.push("Operational signal: strong waiting/berth/queue pattern.");
  } else if (params.operationalSupportScore >= 45) {
    score += 5;
    reasons.push("Operational signal: moderate waiting/berth pattern.");
  } else if (params.operationalSupportScore > 0) {
    score += 2;
  }

  if (params.waitingPatternSignal >= 45) {
    score += 4;
  }
  if (params.berthProximitySignal >= 45) {
    score += 3;
  }
  if (params.portCongestionSignal >= 25) {
    score += 3;
  }

  return {
    score: clampScore(score),
    reasons,
  };
}

const MOROCCO_FALLBACK_PORT_CODE = "MACAS";
const MOROCCO_PORT_TEXT_HINTS: Record<string, string[]> = MOROCCO_PORT_VARIANTS_BY_CODE;

export class HybridAISProvider implements AISProvider {
  private readonly aisStreamApiKey: string;
  private readonly datalasticApiKey: string;
  private readonly aisStreamUrl: string;
  private readonly datalasticBaseUrl: string;
  private readonly cacheTtlMs: number;
  private readonly connectTimeoutMs: number;
  private readonly collectWindowMs: number;
  private readonly maxDetections: number;
  private readonly maxEnrichments: number;
  private readonly enrichmentBatchSize: number;
  private readonly requestTimeoutMs: number;
  private readonly usageLogEnabled: boolean;
  private readonly gfwProvider: GlobalFishingWatchProvider;
  private readonly rollingWindowMs: number;
  private readonly watchlistRetentionMs: number;
  private readonly watchlistReenrichMs: number;

  private readonly portsById = new Map<string, PortRecord>();
  private readonly portsByCode = new Map<string, PortRecord>();
  private readonly portsByName = new Map<string, PortRecord>();
  private readonly portAliasToCode = new Map<string, string>();

  private readonly endpointUsageCounter = new Map<string, number>();
  private readonly portLookupCache = new Map<string, PortRecord>();
  private readonly liveNormalizationDebugByVessel = new Map<string, HybridNormalizationDebugRecord>();
  private evaluationEvents: HybridEvaluationEvent[] = [];
  private readonly loadingBehaviorByVessel = new Map<string, LoadingBehaviorSample[]>();
  private readonly rollingMemoryByKey = new Map<string, RollingVesselMemory>();
  private readonly rollingKeyByVesselId = new Map<string, string>();
  private readonly rollingKeyByMmsi = new Map<string, string>();
  private acquisitionMetrics: HybridAcquisitionMetrics = {
    rawStreamDetections: 0,
    screenedDetections: 0,
    dryBulkCompatibleDetections: 0,
    corridorRelevantDetections: 0,
    exportPortRelevantDetections: 0,
    moroccoRelevantDetections: 0,
    enrichedCandidates: 0,
    admittedCandidates: 0,
    vesselsWithTerminalMatch: 0,
    vesselsWithGrainTerminalMatch: 0,
    vesselsWithUsablePortStayEstimate: 0,
    vesselsWithUsableDraftDeltaEstimate: 0,
    vesselsWithModerateOrStrongLoadingSignal: 0,
    vesselsMatchedKnownTerminalIntelligence: 0,
    vesselsMatchedKnownCommodityProfiles: 0,
    vesselsWithDestinationIntelligenceSupport: 0,
    vesselsCommodityScoreImprovedByKnowledgeBase: 0,
    exportKnowledgeMatchedByExactAlias: 0,
    exportKnowledgeMatchedByFuzzyOrToken: 0,
    exportKnowledgeMatchedByCode: 0,
    terminalMatchedPortFallbackOnly: 0,
    exportKnowledgeAliasGapFailures: 0,
    gfwEnrichmentAttemptedCount: 0,
    gfwEnrichmentSuccessCount: 0,
    gfwVesselsWithExportHistory: 0,
    gfwVesselsWithMoroccoHistory: 0,
    gfwVesselsWithRouteHints: 0,
    gfwVesselsWithSupportiveEvidence: 0,
  };
  private rollingMemoryMetrics: HybridRollingMemoryMetrics = {
    rollingWindowHours: 120,
    vesselsTrackedInMemory: 0,
    vesselsRetainedInRollingWindow: 0,
    vesselsUpdatedMultipleTimes: 0,
    vesselsWithUsableDraftHistory: 0,
    vesselsWithUsableLoadingTrend: 0,
    vesselsConfidenceImprovedOverTime: 0,
  };
  private watchlistMetrics: HybridWatchlistMetrics = {
    vesselsAcquired: 0,
    vesselsInWatchlist: 0,
    vesselsEnrichedFromWatchlist: 0,
    vesselsPromotedToRadar: 0,
    vesselsDroppedFromWatchlist: 0,
    averageWatchlistDurationHours: 0,
    vesselsImprovedOverTimeWhileInWatchlist: 0,
    averageWatchlistEvidenceAgeHours: 0,
    averageReEnrichmentCount: 0,
    vesselsWithImprovingEvidence: 0,
    vesselsWithWeakeningEvidence: 0,
  };
  private websocketCtorPromise: Promise<typeof import("ws").default> | null = null;
  private snapshotRefreshPromise: Promise<CacheSnapshot> | null = null;
  private rollingMemorySeedAttempted = false;
  private rollingMemorySeededFromDb = false;

  private snapshot: CacheSnapshot | null = null;

  constructor(aisStreamApiKey: string, datalasticApiKey: string) {
    this.aisStreamApiKey = aisStreamApiKey;
    this.datalasticApiKey = datalasticApiKey;
    this.aisStreamUrl = process.env.AISSTREAM_URL?.trim() || AISSTREAM_URL;
    this.datalasticBaseUrl = process.env.DATALASTIC_API_BASE_URL?.trim() || DATALASTIC_BASE_URL;
    this.cacheTtlMs = Math.max(60, toInteger(process.env.HYBRID_CACHE_TTL_SECONDS, 900)) * 1000;
    this.connectTimeoutMs = Math.max(20, toInteger(process.env.AISSTREAM_CONNECT_TIMEOUT_SECONDS, 75)) * 1000;
    this.collectWindowMs = Math.max(4, toInteger(process.env.AISSTREAM_COLLECTION_SECONDS, 12)) * 1000;
    this.maxDetections = Math.max(5, toInteger(process.env.AISSTREAM_MAX_DETECTIONS, 30));
    this.maxEnrichments = Math.max(8, toInteger(process.env.HYBRID_MAX_ENRICHMENTS, 40));
    this.enrichmentBatchSize = Math.max(1, toInteger(process.env.HYBRID_ENRICH_BATCH_SIZE, 6));
    this.requestTimeoutMs = Math.max(3_000, toInteger(process.env.DATALASTIC_REQUEST_TIMEOUT_MS, 12_000));
    this.usageLogEnabled = (process.env.RADAR_LOG_API_USAGE ?? "true").toLowerCase() !== "false";
    this.gfwProvider = new GlobalFishingWatchProvider(process.env.GFW_API_TOKEN ?? "");
    const rollingHours = Math.max(72, Math.min(168, toInteger(process.env.RADAR_ROLLING_WINDOW_HOURS, 120)));
    this.rollingWindowMs = rollingHours * 3_600_000;
    this.rollingMemoryMetrics.rollingWindowHours = rollingHours;
    const watchlistRetentionHours = Math.max(
      24,
      Math.min(96, toInteger(process.env.WATCHLIST_RETENTION_HOURS, 72)),
    );
    const watchlistReenrichHours = Math.max(
      2,
      Math.min(24, toInteger(process.env.WATCHLIST_REENRICH_HOURS, 8)),
    );
    this.watchlistRetentionMs = watchlistRetentionHours * 3_600_000;
    this.watchlistReenrichMs = watchlistReenrichHours * 3_600_000;

    for (const port of PORTS) {
      this.registerPort(port);
    }

    this.registerPort({
      id: "live-port-unknown-departure",
      name: "Unknown Departure",
      country: "Unknown",
      code: "UNKDEP",
      lat: UNKNOWN_COORDINATE,
      lon: UNKNOWN_COORDINATE,
      isMoroccoDestination: false,
      isLikelyGrainOrigin: false,
    });

    this.registerPort({
      id: "live-port-unknown-destination",
      name: "Unknown Destination",
      country: "Unknown",
      code: "UNKDST",
      lat: 33.6,
      lon: -7.6,
      isMoroccoDestination: true,
      isLikelyGrainOrigin: false,
    });

    this.registerConfiguredPortAliases();
  }

  private assertConfigured() {
    if (!this.aisStreamApiKey) {
      throw new Error("Hybrid provider requires AISSTREAM_API_KEY.");
    }

    if (!this.datalasticApiKey) {
      throw new Error("Hybrid provider requires DATALASTIC_API_KEY.");
    }
  }

  private logApiUsage(endpoint: string, context: string) {
    if (!this.usageLogEnabled) {
      return;
    }

    const key = `${endpoint}:${context}`;
    const count = (this.endpointUsageCounter.get(key) ?? 0) + 1;
    this.endpointUsageCounter.set(key, count);

    console.info(`[RadarUsage] provider=hybrid endpoint=${endpoint} context="${context}" count=${count}`);
  }

  private registerPort(input: PortRecord) {
    const normalizedCode = normalizePortCode(input.code);
    const normalizedName = normalizeName(input.name);

    const existing = this.portsById.get(input.id) ?? this.portsByCode.get(normalizedCode);
    if (existing) {
      this.portsById.set(existing.id, existing);
      this.portsByCode.set(normalizedCode, existing);
      this.portsByName.set(normalizedName, existing);
      return existing;
    }

    const port: PortRecord = {
      ...input,
      code: normalizedCode,
    };

    this.portsById.set(port.id, port);
    this.portsByCode.set(port.code, port);
    this.portsByName.set(normalizedName, port);
    return port;
  }

  private async getWebSocketConstructor() {
    if (this.websocketCtorPromise) {
      return this.websocketCtorPromise;
    }

    // Prevent ws optional native addon mismatch in bundled dev/runtime contexts.
    process.env.WS_NO_BUFFER_UTIL = "1";
    process.env.WS_NO_UTF_8_VALIDATE = "1";

    this.websocketCtorPromise = import("ws").then((module) => module.default);
    return this.websocketCtorPromise;
  }

  getNormalizationDebug(vesselIds: string[] = []) {
    const nowMs = Date.now();
    const merged = new Map<string, HybridNormalizationDebugRecord>();

    for (const record of Array.from(this.liveNormalizationDebugByVessel.values())) {
      merged.set(record.vesselId, this.annotateDebugWithRollingMemory(record));
    }

    for (const memory of Array.from(this.rollingMemoryByKey.values())) {
      const ageMs = nowMs - new Date(memory.lastSeenAt).getTime();
      if (ageMs > this.rollingWindowMs) {
        continue;
      }
      if (!memory.latestDebug) {
        continue;
      }
      if (!merged.has(memory.vesselId)) {
        merged.set(memory.vesselId, this.annotateDebugWithRollingMemory(memory.latestDebug));
      }
    }

    if (vesselIds.length === 0) {
      return Array.from(merged.values());
    }

    const idSet = new Set(vesselIds);
    return Array.from(merged.values()).filter((item) => idSet.has(item.vesselId));
  }

  getAcquisitionMetrics() {
    return { ...this.acquisitionMetrics };
  }

  getRollingMemoryMetrics() {
    this.updateRollingMemoryMetrics(Date.now());
    return { ...this.rollingMemoryMetrics };
  }

  getWatchlistMetrics() {
    this.updateWatchlistMetrics(Date.now());
    return { ...this.watchlistMetrics };
  }

  getEvaluationSnapshot(windowHours: number): HybridEvaluationSnapshot {
    const normalizedWindowHours = Math.max(
      24,
      Math.min(Math.round(this.rollingWindowMs / 3_600_000), toInteger(windowHours, 48)),
    );
    const nowMs = Date.now();
    const cutoffMs = nowMs - normalizedWindowHours * 3_600_000;

    const events = this.evaluationEvents
      .filter((event) => new Date(event.observedAt).getTime() >= cutoffMs)
      .map((event) => ({
        observedAt: event.observedAt,
        record: { ...event.record },
      }));

    const memory = Array.from(this.rollingMemoryByKey.values())
      .filter((item) => new Date(item.lastSeenAt).getTime() >= cutoffMs)
      .map((item) => ({
        vesselId: item.vesselId,
        vesselName: item.latestVessel?.name ?? item.latestDebug?.vesselName ?? item.vesselId,
        firstSeenAt: item.firstSeenAt,
        lastSeenAt: item.lastSeenAt,
        firstRelevantSeenAt: item.firstRelevantSeenAt,
        lastRelevantSeenAt: item.lastRelevantSeenAt,
        observationCount: item.detectionCount,
        relevantObservationCount: item.relevantDetectionCount,
        watchlistActive: item.watchlistActive,
        watchlistEnteredAt: item.watchlistEnteredAt,
        watchlistLastUpdatedAt: item.watchlistLastUpdatedAt,
        watchlistReEnrichmentCount: item.watchlistReEnrichmentCount,
        watchlistPriorityScore: item.watchlistPriorityScore,
        promotionReadinessScore: item.promotionReadinessScore,
        confidenceImprovedOverTime: item.confidenceImprovedOverTime,
        evidenceImproving: item.evidenceImproving,
        evidenceWeakening: item.evidenceWeakening,
        scoreTrend: item.scoreTrend,
        confidenceTrend: item.confidenceTrend,
        rollingRetentionReason: item.rollingRetentionReason,
      }));

    return {
      generatedAt: new Date().toISOString(),
      windowHours: normalizedWindowHours,
      events,
      memory,
    };
  }

  private pushEvaluationEvent(record: HybridNormalizationDebugRecord) {
    const observedAt = record.lastSignalAt || new Date().toISOString();
    this.evaluationEvents.push({
      observedAt,
      record,
    });
  }

  private pruneEvaluationEvents(nowMs: number) {
    this.evaluationEvents = this.evaluationEvents.filter(
      (event) => nowMs - new Date(event.observedAt).getTime() <= this.rollingWindowMs,
    );
  }

  private resolveRollingKey(params: { vesselId: string; mmsi: string; imo: string | null }) {
    if (params.imo) {
      return `imo:${params.imo}`;
    }
    if (params.mmsi) {
      return `mmsi:${params.mmsi}`;
    }
    return `vessel:${params.vesselId}`;
  }

  private updateRollingMemoryMetrics(nowMs: number) {
    const entries = Array.from(this.rollingMemoryByKey.values());
    const retained = entries.filter(
      (entry) =>
        nowMs - new Date(entry.lastSeenAt).getTime() <= this.rollingWindowMs &&
        Boolean(entry.latestVoyage),
    );
    const multiObs = retained.filter((entry) => entry.detectionCount >= 2).length;
    const usableDraftHistory = retained.filter((entry) => entry.draftSampleCount >= 2).length;
    const usableLoadingTrend = retained.filter((entry) => entry.loadingSignalSampleCount >= 2).length;
    const improved = retained.filter((entry) => entry.confidenceImprovedOverTime).length;

    this.rollingMemoryMetrics = {
      rollingWindowHours: Math.round(this.rollingWindowMs / 3_600_000),
      vesselsTrackedInMemory: entries.length,
      vesselsRetainedInRollingWindow: retained.length,
      vesselsUpdatedMultipleTimes: multiObs,
      vesselsWithUsableDraftHistory: usableDraftHistory,
      vesselsWithUsableLoadingTrend: usableLoadingTrend,
      vesselsConfidenceImprovedOverTime: improved,
    };
  }

  private updateWatchlistMetrics(nowMs: number) {
    const retained = Array.from(this.rollingMemoryByKey.values()).filter(
      (entry) => nowMs - new Date(entry.lastSeenAt).getTime() <= this.rollingWindowMs,
    );
    const activeWatchlist = retained.filter((entry) => entry.watchlistActive);
    const promoted = retained.filter((entry) => entry.promotedToRadarCount > 0);
    const dropped = retained.filter((entry) => entry.droppedFromWatchlistCount > 0);
    const enrichedFromWatchlist = activeWatchlist.filter((entry) => entry.watchlistReEnrichmentCount > 0);
    const improvedInWatchlist = retained.filter(
      (entry) => entry.watchlistEnteredAt && entry.confidenceImprovedOverTime,
    );
    const improvingEvidence = retained.filter((entry) => entry.evidenceImproving).length;
    const weakeningEvidence = retained.filter((entry) => entry.evidenceWeakening).length;

    let avgDuration = 0;
    if (activeWatchlist.length > 0) {
      avgDuration =
        activeWatchlist.reduce((sum, item) => {
          const start = item.watchlistEnteredAt ? new Date(item.watchlistEnteredAt).getTime() : nowMs;
          return sum + Math.max(0, (nowMs - start) / 3_600_000);
        }, 0) / activeWatchlist.length;
    }

    let avgEvidenceAge = 0;
    if (activeWatchlist.length > 0) {
      avgEvidenceAge =
        activeWatchlist.reduce((sum, item) => {
          const firstRelevantAt = item.firstRelevantSeenAt ?? item.firstSeenAt;
          return sum + Math.max(0, (nowMs - new Date(firstRelevantAt).getTime()) / 3_600_000);
        }, 0) / activeWatchlist.length;
    }

    const avgReEnrichmentCount =
      activeWatchlist.length > 0
        ? activeWatchlist.reduce((sum, item) => sum + item.watchlistReEnrichmentCount, 0) /
          activeWatchlist.length
        : 0;

    this.watchlistMetrics = {
      vesselsAcquired: retained.length,
      vesselsInWatchlist: activeWatchlist.length,
      vesselsEnrichedFromWatchlist: enrichedFromWatchlist.length,
      vesselsPromotedToRadar: promoted.length,
      vesselsDroppedFromWatchlist: dropped.length,
      averageWatchlistDurationHours: Number(avgDuration.toFixed(1)),
      vesselsImprovedOverTimeWhileInWatchlist: improvedInWatchlist.length,
      averageWatchlistEvidenceAgeHours: Number(avgEvidenceAge.toFixed(1)),
      averageReEnrichmentCount: Number(avgReEnrichmentCount.toFixed(1)),
      vesselsWithImprovingEvidence: improvingEvidence,
      vesselsWithWeakeningEvidence: weakeningEvidence,
    };
  }

  private evaluateWatchlistEligibility(params: {
    dryBulkCompatible: boolean;
    corridorRelevant: boolean;
    routeCorridorCompatible: boolean;
    exportPortRelevant: boolean;
    moroccoHint: boolean;
    historicalMoroccoRouteRelevant: boolean;
    operationallyRelevant: boolean;
    speed: number;
    preDepartureLoadingSupport: boolean;
  }) {
    const reasons: string[] = [];
    const relevanceSignal =
      params.exportPortRelevant ||
      params.moroccoHint ||
      params.historicalMoroccoRouteRelevant ||
      params.routeCorridorCompatible ||
      params.corridorRelevant;

    if (!params.dryBulkCompatible) {
      return {
        eligible: false,
        reasons: ["Watchlist rejected: vessel class is not dry-bulk compatible."],
        dropReason: "Non dry-bulk compatible class.",
      };
    }

    if (!relevanceSignal) {
      return {
        eligible: false,
        reasons: ["Watchlist rejected: no export/corridor/Morocco relevance signal."],
        dropReason: "No relevance signal.",
      };
    }

    const clearlyContradictory =
      !params.operationallyRelevant &&
      !params.preDepartureLoadingSupport &&
      params.speed < 0.8 &&
      !params.exportPortRelevant &&
      !params.moroccoHint;

    if (clearlyContradictory) {
      return {
        eligible: false,
        reasons: ["Watchlist rejected: contradictory operational pattern."],
        dropReason: "Contradictory operational pattern.",
      };
    }

    reasons.push("Dry-bulk compatible class.");
    if (params.exportPortRelevant) {
      reasons.push("Export-port relevance signal.");
    }
    if (params.routeCorridorCompatible || params.corridorRelevant) {
      reasons.push("Corridor relevance signal.");
    }
    if (params.moroccoHint || params.historicalMoroccoRouteRelevant) {
      reasons.push("Morocco-destination relevance signal.");
    }

    return {
      eligible: true,
      reasons,
      dropReason: null as string | null,
    };
  }

  private shouldReenrichWatchlist(
    memory: RollingVesselMemory | null,
    current: {
      destinationText: string;
      corridorClassification: HybridCorridorClassification;
      draft: number | null;
      watchlistPriorityScore: number;
      nowMs: number;
    },
  ) {
    if (!memory || !memory.watchlistActive) {
      return {
        shouldReenrich: true,
        reason: "First watchlist observation.",
      };
    }

    const lastEnrichedAt = memory.watchlistLastEnrichedAt
      ? new Date(memory.watchlistLastEnrichedAt).getTime()
      : 0;
    const cadenceMultiplier =
      current.watchlistPriorityScore >= 75 ? 0.5 : current.watchlistPriorityScore >= 45 ? 1 : 1.8;
    const weakEvidencePenalty = memory.weakEvidenceStreak >= 3 ? 1.5 : 1;
    const adaptiveCadenceMs = Math.max(
      60 * 60 * 1000,
      Math.min(36 * 60 * 60 * 1000, this.watchlistReenrichMs * cadenceMultiplier * weakEvidencePenalty),
    );
    const dueByCadence = current.nowMs - lastEnrichedAt >= adaptiveCadenceMs;
    if (dueByCadence) {
      return {
        shouldReenrich: true,
        reason: `Adaptive cadence reached (${Math.round(adaptiveCadenceMs / 3_600_000)}h).`,
      };
    }

    const lastDestination = memory.destinationHistory[memory.destinationHistory.length - 1] ?? "";
    const destinationChanged = normalizeDestinationText(lastDestination) !== normalizeDestinationText(current.destinationText);
    if (destinationChanged) {
      return {
        shouldReenrich: true,
        reason: "Destination text changed significantly.",
      };
    }

    const lastCorridor = memory.corridorHistory[memory.corridorHistory.length - 1] ?? "irrelevant_other";
    if (lastCorridor !== current.corridorClassification) {
      return {
        shouldReenrich: true,
        reason: "Corridor classification changed.",
      };
    }

    const previousDraft = memory.draftHistory[memory.draftHistory.length - 1]?.draft ?? null;
    const draftChanged =
      typeof previousDraft === "number" &&
      typeof current.draft === "number" &&
      Math.abs(current.draft - previousDraft) >= 0.8;
    if (draftChanged) {
      return {
        shouldReenrich: true,
        reason: "Draft changed meaningfully.",
      };
    }

    if (memory.evidenceWeakening && current.watchlistPriorityScore < 35 && memory.weakEvidenceStreak >= 4) {
      return {
        shouldReenrich: false,
        reason: "Priority decayed after repeated weak evidence; waiting for stronger signal.",
      };
    }

    return {
      shouldReenrich: false,
      reason: "Adaptive watchlist enrichment skipped (no trigger and cadence not reached).",
    };
  }

  private pruneRollingMemory(nowMs: number) {
    for (const [key, entry] of Array.from(this.rollingMemoryByKey.entries())) {
      const ageMs = nowMs - new Date(entry.lastSeenAt).getTime();
      if (ageMs > this.rollingWindowMs) {
        this.rollingMemoryByKey.delete(key);
        this.rollingKeyByVesselId.delete(entry.vesselId);
        this.rollingKeyByMmsi.delete(entry.mmsi);
        continue;
      }

      if (entry.watchlistActive && entry.watchlistExpiresAt) {
        const expiresAtMs = new Date(entry.watchlistExpiresAt).getTime();
        if (nowMs > expiresAtMs) {
          entry.watchlistActive = false;
          entry.watchlistDecision = "dropped";
          entry.watchlistDropReason = "Watchlist retention window expired without promotion.";
          entry.watchlistLastUpdatedAt = new Date(nowMs).toISOString();
          entry.droppedFromWatchlistCount += 1;
          entry.rollingRetentionReason = "Watchlist expired without evidence improvement.";
          this.rollingMemoryByKey.set(key, entry);
        }
      }
    }

    this.pruneEvaluationEvents(nowMs);
    this.updateRollingMemoryMetrics(nowMs);
    this.updateWatchlistMetrics(nowMs);
  }

  private computeTemporalAdmissionAdjustment(
    memory: RollingVesselMemory | null,
    input: {
      routeCorridorCompatible: boolean;
      departureIsGrainOrigin: boolean;
      moroccoHint: boolean;
      loadingSignalScore: number;
    },
  ): TemporalAdmissionAdjustment {
    if (!memory || memory.detectionCount < 2) {
      return { delta: 0, reasons: [] };
    }

    const reasons: string[] = [];
    let delta = 0;
    const total = Math.max(1, memory.detectionCount);
    const relevantRatio = memory.relevantDetectionCount / total;
    const corridorRatio = memory.corridorRelevantCount / total;
    const moroccoRatio = memory.moroccoRelevantCount / total;
    const contradictionRatio = memory.contradictoryRouteCount / total;

    if (memory.detectionCount >= 3 && relevantRatio >= 0.6) {
      delta += 6;
      reasons.push("Rolling evidence: repeated relevance across observations.");
    } else if (memory.detectionCount >= 2 && relevantRatio >= 0.5) {
      delta += 3;
      reasons.push("Rolling evidence: vessel remained partially relevant.");
    }

    if (memory.detectionCount >= 3 && corridorRatio >= 0.6 && input.routeCorridorCompatible) {
      delta += 4;
      reasons.push("Rolling evidence: corridor behavior remained stable.");
    }

    if (memory.exportRelevantCount >= 2 && input.departureIsGrainOrigin) {
      delta += 3;
      reasons.push("Rolling evidence: repeated export-port relevance.");
    }

    if (memory.moroccoRelevantCount >= 2 && input.moroccoHint) {
      delta += 4;
      reasons.push("Rolling evidence: repeated Morocco destination compatibility.");
    }

    if (memory.loadingSignalSampleCount >= 2 && memory.loadingTrendDelta >= 4 && input.loadingSignalScore >= 45) {
      delta += 3;
      reasons.push("Rolling evidence: loading signal improved over time.");
    }

    if (memory.scoreTrend === "up" && memory.scoreTrendDelta >= 6) {
      delta += 2;
      reasons.push("Rolling evidence: admission confidence trend improved.");
    }

    if (memory.contradictoryRouteCount >= 2 || contradictionRatio >= 0.45) {
      delta -= 8;
      reasons.push("Rolling evidence: repeated contradictory route behavior.");
    }

    if (moroccoRatio < 0.35 && memory.detectionCount >= 3) {
      delta -= 3;
      reasons.push("Rolling evidence: weak Morocco relevance persistence.");
    }

    return { delta: Math.max(-12, Math.min(12, delta)), reasons };
  }

  private mergeObservationIntoRollingMemory(params: {
    record: HybridNormalizationDebugRecord;
    vessel?: VesselRecord;
    voyage?: VoyageRecord;
    position?: LatestPosition;
    history?: string[];
    watchlist?: WatchlistEvaluationContext;
    reEnrichmentTriggered?: boolean;
    reEnrichmentAttempted?: boolean;
  }) {
    const seenAt = new Date().toISOString();
    const existingKey = this.rollingKeyByVesselId.get(params.record.vesselId);
    const rollingKey = existingKey ?? params.record.rollingKey;
    const current = this.rollingMemoryByKey.get(rollingKey);

    const next: RollingVesselMemory = current ?? {
      key: rollingKey,
      vesselId: params.record.vesselId,
      imo: params.vessel?.imo && params.vessel.imo !== "UNKNOWN" ? params.vessel.imo : null,
      mmsi: params.vessel?.mmsi ?? params.record.sourceMmsi,
      firstSeenAt: seenAt,
      lastSeenAt: seenAt,
      firstRelevantSeenAt: null,
      lastRelevantSeenAt: null,
      detectionCount: 0,
      relevantDetectionCount: 0,
      corridorRelevantCount: 0,
      destinationSampleCount: 0,
      exportRelevantCount: 0,
      moroccoRelevantCount: 0,
      contradictoryRouteCount: 0,
      terminalMatchCount: 0,
      grainTerminalMatchCount: 0,
      draftSampleCount: 0,
      loadingSignalSampleCount: 0,
      firstIncludedAt: null,
      lastIncludedAt: null,
      includedCount: 0,
      destinationHistory: [],
      corridorHistory: [],
      draftHistory: [],
      loadingHistory: [],
      agriCargoHistory: [],
      commodityHistory: [],
      confidenceHistory: [],
      admissionHistory: [],
      lastConfidenceLevel: "Low",
      confidenceImprovedOverTime: false,
      scoreTrend: "flat",
      loadingTrend: "flat",
      agriCargoTrend: "flat",
      commodityTrend: "flat",
      confidenceTrend: "flat",
      scoreTrendDelta: 0,
      loadingTrendDelta: 0,
      agriCargoTrendDelta: 0,
      commodityTrendDelta: 0,
      confidenceTrendDelta: 0,
      evidenceImproving: false,
      evidenceWeakening: false,
      weakEvidenceStreak: 0,
      latestDebug: null,
      latestVessel: null,
      latestVoyage: null,
      latestPosition: null,
      latestRouteHistory: [],
      rollingRetentionReason: "Tracked inside rolling memory window.",
      watchlistActive: false,
      watchlistEnteredAt: null,
      watchlistLastUpdatedAt: null,
      watchlistExpiresAt: null,
      watchlistReasons: [],
      watchlistDropReason: null,
      watchlistPromotionReason: null,
      watchlistLastEnrichedAt: null,
      watchlistReEnrichmentCount: 0,
      watchlistPriorityScore: 0,
      watchlistPriorityReasons: [],
      promotionReadinessScore: 0,
      promotionReadinessReasons: [],
      missingSignalsForPromotion: [],
      watchlistDecision: "not_eligible",
      promotedToRadarCount: 0,
      droppedFromWatchlistCount: 0,
    };

    next.vesselId = params.record.vesselId;
    next.mmsi = params.vessel?.mmsi ?? params.record.sourceMmsi ?? next.mmsi;
    if (params.vessel?.imo && params.vessel.imo !== "UNKNOWN") {
      next.imo = params.vessel.imo;
    }

    next.detectionCount += 1;
    next.lastSeenAt = seenAt;
    if (!next.firstSeenAt || new Date(seenAt).getTime() < new Date(next.firstSeenAt).getTime()) {
      next.firstSeenAt = seenAt;
    }

    const relevantObservation =
      params.record.acquisitionDecision === "selected" ||
      params.record.admissionDecision === "included" ||
      params.record.destinationTextMoroccoHint ||
      params.record.exportPortRelevant;

    if (relevantObservation) {
      next.relevantDetectionCount += 1;
      if (!next.firstRelevantSeenAt) {
        next.firstRelevantSeenAt = seenAt;
      }
      next.lastRelevantSeenAt = seenAt;
    }

    if (params.record.corridorRelevant || params.record.routeCorridorCompatible) {
      next.corridorRelevantCount += 1;
    }

    if (params.record.exportPortRelevant) {
      next.exportRelevantCount += 1;
    }

    if (params.record.destinationTextMoroccoHint || params.record.normalizedMoroccoDestination) {
      next.moroccoRelevantCount += 1;
    }

    if (
      !params.record.routeCorridorCompatible &&
      !params.record.destinationTextMoroccoHint &&
      !params.record.exportPortRelevant
    ) {
      next.contradictoryRouteCount += 1;
    }

    next.destinationSampleCount += 1;
    if (params.record.normalizedDestinationText) {
      next.destinationHistory.push(params.record.normalizedDestinationText);
    }
    next.corridorHistory.push(params.record.corridorClassification as HybridCorridorClassification);
    next.destinationHistory = next.destinationHistory.slice(-80);
    next.corridorHistory = next.corridorHistory.slice(-80);

    if (params.record.loadingTerminalMatch) {
      next.terminalMatchCount += 1;
    }
    if (params.record.grainTerminalMatch) {
      next.grainTerminalMatchCount += 1;
    }

    const draftCandidate =
      typeof params.record.departureDraftEstimate === "number"
        ? params.record.departureDraftEstimate
        : typeof params.record.normalizedDraft === "number"
          ? params.record.normalizedDraft
          : null;
    if (typeof draftCandidate === "number") {
      next.draftSampleCount += 1;
    }
    next.draftHistory.push({
      timestamp: seenAt,
      draft: draftCandidate,
      draftDelta: params.record.draftDelta,
    });
    next.draftHistory = next.draftHistory.slice(-96);

    next.loadingSignalSampleCount += 1;
    next.loadingHistory.push({
      timestamp: seenAt,
      score: params.record.loadingSignalScore,
    });
    next.loadingHistory = next.loadingHistory.slice(-96);

    const agriProxyScore = clampScore(
      Math.round(
        params.record.loadingSignalScore * 0.65 +
          params.record.admissionScore * 0.2 +
          (params.record.exportPortRelevant ? 10 : 0) +
          (params.record.routeCorridorCompatible ? 5 : 0),
      ),
    );
    const commodityProxyScore = clampScore(
      Math.round(
        params.record.loadingSignalScore * 0.4 +
          (params.record.exportPortRelevant ? 18 : 0) +
          (params.record.destinationTextMoroccoHint ? 12 : 0) +
          (params.record.routeCorridorCompatible ? 8 : 0),
      ),
    );

    next.agriCargoHistory.push({
      timestamp: seenAt,
      score: agriProxyScore,
    });
    next.agriCargoHistory = next.agriCargoHistory.slice(-96);

    next.commodityHistory.push({
      timestamp: seenAt,
      score: commodityProxyScore,
    });
    next.commodityHistory = next.commodityHistory.slice(-96);

    next.admissionHistory.push({
      timestamp: seenAt,
      score: params.record.admissionScore,
      decision: params.record.admissionDecision,
    });
    next.admissionHistory = next.admissionHistory.slice(-96);

    next.confidenceHistory.push({
      timestamp: seenAt,
      score: toConfidenceScore(toConfidenceLevelFromScore(params.record.admissionScore)),
    });
    next.confidenceHistory = next.confidenceHistory.slice(-96);

    if (params.watchlist) {
      next.watchlistDecision = params.watchlist.decision;
      next.watchlistReasons = params.watchlist.reasons;
      next.watchlistLastUpdatedAt = params.watchlist.lastUpdatedAt;
      next.watchlistDropReason = params.watchlist.dropReason;
      next.watchlistPromotionReason = params.watchlist.promotionReason;
      if (params.watchlist.enteredAt && !next.watchlistEnteredAt) {
        next.watchlistEnteredAt = params.watchlist.enteredAt;
      }
      if (params.watchlist.decision === "entered" || params.watchlist.decision === "retained") {
        next.watchlistActive = true;
        const enteredAt = next.watchlistEnteredAt ?? params.watchlist.enteredAt ?? seenAt;
        next.watchlistEnteredAt = enteredAt;
        next.watchlistExpiresAt = new Date(
          new Date(enteredAt).getTime() + this.watchlistRetentionMs,
        ).toISOString();
      }
      if (params.watchlist.decision === "dropped") {
        if (next.watchlistActive) {
          next.droppedFromWatchlistCount += 1;
        }
        next.watchlistActive = false;
        next.watchlistExpiresAt = null;
      }
      if (params.watchlist.decision === "promoted") {
        next.watchlistActive = false;
        next.watchlistExpiresAt = null;
        next.promotedToRadarCount += 1;
      }
      next.watchlistReEnrichmentCount = Math.max(
        next.watchlistReEnrichmentCount,
        params.watchlist.reEnrichmentCount,
      );
      next.watchlistPriorityScore = params.record.watchlistPriorityScore;
      next.watchlistPriorityReasons = params.record.watchlistPriorityReasons;
      next.promotionReadinessScore = params.record.promotionReadinessScore;
      next.promotionReadinessReasons = params.record.promotionReadinessReasons;
      next.missingSignalsForPromotion = params.record.missingSignalsForPromotion;
    }

    if (params.reEnrichmentTriggered || params.reEnrichmentAttempted) {
      next.watchlistLastEnrichedAt = seenAt;
      if (params.reEnrichmentTriggered && !params.watchlist) {
        next.watchlistReEnrichmentCount += 1;
      }
    }

    next.watchlistPriorityScore = params.record.watchlistPriorityScore;
    next.watchlistPriorityReasons = params.record.watchlistPriorityReasons;
    next.promotionReadinessScore = params.record.promotionReadinessScore;
    next.promotionReadinessReasons = params.record.promotionReadinessReasons;
    next.missingSignalsForPromotion = params.record.missingSignalsForPromotion;

    if (params.record.admissionDecision === "included") {
      next.includedCount += 1;
      if (!next.firstIncludedAt) {
        next.firstIncludedAt = seenAt;
      }
      next.lastIncludedAt = seenAt;
      if (next.watchlistActive) {
        next.watchlistDecision = "promoted";
        next.watchlistActive = false;
        next.watchlistExpiresAt = null;
        next.watchlistPromotionReason = "Promoted to main radar after meeting strict admission.";
        next.promotedToRadarCount += 1;
      }
      if (params.vessel) {
        next.latestVessel = params.vessel;
      }
      if (params.voyage) {
        next.latestVoyage = params.voyage;
      }
      if (params.position) {
        next.latestPosition = params.position;
      }
      if (params.history && params.history.length > 0) {
        next.latestRouteHistory = params.history;
      }
    } else if (next.watchlistActive) {
      if (params.vessel) {
        next.latestVessel = params.vessel;
      } else if (!next.latestVessel) {
        next.latestVessel = {
          id: params.record.vesselId,
          imo: "UNKNOWN",
          mmsi: params.record.sourceMmsi,
          name: params.record.vesselName,
          vesselType: params.record.normalizedVesselType,
          flag: "Unknown",
          deadweight: 0,
          length: 0,
          width: 0,
          lastDraft: Math.max(0, params.record.normalizedDraft || 0),
        };
      }

      if (params.voyage) {
        next.latestVoyage = params.voyage;
      } else {
        next.latestVoyage = {
          id: `watch-voy-${params.record.vesselId}`,
          vesselId: params.record.vesselId,
          currentLat: params.record.currentLat,
          currentLon: params.record.currentLon,
          speed: params.record.speed,
          course: params.record.course,
          heading: params.record.heading,
          destinationText: params.record.normalizedDestinationText,
          destinationPortId: "UNKDST",
          eta: params.record.normalizedEta,
          previousPortId: "UNKDEP",
          departurePortId: "UNKDEP",
          departureDetectedAt: seenAt,
          timeSinceDepartureHours: 0,
          originCountry: "Unknown",
          lastSignalAt: params.record.lastSignalAt,
          firstSeenAt: next.firstSeenAt,
          lastSeenAt: next.lastSeenAt,
          firstRelevantSeenAt: next.firstRelevantSeenAt,
          lastRelevantSeenAt: next.lastRelevantSeenAt,
          observationCount: next.detectionCount,
          relevantObservationCount: next.relevantDetectionCount,
          corridorSampleCount: next.corridorHistory.length,
          destinationSampleCount: next.destinationHistory.length,
          draftSampleCount: next.draftSampleCount,
          loadingSignalSampleCount: next.loadingSignalSampleCount,
          scoreTrend: next.scoreTrend,
          loadingTrend: next.loadingTrend,
          scoreTrendDelta: next.scoreTrendDelta,
          loadingTrendDelta: next.loadingTrendDelta,
          confidenceImprovedOverTime: next.confidenceImprovedOverTime,
          rollingRetentionReason: next.rollingRetentionReason,
        };
      }

      if (params.position) {
        next.latestPosition = params.position;
      } else {
        next.latestPosition = {
          vesselId: params.record.vesselId,
          lat: params.record.currentLat,
          lon: params.record.currentLon,
          speed: params.record.speed,
          course: params.record.course,
          heading: params.record.heading,
          timestamp: params.record.lastSignalAt,
        };
      }
    }

    if (params.record.weakEvidenceOnly) {
      next.weakEvidenceStreak += 1;
    } else {
      next.weakEvidenceStreak = 0;
    }

    const scoreTrend = computeTrendFromSamples(next.admissionHistory.map((item) => item.score));
    const loadingTrend = computeTrendFromSamples(next.loadingHistory.map((item) => item.score));
    const agriTrend = computeTrendFromSamples(next.agriCargoHistory.map((item) => item.score));
    const commodityTrend = computeTrendFromSamples(next.commodityHistory.map((item) => item.score));
    const confidenceTrend = computeTrendFromSamples(next.confidenceHistory.map((item) => item.score));
    next.scoreTrend = scoreTrend.direction;
    next.scoreTrendDelta = scoreTrend.delta;
    next.loadingTrend = loadingTrend.direction;
    next.loadingTrendDelta = loadingTrend.delta;
    next.agriCargoTrend = agriTrend.direction;
    next.agriCargoTrendDelta = agriTrend.delta;
    next.commodityTrend = commodityTrend.direction;
    next.commodityTrendDelta = commodityTrend.delta;
    next.confidenceTrend = confidenceTrend.direction;
    next.confidenceTrendDelta = confidenceTrend.delta;
    next.evidenceImproving =
      scoreTrend.direction === "up" || agriTrend.direction === "up" || confidenceTrend.direction === "up";
    next.evidenceWeakening =
      scoreTrend.direction === "down" ||
      agriTrend.direction === "down" ||
      confidenceTrend.direction === "down" ||
      next.weakEvidenceStreak >= 3;

    const latestConfidence = toConfidenceLevelFromScore(params.record.admissionScore);
    if (
      (next.lastConfidenceLevel === "Low" && (latestConfidence === "Medium" || latestConfidence === "High")) ||
      (next.lastConfidenceLevel === "Medium" && latestConfidence === "High")
    ) {
      next.confidenceImprovedOverTime = true;
    }
    next.lastConfidenceLevel = latestConfidence;

    if (next.lastIncludedAt) {
      next.rollingRetentionReason = `Retained due to included signal within rolling window (${next.includedCount} inclusion${next.includedCount > 1 ? "s" : ""}).`;
    } else if (next.relevantDetectionCount >= 2) {
      next.rollingRetentionReason = "Retained for trend watchlist; repeated relevance observed.";
    } else {
      next.rollingRetentionReason = "Tracked inside rolling memory window.";
    }

    next.latestDebug = params.record;

    const nowMs = Date.now();
    const cutoffMs = nowMs - this.rollingWindowMs;
    next.draftHistory = next.draftHistory.filter((item) => new Date(item.timestamp).getTime() >= cutoffMs);
    next.loadingHistory = next.loadingHistory.filter((item) => new Date(item.timestamp).getTime() >= cutoffMs);
    next.agriCargoHistory = next.agriCargoHistory.filter(
      (item) => new Date(item.timestamp).getTime() >= cutoffMs,
    );
    next.commodityHistory = next.commodityHistory.filter(
      (item) => new Date(item.timestamp).getTime() >= cutoffMs,
    );
    next.confidenceHistory = next.confidenceHistory.filter(
      (item) => new Date(item.timestamp).getTime() >= cutoffMs,
    );
    next.admissionHistory = next.admissionHistory.filter((item) => new Date(item.timestamp).getTime() >= cutoffMs);
    next.destinationHistory = next.destinationHistory.slice(-80);
    next.corridorHistory = next.corridorHistory.slice(-80);

    this.rollingMemoryByKey.set(rollingKey, next);
    this.rollingKeyByVesselId.set(next.vesselId, rollingKey);
    if (next.mmsi) {
      this.rollingKeyByMmsi.set(next.mmsi, rollingKey);
    }
  }

  private annotateDebugWithRollingMemory(record: HybridNormalizationDebugRecord) {
    const key = this.rollingKeyByVesselId.get(record.vesselId) ?? record.rollingKey;
    const memory = this.rollingMemoryByKey.get(key);
    if (!memory) {
      return record;
    }

    const nowMs = Date.now();
    const rollingWindowRetained =
      nowMs - new Date(memory.lastSeenAt).getTime() <= this.rollingWindowMs;
    const watchlistRetentionRemainingHours =
      memory.watchlistActive && memory.watchlistExpiresAt
        ? Number(
            Math.max(
              0,
              (new Date(memory.watchlistExpiresAt).getTime() - nowMs) / 3_600_000,
            ).toFixed(1),
          )
        : null;

    return {
      ...record,
      rollingKey: key,
      firstSeenAt: memory.firstSeenAt,
      lastSeenAt: memory.lastSeenAt,
      firstRelevantSeenAt: memory.firstRelevantSeenAt,
      lastRelevantSeenAt: memory.lastRelevantSeenAt,
      observationCount: memory.detectionCount,
      historicalDraftSamplesCount: memory.draftSampleCount,
      historicalCorridorSamplesCount: memory.corridorHistory.length,
      historicalDestinationSamplesCount: memory.destinationHistory.length,
      scoreTrend: memory.scoreTrend,
      scoreTrendDelta: memory.scoreTrendDelta,
      loadingSignalTrend: memory.loadingTrend,
      loadingSignalTrendDelta: memory.loadingTrendDelta,
      confidenceImprovedOverTime: memory.confidenceImprovedOverTime,
      rollingWindowRetained,
      rollingRetentionReason: memory.rollingRetentionReason,
      watchlistDecision: memory.watchlistDecision,
      watchlistReasons: memory.watchlistReasons,
      watchlistEnteredAt: memory.watchlistEnteredAt,
      watchlistLastUpdatedAt: memory.watchlistLastUpdatedAt,
      watchlistRetentionRemainingHours,
      reEnrichmentCount: memory.watchlistReEnrichmentCount,
      watchlistPriorityScore: memory.watchlistPriorityScore,
      watchlistPriorityReasons: memory.watchlistPriorityReasons,
      promotionReadinessScore: memory.promotionReadinessScore,
      promotionReadinessReasons: memory.promotionReadinessReasons,
      missingSignalsForPromotion: memory.missingSignalsForPromotion,
      scoreTrendDirection: memory.scoreTrend,
      confidenceTrendDirection: memory.confidenceTrend,
      evidenceImproving: memory.evidenceImproving,
      evidenceWeakening: memory.evidenceWeakening,
      moroccoBoundTrend: memory.scoreTrend,
      agriCargoTrend: memory.agriCargoTrend,
      commodityTrend: memory.commodityTrend,
      promotionEligible: memory.watchlistDecision === "promoted",
      promotionReason: memory.watchlistPromotionReason,
      dropReason: memory.watchlistDropReason,
    };
  }

  private buildSnapshotFromRollingMemory() {
    const nowMs = Date.now();
    const vesselsById = new Map<string, VesselRecord>();
    const voyagesByVessel = new Map<string, VoyageRecord>();
    const positionsByVessel = new Map<string, LatestPosition>();
    const historyByVessel = new Map<string, string[]>();

    for (const memory of Array.from(this.rollingMemoryByKey.values())) {
      const ageMs = nowMs - new Date(memory.lastSeenAt).getTime();
      if (ageMs > this.rollingWindowMs) {
        continue;
      }
      if (!memory.latestVessel || !memory.latestVoyage || !memory.latestPosition) {
        continue;
      }

      const voyage: VoyageRecord = {
        ...memory.latestVoyage,
        firstSeenAt: memory.firstSeenAt,
        lastSeenAt: memory.lastSeenAt,
        firstRelevantSeenAt: memory.firstRelevantSeenAt,
        lastRelevantSeenAt: memory.lastRelevantSeenAt,
        observationCount: memory.detectionCount,
        relevantObservationCount: memory.relevantDetectionCount,
        corridorSampleCount: memory.corridorHistory.length,
        destinationSampleCount: memory.destinationHistory.length,
        draftSampleCount: memory.draftSampleCount,
        loadingSignalSampleCount: memory.loadingSignalSampleCount,
        scoreTrend: memory.scoreTrend,
        loadingTrend: memory.loadingTrend,
        scoreTrendDelta: memory.scoreTrendDelta,
        loadingTrendDelta: memory.loadingTrendDelta,
        confidenceImprovedOverTime: memory.confidenceImprovedOverTime,
        rollingRetentionReason: memory.rollingRetentionReason,
      };

      vesselsById.set(memory.latestVessel.id, memory.latestVessel);
      voyagesByVessel.set(voyage.vesselId, voyage);
      positionsByVessel.set(memory.latestPosition.vesselId, memory.latestPosition);
      historyByVessel.set(voyage.vesselId, memory.latestRouteHistory);
    }

    return {
      vesselsById,
      voyagesByVessel,
      positionsByVessel,
      historyByVessel,
    };
  }

  private registerPortAlias(alias: string, portCode: string) {
    const normalizedAlias = normalizeName(alias);
    const normalizedCode = normalizePortCode(portCode);
    if (!normalizedAlias || !normalizedCode) {
      return;
    }
    this.portAliasToCode.set(normalizedAlias, normalizedCode);
  }

  private registerConfiguredPortAliases() {
    for (const [code, aliases] of Object.entries(MOROCCO_PORT_VARIANTS_BY_CODE)) {
      for (const alias of aliases) {
        this.registerPortAlias(alias, code);
      }
    }

    for (const seededPort of SEEDED_EXPORT_PORTS) {
      const canonicalCode =
        seededPort.unlocodes.find((code) => this.portsByCode.has(code)) ?? seededPort.unlocodes[0];
      if (!canonicalCode) {
        continue;
      }

      this.registerPortAlias(seededPort.name, canonicalCode);
      for (const alias of seededPort.aliases) {
        this.registerPortAlias(alias, canonicalCode);
      }
    }

    for (const corridorPort of PORTS) {
      this.registerPortAlias(corridorPort.name, corridorPort.code);
    }
  }

  private resolvePortAliasCodeByName(name: string) {
    const normalized = normalizeName(name);
    if (!normalized) {
      return null;
    }

    const exact = this.portAliasToCode.get(normalized);
    if (exact) {
      return exact;
    }

    for (const [alias, code] of Array.from(this.portAliasToCode.entries())) {
      if (normalized.includes(alias) || alias.includes(normalized)) {
        return code;
      }
    }

    return null;
  }

  private inferExportSignal(options: { departureName: string; departureCode: string }): {
    relevant: boolean;
    reason: string;
    confidence: "high" | "medium" | "low";
    confidenceBand: "exact" | "high" | "medium" | "low";
    matchedBy:
      | "code"
      | "alias_exact"
      | "alias_compact"
      | "loose_inclusion"
      | "token_overlap"
      | "none";
    matchedAlias: string | null;
    port: { name: string } | null;
  } {
    const match = matchSeededExportPort({
      name: options.departureName,
      unlocode: options.departureCode,
    });

    if (match) {
      return {
        relevant: true,
        reason: `${match.port.name} (${match.reason})`,
        confidence: match.confidence,
        confidenceBand: match.confidenceBand,
        matchedBy: match.matchedBy,
        matchedAlias: match.matchedAlias,
        port: { name: match.port.name },
      };
    }

    if (isSeededExportUnlocode(options.departureCode)) {
      return {
        relevant: true,
        reason: `Seeded export UN/LOCODE match (${options.departureCode})`,
        confidence: "high" as const,
        confidenceBand: "high",
        matchedBy: "code",
        matchedAlias: options.departureCode,
        port: null,
      };
    }

    return {
      relevant: false,
      reason: "Departure signal does not match seeded export ports.",
      confidence: "low" as const,
      confidenceBand: "low",
      matchedBy: "none",
      matchedAlias: null,
      port: null,
    };
  }

  private resolveSeededAreaAnchor(options: {
    departureCode: string;
    departureName: string;
    exportPortName?: string | null;
  }): SeededAreaAnchor | null {
    const candidateCodes = new Set<string>();
    const departureCode = normalizePortCode(options.departureCode || "");
    if (departureCode) {
      candidateCodes.add(departureCode);
    }

    const aliasFromDepartureName = this.resolvePortAliasCodeByName(options.departureName);
    if (aliasFromDepartureName) {
      candidateCodes.add(aliasFromDepartureName);
    }
    const aliasFromExportName = this.resolvePortAliasCodeByName(options.exportPortName ?? "");
    if (aliasFromExportName) {
      candidateCodes.add(aliasFromExportName);
    }

    const exportMatch = matchSeededExportPort({
      unlocode: options.departureCode,
      name: options.departureName,
      contextText: options.exportPortName ?? "",
    });
    if (exportMatch) {
      for (const unlocode of exportMatch.port.unlocodes) {
        candidateCodes.add(normalizePortCode(unlocode));
      }
    }

    for (const code of Array.from(candidateCodes)) {
      const port = this.portsByCode.get(code);
      if (!port || !port.isLikelyGrainOrigin) {
        continue;
      }
      return {
        name: port.name,
        code: port.code,
        lat: port.lat,
        lon: port.lon,
      };
    }

    const candidateNames = [options.departureName, options.exportPortName ?? ""]
      .map((value) => normalizeName(value))
      .filter(Boolean);
    for (const name of candidateNames) {
      const port = this.portsByName.get(name);
      if (!port || !port.isLikelyGrainOrigin) {
        continue;
      }
      return {
        name: port.name,
        code: port.code,
        lat: port.lat,
        lon: port.lon,
      };
    }

    return null;
  }

  private countRelevantNearbyVessels(params: {
    anchor: SeededAreaAnchor | null;
    excludeVesselId: string;
    nowMs: number;
  }) {
    if (!params.anchor) {
      return 0;
    }

    let count = 0;
    for (const memory of Array.from(this.rollingMemoryByKey.values())) {
      if (memory.vesselId === params.excludeVesselId) {
        continue;
      }
      if (!memory.latestPosition || !memory.latestVessel) {
        continue;
      }
      if (params.nowMs - new Date(memory.lastSeenAt).getTime() > 48 * 3_600_000) {
        continue;
      }
      const vesselClass = normalizeVesselClass(memory.latestVessel.vesselType);
      if (!vesselClass.dryBulkCompatible) {
        continue;
      }
      const distanceKm = haversineDistanceKm(
        memory.latestPosition.lat,
        memory.latestPosition.lon,
        params.anchor.lat,
        params.anchor.lon,
      );
      if (distanceKm <= 35) {
        count += 1;
      }
    }

    return count;
  }

  private getHistoricalLoadingSamples(vesselMmsi: string) {
    const samples = this.loadingBehaviorByVessel.get(vesselMmsi) ?? [];
    return samples.slice(-24);
  }

  private pushLoadingSample(vesselMmsi: string, sample: LoadingBehaviorSample) {
    const current = this.loadingBehaviorByVessel.get(vesselMmsi) ?? [];
    current.push(sample);

    const trimmed = current
      .slice(-32)
      .filter((item, index, list) => {
        const previous = list[index - 1];
        if (!previous) {
          return true;
        }

        const sameMinute =
          Math.abs(new Date(item.timestamp).getTime() - new Date(previous.timestamp).getTime()) < 60_000;
        const sameDraft = item.draft === previous.draft;
        const sameSpeed = item.speed === previous.speed;
        const samePort = (item.departurePortCode ?? "") === (previous.departurePortCode ?? "");
        return !(sameMinute && sameDraft && sameSpeed && samePort);
      });

    this.loadingBehaviorByVessel.set(vesselMmsi, trimmed);
  }

  private destinationMatchesRequestedMoroccoPort(
    normalizedDestinationText: string,
    requestedPortCode: string,
  ) {
    const hints = MOROCCO_PORT_TEXT_HINTS[requestedPortCode] ?? [];
    const normalized = normalizedDestinationText.toLowerCase();
    return (
      destinationMatchesMoroccoCode(normalizedDestinationText, requestedPortCode) ||
      hints.some((hint) => normalized.includes(hint))
    );
  }

  private getDebugRecordForVesselId(vesselId: string) {
    const current = this.liveNormalizationDebugByVessel.get(vesselId);
    if (current) {
      return current;
    }

    const rollingKey = this.rollingKeyByVesselId.get(vesselId);
    if (!rollingKey) {
      return null;
    }

    const memory = this.rollingMemoryByKey.get(rollingKey);
    return memory?.latestDebug ?? null;
  }

  private async seedRollingMemoryFromDatabase() {
    if (this.rollingMemorySeedAttempted) {
      return;
    }
    this.rollingMemorySeedAttempted = true;
    if (!isPrismaAvailable || !prisma) {
      this.rollingMemorySeededFromDb = false;
      return;
    }

    try {
      const cutoff = new Date(Date.now() - this.rollingWindowMs);
      const recentVoyages = await prisma.voyage.findMany({
        where: {
          lastSignalAt: {
            gte: cutoff,
          },
        },
        include: {
          vessel: true,
        },
        orderBy: {
          lastSignalAt: "desc",
        },
        take: 500,
      });

      for (const row of recentVoyages) {
        if (!row.vessel) {
          continue;
        }

        const dbVesselId = cleanString(row.vessel.id, "");
        const dbMmsi = cleanString(row.vessel.mmsi, "");
        const dbImo = cleanString(row.vessel.imo, "");
        if (!dbVesselId || !dbMmsi) {
          continue;
        }

        const dbLastSignalAt = row.lastSignalAt?.toISOString?.() ?? new Date().toISOString();
        const dbEta = row.eta?.toISOString?.() ?? hoursFromNowIso(96);
        const dbDepartureDetectedAt = row.departureDetectedAt?.toISOString?.() ?? dbLastSignalAt;
        const dbDestinationText = cleanString(row.destinationText, "UNKNOWN DESTINATION");
        const dbOriginCountry = cleanString(row.originCountry, "Unknown");
        const dbCurrentLat = toNumber(row.currentLat, 0);
        const dbCurrentLon = toNumber(row.currentLon, 0);
        const dbSpeed = toNumber(row.speed, 0);
        const dbCourse = toNumber(row.course, 0);
        const dbHeading = toNumber(row.heading, 0);
        const dbTimeSinceDepartureHours = toNumber(row.timeSinceDepartureHours, 0);
        const dbDeadweight = Math.max(0, toNumber(row.vessel.deadweight, 0));
        const dbLength = Math.max(0, toNumber(row.vessel.length, 0));
        const dbWidth = Math.max(0, toNumber(row.vessel.width, 0));
        const dbLastDraft = Math.max(0, toNumber(row.vessel.lastDraft, 0));
        const dbPreviousPortId = cleanString(row.previousPortId, "UNKDEP");
        const dbDeparturePortId = cleanString(row.departurePortId, dbPreviousPortId || "UNKDEP");
        const dbDestinationPortId = cleanString(row.destinationPortId, "UNKDST");

        const vesselRecord: VesselRecord = {
          id: dbVesselId,
          imo: dbImo || "UNKNOWN",
          mmsi: dbMmsi,
          name: cleanString(row.vessel.name, dbVesselId),
          vesselType: cleanString(row.vessel.vesselType, "Unknown"),
          flag: cleanString(row.vessel.flag, "Unknown"),
          deadweight: dbDeadweight,
          length: dbLength,
          width: dbWidth,
          lastDraft: dbLastDraft,
        };

        const voyageRecord: VoyageRecord = {
          id: row.id,
          vesselId: dbVesselId,
          currentLat: dbCurrentLat,
          currentLon: dbCurrentLon,
          speed: dbSpeed,
          course: dbCourse,
          heading: dbHeading,
          destinationText: dbDestinationText,
          destinationPortId: dbDestinationPortId,
          eta: dbEta,
          previousPortId: dbPreviousPortId,
          departurePortId: dbDeparturePortId,
          departureDetectedAt: dbDepartureDetectedAt,
          timeSinceDepartureHours: dbTimeSinceDepartureHours,
          originCountry: dbOriginCountry,
          lastSignalAt: dbLastSignalAt,
        };

        const positionRecord: LatestPosition = {
          vesselId: dbVesselId,
          lat: dbCurrentLat,
          lon: dbCurrentLon,
          speed: dbSpeed,
          course: dbCourse,
          heading: dbHeading,
          timestamp: dbLastSignalAt,
        };

        const rollingKey = this.resolveRollingKey({
          vesselId: dbVesselId,
          mmsi: dbMmsi,
          imo: dbImo || null,
        });

        if (this.rollingMemoryByKey.has(rollingKey)) {
          continue;
        }

        this.rollingMemoryByKey.set(rollingKey, {
          key: rollingKey,
          vesselId: dbVesselId,
          imo: dbImo || null,
          mmsi: dbMmsi,
          firstSeenAt: dbLastSignalAt,
          lastSeenAt: dbLastSignalAt,
          firstRelevantSeenAt: dbLastSignalAt,
          lastRelevantSeenAt: dbLastSignalAt,
          detectionCount: 1,
          relevantDetectionCount: 1,
          corridorRelevantCount: 1,
          destinationSampleCount: 1,
          exportRelevantCount: 0,
          moroccoRelevantCount: 1,
          contradictoryRouteCount: 0,
          terminalMatchCount: 0,
          grainTerminalMatchCount: 0,
          draftSampleCount: dbLastDraft > 0 ? 1 : 0,
          loadingSignalSampleCount: 0,
          firstIncludedAt: dbLastSignalAt,
          lastIncludedAt: dbLastSignalAt,
          includedCount: 1,
          destinationHistory: [normalizeDestinationText(dbDestinationText)],
          corridorHistory: ["irrelevant_other"],
          draftHistory: [
            {
              timestamp: dbLastSignalAt,
              draft: dbLastDraft > 0 ? dbLastDraft : null,
              draftDelta: null,
            },
          ],
          loadingHistory: [],
          agriCargoHistory: [],
          commodityHistory: [],
          confidenceHistory: [],
          admissionHistory: [
            {
              timestamp: dbLastSignalAt,
              score: 60,
              decision: "included",
            },
          ],
          lastConfidenceLevel: "Medium",
          confidenceImprovedOverTime: false,
          scoreTrend: "flat",
          loadingTrend: "flat",
          agriCargoTrend: "flat",
          commodityTrend: "flat",
          confidenceTrend: "flat",
          scoreTrendDelta: 0,
          loadingTrendDelta: 0,
          agriCargoTrendDelta: 0,
          commodityTrendDelta: 0,
          confidenceTrendDelta: 0,
          evidenceImproving: false,
          evidenceWeakening: false,
          weakEvidenceStreak: 0,
          latestDebug: null,
          latestVessel: vesselRecord,
          latestVoyage: voyageRecord,
          latestPosition: positionRecord,
          latestRouteHistory: [voyageRecord.departurePortId, voyageRecord.previousPortId, voyageRecord.destinationPortId].filter(
            (portId, index, list) => portId && list.indexOf(portId) === index,
          ),
          rollingRetentionReason: "Recovered from persisted DB snapshot.",
          watchlistActive: false,
          watchlistEnteredAt: null,
          watchlistLastUpdatedAt: null,
          watchlistExpiresAt: null,
          watchlistReasons: [],
          watchlistDropReason: null,
          watchlistPromotionReason: null,
          watchlistLastEnrichedAt: null,
          watchlistReEnrichmentCount: 0,
          watchlistPriorityScore: 0,
          watchlistPriorityReasons: [],
          promotionReadinessScore: 0,
          promotionReadinessReasons: [],
          missingSignalsForPromotion: [],
          watchlistDecision: "not_eligible",
          promotedToRadarCount: 1,
          droppedFromWatchlistCount: 0,
        });

        this.rollingKeyByVesselId.set(dbVesselId, rollingKey);
        this.rollingKeyByMmsi.set(dbMmsi, rollingKey);
      }

      this.rollingMemorySeededFromDb = recentVoyages.length > 0;
      this.updateRollingMemoryMetrics(Date.now());
    } catch (error) {
      const message = error instanceof Error ? error.message : "unknown database error";
      console.warn(`[RadarRollingMemory] DB seed unavailable; using in-memory rolling store (${message}).`);
      this.rollingMemorySeededFromDb = false;
    }
  }

  private async requestDatalastic<T>(
    endpoint: string,
    params: Record<string, string | number>,
    context: string,
  ): Promise<DatalasticResponse<T>> {
    this.logApiUsage(`datalastic:${endpoint}`, context);

    const url = new URL(endpoint, this.datalasticBaseUrl.endsWith("/") ? this.datalasticBaseUrl : `${this.datalasticBaseUrl}/`);
    url.searchParams.set("api-key", this.datalasticApiKey);

    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, String(value));
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.requestTimeoutMs);

    try {
      const response = await fetch(url.toString(), {
        method: "GET",
        cache: "no-store",
        signal: controller.signal,
      });

      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          throw new Error("Datalastic authentication failed (invalid API key or permissions).");
        }
        if (response.status === 429) {
          throw new Error("Datalastic rate limit reached.");
        }
        throw new Error(`Datalastic request failed (${response.status} ${response.statusText}).`);
      }

      const payload = (await response.json()) as DatalasticResponse<T>;
      if (payload?.meta?.success === false) {
        const message = typeof payload.meta.message === "string"
          ? payload.meta.message
          : JSON.stringify(payload.meta.message ?? "unknown error");
        throw new Error(`Datalastic ${endpoint} error: ${message}`);
      }

      return payload;
    } finally {
      clearTimeout(timeout);
    }
  }

  private parseAisStreamMessage(payload: unknown): AISDetection | null {
    if (!payload || typeof payload !== "object") {
      return null;
    }

    const root = payload as Record<string, unknown>;
    const meta = (root.MetaData ?? {}) as Record<string, unknown>;
    const messageRoot = (root.Message ?? {}) as Record<string, unknown>;
    const positionReport = (messageRoot.PositionReport ?? {}) as Record<string, unknown>;

    const mmsi =
      toMmsiString(meta.MMSI_String) ||
      toMmsiString(meta.MMSI) ||
      toMmsiString(positionReport.UserID);

    if (!mmsi) {
      return null;
    }

    const lat = toNumber(positionReport.Latitude, Number.NaN);
    const lon = toNumber(positionReport.Longitude, Number.NaN);

    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      return null;
    }

    return {
      mmsi,
      lat,
      lon,
      speed: toNumber(positionReport.Sog, 0),
      course: toNumber(positionReport.Cog, 0),
      heading: toNumber(positionReport.TrueHeading, 0),
      shipName: cleanString(meta.ShipName, ""),
      lastSeenAt: parseAisTimestamp(meta.time_utc),
    };
  }

  private mergeDetection(current: AISDetection | undefined, next: AISDetection) {
    if (!current) {
      return next;
    }

    const currentTime = new Date(current.lastSeenAt).getTime();
    const nextTime = new Date(next.lastSeenAt).getTime();

    if (nextTime >= currentTime) {
      return {
        ...current,
        ...next,
      };
    }

    return current;
  }

  private isInRadarRegion(detection: AISDetection) {
    const corridor = classifyCorridor(detection.lat, detection.lon);
    return corridor.relevant;
  }

  private async collectAisStreamDetections() {
    this.logApiUsage("aisstream:stream", "connect");

    const detections = new Map<string, AISDetection>();
    const WebSocketCtor = await this.getWebSocketConstructor();

    const subscriptionMessage = {
      APIKey: this.aisStreamApiKey,
      BoundingBoxes: DEFAULT_BOUNDING_BOXES,
      FilterMessageTypes: ["PositionReport", "ShipStaticData"],
    };

    await new Promise<void>((resolve, reject) => {
      let settled = false;
      let opened = false;

      const ws = new WebSocketCtor(this.aisStreamUrl);

      const hardTimeout = setTimeout(() => {
        if (!settled) {
          settled = true;
          ws.terminate();
          reject(new Error("AISStream connection timed out before usable detections were collected."));
        }
      }, this.connectTimeoutMs + this.collectWindowMs + 5_000);

      let collectTimer: NodeJS.Timeout | null = null;

      const finish = (error?: Error) => {
        if (settled) {
          return;
        }

        settled = true;
        clearTimeout(hardTimeout);
        if (collectTimer) {
          clearTimeout(collectTimer);
        }

        if (ws.readyState === WS_STATE_OPEN || ws.readyState === WS_STATE_CONNECTING) {
          ws.close();
        }

        if (error) {
          reject(error);
          return;
        }

        resolve();
      };

      ws.on("open", () => {
        opened = true;
        this.logApiUsage("aisstream:stream", "opened");
        ws.send(JSON.stringify(subscriptionMessage));

        collectTimer = setTimeout(() => {
          finish();
        }, this.collectWindowMs);
      });

      ws.on("message", (raw) => {
        const rawText = Buffer.isBuffer(raw) ? raw.toString("utf8") : String(raw);
        let parsed: unknown;

        try {
          parsed = JSON.parse(rawText);
        } catch {
          return;
        }

        const detection = this.parseAisStreamMessage(parsed);
        if (!detection) {
          return;
        }

        detections.set(
          detection.mmsi,
          this.mergeDetection(detections.get(detection.mmsi), detection),
        );

        if (detections.size >= this.maxDetections) {
          finish();
        }
      });

      ws.on("error", (error) => {
        const message = error instanceof Error ? error.message : "unknown websocket error";
        if (!opened) {
          finish(new Error(`AISStream failed to connect: ${message}`));
          return;
        }

        finish(new Error(`AISStream stream error: ${message}`));
      });

      ws.on("close", () => {
        if (!settled) {
          if (!opened) {
            finish(new Error("AISStream closed before opening the websocket session."));
            return;
          }

          finish();
        }
      });
    });

    return detections;
  }

  private async resolvePort(options: {
    unlocode?: string | null;
    name?: string | null;
    countryIso?: string | null;
    fallbackLat?: number;
    fallbackLon?: number;
    forceMoroccoDestination?: boolean;
    forceLikelyOrigin?: boolean;
    allowLookup?: boolean;
  }) {
    const unlocode = cleanString(options.unlocode, "").toUpperCase();
    const name = cleanString(options.name, "");

    if (unlocode && this.portsByCode.has(unlocode)) {
      return this.portsByCode.get(unlocode) ?? null;
    }

    if (unlocode) {
      const exportMatch = matchSeededExportPort({ unlocode });
      if (exportMatch) {
        const seededAliasCode = this.resolvePortAliasCodeByName(exportMatch.port.name);
        if (seededAliasCode && this.portsByCode.has(seededAliasCode)) {
          return this.portsByCode.get(seededAliasCode) ?? null;
        }
      }
    }

    if (name) {
      const byName = this.portsByName.get(normalizeName(name));
      if (byName) {
        return byName;
      }

      const aliasCode = this.resolvePortAliasCodeByName(name);
      if (aliasCode) {
        const byAlias = this.portsByCode.get(aliasCode);
        if (byAlias) {
          return byAlias;
        }
      }
    }

    const cacheKey = `${unlocode}|${normalizeName(name)}|${cleanString(options.countryIso, "")}`;
    const cached = this.portLookupCache.get(cacheKey);
    if (cached) {
      return cached;
    }

    const allowLookup = options.allowLookup !== false;
    if (allowLookup && (unlocode || name)) {
      try {
        const payload = await this.requestDatalastic<DatalasticPort[]>(
          "port_find",
          unlocode ? { unlocode } : { name },
          unlocode ? `unlocode=${unlocode}` : `name=${name}`,
        );

        const match = Array.isArray(payload.data) ? payload.data[0] : null;
        if (match) {
          const code = cleanString(match.unlocode, unlocode || `L-${slug(name).toUpperCase()}`);
          const resolved = this.registerPort({
            id: `live-port-${slug(cleanString(match.uuid, code))}`,
            name: cleanString(match.port_name, name || code),
            country: cleanString(match.country_name, cleanString(options.countryIso, "Unknown")),
            code,
            lat: toNumber(match.lat, options.fallbackLat ?? UNKNOWN_COORDINATE),
            lon: toNumber(match.lon, options.fallbackLon ?? UNKNOWN_COORDINATE),
            isMoroccoDestination:
              Boolean(options.forceMoroccoDestination) || hasMoroccoDestinationCode(code) || isMoroccoHint(cleanString(match.port_name, "")),
            isLikelyGrainOrigin:
              Boolean(options.forceLikelyOrigin) || GRAIN_ORIGIN_CODES.has(code) || isSeededExportUnlocode(code),
          });

          this.portLookupCache.set(cacheKey, resolved);
          return resolved;
        }
      } catch {
        // Fall through to synthetic port creation.
      }
    }

    if (!unlocode && !name) {
      return null;
    }

    const syntheticCode = normalizePortCode(unlocode || `L-${slug(name || "UNK").slice(0, 5)}`);
    const synthetic = this.registerPort({
      id: `live-port-${slug(unlocode || name || syntheticCode)}`,
      name: name || syntheticCode,
      country: cleanString(options.countryIso, "Unknown"),
      code: syntheticCode,
      lat: options.fallbackLat ?? UNKNOWN_COORDINATE,
      lon: options.fallbackLon ?? UNKNOWN_COORDINATE,
      isMoroccoDestination:
        Boolean(options.forceMoroccoDestination) || hasMoroccoDestinationCode(syntheticCode) || isMoroccoHint(name),
      isLikelyGrainOrigin:
        Boolean(options.forceLikelyOrigin) ||
        GRAIN_ORIGIN_CODES.has(syntheticCode) ||
        isSeededExportUnlocode(syntheticCode),
    });

    this.portLookupCache.set(cacheKey, synthetic);
    return synthetic;
  }

  private async enrichDetection(detection: AISDetection) {
    const proPayload = await this.requestDatalastic<DatalasticVesselPro>(
      "vessel_pro",
      { mmsi: detection.mmsi },
      `mmsi=${detection.mmsi}`,
    );

    const pro = proPayload.data;
    const vesselMmsi = toMmsiString(pro.mmsi) || detection.mmsi;
    if (!vesselMmsi) {
      return null;
    }
    const imo = cleanString(pro.imo, "");
    const vesselUuid = cleanString(pro.uuid, "");
    const vesselId = mmsiToVesselId(vesselMmsi, imo, vesselUuid);
    let rollingKey = this.resolveRollingKey({
      vesselId,
      mmsi: vesselMmsi,
      imo: imo || null,
    });
    let priorRollingMemory = this.rollingMemoryByKey.get(rollingKey) ?? null;
    if (!priorRollingMemory) {
      const rollingKeyFromMmsi = this.rollingKeyByMmsi.get(vesselMmsi);
      if (rollingKeyFromMmsi) {
        const byMmsi = this.rollingMemoryByKey.get(rollingKeyFromMmsi) ?? null;
        if (byMmsi) {
          priorRollingMemory = byMmsi;
          rollingKey = byMmsi.key;
        }
      }
    }

    const rawDestinationText = cleanString(pro.destination, "");
    const rawVesselType = buildDestinationText(pro.type_specific, pro.type);
    const rawEta = cleanString(pro.eta_UTC, "");
    const rawDeparturePortName = cleanString(pro.dep_port, "");
    const rawDeparturePortCode = cleanString(pro.dep_port_unlocode, "").toUpperCase();
    const rawPreviousPortName = null;
    const rawPreviousPortCode = null;
    const rawDraftCandidate = toNumber(pro.current_draught, Number.NaN);
    const rawDraft = Number.isFinite(rawDraftCandidate) ? rawDraftCandidate : null;
    const record = pro as unknown as Record<string, unknown>;
    const rawArrivalDraftCandidate = toNumber(
      record.arrival_draught ?? record.arr_draught ?? record.draught_arrival,
      Number.NaN,
    );
    const rawArrivalDraft = Number.isFinite(rawArrivalDraftCandidate) ? rawArrivalDraftCandidate : null;

    const destinationText = buildDestinationText(rawDestinationText, pro.dest_port, pro.dest_port_unlocode);
    const vesselTypeText = rawVesselType || "Unknown";
    const normalizedType = normalizeVesselClass(vesselTypeText);
    const destinationPortCode = cleanString(pro.dest_port_unlocode, "").toUpperCase();
    const departureCode = rawDeparturePortCode;

    const currentLat = Number.isFinite(toNumber(pro.lat, Number.NaN))
      ? toNumber(pro.lat, detection.lat)
      : detection.lat;
    const currentLon = Number.isFinite(toNumber(pro.lon, Number.NaN))
      ? toNumber(pro.lon, detection.lon)
      : detection.lon;
    if (!Number.isFinite(currentLat) || !Number.isFinite(currentLon)) {
      return null;
    }

    const speed = Math.max(0, toNumber(pro.speed, detection.speed));
    const course = Math.max(0, toNumber(pro.course, detection.course));
    const heading = Math.max(0, toNumber(pro.heading, detection.heading));
    const corridor = classifyCorridor(currentLat, currentLon);

    const moroccoHint =
      isMoroccoHint(destinationText) ||
      hasMoroccoDestinationCode(destinationPortCode) ||
      destinationLooksMorocco(destinationText);
    const exportSignal = this.inferExportSignal({
      departureName: rawDeparturePortName,
      departureCode,
    });
    const departureIsGrainOrigin = exportSignal.relevant;
    const routeCorridorCompatible = corridor.moroccoCompatible;
    const historicalMoroccoRouteRelevant = departureIsGrainOrigin && (moroccoHint || routeCorridorCompatible);

    const atdDate = toDateOrNull(pro.atd_UTC);
    const ataDate = toDateOrNull(pro.ata_UTC);
    const atd = atdDate?.toISOString() ?? hoursAgoIso(12);
    const hoursSinceDeparture = atdDate
      ? Math.max(0, (Date.now() - atdDate.getTime()) / 3_600_000)
      : null;
    const portStayHours =
      ataDate && atdDate && atdDate.getTime() >= ataDate.getTime()
        ? Number(((atdDate.getTime() - ataDate.getTime()) / 3_600_000).toFixed(1))
        : null;

    const movingVoyage = speed >= 1.5;
    const preDepartureLoadingSupport =
      Boolean(atdDate) &&
      Boolean(hoursSinceDeparture !== null && hoursSinceDeparture <= 24) &&
      speed < 1.5 &&
      departureIsGrainOrigin;
    const operationallyRelevant = movingVoyage || preDepartureLoadingSupport;

    const explicitMoroccoSignals =
      moroccoHint || departureIsGrainOrigin || historicalMoroccoRouteRelevant;
    const moroccoRelevance =
      explicitMoroccoSignals || routeCorridorCompatible;

    const acquisitionReasons: string[] = [];
    if (normalizedType.dryBulkCompatible) {
      acquisitionReasons.push("Dry-bulk compatible vessel class.");
    } else if (normalizedType.exclusionReason) {
      acquisitionReasons.push(normalizedType.exclusionReason);
    } else {
      acquisitionReasons.push("Vessel class is not dry-bulk compatible.");
    }

    if (corridor.relevant) {
      acquisitionReasons.push(`Detected in seeded corridor: ${corridor.classification}.`);
    } else {
      acquisitionReasons.push(`Outside seeded corridors: ${corridor.classification}.`);
    }

    if (departureIsGrainOrigin) {
      acquisitionReasons.push(`Seeded export-port signal: ${exportSignal.reason}.`);
    }

    if (moroccoHint) {
      acquisitionReasons.push("Destination text has Morocco port hint.");
    }

    const acquisitionDecision: HybridAcquisitionDecision =
      normalizedType.dryBulkCompatible &&
      (departureIsGrainOrigin || corridor.relevant || moroccoHint)
        ? "selected"
        : "rejected";
    const acquisitionSkipReason =
      acquisitionDecision === "rejected"
        ? "Rejected by acquisition gate (requires dry-bulk class and export/corridor/Morocco relevance)."
        : null;

    let gfwProfile: GfwHistoricalProfile = {
      enrichmentAttempted: false,
      enrichmentSuccess: false,
      endpointUsed: null,
      gfwHistoricalPortMatches: [],
      gfwMoroccoVisitCount: 0,
      gfwExportPortVisitCount: 0,
      gfwHistoricalRouteHints: [],
      gfwEvidenceConfidence: "low",
      gfwReasons: ["GFW enrichment skipped: acquisition gate rejected vessel."],
    };
    if (acquisitionDecision === "selected") {
      gfwProfile = await this.gfwProvider.getHistoricalProfile({
        mmsi: vesselMmsi,
        imo: imo || undefined,
        vesselName: cleanString(pro.name, detection.shipName || vesselMmsi),
      });
    }
    const gfwSupport = summarizeGfwSupport({
      dryBulkCompatible: normalizedType.dryBulkCompatible,
      corridorRelevant: corridor.relevant,
      routeCorridorCompatible,
      explicitMoroccoSignals: moroccoHint || departureIsGrainOrigin || historicalMoroccoRouteRelevant,
      profile: gfwProfile,
    });

    let admissionScore = 0;
    const exclusionReasons: string[] = [];

    if (normalizedType.dryBulkCompatible) {
      admissionScore += 35;
    } else {
      admissionScore -= 60;
      if (normalizedType.exclusionReason) {
        exclusionReasons.push(normalizedType.exclusionReason);
      }
    }

    if (corridor.relevant) {
      admissionScore += 16;
    } else {
      admissionScore -= 30;
      exclusionReasons.push(`Irrelevant corridor: ${corridor.classification}.`);
    }

    if (routeCorridorCompatible) {
      admissionScore += 10;
    }

    if (moroccoHint) {
      admissionScore += 24;
    }

    if (departureIsGrainOrigin) {
      admissionScore += 18;
    }

    if (historicalMoroccoRouteRelevant) {
      admissionScore += 8;
    }

    if (gfwSupport.admissionDelta > 0) {
      admissionScore += gfwSupport.admissionDelta;
      acquisitionReasons.push(...gfwSupport.reasons.slice(0, 2));
    }

    if (!explicitMoroccoSignals) {
      admissionScore -= 25;
    }

    if (movingVoyage) {
      admissionScore += speed >= 3 ? 8 : 4;
    }

    if (preDepartureLoadingSupport) {
      admissionScore += 6;
    }

    if (!operationallyRelevant) {
      admissionScore -= 20;
      exclusionReasons.push(
        "Operationally irrelevant: stationary vessel without export-port loading context.",
      );
    }

    if (!moroccoRelevance) {
      admissionScore -= 20;
      exclusionReasons.push(
        "No Morocco relevance signal (destination/corridor/export/history).",
      );
    }

    if (rawDraft && rawDraft >= 7) {
      admissionScore += 5;
    }

    if (rawDeparturePortCode || rawDeparturePortName) {
      admissionScore += 3;
    }

    const normalizedMoroccoDestination = moroccoHint;
    const earlyMoroccoSuspect =
      routeCorridorCompatible || departureIsGrainOrigin || normalizedMoroccoDestination;
    const weakEvidenceOnly =
      !explicitMoroccoSignals && !rawDraft && speed < 1.5;

    let inferredDepartureConfidence: InferredDepartureConfidence = "low";
    let inferredDepartureReason =
      "Departure inferred from fallback logic due missing provider departure fields.";
    if (rawDeparturePortCode) {
      inferredDepartureConfidence = "high";
      inferredDepartureReason =
        "Departure inferred directly from provider departure UN/LOCODE.";
    } else if (departureIsGrainOrigin && exportSignal.confidence !== "low") {
      inferredDepartureConfidence = "medium";
      inferredDepartureReason = `Departure inferred from seeded export-port matching (${exportSignal.reason}).`;
    } else if (rawDeparturePortName) {
      inferredDepartureConfidence = "medium";
      inferredDepartureReason = "Departure inferred from provider departure port name.";
    }

    const loadingSignalReasons: string[] = [];
    if (normalizedType.dryBulkCompatible) {
      loadingSignalReasons.push(
        "Vessel class is dry-cargo compatible (bulk/general/dry cargo).",
      );
    } else {
      loadingSignalReasons.push("Vessel class is excluded from dry-bulk radar.");
    }

    if (departureIsGrainOrigin) {
      loadingSignalReasons.push(
        `Departure port is part of seeded grain-export intelligence (${exportSignal.reason}).`,
      );
    } else {
      loadingSignalReasons.push(
        "Departure port is not a seeded grain-export terminal.",
      );
    }

    if (rawDraft && rawDraft >= 7) {
      loadingSignalReasons.push("Draft suggests loaded condition.");
    } else {
      loadingSignalReasons.push("Draft signal is weak or missing.");
    }

    const historicalLoadingSamples = this.getHistoricalLoadingSamples(vesselMmsi);
    const seededAreaAnchor = this.resolveSeededAreaAnchor({
      departureCode: rawDeparturePortCode,
      departureName: rawDeparturePortName,
      exportPortName: exportSignal.port?.name ?? null,
    });
    const seededAreaDistanceKm =
      seededAreaAnchor !== null
        ? haversineDistanceKm(currentLat, currentLon, seededAreaAnchor.lat, seededAreaAnchor.lon)
        : null;
    const nearSeededExportAreaNow =
      typeof seededAreaDistanceKm === "number" && seededAreaDistanceKm <= 25;
    const loadingSignal = detectLoadingSignal({
      vesselType: vesselTypeText,
      departurePortCode: rawDeparturePortCode,
      departurePortName: rawDeparturePortName || exportSignal.port?.name || "",
      departurePortIsLikelyGrainOrigin: departureIsGrainOrigin,
      departureTerminalText: buildDestinationText(rawDeparturePortName, cleanString(pro.dep_terminal, "")),
      arrivalDraft: rawArrivalDraft,
      departureDraft: rawDraft,
      portStayHours,
      routeTowardMorocco: routeCorridorCompatible,
      departureDetectedAt: atd,
      departureAt: atdDate?.toISOString() ?? null,
      arrivalAt: ataDate?.toISOString() ?? null,
      timeSinceDepartureHours: hoursSinceDeparture,
      departureTimestampConfidence: atdDate ? "high" : "low",
      arrivalTimestampConfidence: ataDate ? "high" : "low",
      terminalMatchConfidenceHint: cleanString(pro.dep_terminal, "").trim() ? "medium" : undefined,
      historicalSamples: historicalLoadingSamples,
    });
    const operationalHistoricalSamples = [
      ...historicalLoadingSamples,
      {
        timestamp: toISOStringOrNow(pro.last_position_UTC || detection.lastSeenAt),
        draft: rawDraft,
        speed,
        departurePortCode: rawDeparturePortCode || null,
        nearDeparturePort: nearSeededExportAreaNow,
      } satisfies LoadingBehaviorSample,
    ];
    const nowMs = Date.now();
    const nearbyVesselCount = this.countRelevantNearbyVessels({
      anchor: seededAreaAnchor,
      excludeVesselId: vesselId,
      nowMs,
    });
    const operationalSignal = assessOperationalSignals({
      dryBulkCompatible: normalizedType.dryBulkCompatible,
      currentSpeed: speed,
      routeTowardMorocco: routeCorridorCompatible,
      timeSinceDepartureHours: hoursSinceDeparture,
      matchedTerminalType: loadingSignal.matchedTerminalType,
      loadingSignalScore: loadingSignal.loadingSignalScore,
      loadingConfidence: loadingSignal.loadingConfidence,
      draftDelta: loadingSignal.draftDelta,
      portStayHours: loadingSignal.portStayHours,
      seededArea: seededAreaAnchor
        ? {
            name: seededAreaAnchor.name,
            code: seededAreaAnchor.code,
            distanceKm: seededAreaDistanceKm,
          }
        : null,
      relevantNearbyVesselCount: nearbyVesselCount,
      historicalSamples: operationalHistoricalSamples,
    });
    loadingSignalReasons.push(
      ...operationalSignal.operationalReasons.map((reason) => `Operational: ${reason}`),
    );
    if (operationalSignal.operationalSupportScore >= 65 && loadingSignal.loadingSignalScore >= 45) {
      admissionScore += 6;
      acquisitionReasons.push("Operational waiting/berth/queue signals strongly support loading plausibility.");
    } else if (operationalSignal.operationalSupportScore >= 45) {
      admissionScore += 3;
      acquisitionReasons.push("Operational waiting/berth signals moderately support loading plausibility.");
    }
    loadingSignalReasons.push(...loadingSignal.loadingSignalReasons);
    const exportMatchedAlias = exportSignal.matchedAlias;
    const exportMatchedBy = exportSignal.matchedBy;
    const exportMatchConfidenceBand = exportSignal.confidenceBand;
    const useTerminalMatch = loadingSignal.matchedBy !== "none";
    const matchedAlias = useTerminalMatch
      ? loadingSignal.matchedAlias ?? exportMatchedAlias
      : exportMatchedAlias;
    const matchedBy = useTerminalMatch ? loadingSignal.matchedBy : exportMatchedBy;
    const matchConfidenceBand = useTerminalMatch
      ? loadingSignal.terminalMatchConfidenceBand
      : exportMatchConfidenceBand;
    const fallbackLevel = useTerminalMatch ? loadingSignal.fallbackLevel : "none";
    const knowledgeSnapshot = deriveCommodityKnowledgeSnapshot({
      departurePortCode: rawDeparturePortCode || null,
      departurePortName: rawDeparturePortName || exportSignal.port?.name || null,
      departureTerminalText: buildDestinationText(
        rawDeparturePortName,
        cleanString(pro.dep_terminal, ""),
      ),
      matchedTerminalName: loadingSignal.matchedTerminalName,
      destinationText: destinationText || null,
      vesselType: vesselTypeText,
      deadweight: null,
      corridorId: corridor.relevant ? (corridor.classification as SeededCorridorId) : null,
    });
    const knowledgeCommodityScoreDeltas = deriveKnowledgeCommodityScoreDeltas(knowledgeSnapshot);
    if (knowledgeSnapshot.knowledgeSupportScore >= 70) {
      admissionScore += 6;
      acquisitionReasons.push("Knowledge base strongly supports commodity-route plausibility.");
    } else if (knowledgeSnapshot.knowledgeSupportScore >= 50) {
      admissionScore += 3;
      acquisitionReasons.push("Knowledge base moderately supports commodity-route plausibility.");
    } else if (knowledgeSnapshot.knowledgeSupportScore < 25) {
      admissionScore -= 4;
      acquisitionReasons.push("Knowledge base support is weak for this origin/destination pattern.");
    }
    if (knowledgeSnapshot.matchedTerminalIntelligence && loadingSignal.loadingConfidence === "low") {
      admissionScore += 2;
      acquisitionReasons.push("Terminal knowledge offsets low direct loading confidence.");
    }
    if (!knowledgeSnapshot.matchedCommodityProfile && !knowledgeSnapshot.destinationIntelligenceSupport) {
      admissionScore -= 3;
      acquisitionReasons.push("Missing export/destination commodity intelligence support.");
    }
    const temporalAdjustment = this.computeTemporalAdmissionAdjustment(priorRollingMemory, {
      routeCorridorCompatible,
      departureIsGrainOrigin,
      moroccoHint,
      loadingSignalScore: loadingSignal.loadingSignalScore,
    });
    if (temporalAdjustment.delta !== 0) {
      admissionScore += temporalAdjustment.delta;
      acquisitionReasons.push(...temporalAdjustment.reasons);
    }
    const vesselName = cleanString(pro.name, detection.shipName || `MMSI ${vesselMmsi}`);
    const eta = toDateOrNull(pro.eta_UTC)?.toISOString() ?? hoursFromNowIso(96);
    const lastSignalAt = toISOStringOrNow(pro.last_position_UTC || detection.lastSeenAt);
    const nowIso = new Date(nowMs).toISOString();
    this.pushLoadingSample(vesselMmsi, {
      timestamp: lastSignalAt,
      draft: rawDraft,
      speed,
      departurePortCode: rawDeparturePortCode || null,
      nearDeparturePort: nearSeededExportAreaNow,
    });

    const previousWatchlistActive =
      Boolean(priorRollingMemory?.watchlistActive) &&
      Boolean(
        priorRollingMemory?.watchlistExpiresAt &&
          new Date(priorRollingMemory.watchlistExpiresAt).getTime() > nowMs,
      );
    const watchlistEligibility = this.evaluateWatchlistEligibility({
      dryBulkCompatible: normalizedType.dryBulkCompatible,
      corridorRelevant: corridor.relevant,
      routeCorridorCompatible,
      exportPortRelevant: departureIsGrainOrigin,
      moroccoHint,
      historicalMoroccoRouteRelevant,
      operationallyRelevant,
      speed,
      preDepartureLoadingSupport,
    });
    const layerScoresBase = computeWatchlistLayerScores({
      admissionScore,
      dryBulkCompatible: normalizedType.dryBulkCompatible,
      exportPortRelevant: departureIsGrainOrigin,
      routeCorridorCompatible,
      corridorRelevant: corridor.relevant,
      moroccoHint,
      historicalMoroccoRouteRelevant,
      operationallyRelevant,
      draft: rawDraft,
      loadingSignalScore: loadingSignal.loadingSignalScore,
      destinationText: destinationText || "UNKNOWN",
    });
    const layerScores = {
      ...layerScoresBase,
      moroccoBoundScore: layerScoresBase.moroccoBoundScore,
      agriCargoScore: layerScoresBase.agriCargoScore,
      commodityScore: layerScoresBase.commodityScore,
    };
    if (operationalSignal.operationalSupportScore >= 65 && operationalSignal.loadingQueuePlausibility >= 55) {
      layerScores.moroccoBoundScore = clampScore(layerScores.moroccoBoundScore + 3);
      layerScores.agriCargoScore = clampScore(layerScores.agriCargoScore + 8);
      layerScores.commodityScore = clampScore(layerScores.commodityScore + 5);
    } else if (operationalSignal.operationalSupportScore >= 45) {
      layerScores.moroccoBoundScore = clampScore(layerScores.moroccoBoundScore + 1);
      layerScores.agriCargoScore = clampScore(layerScores.agriCargoScore + 4);
      layerScores.commodityScore = clampScore(layerScores.commodityScore + 2);
    }
    const scoreTrendDirection = priorRollingMemory?.scoreTrend ?? "flat";
    const confidenceTrendDirection = priorRollingMemory?.confidenceTrend ?? "flat";
    const predictedWeakEvidenceStreak = weakEvidenceOnly
      ? (priorRollingMemory?.weakEvidenceStreak ?? 0) + 1
      : 0;
    const previousDestinationText =
      priorRollingMemory?.destinationHistory[priorRollingMemory.destinationHistory.length - 1] ?? "";
    const destinationChanged =
      normalizeDestinationText(previousDestinationText) !== normalizeDestinationText(destinationText || "UNKNOWN");
    const voyageCommodityProxy = {
      wheatScore: clampScore(
        18 + knowledgeSnapshot.commodityBias.wheatScore * 0.5 + knowledgeSnapshot.commoditySupportBoost * 0.25,
      ),
      barleyScore: clampScore(
        18 + knowledgeSnapshot.commodityBias.barleyScore * 0.5 + knowledgeSnapshot.commoditySupportBoost * 0.2,
      ),
      cornScore: clampScore(
        18 + knowledgeSnapshot.commodityBias.cornScore * 0.5 + knowledgeSnapshot.commoditySupportBoost * 0.2,
      ),
      soybeanMealScore: clampScore(
        18 +
          knowledgeSnapshot.commodityBias.soybeanMealScore * 0.5 +
          knowledgeSnapshot.commoditySupportBoost * 0.25,
      ),
    };
    const voyageCommodityRanking = [
      { commodity: "wheat" as const, score: voyageCommodityProxy.wheatScore },
      { commodity: "barley" as const, score: voyageCommodityProxy.barleyScore },
      { commodity: "corn" as const, score: voyageCommodityProxy.cornScore },
      { commodity: "soybeanMeal" as const, score: voyageCommodityProxy.soybeanMealScore },
    ].sort((a, b) => b.score - a.score);
    const topCommodity = voyageCommodityRanking[0]?.commodity ?? "wheat";
    const commodityConfidenceLabel = toCommodityConfidenceLabelFromScore(
      voyageCommodityRanking[0]?.score ?? 0,
    );
    const voyageHypothesis = evaluateVoyageHypotheses({
      vesselType: vesselTypeText,
      deadweight: null,
      departurePortCode: rawDeparturePortCode || null,
      departurePortName: rawDeparturePortName || exportSignal.port?.name || null,
      destinationText: destinationText || null,
      matchedTerminalType: loadingSignal.matchedTerminalType,
      corridorId: corridor.relevant ? (corridor.classification as SeededCorridorId) : null,
      currentMaritimeZone: corridor.classification,
      loadingSignalScore: loadingSignal.loadingSignalScore,
      loadingConfidence: loadingSignal.loadingConfidence,
      moroccoBoundScore: layerScores.moroccoBoundScore,
      agriCargoScore: layerScores.agriCargoScore,
      knowledgeSupportScore: knowledgeSnapshot.knowledgeSupportScore,
      commodityScores: voyageCommodityProxy,
      mostLikelyCommodity: topCommodity,
      routeConsistent: routeCorridorCompatible,
      timeSinceDepartureHours: hoursSinceDeparture ?? 0,
      observationCount: priorRollingMemory?.detectionCount ?? 1,
      evidenceImproving: priorRollingMemory?.evidenceImproving ?? false,
      scoreTrendDirection: scoreTrendDirection,
      gfwMoroccoVisitCount: gfwProfile.gfwMoroccoVisitCount,
      gfwExportPortVisitCount: gfwProfile.gfwExportPortVisitCount,
      gfwHistoricalRouteHints: gfwProfile.gfwHistoricalRouteHints,
      gfwEvidenceConfidence: gfwProfile.gfwEvidenceConfidence,
      operationalSupportScore: operationalSignal.operationalSupportScore,
      waitingPatternSignal: operationalSignal.waitingPatternSignal,
      berthProximitySignal: operationalSignal.berthProximitySignal,
      loadingQueuePlausibility: operationalSignal.loadingQueuePlausibility,
      operationalEvidenceConfidence: operationalSignal.operationalEvidenceConfidence,
    });
    const promotionReadiness = computePromotionReadiness({
      dryBulkCompatible: normalizedType.dryBulkCompatible,
      corridorRelevant: corridor.relevant,
      explicitMoroccoSignals,
      operationallyRelevant,
      admissionScore: layerScores.moroccoBoundScore,
      loadingSignalScore: loadingSignal.loadingSignalScore,
      observationCount: priorRollingMemory?.detectionCount ?? 1,
      knowledgeSupportScore: knowledgeSnapshot.knowledgeSupportScore,
      hasTerminalKnowledge: knowledgeSnapshot.matchedTerminalIntelligence,
      hasDestinationKnowledge: knowledgeSnapshot.destinationIntelligenceSupport,
      topVoyageHypothesis: voyageHypothesis.topVoyageHypothesis,
      topVoyageHypothesisScore: voyageHypothesis.topVoyageHypothesisScore,
      topVoyageHypothesisConfidence: voyageHypothesis.topVoyageHypothesisConfidence,
      voyageHypothesisEvidenceStyle: voyageHypothesis.voyageHypothesisEvidenceStyle,
      gfwSupportScore: gfwSupport.supportScore,
      gfwMoroccoVisitCount: gfwProfile.gfwMoroccoVisitCount,
      gfwExportPortVisitCount: gfwProfile.gfwExportPortVisitCount,
      gfwEvidenceConfidence: gfwProfile.gfwEvidenceConfidence,
      operationalSupportScore: operationalSignal.operationalSupportScore,
      waitingPatternSignal: operationalSignal.waitingPatternSignal,
      loadingQueuePlausibility: operationalSignal.loadingQueuePlausibility,
      operationalEvidenceConfidence: operationalSignal.operationalEvidenceConfidence,
    });
    const watchlistPriority = computeWatchlistPriority({
      dryBulkCompatible: normalizedType.dryBulkCompatible,
      exportPortRelevant: departureIsGrainOrigin,
      corridorRelevant: corridor.relevant,
      routeCorridorCompatible,
      moroccoHint,
      historicalMoroccoRouteRelevant,
      operationallyRelevant,
      loadingSignalScore: loadingSignal.loadingSignalScore,
      agriCargoScore: layerScores.agriCargoScore,
      commodityScore: layerScores.commodityScore,
      draftDelta: loadingSignal.draftDelta,
      destinationChanged,
      observationCount: priorRollingMemory?.detectionCount ?? 1,
      relevantObservationCount: priorRollingMemory?.relevantDetectionCount ?? 1,
      scoreTrendDirection,
      confidenceTrendDirection,
      weakEvidenceStreak: predictedWeakEvidenceStreak,
      missingSignalsForPromotionCount: promotionReadiness.missingSignals.length,
      promotionReadinessScore: promotionReadiness.score,
      knowledgeSupportScore: knowledgeSnapshot.knowledgeSupportScore,
      hasTerminalKnowledge: knowledgeSnapshot.matchedTerminalIntelligence,
      hasDestinationKnowledge: knowledgeSnapshot.destinationIntelligenceSupport,
      topVoyageHypothesis: voyageHypothesis.topVoyageHypothesis,
      topVoyageHypothesisScore: voyageHypothesis.topVoyageHypothesisScore,
      topVoyageHypothesisConfidence: voyageHypothesis.topVoyageHypothesisConfidence,
      voyageHypothesisEvidenceStyle: voyageHypothesis.voyageHypothesisEvidenceStyle,
      missingSignalsForVoyageConfirmationCount:
        voyageHypothesis.missingSignalsForVoyageConfirmation.length,
      gfwSupportScore: gfwSupport.supportScore,
      gfwMoroccoVisitCount: gfwProfile.gfwMoroccoVisitCount,
      gfwExportPortVisitCount: gfwProfile.gfwExportPortVisitCount,
      gfwEvidenceConfidence: gfwProfile.gfwEvidenceConfidence,
      operationalSupportScore: operationalSignal.operationalSupportScore,
      portCongestionSignal: operationalSignal.portCongestionSignal,
      berthProximitySignal: operationalSignal.berthProximitySignal,
      waitingPatternSignal: operationalSignal.waitingPatternSignal,
      loadingQueuePlausibility: operationalSignal.loadingQueuePlausibility,
      operationalEvidenceConfidence: operationalSignal.operationalEvidenceConfidence,
    });
    const reEnrichPolicy = this.shouldReenrichWatchlist(priorRollingMemory, {
      destinationText: destinationText || "UNKNOWN",
      corridorClassification: corridor.classification,
      draft: rawDraft,
      watchlistPriorityScore: watchlistPriority.score,
      nowMs,
    });
    let admissionDecision: HybridAdmissionDecision = "excluded";
    let watchlistDecision: HybridWatchlistDecision = "not_eligible";
    const watchlistReasons: string[] = [...watchlistEligibility.reasons];
    let watchlistEnteredAt: string | null = priorRollingMemory?.watchlistEnteredAt ?? null;
    let watchlistLastUpdatedAt: string | null = null;
    let watchlistRetentionRemainingHours: number | null = null;
    let promotionEligible = false;
    let promotionReason: string | null = null;
    let dropReason: string | null = null;
    let watchlistReEnrichmentTriggered = false;
    const priorReEnrichmentCount = priorRollingMemory?.watchlistReEnrichmentCount ?? 0;
    let reEnrichmentCount = priorReEnrichmentCount;

    if (acquisitionDecision === "rejected") {
      if (previousWatchlistActive) {
        watchlistDecision = "dropped";
        dropReason = "Failed acquisition gate during active watchlist period.";
        watchlistReasons.push("Dropped: acquisition gate no longer satisfied.");
        watchlistLastUpdatedAt = nowIso;
      }
      if (watchlistDecision !== "not_eligible") {
        watchlistReasons.push(`Watchlist priority: ${watchlistPriority.score}/100.`);
        watchlistReasons.push(
          `Missing signals: ${promotionReadiness.missingSignals.slice(0, 3).join(", ") || "none"}.`,
        );
      }
      const debugRecord: HybridNormalizationDebugRecord = {
        vesselId,
        vesselName,
        rollingKey,
        sourceMmsi: vesselMmsi,
        rawDestinationText: rawDestinationText || null,
        normalizedDestinationText: normalizeDestinationText(destinationText || "UNKNOWN"),
        rawVesselType: rawVesselType || null,
        normalizedVesselType: normalizedType.normalizedVesselType,
        normalizedVesselClass: normalizedType.normalizedVesselClass,
        rawEta: rawEta || null,
        normalizedEta: eta,
        rawDraft,
        normalizedDraft: Math.max(0, rawDraft ?? 0),
        rawDeparturePortName: rawDeparturePortName || null,
        rawDeparturePortCode: rawDeparturePortCode || null,
        rawPreviousPortName,
        rawPreviousPortCode,
        exportMatchedAlias,
        exportMatchedBy,
        exportMatchConfidenceBand,
        inferredDeparturePort:
          rawDeparturePortName || exportSignal.port?.name || rawDeparturePortCode || "Unknown Departure",
        inferredDepartureConfidence,
        inferredDepartureReason,
        corridorClassification: corridor.classification,
        corridorRelevant: corridor.relevant,
        routeCorridorCompatible,
        exportPortRelevant: departureIsGrainOrigin,
        destinationTextMoroccoHint: moroccoHint,
        historicalMoroccoRouteRelevant,
        operationallyRelevant,
        acquisitionDecision,
        acquisitionReasons,
        acquisitionDryBulkCompatible: normalizedType.dryBulkCompatible,
        acquisitionCorridorRelevant: corridor.relevant,
        acquisitionExportPortRelevant: departureIsGrainOrigin,
        acquisitionMoroccoRelevant: moroccoHint || routeCorridorCompatible,
        enrichmentAttempted: false,
        enrichmentSkipped: true,
        enrichmentSkipReason: acquisitionSkipReason,
        gfwEnrichmentAttempted: gfwProfile.enrichmentAttempted,
        gfwEnrichmentSuccess: gfwProfile.enrichmentSuccess,
        gfwEndpointUsed: gfwProfile.endpointUsed,
        gfwHistoricalPortMatches: gfwProfile.gfwHistoricalPortMatches,
        gfwMoroccoVisitCount: gfwProfile.gfwMoroccoVisitCount,
        gfwExportPortVisitCount: gfwProfile.gfwExportPortVisitCount,
        gfwHistoricalRouteHints: gfwProfile.gfwHistoricalRouteHints,
        gfwEvidenceConfidence: gfwProfile.gfwEvidenceConfidence,
        gfwReasons: gfwProfile.gfwReasons,
        mostLikelyCommodity: topCommodity,
        commodityConfidenceLabel,
        operationalSupportScore: operationalSignal.operationalSupportScore,
        portCongestionSignal: operationalSignal.portCongestionSignal,
        berthProximitySignal: operationalSignal.berthProximitySignal,
        waitingPatternSignal: operationalSignal.waitingPatternSignal,
        loadingQueuePlausibility: operationalSignal.loadingQueuePlausibility,
        operationalEvidenceConfidence: operationalSignal.operationalEvidenceConfidence,
        operationalReasons: operationalSignal.operationalReasons,
        repeatedObservedNearSeededExportArea:
          operationalSignal.repeatedObservedNearSeededExportArea,
        lowSpeedDurationNearSeededPortHours:
          operationalSignal.lowSpeedDurationNearSeededPortHours,
        relevantNearbyVesselCount: operationalSignal.relevantNearbyVesselCount,
        operationalSeededExportArea: operationalSignal.operationalSeededExportArea,
        admissionScore: clampAdmissionScore(admissionScore),
        admissionDecision: "excluded",
        exclusionReasons: [acquisitionSkipReason].filter((value): value is string => Boolean(value)),
        normalizedMoroccoDestination: moroccoHint,
        earlyMoroccoSuspect,
        weakEvidenceOnly,
        loadingSignalReasons,
        topVoyageHypothesis: voyageHypothesis.topVoyageHypothesis,
        topVoyageHypothesisScore: voyageHypothesis.topVoyageHypothesisScore,
        topVoyageHypothesisConfidence: voyageHypothesis.topVoyageHypothesisConfidence,
        voyageHypothesisEvidenceStyle: voyageHypothesis.voyageHypothesisEvidenceStyle,
        voyageHypothesisReasons: voyageHypothesis.voyageHypothesisReasons,
        alternativeVoyageHypotheses: voyageHypothesis.alternativeVoyageHypotheses,
        missingSignalsForVoyageConfirmation:
          voyageHypothesis.missingSignalsForVoyageConfirmation,
        loadingSignalScore: loadingSignal.loadingSignalScore,
        draftDelta: loadingSignal.draftDelta,
        portStayHours: loadingSignal.portStayHours,
        loadingTerminalMatch: loadingSignal.loadingTerminalMatch,
        loadingConfidence: loadingSignal.loadingConfidence,
        loadingEvidenceStrength: loadingSignal.loadingEvidenceStrength,
        missingCriticalSignals: loadingSignal.missingCriticalSignals,
        matchedTerminalName: loadingSignal.matchedTerminalName,
        matchedTerminalType: loadingSignal.matchedTerminalType,
        terminalMatchConfidence: loadingSignal.terminalMatchConfidence,
        terminalMatchConfidenceBand: loadingSignal.terminalMatchConfidenceBand,
        terminalMatchedAlias: loadingSignal.matchedAlias,
        terminalMatchedBy: loadingSignal.matchedBy,
        terminalFallbackLevel: loadingSignal.fallbackLevel,
        matchedAlias,
        matchedBy,
        matchConfidenceBand,
        fallbackLevel,
        portStayConfidence: loadingSignal.portStayConfidence,
        arrivalDraftEstimate: loadingSignal.arrivalDraftEstimate,
        departureDraftEstimate: loadingSignal.departureDraftEstimate,
        arrivalDraftConfidence: loadingSignal.arrivalDraftConfidence,
        departureDraftConfidence: loadingSignal.departureDraftConfidence,
        draftDeltaConfidence: loadingSignal.draftDeltaConfidence,
        grainTerminalMatch: loadingSignal.grainTerminalMatch,
        matchedCommodityKnowledgeNode: knowledgeSnapshot.matchedCommodityKnowledgeNode,
        terminalCommodityProfile: knowledgeSnapshot.terminalCommodityProfile,
        vesselClassKnowledgeProfile: knowledgeSnapshot.vesselClassKnowledgeProfile,
        destinationKnowledgeProfile: knowledgeSnapshot.destinationKnowledgeProfile,
        knowledgeBasedCommodityReasons: knowledgeSnapshot.knowledgeBasedCommodityReasons,
        knowledgeSupportScore: knowledgeSnapshot.knowledgeSupportScore,
        knowledgeAgriScoreDelta: knowledgeSnapshot.agriSupportBoost,
        knowledgeCommodityScoreBoost: knowledgeSnapshot.commoditySupportBoost,
        knowledgeCommodityScoreDeltas,
        knowledgeMatchedTerminalIntelligence: knowledgeSnapshot.matchedTerminalIntelligence,
        knowledgeMatchedCommodityProfile: knowledgeSnapshot.matchedCommodityProfile,
        knowledgeDestinationIntelligenceSupport: knowledgeSnapshot.destinationIntelligenceSupport,
        firstSeenAt: null,
        lastSeenAt: null,
        firstRelevantSeenAt: null,
        lastRelevantSeenAt: null,
        observationCount: 1,
        historicalDraftSamplesCount: typeof loadingSignal.departureDraftEstimate === "number" ? 1 : 0,
        historicalCorridorSamplesCount: 1,
        historicalDestinationSamplesCount: 1,
        scoreTrend: scoreTrendDirection,
        scoreTrendDelta: priorRollingMemory?.scoreTrendDelta ?? 0,
        loadingSignalTrend: priorRollingMemory?.loadingTrend ?? "flat",
        loadingSignalTrendDelta: priorRollingMemory?.loadingTrendDelta ?? 0,
        confidenceImprovedOverTime: priorRollingMemory?.confidenceImprovedOverTime ?? false,
        rollingWindowRetained: false,
        rollingRetentionReason: "Tracked in current snapshot only.",
        temporalAdjustmentReasons: temporalAdjustment.reasons,
        watchlistDecision,
        watchlistReasons,
        watchlistEnteredAt,
        watchlistLastUpdatedAt,
        watchlistRetentionRemainingHours,
        reEnrichmentCount,
        watchlistPriorityScore: watchlistPriority.score,
        watchlistPriorityReasons: watchlistPriority.reasons,
        promotionReadinessScore: promotionReadiness.score,
        promotionReadinessReasons: promotionReadiness.reasons,
        missingSignalsForPromotion: promotionReadiness.missingSignals,
        scoreTrendDirection,
        confidenceTrendDirection,
        evidenceImproving: priorRollingMemory?.evidenceImproving ?? false,
        evidenceWeakening:
          (priorRollingMemory?.evidenceWeakening ?? false) || predictedWeakEvidenceStreak >= 3,
        moroccoBoundTrend: scoreTrendDirection,
        agriCargoTrend: priorRollingMemory?.agriCargoTrend ?? "flat",
        commodityTrend: priorRollingMemory?.commodityTrend ?? "flat",
        promotionEligible,
        promotionReason,
        dropReason,
        currentLat,
        currentLon,
        speed,
        course,
        heading,
        lastSignalAt,
      };
      this.liveNormalizationDebugByVessel.set(vesselId, debugRecord);
      return null;
    }

    admissionDecision =
      normalizedType.dryBulkCompatible &&
      corridor.relevant &&
      explicitMoroccoSignals &&
      operationallyRelevant &&
      admissionScore >= 50
        ? "included"
        : "excluded";

    if (admissionDecision === "included") {
      promotionEligible = true;
      if (previousWatchlistActive) {
        watchlistDecision = "promoted";
        promotionReason = "Promoted: strict radar admission criteria now satisfied.";
        watchlistReasons.push("Promoted from watchlist to main radar.");
      } else {
        watchlistDecision = "not_eligible";
      }
    } else if (watchlistEligibility.eligible) {
      watchlistLastUpdatedAt = nowIso;
      if (previousWatchlistActive) {
        watchlistDecision = "retained";
        watchlistReasons.push("Retained in watchlist while strict admission remains unmet.");
      } else {
        watchlistDecision = "entered";
        watchlistEnteredAt = nowIso;
        watchlistReasons.push("Entered watchlist for continued evidence accumulation.");
      }
      watchlistReEnrichmentTriggered = reEnrichPolicy.shouldReenrich;
      if (watchlistReEnrichmentTriggered) {
        watchlistReasons.push(`Re-enrichment triggered: ${reEnrichPolicy.reason}`);
        reEnrichmentCount += 1;
      } else {
        watchlistReasons.push(`Re-enrichment skipped: ${reEnrichPolicy.reason}`);
      }
      const baseEnteredAt = watchlistEnteredAt ?? nowIso;
      const expiresAtMs = new Date(baseEnteredAt).getTime() + this.watchlistRetentionMs;
      watchlistRetentionRemainingHours = Number(Math.max(0, (expiresAtMs - nowMs) / 3_600_000).toFixed(1));
    } else if (previousWatchlistActive) {
      watchlistDecision = "dropped";
      dropReason = watchlistEligibility.dropReason ?? "Watchlist relevance no longer satisfied.";
      watchlistReasons.push(`Dropped from watchlist: ${dropReason}`);
      watchlistLastUpdatedAt = nowIso;
    }

    if (watchlistDecision !== "not_eligible") {
      watchlistReasons.push(`Watchlist priority: ${watchlistPriority.score}/100.`);
      if (operationalSignal.operationalSupportScore >= 45) {
        watchlistReasons.push(
          `Operational support: ${operationalSignal.operationalSupportScore}/100 (${operationalSignal.operationalEvidenceConfidence}).`,
        );
        if (operationalSignal.operationalReasons.length > 0) {
          watchlistReasons.push(`Operational: ${operationalSignal.operationalReasons[0]}`);
        }
      }
      if (gfwSupport.supportScore >= 45) {
        watchlistReasons.push(`GFW historical support: ${gfwSupport.supportScore}/100.`);
      }
      if (gfwProfile.gfwReasons.length > 0) {
        watchlistReasons.push(`GFW: ${gfwProfile.gfwReasons[0]}`);
      }
      watchlistReasons.push(
        `Voyage hypothesis: ${voyageHypothesis.topVoyageHypothesis.replaceAll("_", " ")} (${voyageHypothesis.topVoyageHypothesisScore}).`,
      );
      if (promotionReadiness.score >= 75) {
        watchlistReasons.push("Promotion readiness is high; vessel is near strict admission.");
      } else if (promotionReadiness.score >= 55) {
        watchlistReasons.push("Promotion readiness is moderate; additional evidence required.");
      } else {
        watchlistReasons.push("Promotion readiness is low; evidence remains incomplete.");
      }
      if (promotionReadiness.missingSignals.length > 0) {
        watchlistReasons.push(
          `Missing signals: ${promotionReadiness.missingSignals.slice(0, 3).join(", ")}.`,
        );
      }
      if (voyageHypothesis.missingSignalsForVoyageConfirmation.length > 0) {
        watchlistReasons.push(
          `Voyage confirmation gaps: ${voyageHypothesis.missingSignalsForVoyageConfirmation
            .slice(0, 3)
            .join(", ")}.`,
        );
      }
    }

    if (admissionDecision === "excluded") {
      if (!normalizedType.dryBulkCompatible && normalizedType.exclusionReason) {
        exclusionReasons.push(normalizedType.exclusionReason);
      }
      if (!corridor.relevant) {
        exclusionReasons.push("Position is outside target maritime corridors.");
      }
      if (!explicitMoroccoSignals) {
        exclusionReasons.push("Morocco/export evidence criteria not met.");
      }
      if (!operationallyRelevant) {
        exclusionReasons.push("Operational pattern indicates non-voyage harbor clutter.");
      }
      if (admissionScore < 50) {
        exclusionReasons.push(`Admission score below threshold (${clampAdmissionScore(admissionScore)} < 50).`);
      }
    }

    const debugRecord: HybridNormalizationDebugRecord = {
      vesselId,
      vesselName,
      rollingKey,
      sourceMmsi: vesselMmsi,
      rawDestinationText: rawDestinationText || null,
      normalizedDestinationText: normalizeDestinationText(destinationText || "UNKNOWN"),
      rawVesselType: rawVesselType || null,
      normalizedVesselType: normalizedType.normalizedVesselType,
      normalizedVesselClass: normalizedType.normalizedVesselClass,
      rawEta: rawEta || null,
      normalizedEta: eta,
      rawDraft,
      normalizedDraft: Math.max(0, rawDraft ?? 0),
      rawDeparturePortName: rawDeparturePortName || null,
      rawDeparturePortCode: rawDeparturePortCode || null,
      rawPreviousPortName,
      rawPreviousPortCode,
      exportMatchedAlias,
      exportMatchedBy,
      exportMatchConfidenceBand,
      inferredDeparturePort:
        rawDeparturePortName || exportSignal.port?.name || rawDeparturePortCode || "Unknown Departure",
      inferredDepartureConfidence,
      inferredDepartureReason,
      corridorClassification: corridor.classification,
      corridorRelevant: corridor.relevant,
      routeCorridorCompatible,
      exportPortRelevant: departureIsGrainOrigin,
      destinationTextMoroccoHint: moroccoHint,
      historicalMoroccoRouteRelevant,
      operationallyRelevant,
      acquisitionDecision,
      acquisitionReasons,
      acquisitionDryBulkCompatible: normalizedType.dryBulkCompatible,
      acquisitionCorridorRelevant: corridor.relevant,
      acquisitionExportPortRelevant: departureIsGrainOrigin,
      acquisitionMoroccoRelevant: moroccoHint || routeCorridorCompatible,
      enrichmentAttempted: admissionDecision === "included",
      enrichmentSkipped: admissionDecision !== "included",
      enrichmentSkipReason:
        admissionDecision === "included"
          ? null
          : "Rejected by strict admission gate after acquisition selection.",
      gfwEnrichmentAttempted: gfwProfile.enrichmentAttempted,
      gfwEnrichmentSuccess: gfwProfile.enrichmentSuccess,
      gfwEndpointUsed: gfwProfile.endpointUsed,
      gfwHistoricalPortMatches: gfwProfile.gfwHistoricalPortMatches,
      gfwMoroccoVisitCount: gfwProfile.gfwMoroccoVisitCount,
      gfwExportPortVisitCount: gfwProfile.gfwExportPortVisitCount,
      gfwHistoricalRouteHints: gfwProfile.gfwHistoricalRouteHints,
      gfwEvidenceConfidence: gfwProfile.gfwEvidenceConfidence,
      gfwReasons: gfwProfile.gfwReasons,
      mostLikelyCommodity: topCommodity,
      commodityConfidenceLabel,
      operationalSupportScore: operationalSignal.operationalSupportScore,
      portCongestionSignal: operationalSignal.portCongestionSignal,
      berthProximitySignal: operationalSignal.berthProximitySignal,
      waitingPatternSignal: operationalSignal.waitingPatternSignal,
      loadingQueuePlausibility: operationalSignal.loadingQueuePlausibility,
      operationalEvidenceConfidence: operationalSignal.operationalEvidenceConfidence,
      operationalReasons: operationalSignal.operationalReasons,
      repeatedObservedNearSeededExportArea:
        operationalSignal.repeatedObservedNearSeededExportArea,
      lowSpeedDurationNearSeededPortHours:
        operationalSignal.lowSpeedDurationNearSeededPortHours,
      relevantNearbyVesselCount: operationalSignal.relevantNearbyVesselCount,
      operationalSeededExportArea: operationalSignal.operationalSeededExportArea,
      admissionScore: clampAdmissionScore(admissionScore),
      admissionDecision,
      exclusionReasons: exclusionReasons.filter(
        (reason, index, list) => list.indexOf(reason) === index,
      ),
      normalizedMoroccoDestination,
      earlyMoroccoSuspect,
      weakEvidenceOnly,
      loadingSignalReasons,
      topVoyageHypothesis: voyageHypothesis.topVoyageHypothesis,
      topVoyageHypothesisScore: voyageHypothesis.topVoyageHypothesisScore,
      topVoyageHypothesisConfidence: voyageHypothesis.topVoyageHypothesisConfidence,
      voyageHypothesisEvidenceStyle: voyageHypothesis.voyageHypothesisEvidenceStyle,
      voyageHypothesisReasons: voyageHypothesis.voyageHypothesisReasons,
      alternativeVoyageHypotheses: voyageHypothesis.alternativeVoyageHypotheses,
      missingSignalsForVoyageConfirmation:
        voyageHypothesis.missingSignalsForVoyageConfirmation,
      loadingSignalScore: loadingSignal.loadingSignalScore,
      draftDelta: loadingSignal.draftDelta,
      portStayHours: loadingSignal.portStayHours,
      loadingTerminalMatch: loadingSignal.loadingTerminalMatch,
      loadingConfidence: loadingSignal.loadingConfidence,
      loadingEvidenceStrength: loadingSignal.loadingEvidenceStrength,
      missingCriticalSignals: loadingSignal.missingCriticalSignals,
      matchedTerminalName: loadingSignal.matchedTerminalName,
      matchedTerminalType: loadingSignal.matchedTerminalType,
      terminalMatchConfidence: loadingSignal.terminalMatchConfidence,
      terminalMatchConfidenceBand: loadingSignal.terminalMatchConfidenceBand,
      terminalMatchedAlias: loadingSignal.matchedAlias,
      terminalMatchedBy: loadingSignal.matchedBy,
      terminalFallbackLevel: loadingSignal.fallbackLevel,
      matchedAlias,
      matchedBy,
      matchConfidenceBand,
      fallbackLevel,
      portStayConfidence: loadingSignal.portStayConfidence,
      arrivalDraftEstimate: loadingSignal.arrivalDraftEstimate,
      departureDraftEstimate: loadingSignal.departureDraftEstimate,
      arrivalDraftConfidence: loadingSignal.arrivalDraftConfidence,
      departureDraftConfidence: loadingSignal.departureDraftConfidence,
      draftDeltaConfidence: loadingSignal.draftDeltaConfidence,
      grainTerminalMatch: loadingSignal.grainTerminalMatch,
      matchedCommodityKnowledgeNode: knowledgeSnapshot.matchedCommodityKnowledgeNode,
      terminalCommodityProfile: knowledgeSnapshot.terminalCommodityProfile,
      vesselClassKnowledgeProfile: knowledgeSnapshot.vesselClassKnowledgeProfile,
      destinationKnowledgeProfile: knowledgeSnapshot.destinationKnowledgeProfile,
      knowledgeBasedCommodityReasons: knowledgeSnapshot.knowledgeBasedCommodityReasons,
      knowledgeSupportScore: knowledgeSnapshot.knowledgeSupportScore,
      knowledgeAgriScoreDelta: knowledgeSnapshot.agriSupportBoost,
      knowledgeCommodityScoreBoost: knowledgeSnapshot.commoditySupportBoost,
      knowledgeCommodityScoreDeltas,
      knowledgeMatchedTerminalIntelligence: knowledgeSnapshot.matchedTerminalIntelligence,
      knowledgeMatchedCommodityProfile: knowledgeSnapshot.matchedCommodityProfile,
      knowledgeDestinationIntelligenceSupport: knowledgeSnapshot.destinationIntelligenceSupport,
      firstSeenAt: null,
      lastSeenAt: null,
      firstRelevantSeenAt: null,
      lastRelevantSeenAt: null,
      observationCount: 1,
      historicalDraftSamplesCount: typeof loadingSignal.departureDraftEstimate === "number" ? 1 : 0,
      historicalCorridorSamplesCount: 1,
      historicalDestinationSamplesCount: 1,
      scoreTrend: scoreTrendDirection,
      scoreTrendDelta: priorRollingMemory?.scoreTrendDelta ?? 0,
      loadingSignalTrend: priorRollingMemory?.loadingTrend ?? "flat",
      loadingSignalTrendDelta: priorRollingMemory?.loadingTrendDelta ?? 0,
      confidenceImprovedOverTime: priorRollingMemory?.confidenceImprovedOverTime ?? false,
      rollingWindowRetained: false,
      rollingRetentionReason: "Tracked in current snapshot only.",
      temporalAdjustmentReasons: temporalAdjustment.reasons,
      watchlistDecision,
      watchlistReasons,
      watchlistEnteredAt,
      watchlistLastUpdatedAt,
      watchlistRetentionRemainingHours,
      reEnrichmentCount,
      watchlistPriorityScore: watchlistPriority.score,
      watchlistPriorityReasons: watchlistPriority.reasons,
      promotionReadinessScore: promotionReadiness.score,
      promotionReadinessReasons: promotionReadiness.reasons,
      missingSignalsForPromotion: promotionReadiness.missingSignals,
      scoreTrendDirection,
      confidenceTrendDirection,
      evidenceImproving: priorRollingMemory?.evidenceImproving ?? false,
      evidenceWeakening:
        (priorRollingMemory?.evidenceWeakening ?? false) || predictedWeakEvidenceStreak >= 3,
      moroccoBoundTrend: scoreTrendDirection,
      agriCargoTrend: priorRollingMemory?.agriCargoTrend ?? "flat",
      commodityTrend: priorRollingMemory?.commodityTrend ?? "flat",
      promotionEligible,
      promotionReason,
      dropReason,
      currentLat,
      currentLon,
      speed,
      course,
      heading,
      lastSignalAt,
    };
    this.liveNormalizationDebugByVessel.set(vesselId, debugRecord);

    if (admissionDecision === "excluded" && (watchlistDecision === "entered" || watchlistDecision === "retained")) {
      if (watchlistReEnrichmentTriggered) {
        try {
          await this.requestDatalastic<DatalasticVesselInfo>(
            "vessel_info",
            { mmsi: vesselMmsi },
            `watchlist-mmsi=${vesselMmsi}`,
          );
        } catch {
          // best-effort watchlist enrichment
        }
      }
      this.liveNormalizationDebugByVessel.set(vesselId, {
        ...debugRecord,
        enrichmentAttempted: watchlistReEnrichmentTriggered,
        enrichmentSkipped: !watchlistReEnrichmentTriggered,
        enrichmentSkipReason: watchlistReEnrichmentTriggered ? null : reEnrichPolicy.reason,
      });
      return null;
    }

    if (admissionDecision === "excluded") {
      return null;
    }

    let vesselInfo: DatalasticVesselInfo | null = null;
    try {
      const infoPayload = await this.requestDatalastic<DatalasticVesselInfo>(
        "vessel_info",
        { mmsi: vesselMmsi },
        `mmsi=${vesselMmsi}`,
      );
      vesselInfo = infoPayload.data;
    } catch {
      vesselInfo = null;
    }

    const departurePort =
      (await this.resolvePort({
        unlocode: pro.dep_port_unlocode,
        name: pro.dep_port,
        countryIso: cleanString(pro.country_iso, ""),
        fallbackLat: detection.lat,
        fallbackLon: detection.lon,
        forceLikelyOrigin: departureIsGrainOrigin,
      })) ?? this.portsByCode.get("UNKDEP") ?? null;

    const destinationPort =
      (await this.resolvePort({
        unlocode: pro.dest_port_unlocode,
        name: pro.dest_port || pro.destination,
        countryIso: cleanString(pro.country_iso, ""),
        forceMoroccoDestination: normalizedMoroccoDestination,
      })) ?? this.portsByCode.get("UNKDST") ?? null;

    if (!departurePort || !destinationPort) {
      this.liveNormalizationDebugByVessel.set(vesselId, {
        ...debugRecord,
        enrichmentAttempted: true,
        enrichmentSkipped: true,
        enrichmentSkipReason:
          "Skipped final enrichment because departure/destination ports could not be resolved.",
      });
      return null;
    }

    const previousPort = departurePort;

    const vesselRecord: VesselRecord = {
      id: vesselId,
      imo: imo || "UNKNOWN",
      mmsi: vesselMmsi,
      name: vesselName,
      vesselType: normalizedType.normalizedVesselType,
      flag: cleanString(vesselInfo?.country_iso, cleanString(pro.country_iso, "Unknown")),
      deadweight: Math.max(0, toNumber(vesselInfo?.deadweight, 0)),
      length: Math.max(0, toNumber(vesselInfo?.length, 0)),
      width: Math.max(0, toNumber(vesselInfo?.breadth, 0)),
      lastDraft: Math.max(0, toNumber(pro.current_draught, toNumber(vesselInfo?.draught_avg, 0))),
    };

    const voyageRecord: VoyageRecord = {
      id: `live-voy-${vesselId}`,
      vesselId,
      currentLat,
      currentLon,
      speed,
      course,
      heading,
      destinationText: destinationText || destinationPort.name,
      destinationPortId: destinationPort.id,
      eta,
      previousPortId: previousPort.id,
      departurePortId: departurePort.id,
      departureDetectedAt: atd,
      timeSinceDepartureHours: Math.max(
        0,
        Number(((Date.now() - new Date(atd).getTime()) / 3_600_000).toFixed(1)),
      ),
      originCountry: departurePort.country,
      lastSignalAt,
      arrivalDraft: loadingSignal.arrivalDraftEstimate,
      departureDraft: loadingSignal.departureDraftEstimate,
      portStayHours: loadingSignal.portStayHours,
      loadingTerminalHint: cleanString(pro.dep_terminal, rawDeparturePortName),
      arrivalAt: ataDate?.toISOString() ?? null,
      departureAt: atdDate?.toISOString() ?? null,
    };

    const positionRecord: LatestPosition = {
      vesselId,
      lat: currentLat,
      lon: currentLon,
      speed: voyageRecord.speed,
      course: voyageRecord.course,
      heading: voyageRecord.heading,
      timestamp: lastSignalAt,
    };

    this.liveNormalizationDebugByVessel.set(vesselId, {
      ...debugRecord,
      normalizedDraft: vesselRecord.lastDraft,
      inferredDeparturePort: departurePort.name,
      normalizedMoroccoDestination:
        destinationPort.isMoroccoDestination || normalizedMoroccoDestination,
      enrichmentAttempted: true,
      enrichmentSkipped: false,
      enrichmentSkipReason: null,
    });

    return {
      vessel: vesselRecord,
      voyage: voyageRecord,
      position: positionRecord,
      history: [departurePort.id, previousPort.id, destinationPort.id].filter(
        (portId, index, items) => items.indexOf(portId) === index,
      ),
    };
  }

  private async refreshSnapshot() {
    this.assertConfigured();
    await this.seedRollingMemoryFromDatabase();
    this.liveNormalizationDebugByVessel.clear();
    this.acquisitionMetrics = {
      rawStreamDetections: 0,
      screenedDetections: 0,
      dryBulkCompatibleDetections: 0,
      corridorRelevantDetections: 0,
      exportPortRelevantDetections: 0,
      moroccoRelevantDetections: 0,
      enrichedCandidates: 0,
      admittedCandidates: 0,
      vesselsWithTerminalMatch: 0,
      vesselsWithGrainTerminalMatch: 0,
      vesselsWithUsablePortStayEstimate: 0,
      vesselsWithUsableDraftDeltaEstimate: 0,
      vesselsWithModerateOrStrongLoadingSignal: 0,
      vesselsMatchedKnownTerminalIntelligence: 0,
      vesselsMatchedKnownCommodityProfiles: 0,
      vesselsWithDestinationIntelligenceSupport: 0,
      vesselsCommodityScoreImprovedByKnowledgeBase: 0,
      exportKnowledgeMatchedByExactAlias: 0,
      exportKnowledgeMatchedByFuzzyOrToken: 0,
      exportKnowledgeMatchedByCode: 0,
      terminalMatchedPortFallbackOnly: 0,
      exportKnowledgeAliasGapFailures: 0,
      gfwEnrichmentAttemptedCount: 0,
      gfwEnrichmentSuccessCount: 0,
      gfwVesselsWithExportHistory: 0,
      gfwVesselsWithMoroccoHistory: 0,
      gfwVesselsWithRouteHints: 0,
      gfwVesselsWithSupportiveEvidence: 0,
    };

    const detections = await this.collectAisStreamDetections();
    if (detections.size === 0) {
      this.pruneRollingMemory(Date.now());
      const retainedOnly = this.buildSnapshotFromRollingMemory();
      if (retainedOnly.voyagesByVessel.size > 0) {
        const snapshot: CacheSnapshot = {
          fetchedAt: Date.now(),
          vesselsById: retainedOnly.vesselsById,
          voyagesByVessel: retainedOnly.voyagesByVessel,
          positionsByVessel: retainedOnly.positionsByVessel,
          historyByVessel: retainedOnly.historyByVessel,
          ports: Array.from(this.portsById.values()),
        };
        this.snapshot = snapshot;
        console.info(
          `[RadarUsage] provider=hybrid no fresh detections; serving retained rolling-window vessels=${snapshot.voyagesByVessel.size}`,
        );
        return snapshot;
      }
      throw new Error("AISStream returned no detections for the configured corridors.");
    }

    const allDetections = Array.from(detections.values());
    const prioritized = allDetections.filter((detection) => this.isInRadarRegion(detection));
    const fallbackPool = allDetections.filter((detection) => !this.isInRadarRegion(detection));
    const fallbackQuota = Math.max(0, toInteger(process.env.HYBRID_FALLBACK_ENRICHMENTS, 0));
    const detectionList = [...prioritized, ...fallbackPool.slice(0, fallbackQuota)].slice(
      0,
      this.maxEnrichments,
    );
    this.acquisitionMetrics.rawStreamDetections = detections.size;
    this.acquisitionMetrics.screenedDetections = detectionList.length;
    this.acquisitionMetrics.corridorRelevantDetections = allDetections.filter((detection) =>
      classifyCorridor(detection.lat, detection.lon).relevant
    ).length;

    const vesselsById = new Map<string, VesselRecord>();
    const voyagesByVessel = new Map<string, VoyageRecord>();
    const positionsByVessel = new Map<string, LatestPosition>();
    const historyByVessel = new Map<string, string[]>();

    for (let index = 0; index < detectionList.length; index += this.enrichmentBatchSize) {
      const batch = detectionList.slice(index, index + this.enrichmentBatchSize);
      const enrichedBatch = await Promise.all(
        batch.map(async (detection) => {
          try {
            return await this.enrichDetection(detection);
          } catch {
            return null;
          }
        }),
      );

      for (const enriched of enrichedBatch) {
        if (!enriched) {
          continue;
        }

        vesselsById.set(enriched.vessel.id, enriched.vessel);
        voyagesByVessel.set(enriched.voyage.vesselId, enriched.voyage);
        positionsByVessel.set(enriched.position.vesselId, enriched.position);
        historyByVessel.set(enriched.voyage.vesselId, enriched.history);
      }
    }

    const rawDebugRecords = Array.from(this.liveNormalizationDebugByVessel.values());
    for (const record of rawDebugRecords) {
      const vessel = vesselsById.get(record.vesselId);
      const voyage = voyagesByVessel.get(record.vesselId);
      const position = positionsByVessel.get(record.vesselId);
      const history = historyByVessel.get(record.vesselId);
      this.mergeObservationIntoRollingMemory({
        record,
        vessel,
        voyage,
        position,
        history,
        watchlist: {
          decision: record.watchlistDecision,
          reasons: record.watchlistReasons,
          enteredAt: record.watchlistEnteredAt,
          lastUpdatedAt: record.watchlistLastUpdatedAt,
          retentionRemainingHours: record.watchlistRetentionRemainingHours,
          reEnrichmentCount: record.reEnrichmentCount,
          promotionEligible: record.promotionEligible,
          promotionReason: record.promotionReason,
          dropReason: record.dropReason,
        },
        reEnrichmentTriggered:
          record.watchlistDecision !== "not_eligible" &&
          record.enrichmentAttempted &&
          !record.promotionEligible,
        reEnrichmentAttempted: record.enrichmentAttempted,
      });
    }

    this.pruneRollingMemory(Date.now());

    for (const [vesselId, record] of Array.from(this.liveNormalizationDebugByVessel.entries())) {
      const annotated = this.annotateDebugWithRollingMemory(record);
      this.liveNormalizationDebugByVessel.set(vesselId, annotated);
      this.pushEvaluationEvent(annotated);
    }

    const retainedSnapshot = this.buildSnapshotFromRollingMemory();
    const snapshot: CacheSnapshot = {
      fetchedAt: Date.now(),
      vesselsById: retainedSnapshot.vesselsById,
      voyagesByVessel: retainedSnapshot.voyagesByVessel,
      positionsByVessel: retainedSnapshot.positionsByVessel,
      historyByVessel: retainedSnapshot.historyByVessel,
      ports: Array.from(this.portsById.values()),
    };

    const debugRecords = Array.from(this.liveNormalizationDebugByVessel.values());
    const admitted = debugRecords.filter((record) => record.admissionDecision === "included").length;
    const excluded = debugRecords.length - admitted;
    const dryBulkCompatible = debugRecords.filter((record) => record.acquisitionDryBulkCompatible).length;
    const exportRelevant = debugRecords.filter((record) => record.acquisitionExportPortRelevant).length;
    const moroccoRelevant = debugRecords.filter((record) => record.acquisitionMoroccoRelevant).length;
    const acquisitionSelected = debugRecords.filter((record) => record.acquisitionDecision === "selected").length;
    const vesselsWithTerminalMatch = debugRecords.filter((record) => record.loadingTerminalMatch).length;
    const vesselsWithGrainTerminalMatch = debugRecords.filter((record) => record.grainTerminalMatch).length;
    const vesselsWithUsablePortStayEstimate = debugRecords.filter(
      (record) =>
        typeof record.portStayHours === "number" &&
        record.portStayHours > 0 &&
        (record.portStayConfidence === "medium" || record.portStayConfidence === "high"),
    ).length;
    const vesselsWithUsableDraftDeltaEstimate = debugRecords.filter(
      (record) =>
        typeof record.draftDelta === "number" &&
        record.draftDelta !== 0 &&
        (record.draftDeltaConfidence === "medium" || record.draftDeltaConfidence === "high"),
    ).length;
    const vesselsWithModerateOrStrongLoadingSignal = debugRecords.filter(
      (record) =>
        record.loadingEvidenceStrength === "moderate" ||
        record.loadingEvidenceStrength === "strong",
    ).length;
    const vesselsMatchedKnownTerminalIntelligence = debugRecords.filter(
      (record) => record.knowledgeMatchedTerminalIntelligence,
    ).length;
    const vesselsMatchedKnownCommodityProfiles = debugRecords.filter(
      (record) => record.knowledgeMatchedCommodityProfile,
    ).length;
    const vesselsWithDestinationIntelligenceSupport = debugRecords.filter(
      (record) => record.knowledgeDestinationIntelligenceSupport,
    ).length;
    const vesselsCommodityScoreImprovedByKnowledgeBase = debugRecords.filter(
      (record) => record.knowledgeCommodityScoreBoost > 0,
    ).length;
    const exportKnowledgeMatchedByExactAlias = debugRecords.filter(
      (record) =>
        record.exportMatchedBy === "alias_exact" ||
        record.exportMatchedBy === "alias_compact",
    ).length;
    const exportKnowledgeMatchedByFuzzyOrToken = debugRecords.filter(
      (record) =>
        record.exportMatchedBy === "loose_inclusion" ||
        record.exportMatchedBy === "token_overlap",
    ).length;
    const exportKnowledgeMatchedByCode = debugRecords.filter(
      (record) => record.exportMatchedBy === "code",
    ).length;
    const terminalMatchedPortFallbackOnly = debugRecords.filter(
      (record) =>
        record.terminalMatchedBy === "port_fallback" &&
        record.terminalFallbackLevel === "port",
    ).length;
    const exportKnowledgeAliasGapFailures = debugRecords.filter((record) => {
      const hasDepartureHints =
        Boolean(record.rawDeparturePortCode && record.rawDeparturePortCode.trim()) ||
        Boolean(record.rawDeparturePortName && record.rawDeparturePortName.trim());
      return (
        record.exportMatchedBy === "none" &&
        hasDepartureHints &&
        record.acquisitionDryBulkCompatible
      );
    }).length;
    const gfwEnrichmentAttemptedCount = debugRecords.filter(
      (record) => record.gfwEnrichmentAttempted,
    ).length;
    const gfwEnrichmentSuccessCount = debugRecords.filter(
      (record) => record.gfwEnrichmentSuccess,
    ).length;
    const gfwVesselsWithExportHistory = debugRecords.filter(
      (record) => record.gfwExportPortVisitCount > 0,
    ).length;
    const gfwVesselsWithMoroccoHistory = debugRecords.filter(
      (record) => record.gfwMoroccoVisitCount > 0,
    ).length;
    const gfwVesselsWithRouteHints = debugRecords.filter(
      (record) => record.gfwHistoricalRouteHints.length > 0,
    ).length;
    const gfwVesselsWithSupportiveEvidence = debugRecords.filter(
      (record) =>
        record.gfwEvidenceConfidence !== "low" &&
        (record.gfwExportPortVisitCount > 0 ||
          record.gfwMoroccoVisitCount > 0 ||
          record.gfwHistoricalRouteHints.length > 0),
    ).length;
    const retainedCandidates = snapshot.voyagesByVessel.size;

    this.acquisitionMetrics = {
      rawStreamDetections: detections.size,
      screenedDetections: detectionList.length,
      dryBulkCompatibleDetections: dryBulkCompatible,
      corridorRelevantDetections: this.acquisitionMetrics.corridorRelevantDetections,
      exportPortRelevantDetections: exportRelevant,
      moroccoRelevantDetections: moroccoRelevant,
      enrichedCandidates: acquisitionSelected,
      admittedCandidates: admitted,
      vesselsWithTerminalMatch,
      vesselsWithGrainTerminalMatch,
      vesselsWithUsablePortStayEstimate,
      vesselsWithUsableDraftDeltaEstimate,
      vesselsWithModerateOrStrongLoadingSignal,
      vesselsMatchedKnownTerminalIntelligence,
      vesselsMatchedKnownCommodityProfiles,
      vesselsWithDestinationIntelligenceSupport,
      vesselsCommodityScoreImprovedByKnowledgeBase,
      exportKnowledgeMatchedByExactAlias,
      exportKnowledgeMatchedByFuzzyOrToken,
      exportKnowledgeMatchedByCode,
      terminalMatchedPortFallbackOnly,
      exportKnowledgeAliasGapFailures,
      gfwEnrichmentAttemptedCount,
      gfwEnrichmentSuccessCount,
      gfwVesselsWithExportHistory,
      gfwVesselsWithMoroccoHistory,
      gfwVesselsWithRouteHints,
      gfwVesselsWithSupportiveEvidence,
    };
    this.updateWatchlistMetrics(Date.now());
    const watchlist = this.watchlistMetrics;

    console.info(
      `[RadarUsage] provider=hybrid rawDetections=${detections.size} screened=${detectionList.length} dryBulk=${dryBulkCompatible} corridorRelevant=${this.acquisitionMetrics.corridorRelevantDetections} exportRelevant=${exportRelevant} moroccoRelevant=${moroccoRelevant} acquisitionSelected=${acquisitionSelected} admitted=${admitted} loadingTerminal=${vesselsWithTerminalMatch} grainTerminal=${vesselsWithGrainTerminalMatch} usablePortStay=${vesselsWithUsablePortStayEstimate} usableDraftDelta=${vesselsWithUsableDraftDeltaEstimate} loadingModerateStrong=${vesselsWithModerateOrStrongLoadingSignal} knowledgeTerminal=${vesselsMatchedKnownTerminalIntelligence} knowledgeProfile=${vesselsMatchedKnownCommodityProfiles} knowledgeDest=${vesselsWithDestinationIntelligenceSupport} knowledgeBoosted=${vesselsCommodityScoreImprovedByKnowledgeBase} exportExactAlias=${exportKnowledgeMatchedByExactAlias} exportFuzzy=${exportKnowledgeMatchedByFuzzyOrToken} exportCode=${exportKnowledgeMatchedByCode} terminalPortFallback=${terminalMatchedPortFallbackOnly} aliasGap=${exportKnowledgeAliasGapFailures} gfwAttempted=${gfwEnrichmentAttemptedCount} gfwSuccess=${gfwEnrichmentSuccessCount} gfwExportHistory=${gfwVesselsWithExportHistory} gfwMoroccoHistory=${gfwVesselsWithMoroccoHistory} gfwRouteHints=${gfwVesselsWithRouteHints} gfwSupportive=${gfwVesselsWithSupportiveEvidence} excluded=${excluded} retainedWindow=${retainedCandidates} watchlistActive=${watchlist.vesselsInWatchlist} watchlistPromoted=${watchlist.vesselsPromotedToRadar} watchlistDropped=${watchlist.vesselsDroppedFromWatchlist} watchlistAvgEvidenceAgeH=${watchlist.averageWatchlistEvidenceAgeHours} watchlistAvgReenrich=${watchlist.averageReEnrichmentCount} watchlistImproving=${watchlist.vesselsWithImprovingEvidence} watchlistWeakening=${watchlist.vesselsWithWeakeningEvidence} dbSeed=${this.rollingMemorySeededFromDb ? "yes" : "no"}`,
    );

    this.snapshot = snapshot;
    return snapshot;
  }

  private async ensureSnapshot() {
    const hasFreshSnapshot =
      this.snapshot && Date.now() - this.snapshot.fetchedAt <= this.cacheTtlMs;

    if (hasFreshSnapshot && this.snapshot) {
      return this.snapshot;
    }

    if (!this.snapshotRefreshPromise) {
      this.snapshotRefreshPromise = this.refreshSnapshot().finally(() => {
        this.snapshotRefreshPromise = null;
      });
    }

    return this.snapshotRefreshPromise;
  }

  async getExpectedArrivals(portCode: string): Promise<VoyageRecord[]> {
    const snapshot = await this.ensureSnapshot();
    const normalizedPortCode = normalizePortCode(portCode);

    const requestedPort = this.portsByCode.get(normalizedPortCode);
    if (!requestedPort?.isMoroccoDestination) {
      return [];
    }

    return Array.from(snapshot.voyagesByVessel.values()).filter((voyage) => {
      const debug = this.getDebugRecordForVesselId(voyage.vesselId);
      if (!debug || debug.admissionDecision !== "included") {
        return false;
      }

      const resolvedDestination = this.portsById.get(voyage.destinationPortId);

      if (resolvedDestination?.code === normalizedPortCode) {
        return true;
      }

      if (
        debug.normalizedMoroccoDestination &&
        this.destinationMatchesRequestedMoroccoPort(
          debug.normalizedDestinationText,
          normalizedPortCode,
        )
      ) {
        return true;
      }

      if (
        normalizedPortCode === MOROCCO_FALLBACK_PORT_CODE &&
        debug.routeCorridorCompatible &&
        debug.exportPortRelevant
      ) {
        return true;
      }

      return false;
    });
  }

  async getPortCalls(portCode: string): Promise<PortCallRecord[]> {
    void portCode;
    return [];
  }

  async getVesselDetails(vesselId: string): Promise<VesselRecord | null> {
    const snapshot = await this.ensureSnapshot();
    return snapshot.vesselsById.get(vesselId) ?? null;
  }

  async getLatestPositions(vesselIds: string[]): Promise<LatestPosition[]> {
    const snapshot = await this.ensureSnapshot();
    return vesselIds
      .map((vesselId) => snapshot.positionsByVessel.get(vesselId))
      .filter((position): position is LatestPosition => Boolean(position));
  }

  async getVoyageData(vesselIds: string[]): Promise<VoyageRecord[]> {
    const snapshot = await this.ensureSnapshot();
    return vesselIds
      .map((vesselId) => snapshot.voyagesByVessel.get(vesselId))
      .filter((voyage): voyage is VoyageRecord => Boolean(voyage));
  }

  async getPorts(): Promise<PortRecord[]> {
    const snapshot = await this.ensureSnapshot();
    return snapshot.ports;
  }

  async getHistoricalRoutePattern(vesselId: string): Promise<string[]> {
    const snapshot = await this.ensureSnapshot();
    return snapshot.historyByVessel.get(vesselId) ?? [];
  }
}
