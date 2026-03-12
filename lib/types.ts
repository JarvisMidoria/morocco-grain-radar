export type ConfidenceLevel = "High" | "Medium" | "Low";

export type DetectionPhase =
  | "departure_detected"
  | "morocco_bound_suspected"
  | "morocco_bound_likely"
  | "agri_cargo_likely"
  | "commodity_hypothesis"
  | "near_arrival_confirmed";

export type CommodityType = "wheat" | "barley" | "corn" | "soybeanMeal";

export type CommodityConfidenceLabel =
  | "weak hypothesis"
  | "moderate hypothesis"
  | "strong hypothesis";

export type VoyageHypothesisId =
  | "western_europe_wheat_to_morocco"
  | "western_europe_feed_to_morocco"
  | "black_sea_mixed_grain_to_morocco"
  | "south_atlantic_feed_to_morocco"
  | "us_gulf_feed_to_morocco"
  | "western_europe_grain_morocco_candidate"
  | "black_sea_grain_morocco_candidate"
  | "south_atlantic_feed_morocco_candidate"
  | "ambiguous_dry_bulk_non_morocco";

export type VoyageHypothesisConfidence = "weak" | "moderate" | "strong";

export type VoyageHypothesisEvidenceStyle =
  | "explicit_morocco_support"
  | "candidate_pre_confirmation";

export interface VoyageHypothesisAlternative {
  id: VoyageHypothesisId;
  label: string;
  score: number;
  confidence: VoyageHypothesisConfidence;
}

export interface PortRecord {
  id: string;
  name: string;
  country: string;
  code: string;
  lat: number;
  lon: number;
  isMoroccoDestination: boolean;
  isLikelyGrainOrigin: boolean;
}

export interface VesselRecord {
  id: string;
  imo: string;
  mmsi: string;
  name: string;
  vesselType: string;
  flag: string;
  deadweight: number;
  length: number;
  width: number;
  lastDraft: number;
}

export interface VoyageRecord {
  id: string;
  vesselId: string;
  currentLat: number;
  currentLon: number;
  speed: number;
  course: number;
  heading: number;
  destinationText: string;
  destinationPortId: string;
  eta: string;
  previousPortId: string;
  departurePortId: string;
  departureDetectedAt: string;
  timeSinceDepartureHours: number;
  originCountry: string;
  lastSignalAt: string;
  arrivalDraft?: number | null;
  departureDraft?: number | null;
  portStayHours?: number | null;
  loadingTerminalHint?: string | null;
  arrivalAt?: string | null;
  departureAt?: string | null;
  firstSeenAt?: string | null;
  lastSeenAt?: string | null;
  firstRelevantSeenAt?: string | null;
  lastRelevantSeenAt?: string | null;
  observationCount?: number;
  relevantObservationCount?: number;
  corridorSampleCount?: number;
  destinationSampleCount?: number;
  draftSampleCount?: number;
  loadingSignalSampleCount?: number;
  scoreTrend?: "up" | "flat" | "down";
  loadingTrend?: "up" | "flat" | "down";
  scoreTrendDelta?: number | null;
  loadingTrendDelta?: number | null;
  confidenceImprovedOverTime?: boolean;
  rollingRetentionReason?: string | null;
}

export type PortCallEventType = "ARRIVAL" | "DEPARTURE" | "BERTHED" | "ANCHORED";

export interface PortCallRecord {
  id: string;
  vesselId: string;
  portId: string;
  eventType: PortCallEventType;
  eventTime: string;
}

export interface LatestPosition {
  vesselId: string;
  lat: number;
  lon: number;
  speed: number;
  course: number;
  heading: number;
  timestamp: string;
}

export interface GrainAssessment {
  vesselId: string;
  score: number;
  confidenceLevel: ConfidenceLevel;
  reasons: string[];
}

export interface GeoPoint {
  lat: number;
  lon: number;
  label: string;
}

export interface CommodityScores {
  wheatScore: number;
  barleyScore: number;
  cornScore: number;
  soybeanMealScore: number;
}

export interface LayerReasons {
  moroccoBoundReasons: string[];
  agriCargoReasons: string[];
  commodityReasons: string[];
}

export interface RadarVessel extends LayerReasons {
  id: string;
  name: string;
  imo: string;
  mmsi: string;
  vesselType: string;
  flag: string;
  deadweight: number;
  lastDraft: number;
  length: number;
  width: number;
  previousPort: string;
  previousPortCode: string;
  previousPortCountry: string;
  departurePort: string;
  departurePortCode: string;
  departureCountry: string;
  departureDetectedAt: string;
  timeSinceDepartureHours: number;
  destinationPort: string;
  destinationPortCode: string;
  destinationPortCountry: string;
  destinationText: string;
  originCountry: string;
  eta: string;
  lastSignalAt: string;
  currentLat: number;
  currentLon: number;
  speed: number;
  course: number;
  heading: number;
  currentMaritimeZone: string;
  suspectedDestinationRegion: string;
  estimatedDaysToMorocco: number;
  detectionPhase: DetectionPhase;
  moroccoBoundScore: number;
  agriCargoScore: number;
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
  commodityScores: CommodityScores;
  mostLikelyCommodity: CommodityType;
  commodityConfidenceLabel: CommodityConfidenceLabel;
  topVoyageHypothesis: VoyageHypothesisId;
  topVoyageHypothesisScore: number;
  topVoyageHypothesisConfidence: VoyageHypothesisConfidence;
  topVoyageHypothesisProbability: number;
  voyageHypothesisEvidenceStyle: VoyageHypothesisEvidenceStyle;
  voyageHypothesisReasons: string[];
  missingSignalsForVoyageConfirmation: string[];
  alternativeVoyageHypotheses: VoyageHypothesisAlternative[];
  voyageTemplatePosteriorProbabilities: Record<VoyageHypothesisId, number>;
  voyageTemplateEntropy: number;
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
  destinationEvolutionScore: number;
  destinationMoroccoConfidence: number;
  destinationContradictionScore: number;
  destinationConsistencyScore: number;
  destinationEvolutionReasons: string[];
  portCommodityPriorScores: CommodityScores;
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
    routeEvidence: CommodityScores;
    loadingEvidence: CommodityScores;
    historicalEvidence: CommodityScores;
    destinationEvidence: CommodityScores;
    flowPriorEvidence: CommodityScores;
    contradictionEvidence: CommodityScores;
    voyageHypothesisEvidence: CommodityScores;
    seasonalEvidence: CommodityScores;
    commercialPatternEvidence: CommodityScores;
  };
  predictionEntropy: number;
  evidenceCoverageScore: number;
  uncertaintyPenalty: number;
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
  routePoints: GeoPoint[];

  // Backward-compatible fields used by existing map/table components.
  score: number;
  confidenceLevel: ConfidenceLevel;
  reasons: string[];
  firstSeenAt?: string | null;
  lastSeenAt?: string | null;
  firstRelevantSeenAt?: string | null;
  lastRelevantSeenAt?: string | null;
  observationCount?: number;
  evidenceAgeHours?: number;
  scoreTrend?: "up" | "flat" | "down";
  scoreTrendDelta?: number | null;
  loadingTrend?: "up" | "flat" | "down";
  loadingTrendDelta?: number | null;
  confidenceImprovedOverTime?: boolean;
  rollingRetentionReason?: string | null;
  isFavorite?: boolean;
}

export interface DashboardMetrics {
  recentDeparturesDetected: number;
  moroccoBoundSuspected: number;
  moroccoBoundLikely: number;
  agriCargoLikely: number;
  commodityHypothesesAvailable: number;
}

export interface WatchlistFallbackCandidate {
  vesselId: string;
  vesselName: string;
  departurePort: string;
  currentCorridor: string;
  topVoyageHypothesis: string;
  mostLikelyCommodity: CommodityType;
  commodityConfidenceLabel: CommodityConfidenceLabel;
  watchlistPriorityScore: number;
  promotionReadinessScore: number;
  observationCount: number;
  evidenceAgeHours: number;
  missingSignalsForPromotion: string[];
}

export interface PortOverview {
  portId: string;
  portName: string;
  incomingVessels: number;
  earlyDetectedLikely: number;
  topOriginPorts: string[];
  topCommodityHypotheses: string[];
  averageEstimatedDaysToArrival: number | null;
  nextArrivalEta: string | null;
}

export interface AnalyticsPayload {
  topRecentDeparturePorts: Array<{ name: string; value: number }>;
  topDepartureCountries: Array<{ name: string; value: number }>;
  vesselsByDetectionPhase: Array<{ name: string; value: number }>;
  averageDaysToMoroccoByPhase: Array<{ name: string; value: number }>;
  commodityDistribution: Array<{ name: string; value: number }>;
  moroccoBoundByCorridor: Array<{ name: string; value: number }>;
  agriCargoScoreDistribution: Array<{ name: string; value: number }>;
}

export interface RadarDataSource {
  mode: "mock" | "live";
  provider: string;
  label: string;
  fallbackToMock?: boolean;
  warning?: string;
  cacheAgeSeconds?: number;
}

export interface RadarFeed {
  vessels: RadarVessel[];
  source: RadarDataSource;
  warning?: string;
}

export type MapMode =
  | "all_tracked_vessels"
  | "early_detected_only"
  | "approaching_morocco_only"
  | "agri_cargo_likely_only";
