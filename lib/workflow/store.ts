import fs from "node:fs";
import path from "node:path";
import { isPrismaAvailable } from "@/lib/db/prisma";
import { PersistenceBackend, readAppState, writeAppState } from "@/lib/db/app-state";
import { DetectionPhase } from "@/lib/types";
import { getRadarLocalStoreDir } from "@/lib/storage/local-store";
import {
  AnalystFeedbackAuditEvent,
  AnalystFeedbackRecord,
  AlertSeverity,
  AlertStatus,
  ModelScoringVersionId,
  ValidatedVoyage,
  WorkflowAlert,
  WorkflowAlertRule,
  WorkflowScoringVersion,
  WorkflowStore,
  WorkflowVesselChangeEvent,
  WorkflowVesselSnapshot,
  WorkflowWatchlist,
  WorkflowWorkspace,
  WorkflowWorkspaceId,
} from "@/lib/workflow/types";

const CACHE_TTL_MS = 2_000;
const WORKFLOW_STATE_NAMESPACE = "workflow-store";
const DEFAULT_WORKSPACE_ID = "default-workspace";
const MAX_ALERTS = 250;
const MAX_CHANGE_EVENTS = 600;
const MAX_ANALYST_AUDIT_EVENTS = 600;
const MAX_VALIDATED_VOYAGES = 1200;

let cache: { loadedAt: number; store: WorkflowStore; backend: PersistenceBackend } | null = null;

function nowIso() {
  return new Date().toISOString();
}

function createId(prefix: string) {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${prefix}_${crypto.randomUUID()}`;
  }
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function getWorkflowDir() {
  return getRadarLocalStoreDir();
}

function getWorkflowFile() {
  return path.join(getWorkflowDir(), "workflow.json");
}

function ensureWorkflowDir() {
  const workflowDir = getWorkflowDir();
  if (!fs.existsSync(workflowDir)) {
    fs.mkdirSync(workflowDir, { recursive: true });
  }
}

function defaultAlertRules(workspaceId: WorkflowWorkspaceId, createdAt: string): WorkflowAlertRule[] {
  return [
    {
      id: createId("rule"),
      workspaceId,
      name: "High Morocco-bound score",
      description: "Trigger when a vessel crosses the Morocco-bound conviction threshold.",
      type: "morocco_bound_threshold",
      isActive: true,
      severity: "warning",
      threshold: 75,
      phase: null,
      etaShiftHours: null,
      watchlistId: null,
      createdAt,
      updatedAt: createdAt,
    },
    {
      id: createId("rule"),
      workspaceId,
      name: "High agri-cargo score",
      description: "Trigger when dry agri-cargo confidence becomes strong.",
      type: "agri_cargo_threshold",
      isActive: true,
      severity: "warning",
      threshold: 75,
      phase: null,
      etaShiftHours: null,
      watchlistId: null,
      createdAt,
      updatedAt: createdAt,
    },
    {
      id: createId("rule"),
      workspaceId,
      name: "Phase reaches agri cargo likely",
      description: "Escalate when a vessel enters the agri cargo likely phase or above.",
      type: "phase_reached",
      isActive: true,
      severity: "critical",
      threshold: null,
      phase: "agri_cargo_likely",
      etaShiftHours: null,
      watchlistId: null,
      createdAt,
      updatedAt: createdAt,
    },
    {
      id: createId("rule"),
      workspaceId,
      name: "ETA shifts materially",
      description: "Trigger when ETA moves by at least twelve hours.",
      type: "eta_change",
      isActive: true,
      severity: "info",
      threshold: null,
      phase: null,
      etaShiftHours: 12,
      watchlistId: null,
      createdAt,
      updatedAt: createdAt,
    },
    {
      id: createId("rule"),
      workspaceId,
      name: "Destination changes",
      description: "Trigger when destination text or inferred destination port changes.",
      type: "destination_change",
      isActive: true,
      severity: "warning",
      threshold: null,
      phase: null,
      etaShiftHours: null,
      watchlistId: null,
      createdAt,
      updatedAt: createdAt,
    },
  ];
}

function defaultWorkspace(createdAt: string): WorkflowWorkspace {
  return {
    id: DEFAULT_WORKSPACE_ID,
    name: "Default Workspace",
    createdAt,
    updatedAt: createdAt,
    watchlists: [],
    alertRules: defaultAlertRules(DEFAULT_WORKSPACE_ID, createdAt),
  };
}

function defaultScoringVersions(createdAt: string): WorkflowScoringVersion[] {
  return [
    {
      id: "scorever_hybrid_grain_v1",
      slug: "hybrid-grain-radar-v1",
      label: "Hybrid Grain Radar v1",
      description: "Explainable hybrid scoring blend for Morocco-bound grain and feed detection.",
      isActive: true,
      createdAt,
      updatedAt: createdAt,
    },
  ];
}

function getDefaultStore(): WorkflowStore {
  const createdAt = nowIso();
  return {
    version: 4,
    defaultWorkspaceId: DEFAULT_WORKSPACE_ID,
    workspaces: [defaultWorkspace(createdAt)],
    alerts: [],
    vesselSnapshots: [],
    vesselChangeEvents: [],
    analystFeedback: [],
    analystFeedbackAuditEvents: [],
    scoringVersions: defaultScoringVersions(createdAt),
    validatedVoyages: [],
    lastFeedSignature: null,
    lastSyncAt: null,
    lastSource: null,
  };
}

function normalizeSeverity(value: unknown): AlertSeverity {
  if (value === "info" || value === "warning" || value === "critical") {
    return value;
  }
  return "warning";
}

function normalizeStatus(value: unknown): AlertStatus {
  if (value === "open" || value === "acknowledged") {
    return value;
  }
  return "open";
}

function normalizePhase(value: unknown): DetectionPhase | null {
  if (
    value === "departure_detected" ||
    value === "morocco_bound_suspected" ||
    value === "morocco_bound_likely" ||
    value === "agri_cargo_likely" ||
    value === "commodity_hypothesis" ||
    value === "near_arrival_confirmed"
  ) {
    return value;
  }
  return null;
}

function sanitizeText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function sanitizeNullableText(value: unknown) {
  const text = sanitizeText(value);
  return text.length > 0 ? text : null;
}

function sanitizeBoolean(value: unknown, fallback = false) {
  return typeof value === "boolean" ? value : fallback;
}

function sanitizeNumber(value: unknown) {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === "string" && value.trim().length === 0) {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeWatchlist(workspaceId: WorkflowWorkspaceId, raw: unknown): WorkflowWatchlist | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const typed = raw as Partial<WorkflowWatchlist>;
  const createdAt = sanitizeText(typed.createdAt) || nowIso();
  const updatedAt = sanitizeText(typed.updatedAt) || createdAt;

  return {
    id: sanitizeText(typed.id) || createId("watchlist"),
    workspaceId,
    name: sanitizeText(typed.name) || "Untitled watchlist",
    description: sanitizeNullableText(typed.description),
    isActive: sanitizeBoolean(typed.isActive, true),
    filters: {
      destinationPortCode: sanitizeNullableText(typed.filters?.destinationPortCode),
      commodity:
        typed.filters?.commodity === "wheat" ||
        typed.filters?.commodity === "barley" ||
        typed.filters?.commodity === "corn" ||
        typed.filters?.commodity === "soybeanMeal"
          ? typed.filters.commodity
          : null,
      departureCountry: sanitizeNullableText(typed.filters?.departureCountry),
      maxDaysToMorocco: sanitizeNumber(typed.filters?.maxDaysToMorocco),
      minMoroccoBoundScore: sanitizeNumber(typed.filters?.minMoroccoBoundScore),
      minAgriCargoScore: sanitizeNumber(typed.filters?.minAgriCargoScore),
      favoritesOnly: sanitizeBoolean(typed.filters?.favoritesOnly, false),
    },
    createdAt,
    updatedAt,
  };
}

function normalizeAlertRule(workspaceId: WorkflowWorkspaceId, raw: unknown): WorkflowAlertRule | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const typed = raw as Partial<WorkflowAlertRule>;
  const createdAt = sanitizeText(typed.createdAt) || nowIso();
  const updatedAt = sanitizeText(typed.updatedAt) || createdAt;

  if (
    typed.type !== "morocco_bound_threshold" &&
    typed.type !== "agri_cargo_threshold" &&
    typed.type !== "phase_reached" &&
    typed.type !== "eta_change" &&
    typed.type !== "destination_change"
  ) {
    return null;
  }

  return {
    id: sanitizeText(typed.id) || createId("rule"),
    workspaceId,
    name: sanitizeText(typed.name) || "Untitled rule",
    description: sanitizeNullableText(typed.description),
    type: typed.type,
    isActive: sanitizeBoolean(typed.isActive, true),
    severity: normalizeSeverity(typed.severity),
    threshold: sanitizeNumber(typed.threshold),
    phase: normalizePhase(typed.phase),
    etaShiftHours: sanitizeNumber(typed.etaShiftHours),
    watchlistId: sanitizeNullableText(typed.watchlistId),
    createdAt,
    updatedAt,
  };
}

function normalizeWorkspace(raw: unknown): WorkflowWorkspace | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const typed = raw as Partial<WorkflowWorkspace>;
  const workspaceId = sanitizeText(typed.id) || DEFAULT_WORKSPACE_ID;
  const createdAt = sanitizeText(typed.createdAt) || nowIso();
  const updatedAt = sanitizeText(typed.updatedAt) || createdAt;

  const watchlists = Array.isArray(typed.watchlists)
    ? typed.watchlists
        .map((watchlist) => normalizeWatchlist(workspaceId, watchlist))
        .filter((watchlist): watchlist is WorkflowWatchlist => watchlist !== null)
    : [];

  const alertRules = Array.isArray(typed.alertRules)
    ? typed.alertRules
        .map((rule) => normalizeAlertRule(workspaceId, rule))
        .filter((rule): rule is WorkflowAlertRule => rule !== null)
    : defaultAlertRules(workspaceId, createdAt);

  return {
    id: workspaceId,
    name: sanitizeText(typed.name) || "Default Workspace",
    createdAt,
    updatedAt,
    watchlists,
    alertRules: alertRules.length > 0 ? alertRules : defaultAlertRules(workspaceId, createdAt),
  };
}

function normalizeAlert(raw: unknown): WorkflowAlert | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const typed = raw as Partial<WorkflowAlert>;
  const createdAt = sanitizeText(typed.createdAt);
  if (!createdAt) {
    return null;
  }

  const phase = normalizePhase(typed.detectionPhase);
  if (!phase) {
    return null;
  }

  return {
    id: sanitizeText(typed.id) || createId("alert"),
    workspaceId: sanitizeText(typed.workspaceId) || DEFAULT_WORKSPACE_ID,
    ruleId: sanitizeText(typed.ruleId),
    ruleName: sanitizeText(typed.ruleName) || "Alert",
    ruleType:
      typed.ruleType === "morocco_bound_threshold" ||
      typed.ruleType === "agri_cargo_threshold" ||
      typed.ruleType === "phase_reached" ||
      typed.ruleType === "eta_change" ||
      typed.ruleType === "destination_change"
        ? typed.ruleType
        : "morocco_bound_threshold",
    vesselId: sanitizeText(typed.vesselId),
    vesselName: sanitizeText(typed.vesselName) || "Unknown vessel",
    severity: normalizeSeverity(typed.severity),
    status: normalizeStatus(typed.status),
    title: sanitizeText(typed.title) || "Workflow alert",
    message: sanitizeText(typed.message),
    watchlistIds: Array.isArray(typed.watchlistIds)
      ? typed.watchlistIds.map((value) => sanitizeText(value)).filter(Boolean)
      : [],
    watchlistNames: Array.isArray(typed.watchlistNames)
      ? typed.watchlistNames.map((value) => sanitizeText(value)).filter(Boolean)
      : [],
    detectionPhase: phase,
    moroccoBoundScore: sanitizeNumber(typed.moroccoBoundScore) ?? 0,
    agriCargoScore: sanitizeNumber(typed.agriCargoScore) ?? 0,
    eta: sanitizeText(typed.eta),
    destinationPort: sanitizeText(typed.destinationPort),
    destinationText: sanitizeText(typed.destinationText),
    fingerprint: sanitizeText(typed.fingerprint),
    createdAt,
    acknowledgedAt: sanitizeNullableText(typed.acknowledgedAt),
  };
}

function normalizeSnapshot(raw: unknown): WorkflowVesselSnapshot | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const typed = raw as Partial<WorkflowVesselSnapshot>;
  const phase = normalizePhase(typed.detectionPhase);
  if (!phase) {
    return null;
  }

  return {
    vesselId: sanitizeText(typed.vesselId),
    vesselName: sanitizeText(typed.vesselName) || "Unknown vessel",
    detectionPhase: phase,
    moroccoBoundScore: sanitizeNumber(typed.moroccoBoundScore) ?? 0,
    agriCargoScore: sanitizeNumber(typed.agriCargoScore) ?? 0,
    eta: sanitizeText(typed.eta),
    destinationPortCode: sanitizeText(typed.destinationPortCode),
    destinationPort: sanitizeText(typed.destinationPort),
    destinationText: sanitizeText(typed.destinationText),
    departurePortCode: sanitizeText(typed.departurePortCode),
    departurePort: sanitizeText(typed.departurePort),
    departureCountry: sanitizeText(typed.departureCountry),
    currentMaritimeZone: sanitizeText(typed.currentMaritimeZone),
    estimatedDaysToMorocco: sanitizeNumber(typed.estimatedDaysToMorocco) ?? 0,
    mostLikelyCommodity:
      typed.mostLikelyCommodity === "wheat" ||
      typed.mostLikelyCommodity === "barley" ||
      typed.mostLikelyCommodity === "corn" ||
      typed.mostLikelyCommodity === "soybeanMeal"
        ? typed.mostLikelyCommodity
        : "wheat",
    lastSignalAt: sanitizeText(typed.lastSignalAt),
    capturedAt: sanitizeText(typed.capturedAt) || nowIso(),
  };
}

function normalizeChangeEvent(raw: unknown): WorkflowVesselChangeEvent | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const typed = raw as Partial<WorkflowVesselChangeEvent>;
  if (
    typed.type !== "new_vessel" &&
    typed.type !== "phase_change" &&
    typed.type !== "score_change" &&
    typed.type !== "eta_change" &&
    typed.type !== "destination_change"
  ) {
    return null;
  }

  return {
    id: sanitizeText(typed.id) || createId("evt"),
    vesselId: sanitizeText(typed.vesselId),
    vesselName: sanitizeText(typed.vesselName) || "Unknown vessel",
    type: typed.type,
    title: sanitizeText(typed.title) || "Workflow event",
    summary: sanitizeText(typed.summary),
    metadata: typed.metadata && typeof typed.metadata === "object" ? typed.metadata : {},
    fingerprint: sanitizeText(typed.fingerprint),
    createdAt: sanitizeText(typed.createdAt) || nowIso(),
  };
}

function normalizeAnalystAnnotationLabel(value: unknown) {
  return value === "interesting" ||
    value === "false_positive" ||
    value === "to_confirm" ||
    value === "probable_cargo"
    ? value
    : null;
}

function normalizeAnalystVerdict(value: unknown): "confirmed" | "rejected" | "pending" {
  if (value === "confirmed" || value === "rejected" || value === "pending") {
    return value;
  }
  return "pending";
}

function normalizeAnalystFeedback(raw: unknown): AnalystFeedbackRecord | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const typed = raw as Partial<AnalystFeedbackRecord>;
  const predictedPhase = normalizePhase(typed.predictedDetectionPhase);
  const predictedCommodity =
    typed.predictedCommodity === "wheat" ||
    typed.predictedCommodity === "barley" ||
    typed.predictedCommodity === "corn" ||
    typed.predictedCommodity === "soybeanMeal"
      ? typed.predictedCommodity
      : null;

  if (!predictedPhase || !predictedCommodity) {
    return null;
  }

  return {
    id: sanitizeText(typed.id) || createId("feedback"),
    workspaceId: sanitizeText(typed.workspaceId) || DEFAULT_WORKSPACE_ID,
    vesselId: sanitizeText(typed.vesselId),
    vesselName: sanitizeText(typed.vesselName) || "Unknown vessel",
    annotations: Array.isArray(typed.annotations)
      ? typed.annotations
          .map((value) => normalizeAnalystAnnotationLabel(value))
          .filter((value): value is NonNullable<typeof value> => value !== null)
      : [],
    moroccoBoundVerdict: normalizeAnalystVerdict(typed.moroccoBoundVerdict),
    commodityVerdict: normalizeAnalystVerdict(typed.commodityVerdict),
    actualCommodity:
      typed.actualCommodity === "wheat" ||
      typed.actualCommodity === "barley" ||
      typed.actualCommodity === "corn" ||
      typed.actualCommodity === "soybeanMeal"
        ? typed.actualCommodity
        : null,
    note: sanitizeNullableText(typed.note),
    predictedCommodity,
    predictedDetectionPhase: predictedPhase,
    predictedMoroccoBoundScore: sanitizeNumber(typed.predictedMoroccoBoundScore) ?? 0,
    predictedAgriCargoScore: sanitizeNumber(typed.predictedAgriCargoScore) ?? 0,
    predictedDeparturePort: sanitizeText(typed.predictedDeparturePort),
    predictedDepartureCountry: sanitizeText(typed.predictedDepartureCountry),
    predictedDestinationPort: sanitizeText(typed.predictedDestinationPort),
    predictedCurrentMaritimeZone: sanitizeText(typed.predictedCurrentMaritimeZone),
    predictedDepartureDetectedAt: sanitizeText(typed.predictedDepartureDetectedAt),
    predictedEta: sanitizeText(typed.predictedEta),
    feedbackCreatedAt: sanitizeText(typed.feedbackCreatedAt) || nowIso(),
    lastReviewedAt: sanitizeText(typed.lastReviewedAt) || nowIso(),
  };
}

function normalizeAnalystFeedbackAuditEvent(raw: unknown): AnalystFeedbackAuditEvent | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const typed = raw as Partial<AnalystFeedbackAuditEvent>;
  if (
    typed.action !== "feedback_created" &&
    typed.action !== "annotations_updated" &&
    typed.action !== "morocco_verdict_updated" &&
    typed.action !== "commodity_verdict_updated" &&
    typed.action !== "note_updated"
  ) {
    return null;
  }

  return {
    id: sanitizeText(typed.id) || createId("audit"),
    feedbackId: sanitizeText(typed.feedbackId),
    vesselId: sanitizeText(typed.vesselId),
    vesselName: sanitizeText(typed.vesselName) || "Unknown vessel",
    action: typed.action,
    summary: sanitizeText(typed.summary),
    metadata: typed.metadata && typeof typed.metadata === "object" ? typed.metadata : {},
    createdAt: sanitizeText(typed.createdAt) || nowIso(),
  };
}

function normalizeScoringVersion(raw: unknown): WorkflowScoringVersion | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const typed = raw as Partial<WorkflowScoringVersion>;
  const createdAt = sanitizeText(typed.createdAt) || nowIso();
  const updatedAt = sanitizeText(typed.updatedAt) || createdAt;
  const id = sanitizeText(typed.id);
  const slug = sanitizeText(typed.slug);

  if (!id || !slug) {
    return null;
  }

  return {
    id,
    slug,
    label: sanitizeText(typed.label) || slug,
    description: sanitizeNullableText(typed.description),
    isActive: sanitizeBoolean(typed.isActive, false),
    createdAt,
    updatedAt,
  };
}

function normalizeValidatedVoyage(raw: unknown): ValidatedVoyage | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const typed = raw as Partial<ValidatedVoyage>;
  const predictedPhase = normalizePhase(typed.predictedDetectionPhase);
  const predictedCommodity =
    typed.predictedCommodity === "wheat" ||
    typed.predictedCommodity === "barley" ||
    typed.predictedCommodity === "corn" ||
    typed.predictedCommodity === "soybeanMeal"
      ? typed.predictedCommodity
      : null;

  if (!predictedPhase || !predictedCommodity) {
    return null;
  }

  return {
    id: sanitizeText(typed.id) || createId("validated"),
    workspaceId: sanitizeText(typed.workspaceId) || DEFAULT_WORKSPACE_ID,
    feedbackId: sanitizeText(typed.feedbackId),
    vesselId: sanitizeText(typed.vesselId),
    vesselName: sanitizeText(typed.vesselName) || "Unknown vessel",
    scoringVersionId: sanitizeText(typed.scoringVersionId) || "scorever_hybrid_grain_v1",
    predictedDetectionPhase: predictedPhase,
    predictedCommodity,
    actualCommodity:
      typed.actualCommodity === "wheat" ||
      typed.actualCommodity === "barley" ||
      typed.actualCommodity === "corn" ||
      typed.actualCommodity === "soybeanMeal"
        ? typed.actualCommodity
        : null,
    moroccoBoundVerdict: normalizeAnalystVerdict(typed.moroccoBoundVerdict),
    commodityVerdict: normalizeAnalystVerdict(typed.commodityVerdict),
    predictedMoroccoBoundScore: sanitizeNumber(typed.predictedMoroccoBoundScore) ?? 0,
    predictedAgriCargoScore: sanitizeNumber(typed.predictedAgriCargoScore) ?? 0,
    departurePort: sanitizeText(typed.departurePort),
    departureCountry: sanitizeText(typed.departureCountry),
    destinationPort: sanitizeText(typed.destinationPort),
    corridor: sanitizeText(typed.corridor),
    predictedDepartureDetectedAt: sanitizeText(typed.predictedDepartureDetectedAt),
    predictedEta: sanitizeText(typed.predictedEta),
    leadTimeDays: sanitizeNumber(typed.leadTimeDays),
    reviewRecordedAt: sanitizeText(typed.reviewRecordedAt) || nowIso(),
    note: sanitizeNullableText(typed.note),
  };
}

function normalizeStore(raw: unknown): WorkflowStore {
  const defaults = getDefaultStore();
  if (!raw || typeof raw !== "object") {
    return defaults;
  }

  const typed = raw as Partial<WorkflowStore>;
  const workspaces = Array.isArray(typed.workspaces)
    ? typed.workspaces
        .map((workspace) => normalizeWorkspace(workspace))
        .filter((workspace): workspace is WorkflowWorkspace => workspace !== null)
    : [];

  const resolvedWorkspaces = workspaces.length > 0 ? workspaces : defaults.workspaces;
  const defaultWorkspaceId = sanitizeText(typed.defaultWorkspaceId) || resolvedWorkspaces[0].id;

  const sourceVersion = typeof typed.version === "number" ? typed.version : 0;
  const shouldResetAlerts = sourceVersion < 2;

  return {
    version: defaults.version,
    defaultWorkspaceId,
    workspaces: resolvedWorkspaces,
    alerts: shouldResetAlerts
      ? []
      : Array.isArray(typed.alerts)
          ? typed.alerts
              .map((alert) => normalizeAlert(alert))
              .filter((alert): alert is WorkflowAlert => alert !== null)
              .slice(-MAX_ALERTS)
          : [],
    vesselSnapshots: Array.isArray(typed.vesselSnapshots)
      ? typed.vesselSnapshots
          .map((snapshot) => normalizeSnapshot(snapshot))
          .filter((snapshot): snapshot is WorkflowVesselSnapshot => snapshot !== null)
      : [],
    vesselChangeEvents: Array.isArray(typed.vesselChangeEvents)
      ? typed.vesselChangeEvents
          .map((event) => normalizeChangeEvent(event))
          .filter((event): event is WorkflowVesselChangeEvent => event !== null)
          .slice(-MAX_CHANGE_EVENTS)
      : [],
    analystFeedback: Array.isArray(typed.analystFeedback)
      ? typed.analystFeedback
          .map((record) => normalizeAnalystFeedback(record))
          .filter((record): record is AnalystFeedbackRecord => record !== null)
      : [],
    analystFeedbackAuditEvents: Array.isArray(typed.analystFeedbackAuditEvents)
      ? typed.analystFeedbackAuditEvents
          .map((event) => normalizeAnalystFeedbackAuditEvent(event))
          .filter((event): event is AnalystFeedbackAuditEvent => event !== null)
          .slice(-MAX_ANALYST_AUDIT_EVENTS)
      : [],
    scoringVersions: Array.isArray(typed.scoringVersions)
      ? typed.scoringVersions
          .map((version) => normalizeScoringVersion(version))
          .filter((version): version is WorkflowScoringVersion => version !== null)
      : defaults.scoringVersions,
    validatedVoyages: Array.isArray(typed.validatedVoyages)
      ? typed.validatedVoyages
          .map((entry) => normalizeValidatedVoyage(entry))
          .filter((entry): entry is ValidatedVoyage => entry !== null)
          .slice(-MAX_VALIDATED_VOYAGES)
      : [],
    lastFeedSignature: sanitizeNullableText(typed.lastFeedSignature),
    lastSyncAt: sanitizeNullableText(typed.lastSyncAt),
    lastSource: typed.lastSource && typeof typed.lastSource === "object" ? typed.lastSource : null,
  };
}

function writeStore(store: WorkflowStore) {
  ensureWorkflowDir();
  fs.writeFileSync(getWorkflowFile(), JSON.stringify(store, null, 2), "utf-8");
  cache = { loadedAt: Date.now(), store, backend: "file" };
}

function readWorkflowStoreFresh() {
  const defaults = getDefaultStore();
  ensureWorkflowDir();
  const workflowFile = getWorkflowFile();

  if (!fs.existsSync(workflowFile)) {
    writeStore(defaults);
    return defaults;
  }

  try {
    const raw = fs.readFileSync(workflowFile, "utf-8");
    const parsed = raw ? JSON.parse(raw) : {};
    const store = normalizeStore(parsed);
    cache = { loadedAt: Date.now(), store, backend: "file" };
    return store;
  } catch {
    writeStore(defaults);
    return defaults;
  }
}

export function getWorkflowStore(options?: { bypassCache?: boolean }) {
  if (options?.bypassCache) {
    return readWorkflowStoreFresh();
  }

  const now = Date.now();
  if (cache && now - cache.loadedAt <= CACHE_TTL_MS) {
    return cache.store;
  }

  const store = readWorkflowStoreFresh();
  cache = { loadedAt: now, store, backend: "file" };
  return store;
}

export function saveWorkflowStore(store: WorkflowStore) {
  writeStore({
    ...store,
    alerts: store.alerts.slice(-MAX_ALERTS),
    vesselChangeEvents: store.vesselChangeEvents.slice(-MAX_CHANGE_EVENTS),
    analystFeedbackAuditEvents: store.analystFeedbackAuditEvents.slice(-MAX_ANALYST_AUDIT_EVENTS),
    validatedVoyages: store.validatedVoyages.slice(-MAX_VALIDATED_VOYAGES),
  });
}

export function updateWorkflowStore(mutator: (store: WorkflowStore) => WorkflowStore) {
  const next = mutator(getWorkflowStore({ bypassCache: true }));
  saveWorkflowStore(next);
  return next;
}

function trimWorkflowStore(store: WorkflowStore) {
  return {
    ...store,
    alerts: store.alerts.slice(-MAX_ALERTS),
    vesselChangeEvents: store.vesselChangeEvents.slice(-MAX_CHANGE_EVENTS),
    analystFeedbackAuditEvents: store.analystFeedbackAuditEvents.slice(-MAX_ANALYST_AUDIT_EVENTS),
    validatedVoyages: store.validatedVoyages.slice(-MAX_VALIDATED_VOYAGES),
  };
}

export async function getWorkflowStoreWithMetaAsync(options?: { bypassCache?: boolean }) {
  if (!options?.bypassCache) {
    const now = Date.now();
    if (cache && now - cache.loadedAt <= CACHE_TTL_MS) {
      return {
        backend: cache.backend,
        store: cache.store,
      };
    }
  }

  const persisted = await readAppState({
    namespace: WORKFLOW_STATE_NAMESPACE,
    normalize: normalizeStore,
  });

  if (persisted.backend === "prisma" && persisted.store) {
    cache = {
      loadedAt: Date.now(),
      store: persisted.store,
      backend: "prisma",
    };
    return {
      backend: "prisma" as const,
      store: persisted.store,
    };
  }

  const fileStore = getWorkflowStore({ bypassCache: true });
  if (persisted.backend === "prisma") {
    const backend = await writeAppState({
      namespace: WORKFLOW_STATE_NAMESPACE,
      payload: fileStore,
    });
    cache = {
      loadedAt: Date.now(),
      store: fileStore,
      backend,
    };
    return {
      backend,
      store: fileStore,
    };
  }

  cache = {
    loadedAt: Date.now(),
    store: fileStore,
    backend: "file",
  };
  return {
    backend: "file" as const,
    store: fileStore,
  };
}

export async function getWorkflowStoreAsync(options?: { bypassCache?: boolean }) {
  const result = await getWorkflowStoreWithMetaAsync(options);
  return result.store;
}

export async function saveWorkflowStoreAsync(store: WorkflowStore) {
  const trimmed = trimWorkflowStore(store);
  writeStore(trimmed);
  const backend = await writeAppState({
    namespace: WORKFLOW_STATE_NAMESPACE,
    payload: trimmed,
  });
  cache = {
    loadedAt: Date.now(),
    store: trimmed,
    backend,
  };
  return trimmed;
}

export async function updateWorkflowStoreAsync(mutator: (store: WorkflowStore) => WorkflowStore) {
  const current = await getWorkflowStoreAsync({ bypassCache: true });
  const next = mutator(current);
  return saveWorkflowStoreAsync(next);
}

export async function getWorkflowPersistenceInfo() {
  const { backend } = await getWorkflowStoreWithMetaAsync();
  return {
    backend,
    prismaAvailable: isPrismaAvailable,
  };
}

export function getDefaultWorkspace(store = getWorkflowStore()) {
  return (
    store.workspaces.find((workspace) => workspace.id === store.defaultWorkspaceId) ??
    store.workspaces[0] ??
    defaultWorkspace(nowIso())
  );
}

export function replaceWorkspace(store: WorkflowStore, workspace: WorkflowWorkspace) {
  return {
    ...store,
    workspaces: store.workspaces.map((entry) => (entry.id === workspace.id ? workspace : entry)),
  };
}

export function createWorkflowIds() {
  return {
    watchlistId: createId("watchlist"),
    ruleId: createId("rule"),
    alertId: createId("alert"),
    eventId: createId("evt"),
    feedbackId: createId("feedback"),
    auditId: createId("audit"),
    scoringVersionId: createId("scorever") as ModelScoringVersionId,
    validatedVoyageId: createId("validated"),
  };
}

export { DEFAULT_WORKSPACE_ID };
