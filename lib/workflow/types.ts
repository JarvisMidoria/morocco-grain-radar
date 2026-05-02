import { CommodityType, DetectionPhase, RadarDataSource } from "@/lib/types";

export type WorkflowWorkspaceId = string;
export type WatchlistId = string;
export type AlertRuleId = string;
export type AlertId = string;
export type VesselChangeEventId = string;
export type AnalystFeedbackId = string;
export type AnalystFeedbackAuditEventId = string;
export type ModelScoringVersionId = string;
export type ValidatedVoyageId = string;

export interface WatchlistFilters {
  destinationPortCode?: string | null;
  commodity?: CommodityType | null;
  departureCountry?: string | null;
  maxDaysToMorocco?: number | null;
  minMoroccoBoundScore?: number | null;
  minAgriCargoScore?: number | null;
  favoritesOnly?: boolean;
}

export interface WorkflowWatchlist {
  id: WatchlistId;
  workspaceId: WorkflowWorkspaceId;
  name: string;
  description: string | null;
  isActive: boolean;
  filters: WatchlistFilters;
  createdAt: string;
  updatedAt: string;
}

export type AlertSeverity = "info" | "warning" | "critical";
export type AlertStatus = "open" | "acknowledged";

export type AlertRuleType =
  | "morocco_bound_threshold"
  | "agri_cargo_threshold"
  | "phase_reached"
  | "eta_change"
  | "destination_change";

export interface WorkflowAlertRule {
  id: AlertRuleId;
  workspaceId: WorkflowWorkspaceId;
  name: string;
  description: string | null;
  type: AlertRuleType;
  isActive: boolean;
  severity: AlertSeverity;
  threshold?: number | null;
  phase?: DetectionPhase | null;
  etaShiftHours?: number | null;
  watchlistId?: WatchlistId | null;
  createdAt: string;
  updatedAt: string;
}

export interface WorkflowAlert {
  id: AlertId;
  workspaceId: WorkflowWorkspaceId;
  ruleId: AlertRuleId;
  ruleName: string;
  ruleType: AlertRuleType;
  vesselId: string;
  vesselName: string;
  severity: AlertSeverity;
  status: AlertStatus;
  title: string;
  message: string;
  watchlistIds: WatchlistId[];
  watchlistNames: string[];
  detectionPhase: DetectionPhase;
  moroccoBoundScore: number;
  agriCargoScore: number;
  eta: string;
  destinationPort: string;
  destinationText: string;
  fingerprint: string;
  createdAt: string;
  acknowledgedAt: string | null;
}

export type VesselChangeEventType =
  | "new_vessel"
  | "phase_change"
  | "score_change"
  | "eta_change"
  | "destination_change";

export interface WorkflowVesselSnapshot {
  vesselId: string;
  vesselName: string;
  detectionPhase: DetectionPhase;
  moroccoBoundScore: number;
  agriCargoScore: number;
  eta: string;
  destinationPortCode: string;
  destinationPort: string;
  destinationText: string;
  departurePortCode: string;
  departurePort: string;
  departureCountry: string;
  currentMaritimeZone: string;
  estimatedDaysToMorocco: number;
  mostLikelyCommodity: CommodityType;
  lastSignalAt: string;
  capturedAt: string;
}

export interface WorkflowVesselChangeEvent {
  id: VesselChangeEventId;
  vesselId: string;
  vesselName: string;
  type: VesselChangeEventType;
  title: string;
  summary: string;
  metadata: Record<string, string | number | boolean | null>;
  fingerprint: string;
  createdAt: string;
}

export type AnalystAnnotationLabel =
  | "interesting"
  | "false_positive"
  | "to_confirm"
  | "probable_cargo";

export type AnalystVerdict = "confirmed" | "rejected" | "pending";

export interface AnalystFeedbackRecord {
  id: AnalystFeedbackId;
  workspaceId: WorkflowWorkspaceId;
  vesselId: string;
  vesselName: string;
  annotations: AnalystAnnotationLabel[];
  moroccoBoundVerdict: AnalystVerdict;
  commodityVerdict: AnalystVerdict;
  actualCommodity: CommodityType | null;
  note: string | null;
  predictedCommodity: CommodityType;
  predictedDetectionPhase: DetectionPhase;
  predictedMoroccoBoundScore: number;
  predictedAgriCargoScore: number;
  predictedDeparturePort: string;
  predictedDepartureCountry: string;
  predictedDestinationPort: string;
  predictedCurrentMaritimeZone: string;
  predictedDepartureDetectedAt: string;
  predictedEta: string;
  feedbackCreatedAt: string;
  lastReviewedAt: string;
}

export type AnalystFeedbackAuditAction =
  | "feedback_created"
  | "annotations_updated"
  | "morocco_verdict_updated"
  | "commodity_verdict_updated"
  | "note_updated";

export interface AnalystFeedbackAuditEvent {
  id: AnalystFeedbackAuditEventId;
  feedbackId: AnalystFeedbackId;
  vesselId: string;
  vesselName: string;
  action: AnalystFeedbackAuditAction;
  summary: string;
  metadata: Record<string, string | number | boolean | null>;
  createdAt: string;
}

export interface WorkflowScoringVersion {
  id: ModelScoringVersionId;
  slug: string;
  label: string;
  description: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ValidatedVoyage {
  id: ValidatedVoyageId;
  workspaceId: WorkflowWorkspaceId;
  feedbackId: AnalystFeedbackId;
  vesselId: string;
  vesselName: string;
  scoringVersionId: ModelScoringVersionId;
  predictedDetectionPhase: DetectionPhase;
  predictedCommodity: CommodityType;
  actualCommodity: CommodityType | null;
  moroccoBoundVerdict: AnalystVerdict;
  commodityVerdict: AnalystVerdict;
  predictedMoroccoBoundScore: number;
  predictedAgriCargoScore: number;
  departurePort: string;
  departureCountry: string;
  destinationPort: string;
  corridor: string;
  predictedDepartureDetectedAt: string;
  predictedEta: string;
  leadTimeDays: number | null;
  reviewRecordedAt: string;
  note: string | null;
}

export interface WorkflowWorkspace {
  id: WorkflowWorkspaceId;
  name: string;
  createdAt: string;
  updatedAt: string;
  watchlists: WorkflowWatchlist[];
  alertRules: WorkflowAlertRule[];
}

export interface WorkflowStore {
  version: number;
  defaultWorkspaceId: WorkflowWorkspaceId;
  workspaces: WorkflowWorkspace[];
  alerts: WorkflowAlert[];
  vesselSnapshots: WorkflowVesselSnapshot[];
  vesselChangeEvents: WorkflowVesselChangeEvent[];
  analystFeedback: AnalystFeedbackRecord[];
  analystFeedbackAuditEvents: AnalystFeedbackAuditEvent[];
  scoringVersions: WorkflowScoringVersion[];
  validatedVoyages: ValidatedVoyage[];
  lastFeedSignature: string | null;
  lastSyncAt: string | null;
  lastSource: RadarDataSource | null;
}

export interface WorkflowWatchlistMatch {
  watchlistId: WatchlistId;
  watchlistName: string;
}

export interface WorkflowWatchlistEntry {
  watchlist: WorkflowWatchlist;
  matches: Array<{
    vesselId: string;
    vesselName: string;
    departurePort: string;
    departureCountry: string;
    destinationPort: string;
    eta: string;
    estimatedDaysToMorocco: number;
    mostLikelyCommodity: CommodityType;
    moroccoBoundScore: number;
    agriCargoScore: number;
    detectionPhase: DetectionPhase;
    priorityScore: number;
  }>;
}

export interface MorningBriefVesselEntry {
  vesselId: string;
  vesselName: string;
  departurePort: string;
  departureCountry: string;
  destinationPort: string;
  eta: string;
  estimatedDaysToMorocco: number;
  currentMaritimeZone: string;
  mostLikelyCommodity: CommodityType;
  detectionPhase: DetectionPhase;
  moroccoBoundScore: number;
  agriCargoScore: number;
  priorityScore: number;
  summaryReasons: string[];
}

export interface MorningBriefPayload {
  generatedAt: string;
  source: RadarDataSource | null;
  summary: {
    trackedVessels: number;
    arrivalsNext7Days: number;
    highConfidenceCargoes: number;
    openAlerts: number;
    watchlistsWithMatches: number;
  };
  topVessels: MorningBriefVesselEntry[];
  watchlists: WorkflowWatchlistEntry[];
  openAlerts: WorkflowAlert[];
  recentChanges: WorkflowVesselChangeEvent[];
  notes: string[];
}

export interface WorkflowDashboardPayload {
  workspace: WorkflowWorkspace;
  morningBrief: MorningBriefPayload;
  alerts: WorkflowAlert[];
  watchlists: WorkflowWatchlistEntry[];
  recentChanges: WorkflowVesselChangeEvent[];
  source: RadarDataSource | null;
}

export interface ValidationMetrics {
  totalFeedbackCases: number;
  annotatedInterestingCount: number;
  annotatedFalsePositiveCount: number;
  pendingReviewCount: number;
  reviewedMoroccoCases: number;
  confirmedMoroccoCases: number;
  rejectedMoroccoCases: number;
  moroccoPrecision: number | null;
  reviewedCommodityCases: number;
  commodityExactMatches: number;
  commodityExactRate: number | null;
}

export interface ValidationCase {
  feedback: AnalystFeedbackRecord;
  latestSnapshot: WorkflowVesselSnapshot | null;
  currentLive: {
    detectionPhase: DetectionPhase;
    moroccoBoundScore: number;
    agriCargoScore: number;
    destinationPort: string;
    eta: string;
    mostLikelyCommodity: CommodityType;
  } | null;
}

export interface ValidationDashboardPayload {
  source: RadarDataSource | null;
  generatedAt: string;
  metrics: ValidationMetrics;
  cases: ValidationCase[];
  auditTrail: AnalystFeedbackAuditEvent[];
}

export interface ModelPerformanceSummaryMetrics {
  totalValidatedVoyages: number;
  reviewedMoroccoCases: number;
  truePositives: number;
  falsePositives: number;
  falseNegatives: number;
  trueNegatives: number;
  precision: number | null;
  recall: number | null;
  averageLeadTimeDays: number | null;
  commodityExactRate: number | null;
}

export interface ModelPerformanceBreakdownRow {
  key: string;
  label: string;
  totalCases: number;
  reviewedCases: number;
  truePositives: number;
  falsePositives: number;
  falseNegatives: number;
  precision: number | null;
  recall: number | null;
  averageLeadTimeDays: number | null;
  commodityExactRate: number | null;
}

export interface ModelPerformanceDashboardPayload {
  source: RadarDataSource | null;
  generatedAt: string;
  activeScoringVersion: WorkflowScoringVersion | null;
  scoringVersions: WorkflowScoringVersion[];
  metrics: ModelPerformanceSummaryMetrics;
  thresholds: {
    moroccoBoundPositiveScore: number;
  };
  byOriginCountry: ModelPerformanceBreakdownRow[];
  byDestinationPort: ModelPerformanceBreakdownRow[];
  byCommodity: ModelPerformanceBreakdownRow[];
  byCorridor: ModelPerformanceBreakdownRow[];
  byScoringVersion: ModelPerformanceBreakdownRow[];
  recentCases: ValidatedVoyage[];
  notes: string[];
}

export interface UpsertAnalystFeedbackInput {
  vesselId: string;
  vesselName: string;
  annotations?: AnalystAnnotationLabel[];
  moroccoBoundVerdict?: AnalystVerdict;
  commodityVerdict?: AnalystVerdict;
  actualCommodity?: CommodityType | null;
  note?: string | null;
  predictedCommodity: CommodityType;
  predictedDetectionPhase: DetectionPhase;
  predictedMoroccoBoundScore: number;
  predictedAgriCargoScore: number;
  predictedDeparturePort: string;
  predictedDepartureCountry: string;
  predictedDestinationPort: string;
  predictedCurrentMaritimeZone: string;
  predictedDepartureDetectedAt: string;
  predictedEta: string;
}

export interface UpsertWatchlistInput {
  id?: string;
  name: string;
  description?: string | null;
  isActive?: boolean;
  filters?: WatchlistFilters;
}

export interface UpsertAlertRuleInput {
  id?: string;
  name: string;
  description?: string | null;
  type: AlertRuleType;
  isActive?: boolean;
  severity: AlertSeverity;
  threshold?: number | null;
  phase?: DetectionPhase | null;
  etaShiftHours?: number | null;
  watchlistId?: WatchlistId | null;
}
