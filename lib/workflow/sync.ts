import { format } from "date-fns";
import { getFavoriteVesselIds } from "@/lib/settings/store";
import {
  CommodityType,
  DetectionPhase,
  RadarDataSource,
  RadarFeed,
  RadarVessel,
} from "@/lib/types";
import {
  createWorkflowIds,
  getDefaultWorkspace,
  getWorkflowStoreAsync,
  replaceWorkspace,
  saveWorkflowStoreAsync,
  updateWorkflowStoreAsync,
} from "@/lib/workflow/store";
import {
  AnalystFeedbackAuditEvent,
  AnalystFeedbackRecord,
  AnalystVerdict,
  MorningBriefPayload,
  MorningBriefVesselEntry,
  UpsertAnalystFeedbackInput,
  UpsertAlertRuleInput,
  UpsertWatchlistInput,
  ValidationDashboardPayload,
  ValidationMetrics,
  WorkflowAlert,
  WorkflowAlertRule,
  WorkflowDashboardPayload,
  WorkflowStore,
  WorkflowVesselChangeEvent,
  WorkflowVesselSnapshot,
  WorkflowWatchlist,
  WorkflowWatchlistEntry,
  WorkflowWatchlistMatch,
} from "@/lib/workflow/types";

const PHASE_PRIORITY: Record<DetectionPhase, number> = {
  departure_detected: 1,
  morocco_bound_suspected: 2,
  morocco_bound_likely: 3,
  agri_cargo_likely: 4,
  commodity_hypothesis: 5,
  near_arrival_confirmed: 6,
};

function safeDate(isoDate: string) {
  const date = new Date(isoDate);
  return Number.isNaN(date.getTime()) ? null : date;
}

function hoursBetween(a: string, b: string) {
  const first = safeDate(a);
  const second = safeDate(b);
  if (!first || !second) {
    return null;
  }
  return Math.abs((second.getTime() - first.getTime()) / 3_600_000);
}

function normalizeFreeText(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function formatCommodityLabel(value: CommodityType) {
  return value
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatPhaseLabel(value: DetectionPhase) {
  return value.replaceAll("_", " ");
}

function formatVerdictLabel(value: AnalystVerdict) {
  return value.replaceAll("_", " ");
}

function buildPriorityScore(vessel: RadarVessel) {
  return Number(
    (
      vessel.moroccoBoundScore * 0.45 +
      vessel.agriCargoScore * 0.35 +
      PHASE_PRIORITY[vessel.detectionPhase] * 4 +
      Math.min(12, (vessel.observationCount ?? 1) * 1.5) +
      (vessel.commodityConfidenceLabel === "strong hypothesis"
        ? 8
        : vessel.commodityConfidenceLabel === "moderate hypothesis"
          ? 4
          : 1)
    ).toFixed(1),
  );
}

function buildFeedSignature(vessels: RadarVessel[], source: RadarDataSource) {
  const vesselSignature = vessels
    .map((vessel) =>
      [
        vessel.id,
        vessel.detectionPhase,
        vessel.moroccoBoundScore,
        vessel.agriCargoScore,
        vessel.eta,
        vessel.destinationPortCode,
        vessel.destinationText,
      ].join("|"),
    )
    .sort()
    .join("\n");

  return `${source.mode}:${source.provider}:${source.warning ?? ""}:${vesselSignature}`;
}

function buildSnapshot(vessel: RadarVessel, capturedAt: string): WorkflowVesselSnapshot {
  return {
    vesselId: vessel.id,
    vesselName: vessel.name,
    detectionPhase: vessel.detectionPhase,
    moroccoBoundScore: vessel.moroccoBoundScore,
    agriCargoScore: vessel.agriCargoScore,
    eta: vessel.eta,
    destinationPortCode: vessel.destinationPortCode,
    destinationPort: vessel.destinationPort,
    destinationText: vessel.destinationText,
    departurePortCode: vessel.departurePortCode,
    departurePort: vessel.departurePort,
    departureCountry: vessel.departureCountry,
    currentMaritimeZone: vessel.currentMaritimeZone,
    estimatedDaysToMorocco: vessel.estimatedDaysToMorocco,
    mostLikelyCommodity: vessel.mostLikelyCommodity,
    lastSignalAt: vessel.lastSignalAt,
    capturedAt,
  };
}

function matchesWatchlist(vessel: RadarVessel, watchlist: WorkflowWatchlist, favoriteIds: Set<string>) {
  const filters = watchlist.filters;

  if (!watchlist.isActive) {
    return false;
  }

  if (filters.destinationPortCode && vessel.destinationPortCode !== filters.destinationPortCode) {
    return false;
  }

  if (filters.commodity && vessel.mostLikelyCommodity !== filters.commodity) {
    return false;
  }

  if (filters.departureCountry && vessel.departureCountry !== filters.departureCountry) {
    return false;
  }

  if (typeof filters.maxDaysToMorocco === "number" && vessel.estimatedDaysToMorocco > filters.maxDaysToMorocco) {
    return false;
  }

  if (
    typeof filters.minMoroccoBoundScore === "number" &&
    vessel.moroccoBoundScore < filters.minMoroccoBoundScore
  ) {
    return false;
  }

  if (typeof filters.minAgriCargoScore === "number" && vessel.agriCargoScore < filters.minAgriCargoScore) {
    return false;
  }

  if (filters.favoritesOnly && !favoriteIds.has(vessel.id)) {
    return false;
  }

  return true;
}

function getWatchlistMatches(
  vessel: RadarVessel,
  watchlists: WorkflowWatchlist[],
  favoriteIds: Set<string>,
): WorkflowWatchlistMatch[] {
  return watchlists
    .filter((watchlist) => matchesWatchlist(vessel, watchlist, favoriteIds))
    .map((watchlist) => ({
      watchlistId: watchlist.id,
      watchlistName: watchlist.name,
    }));
}

function maybePushEvent(
  events: WorkflowVesselChangeEvent[],
  nextEvent: WorkflowVesselChangeEvent,
  existingFingerprints: Set<string>,
) {
  if (existingFingerprints.has(nextEvent.fingerprint)) {
    return;
  }

  existingFingerprints.add(nextEvent.fingerprint);
  events.push(nextEvent);
}

function maybePushAlert(alerts: WorkflowAlert[], nextAlert: WorkflowAlert, existingFingerprints: Set<string>) {
  if (existingFingerprints.has(nextAlert.fingerprint)) {
    return;
  }

  existingFingerprints.add(nextAlert.fingerprint);
  alerts.unshift(nextAlert);
}

function areStringArraysEqual(a: string[], b: string[]) {
  if (a.length !== b.length) {
    return false;
  }

  return a.every((value, index) => value === b[index]);
}

function buildAuditEvent(
  feedbackId: string,
  vesselId: string,
  vesselName: string,
  action: AnalystFeedbackAuditEvent["action"],
  summary: string,
  metadata: AnalystFeedbackAuditEvent["metadata"],
  createdAt: string,
): AnalystFeedbackAuditEvent {
  return {
    id: createWorkflowIds().auditId,
    feedbackId,
    vesselId,
    vesselName,
    action,
    summary,
    metadata,
    createdAt,
  };
}

function buildScoreChangeSummary(previous: WorkflowVesselSnapshot, current: WorkflowVesselSnapshot) {
  const parts: string[] = [];
  if (previous.moroccoBoundScore !== current.moroccoBoundScore) {
    parts.push(`Morocco ${previous.moroccoBoundScore} -> ${current.moroccoBoundScore}`);
  }
  if (previous.agriCargoScore !== current.agriCargoScore) {
    parts.push(`Agri ${previous.agriCargoScore} -> ${current.agriCargoScore}`);
  }
  return parts.join(" · ");
}

function buildChangeEvents(
  vessel: RadarVessel,
  previous: WorkflowVesselSnapshot | undefined,
  current: WorkflowVesselSnapshot,
  createdAt: string,
): WorkflowVesselChangeEvent[] {
  const ids = createWorkflowIds();
  const events: WorkflowVesselChangeEvent[] = [];

  if (!previous) {
    events.push({
      id: ids.eventId,
      vesselId: vessel.id,
      vesselName: vessel.name,
      type: "new_vessel",
      title: "New vessel tracked",
      summary: `${vessel.name} entered the radar feed from ${vessel.departurePort}.`,
      metadata: {
        phase: vessel.detectionPhase,
        departurePort: vessel.departurePort,
        commodity: vessel.mostLikelyCommodity,
      },
      fingerprint: `new_vessel:${vessel.id}:${current.capturedAt}`,
      createdAt,
    });
    return events;
  }

  if (previous.detectionPhase !== current.detectionPhase) {
    events.push({
      id: ids.eventId,
      vesselId: vessel.id,
      vesselName: vessel.name,
      type: "phase_change",
      title: "Detection phase upgraded",
      summary: `${vessel.name} moved from ${formatPhaseLabel(previous.detectionPhase)} to ${formatPhaseLabel(current.detectionPhase)}.`,
      metadata: {
        fromPhase: previous.detectionPhase,
        toPhase: current.detectionPhase,
      },
      fingerprint: `phase_change:${vessel.id}:${previous.detectionPhase}:${current.detectionPhase}`,
      createdAt,
    });
  }

  const moroccoDelta = Math.abs(previous.moroccoBoundScore - current.moroccoBoundScore);
  const agriDelta = Math.abs(previous.agriCargoScore - current.agriCargoScore);
  if (moroccoDelta >= 5 || agriDelta >= 5) {
    events.push({
      id: createWorkflowIds().eventId,
      vesselId: vessel.id,
      vesselName: vessel.name,
      type: "score_change",
      title: "Conviction score moved",
      summary: buildScoreChangeSummary(previous, current),
      metadata: {
        previousMoroccoBoundScore: previous.moroccoBoundScore,
        currentMoroccoBoundScore: current.moroccoBoundScore,
        previousAgriCargoScore: previous.agriCargoScore,
        currentAgriCargoScore: current.agriCargoScore,
      },
      fingerprint: `score_change:${vessel.id}:${current.moroccoBoundScore}:${current.agriCargoScore}`,
      createdAt,
    });
  }

  const etaShiftHours = hoursBetween(previous.eta, current.eta);
  if (typeof etaShiftHours === "number" && etaShiftHours >= 6) {
    events.push({
      id: createWorkflowIds().eventId,
      vesselId: vessel.id,
      vesselName: vessel.name,
      type: "eta_change",
      title: "ETA changed materially",
      summary: `${vessel.name} ETA moved by ${etaShiftHours.toFixed(1)}h.`,
      metadata: {
        previousEta: previous.eta,
        currentEta: current.eta,
        etaShiftHours: Number(etaShiftHours.toFixed(1)),
      },
      fingerprint: `eta_change:${vessel.id}:${current.eta}`,
      createdAt,
    });
  }

  const destinationChanged =
    previous.destinationPortCode !== current.destinationPortCode ||
    normalizeFreeText(previous.destinationText) !== normalizeFreeText(current.destinationText);

  if (destinationChanged) {
    events.push({
      id: createWorkflowIds().eventId,
      vesselId: vessel.id,
      vesselName: vessel.name,
      type: "destination_change",
      title: "Destination changed",
      summary: `${vessel.name} destination changed from ${previous.destinationPort || previous.destinationText} to ${current.destinationPort || current.destinationText}.`,
      metadata: {
        previousDestinationPort: previous.destinationPort,
        currentDestinationPort: current.destinationPort,
        previousDestinationText: previous.destinationText,
        currentDestinationText: current.destinationText,
      },
      fingerprint: `destination_change:${vessel.id}:${current.destinationPortCode}:${normalizeFreeText(current.destinationText)}`,
      createdAt,
    });
  }

  return events;
}

function buildAlertFromRule(
  vessel: RadarVessel,
  previous: WorkflowVesselSnapshot | undefined,
  current: WorkflowVesselSnapshot,
  rule: WorkflowAlertRule,
  watchlistMatches: WorkflowWatchlistMatch[],
  createdAt: string,
): WorkflowAlert | null {
  if (!rule.isActive || !previous) {
    return null;
  }

  if (
    rule.watchlistId &&
    !watchlistMatches.some((match) => match.watchlistId === rule.watchlistId)
  ) {
    return null;
  }

  let shouldCreate = false;
  let title = rule.name;
  let message = rule.description ?? rule.name;
  let fingerprint = `${rule.id}:${vessel.id}`;

  if (rule.type === "morocco_bound_threshold") {
    const threshold = rule.threshold ?? 75;
    const previousScore = previous?.moroccoBoundScore ?? -1;
    shouldCreate = current.moroccoBoundScore >= threshold && previousScore < threshold;
    title = "Morocco-bound threshold crossed";
    message = `${vessel.name} reached Morocco-bound score ${current.moroccoBoundScore}.`;
    fingerprint = `${rule.id}:${vessel.id}:morocco:${current.moroccoBoundScore}`;
  }

  if (rule.type === "agri_cargo_threshold") {
    const threshold = rule.threshold ?? 75;
    const previousScore = previous?.agriCargoScore ?? -1;
    shouldCreate = current.agriCargoScore >= threshold && previousScore < threshold;
    title = "Agri-cargo threshold crossed";
    message = `${vessel.name} reached agri-cargo score ${current.agriCargoScore}.`;
    fingerprint = `${rule.id}:${vessel.id}:agri:${current.agriCargoScore}`;
  }

  if (rule.type === "phase_reached") {
    const targetPhase = rule.phase ?? "agri_cargo_likely";
    const previousRank = previous ? PHASE_PRIORITY[previous.detectionPhase] : 0;
    const currentRank = PHASE_PRIORITY[current.detectionPhase];
    shouldCreate = currentRank >= PHASE_PRIORITY[targetPhase] && previousRank < PHASE_PRIORITY[targetPhase];
    title = "Detection phase reached";
    message = `${vessel.name} is now at ${formatPhaseLabel(current.detectionPhase)}.`;
    fingerprint = `${rule.id}:${vessel.id}:phase:${current.detectionPhase}`;
  }

  if (rule.type === "eta_change" && previous) {
    const etaShiftHours = hoursBetween(previous.eta, current.eta);
    const threshold = rule.etaShiftHours ?? 12;
    shouldCreate = typeof etaShiftHours === "number" && etaShiftHours >= threshold;
    title = "ETA moved";
    message =
      typeof etaShiftHours === "number"
        ? `${vessel.name} ETA moved by ${etaShiftHours.toFixed(1)}h.`
        : `${vessel.name} ETA moved materially.`;
    fingerprint = `${rule.id}:${vessel.id}:eta:${current.eta}`;
  }

  if (rule.type === "destination_change" && previous) {
    const destinationChanged =
      previous.destinationPortCode !== current.destinationPortCode ||
      normalizeFreeText(previous.destinationText) !== normalizeFreeText(current.destinationText);
    shouldCreate = destinationChanged;
    title = "Destination changed";
    message = `${vessel.name} destination shifted to ${current.destinationPort || current.destinationText}.`;
    fingerprint = `${rule.id}:${vessel.id}:dest:${current.destinationPortCode}:${normalizeFreeText(current.destinationText)}`;
  }

  if (!shouldCreate) {
    return null;
  }

  return {
    id: createWorkflowIds().alertId,
    workspaceId: rule.workspaceId,
    ruleId: rule.id,
    ruleName: rule.name,
    ruleType: rule.type,
    vesselId: vessel.id,
    vesselName: vessel.name,
    severity: rule.severity,
    status: "open",
    title,
    message,
    watchlistIds: watchlistMatches.map((match) => match.watchlistId),
    watchlistNames: watchlistMatches.map((match) => match.watchlistName),
    detectionPhase: current.detectionPhase,
    moroccoBoundScore: current.moroccoBoundScore,
    agriCargoScore: current.agriCargoScore,
    eta: current.eta,
    destinationPort: current.destinationPort,
    destinationText: current.destinationText,
    fingerprint,
    createdAt,
    acknowledgedAt: null,
  };
}

export async function syncRadarWorkflowState(vessels: RadarVessel[], source: RadarDataSource) {
  const store = await getWorkflowStoreAsync();
  const feedSignature = buildFeedSignature(vessels, source);
  if (store.lastFeedSignature === feedSignature) {
    return store;
  }

  const workspace = getDefaultWorkspace(store);
  const favoriteIds = getFavoriteVesselIds();
  const existingEventFingerprints = new Set(store.vesselChangeEvents.map((event) => event.fingerprint));
  const existingAlertFingerprints = new Set(store.alerts.map((alert) => alert.fingerprint));
  const previousByVesselId = new Map(store.vesselSnapshots.map((snapshot) => [snapshot.vesselId, snapshot]));
  const capturedAt = new Date().toISOString();
  const nextSnapshots: WorkflowVesselSnapshot[] = [];
  const nextEvents = [...store.vesselChangeEvents];
  const nextAlerts = [...store.alerts];

  for (const vessel of vessels) {
    const previous = previousByVesselId.get(vessel.id);
    const current = buildSnapshot(vessel, capturedAt);
    const watchlistMatches = getWatchlistMatches(vessel, workspace.watchlists, favoriteIds);

    for (const event of buildChangeEvents(vessel, previous, current, capturedAt)) {
      maybePushEvent(nextEvents, event, existingEventFingerprints);
    }

    for (const rule of workspace.alertRules) {
      const alert = buildAlertFromRule(vessel, previous, current, rule, watchlistMatches, capturedAt);
      if (alert) {
        maybePushAlert(nextAlerts, alert, existingAlertFingerprints);
      }
    }

    nextSnapshots.push(current);
  }

  const nextStore: WorkflowStore = {
    ...store,
    vesselSnapshots: nextSnapshots,
    vesselChangeEvents: nextEvents.slice(-600),
    alerts: nextAlerts.slice(0, 250),
    lastFeedSignature: feedSignature,
    lastSyncAt: capturedAt,
    lastSource: source,
  };

  await saveWorkflowStoreAsync(nextStore);
  return nextStore;
}

function toMorningBriefEntry(vessel: RadarVessel): MorningBriefVesselEntry {
  return {
    vesselId: vessel.id,
    vesselName: vessel.name,
    departurePort: vessel.departurePort,
    departureCountry: vessel.departureCountry,
    destinationPort: vessel.destinationPort,
    eta: vessel.eta,
    estimatedDaysToMorocco: vessel.estimatedDaysToMorocco,
    currentMaritimeZone: vessel.currentMaritimeZone,
    mostLikelyCommodity: vessel.mostLikelyCommodity,
    detectionPhase: vessel.detectionPhase,
    moroccoBoundScore: vessel.moroccoBoundScore,
    agriCargoScore: vessel.agriCargoScore,
    priorityScore: buildPriorityScore(vessel),
    summaryReasons: [
      vessel.moroccoBoundReasons[0],
      vessel.agriCargoReasons[0],
      vessel.commodityReasons[0],
    ].filter((reason): reason is string => Boolean(reason)),
  };
}

export function buildWatchlistEntries(vessels: RadarVessel[], watchlists: WorkflowWatchlist[]) {
  const favoriteIds = getFavoriteVesselIds();

  return watchlists.map((watchlist): WorkflowWatchlistEntry => {
    const matches = vessels
      .filter((vessel) => matchesWatchlist(vessel, watchlist, favoriteIds))
      .map((vessel) => ({
        vesselId: vessel.id,
        vesselName: vessel.name,
        departurePort: vessel.departurePort,
        departureCountry: vessel.departureCountry,
        destinationPort: vessel.destinationPort,
        eta: vessel.eta,
        estimatedDaysToMorocco: vessel.estimatedDaysToMorocco,
        mostLikelyCommodity: vessel.mostLikelyCommodity,
        moroccoBoundScore: vessel.moroccoBoundScore,
        agriCargoScore: vessel.agriCargoScore,
        detectionPhase: vessel.detectionPhase,
        priorityScore: buildPriorityScore(vessel),
      }))
      .sort((a, b) => b.priorityScore - a.priorityScore)
      .slice(0, 12);

    return {
      watchlist,
      matches,
    };
  });
}

function buildMorningBriefFromStore(feed: RadarFeed, store: WorkflowStore): MorningBriefPayload {
  const workspace = getDefaultWorkspace(store);
  const alerts = store.alerts
    .filter((alert) => alert.workspaceId === workspace.id && alert.status === "open")
    .sort((a, b) => {
      if (a.severity !== b.severity) {
        const weight = { critical: 3, warning: 2, info: 1 };
        return weight[b.severity] - weight[a.severity];
      }
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

  const watchlists = buildWatchlistEntries(feed.vessels, workspace.watchlists);
  const topVessels = [...feed.vessels]
    .sort((a, b) => buildPriorityScore(b) - buildPriorityScore(a))
    .slice(0, 10)
    .map(toMorningBriefEntry);

  const arrivalsNext7Days = feed.vessels.filter((vessel) => vessel.estimatedDaysToMorocco <= 7).length;
  const highConfidenceCargoes = feed.vessels.filter(
    (vessel) =>
      vessel.moroccoBoundScore >= 70 &&
      vessel.agriCargoScore >= 65 &&
      vessel.commodityConfidenceLabel !== "weak hypothesis",
  ).length;

  const recentChanges = store.vesselChangeEvents
    .slice()
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 20);

  const notes: string[] = [];
  if (alerts.filter((alert) => alert.severity === "critical").length > 0) {
    notes.push("Critical workflow alerts require review before the next refresh cycle.");
  }
  if (arrivalsNext7Days > 0) {
    notes.push(`${arrivalsNext7Days} tracked vessels are projected to reach Morocco within 7 days.`);
  }
  if (watchlists.some((entry) => entry.matches.length > 0)) {
    notes.push("At least one active watchlist currently has live matches.");
  }

  return {
    generatedAt: new Date().toISOString(),
    source: store.lastSource ?? feed.source,
    summary: {
      trackedVessels: feed.vessels.length,
      arrivalsNext7Days,
      highConfidenceCargoes,
      openAlerts: alerts.length,
      watchlistsWithMatches: watchlists.filter((entry) => entry.matches.length > 0).length,
    },
    topVessels,
    watchlists,
    openAlerts: alerts.slice(0, 12),
    recentChanges,
    notes,
  };
}

export async function buildMorningBrief(feed: RadarFeed): Promise<MorningBriefPayload> {
  const store = await getWorkflowStoreAsync();
  return buildMorningBriefFromStore(feed, store);
}

function buildWorkflowDashboardFromStore(feed: RadarFeed, store: WorkflowStore): WorkflowDashboardPayload {
  const workspace = getDefaultWorkspace(store);
  const watchlists = buildWatchlistEntries(feed.vessels, workspace.watchlists);
  const alerts = store.alerts
    .filter((alert) => alert.workspaceId === workspace.id)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 30);

  return {
    workspace,
    morningBrief: buildMorningBriefFromStore(feed, store),
    alerts,
    watchlists,
    recentChanges: store.vesselChangeEvents
      .slice()
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 40),
    source: store.lastSource ?? feed.source,
  };
}

export async function buildWorkflowDashboard(feed: RadarFeed): Promise<WorkflowDashboardPayload> {
  const store = await getWorkflowStoreAsync();
  return buildWorkflowDashboardFromStore(feed, store);
}

export async function getVesselChangeHistory(vesselId: string) {
  const store = await getWorkflowStoreAsync();
  return store.vesselChangeEvents
    .filter((event) => event.vesselId === vesselId)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 20);
}

export async function getAnalystFeedbackForVessel(vesselId: string) {
  const store = await getWorkflowStoreAsync();
  return (
    store.analystFeedback
      .filter((feedback) => feedback.vesselId === vesselId)
      .sort((a, b) => new Date(b.lastReviewedAt).getTime() - new Date(a.lastReviewedAt).getTime())[0] ?? null
  );
}

export async function upsertAnalystFeedback(input: UpsertAnalystFeedbackInput) {
  const now = new Date().toISOString();

  return updateWorkflowStoreAsync((store) => {
    const workspace = getDefaultWorkspace(store);
    const existing =
      store.analystFeedback.find(
        (feedback) => feedback.workspaceId === workspace.id && feedback.vesselId === input.vesselId,
      ) ?? null;
    const feedbackId = existing?.id ?? createWorkflowIds().feedbackId;
    const nextAnnotations = Array.from(new Set((input.annotations ?? existing?.annotations ?? []).filter(Boolean))).sort();
    const nextMoroccoVerdict = input.moroccoBoundVerdict ?? existing?.moroccoBoundVerdict ?? "pending";
    const nextCommodityVerdict = input.commodityVerdict ?? existing?.commodityVerdict ?? "pending";
    const nextActualCommodity = input.actualCommodity ?? existing?.actualCommodity ?? null;
    const nextNote = input.note?.trim() || null;

    const nextFeedback: AnalystFeedbackRecord = {
      id: feedbackId,
      workspaceId: workspace.id,
      vesselId: input.vesselId,
      vesselName: input.vesselName.trim() || existing?.vesselName || "Unknown vessel",
      annotations: nextAnnotations,
      moroccoBoundVerdict: nextMoroccoVerdict,
      commodityVerdict: nextCommodityVerdict,
      actualCommodity: nextActualCommodity,
      note: nextNote,
      predictedCommodity: input.predictedCommodity,
      predictedDetectionPhase: input.predictedDetectionPhase,
      predictedMoroccoBoundScore: input.predictedMoroccoBoundScore,
      predictedAgriCargoScore: input.predictedAgriCargoScore,
      predictedDeparturePort: input.predictedDeparturePort.trim(),
      predictedDepartureCountry: input.predictedDepartureCountry.trim(),
      predictedDestinationPort: input.predictedDestinationPort.trim(),
      predictedCurrentMaritimeZone: input.predictedCurrentMaritimeZone.trim(),
      predictedDepartureDetectedAt: input.predictedDepartureDetectedAt,
      predictedEta: input.predictedEta,
      feedbackCreatedAt: existing?.feedbackCreatedAt ?? now,
      lastReviewedAt: now,
    };

    const nextAuditTrail = [...store.analystFeedbackAuditEvents];

    if (!existing) {
      nextAuditTrail.unshift(
        buildAuditEvent(
          feedbackId,
          nextFeedback.vesselId,
          nextFeedback.vesselName,
          "feedback_created",
          `Analyst review started for ${nextFeedback.vesselName}.`,
          {
            predictedCommodity: nextFeedback.predictedCommodity,
            predictedDetectionPhase: nextFeedback.predictedDetectionPhase,
            predictedMoroccoBoundScore: nextFeedback.predictedMoroccoBoundScore,
            predictedAgriCargoScore: nextFeedback.predictedAgriCargoScore,
          },
          now,
        ),
      );
    }

    if (existing && !areStringArraysEqual(existing.annotations, nextAnnotations)) {
      nextAuditTrail.unshift(
        buildAuditEvent(
          feedbackId,
          nextFeedback.vesselId,
          nextFeedback.vesselName,
          "annotations_updated",
          nextAnnotations.length > 0
            ? `Annotations updated for ${nextFeedback.vesselName}.`
            : `All analyst annotations cleared for ${nextFeedback.vesselName}.`,
          {
            previousAnnotations: existing.annotations.join(", "),
            currentAnnotations: nextAnnotations.join(", "),
          },
          now,
        ),
      );
    }

    if (existing && existing.moroccoBoundVerdict !== nextMoroccoVerdict) {
      nextAuditTrail.unshift(
        buildAuditEvent(
          feedbackId,
          nextFeedback.vesselId,
          nextFeedback.vesselName,
          "morocco_verdict_updated",
          `${nextFeedback.vesselName} Morocco-bound verdict set to ${formatVerdictLabel(nextMoroccoVerdict)}.`,
          {
            previousVerdict: existing.moroccoBoundVerdict,
            currentVerdict: nextMoroccoVerdict,
          },
          now,
        ),
      );
    }

    if (
      existing &&
      (existing.commodityVerdict !== nextCommodityVerdict || existing.actualCommodity !== nextActualCommodity)
    ) {
      nextAuditTrail.unshift(
        buildAuditEvent(
          feedbackId,
          nextFeedback.vesselId,
          nextFeedback.vesselName,
          "commodity_verdict_updated",
          `${nextFeedback.vesselName} commodity review updated to ${formatVerdictLabel(nextCommodityVerdict)}.`,
          {
            previousVerdict: existing.commodityVerdict,
            currentVerdict: nextCommodityVerdict,
            previousActualCommodity: existing.actualCommodity,
            currentActualCommodity: nextActualCommodity,
          },
          now,
        ),
      );
    }

    if (existing && (existing.note ?? null) !== nextNote) {
      nextAuditTrail.unshift(
        buildAuditEvent(
          feedbackId,
          nextFeedback.vesselId,
          nextFeedback.vesselName,
          "note_updated",
          nextNote
            ? `Analyst note updated for ${nextFeedback.vesselName}.`
            : `Analyst note cleared for ${nextFeedback.vesselName}.`,
          {
            hadPreviousNote: Boolean(existing.note),
            hasCurrentNote: Boolean(nextNote),
          },
          now,
        ),
      );
    }

    return {
      ...store,
      analystFeedback: existing
        ? store.analystFeedback.map((feedback) => (feedback.id === feedbackId ? nextFeedback : feedback))
        : [nextFeedback, ...store.analystFeedback],
      analystFeedbackAuditEvents: nextAuditTrail,
    };
  });
}

function buildValidationMetrics(store: WorkflowStore): ValidationMetrics {
  const totalFeedbackCases = store.analystFeedback.length;
  const annotatedInterestingCount = store.analystFeedback.filter((feedback) =>
    feedback.annotations.includes("interesting"),
  ).length;
  const annotatedFalsePositiveCount = store.analystFeedback.filter((feedback) =>
    feedback.annotations.includes("false_positive"),
  ).length;
  const pendingReviewCount = store.analystFeedback.filter(
    (feedback) =>
      feedback.moroccoBoundVerdict === "pending" || feedback.commodityVerdict === "pending",
  ).length;
  const reviewedMoroccoCases = store.analystFeedback.filter(
    (feedback) => feedback.moroccoBoundVerdict !== "pending",
  ).length;
  const confirmedMoroccoCases = store.analystFeedback.filter(
    (feedback) => feedback.moroccoBoundVerdict === "confirmed",
  ).length;
  const rejectedMoroccoCases = store.analystFeedback.filter(
    (feedback) => feedback.moroccoBoundVerdict === "rejected",
  ).length;
  const reviewedCommodityCases = store.analystFeedback.filter(
    (feedback) => feedback.commodityVerdict !== "pending",
  ).length;
  const commodityComparableCases = store.analystFeedback.filter((feedback) => feedback.actualCommodity !== null);
  const commodityExactMatches = commodityComparableCases.filter(
    (feedback) => feedback.actualCommodity === feedback.predictedCommodity,
  ).length;

  return {
    totalFeedbackCases,
    annotatedInterestingCount,
    annotatedFalsePositiveCount,
    pendingReviewCount,
    reviewedMoroccoCases,
    confirmedMoroccoCases,
    rejectedMoroccoCases,
    moroccoPrecision:
      reviewedMoroccoCases > 0 ? Number((confirmedMoroccoCases / reviewedMoroccoCases).toFixed(3)) : null,
    reviewedCommodityCases,
    commodityExactMatches,
    commodityExactRate:
      commodityComparableCases.length > 0
        ? Number((commodityExactMatches / commodityComparableCases.length).toFixed(3))
        : null,
  };
}

function buildValidationDashboardFromStore(feed: RadarFeed, store: WorkflowStore): ValidationDashboardPayload {
  const snapshotByVesselId = new Map(store.vesselSnapshots.map((snapshot) => [snapshot.vesselId, snapshot]));
  const liveByVesselId = new Map(feed.vessels.map((vessel) => [vessel.id, vessel]));

  return {
    source: store.lastSource ?? feed.source,
    generatedAt: new Date().toISOString(),
    metrics: buildValidationMetrics(store),
    cases: store.analystFeedback
      .slice()
      .sort((a, b) => new Date(b.lastReviewedAt).getTime() - new Date(a.lastReviewedAt).getTime())
      .map((feedback) => {
        const live = liveByVesselId.get(feedback.vesselId);
        return {
          feedback,
          latestSnapshot: snapshotByVesselId.get(feedback.vesselId) ?? null,
          currentLive: live
            ? {
                detectionPhase: live.detectionPhase,
                moroccoBoundScore: live.moroccoBoundScore,
                agriCargoScore: live.agriCargoScore,
                destinationPort: live.destinationPort,
                eta: live.eta,
                mostLikelyCommodity: live.mostLikelyCommodity,
              }
            : null,
        };
      }),
    auditTrail: store.analystFeedbackAuditEvents
      .slice()
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 80),
  };
}

export async function buildValidationDashboard(feed: RadarFeed): Promise<ValidationDashboardPayload> {
  const store = await getWorkflowStoreAsync();
  return buildValidationDashboardFromStore(feed, store);
}

export async function upsertWorkflowWatchlist(input: UpsertWatchlistInput) {
  const now = new Date().toISOString();
  return updateWorkflowStoreAsync((store) => {
    const currentWorkspace = getDefaultWorkspace(store);
    const existing = input.id
      ? currentWorkspace.watchlists.find((watchlist) => watchlist.id === input.id) ?? null
      : null;
    const watchlistId = existing?.id ?? createWorkflowIds().watchlistId;
    const nextWatchlist: WorkflowWatchlist = {
      id: watchlistId,
      workspaceId: currentWorkspace.id,
      name: input.name.trim() || "Untitled watchlist",
      description: input.description?.trim() || null,
      isActive: input.isActive ?? existing?.isActive ?? true,
      filters: {
        destinationPortCode: input.filters?.destinationPortCode?.trim() || null,
        commodity: input.filters?.commodity ?? null,
        departureCountry: input.filters?.departureCountry?.trim() || null,
        maxDaysToMorocco:
          typeof input.filters?.maxDaysToMorocco === "number" ? input.filters.maxDaysToMorocco : null,
        minMoroccoBoundScore:
          typeof input.filters?.minMoroccoBoundScore === "number" ? input.filters.minMoroccoBoundScore : null,
        minAgriCargoScore:
          typeof input.filters?.minAgriCargoScore === "number" ? input.filters.minAgriCargoScore : null,
        favoritesOnly: input.filters?.favoritesOnly ?? existing?.filters.favoritesOnly ?? false,
      },
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    const updatedWorkspace = {
      ...currentWorkspace,
      updatedAt: now,
      watchlists: existing
        ? currentWorkspace.watchlists.map((watchlist) => (watchlist.id === watchlistId ? nextWatchlist : watchlist))
        : [nextWatchlist, ...currentWorkspace.watchlists],
    };

    return replaceWorkspace(store, updatedWorkspace);
  });
}

export async function deleteWorkflowWatchlist(watchlistId: string) {
  return updateWorkflowStoreAsync((store) => {
    const workspace = getDefaultWorkspace(store);
    const updatedWorkspace = {
      ...workspace,
      updatedAt: new Date().toISOString(),
      watchlists: workspace.watchlists.filter((watchlist) => watchlist.id !== watchlistId),
      alertRules: workspace.alertRules.map((rule) =>
        rule.watchlistId === watchlistId
          ? {
              ...rule,
              watchlistId: null,
              updatedAt: new Date().toISOString(),
            }
          : rule,
      ),
    };

    return replaceWorkspace(store, updatedWorkspace);
  });
}

export async function acknowledgeWorkflowAlert(alertId: string) {
  return updateWorkflowStoreAsync((store) => ({
    ...store,
    alerts: store.alerts.map((alert) =>
      alert.id === alertId
        ? {
            ...alert,
            status: "acknowledged",
            acknowledgedAt: new Date().toISOString(),
          }
        : alert,
    ),
  }));
}

export async function upsertWorkflowAlertRule(input: UpsertAlertRuleInput) {
  const now = new Date().toISOString();
  return updateWorkflowStoreAsync((store) => {
    const currentWorkspace = getDefaultWorkspace(store);
    const existing = input.id ? currentWorkspace.alertRules.find((rule) => rule.id === input.id) ?? null : null;
    const ruleId = existing?.id ?? createWorkflowIds().ruleId;
    const nextRule: WorkflowAlertRule = {
      id: ruleId,
      workspaceId: currentWorkspace.id,
      name: input.name.trim() || "Untitled rule",
      description: input.description?.trim() || null,
      type: input.type,
      isActive: input.isActive ?? existing?.isActive ?? true,
      severity: input.severity,
      threshold: typeof input.threshold === "number" ? input.threshold : null,
      phase: input.phase ?? null,
      etaShiftHours: typeof input.etaShiftHours === "number" ? input.etaShiftHours : null,
      watchlistId: input.watchlistId ?? null,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    const updatedWorkspace = {
      ...currentWorkspace,
      updatedAt: now,
      alertRules: existing
        ? currentWorkspace.alertRules.map((rule) => (rule.id === ruleId ? nextRule : rule))
        : [nextRule, ...currentWorkspace.alertRules],
    };

    return replaceWorkspace(store, updatedWorkspace);
  });
}

export async function deleteWorkflowAlertRule(ruleId: string) {
  return updateWorkflowStoreAsync((store) => {
    const workspace = getDefaultWorkspace(store);
    const updatedWorkspace = {
      ...workspace,
      updatedAt: new Date().toISOString(),
      alertRules: workspace.alertRules.filter((rule) => rule.id !== ruleId),
    };

    return replaceWorkspace(store, updatedWorkspace);
  });
}

function escapeCsvValue(value: string | number | boolean | null | undefined) {
  const stringValue = value === null || value === undefined ? "" : String(value);
  if (/[",\n]/.test(stringValue)) {
    return `"${stringValue.replaceAll('"', '""')}"`;
  }
  return stringValue;
}

function buildCsv(headers: string[], rows: Array<Array<string | number | boolean | null | undefined>>) {
  return [headers.map(escapeCsvValue).join(","), ...rows.map((row) => row.map(escapeCsvValue).join(","))].join("\n");
}

export async function exportMorningBriefCsv(feed: RadarFeed) {
  const brief = await buildMorningBrief(feed);
  const rows = brief.topVessels.map((entry) => [
    entry.vesselName,
    entry.detectionPhase,
    formatCommodityLabel(entry.mostLikelyCommodity),
    entry.departurePort,
    entry.departureCountry,
    entry.destinationPort,
    entry.eta,
    entry.estimatedDaysToMorocco,
    entry.moroccoBoundScore,
    entry.agriCargoScore,
    entry.priorityScore,
    entry.summaryReasons.join(" | "),
  ]);

  return buildCsv(
    [
      "Vessel",
      "Detection Phase",
      "Commodity",
      "Departure Port",
      "Departure Country",
      "Destination Port",
      "ETA",
      "Estimated Days To Morocco",
      "Morocco-Bound Score",
      "Agri-Cargo Score",
      "Priority Score",
      "Headline Reasons",
    ],
    rows,
  );
}

export async function exportMorningBriefText(feed: RadarFeed) {
  const brief = await buildMorningBrief(feed);
  const lines = [
    `Morocco Grain Radar Morning Brief`,
    `Generated: ${format(new Date(brief.generatedAt), "dd MMM yyyy HH:mm")}`,
    `Source: ${brief.source?.label ?? "Unknown source"}`,
    ``,
    `Tracked vessels: ${brief.summary.trackedVessels}`,
    `Arrivals next 7 days: ${brief.summary.arrivalsNext7Days}`,
    `High-confidence cargoes: ${brief.summary.highConfidenceCargoes}`,
    `Open alerts: ${brief.summary.openAlerts}`,
    ``,
    `Top cargos`,
    ...brief.topVessels.flatMap((entry, index) => [
      `${index + 1}. ${entry.vesselName} | ${formatCommodityLabel(entry.mostLikelyCommodity)} | ${entry.departurePort} -> ${entry.destinationPort}`,
      `   Phase ${formatPhaseLabel(entry.detectionPhase)} | Morocco ${entry.moroccoBoundScore} | Agri ${entry.agriCargoScore} | ETA ${entry.eta}`,
      `   Reasons: ${entry.summaryReasons.join("; ")}`,
    ]),
  ];

  return lines.join("\n");
}

export async function exportWatchlistCsv(feed: RadarFeed, watchlistId: string) {
  const store = await getWorkflowStoreAsync();
  const workspace = getDefaultWorkspace(store);
  const watchlist = workspace.watchlists.find((entry) => entry.id === watchlistId);
  if (!watchlist) {
    return null;
  }

  const entry = buildWatchlistEntries(feed.vessels, [watchlist])[0];
  const rows = entry.matches.map((match) => [
    match.vesselName,
    match.detectionPhase,
    formatCommodityLabel(match.mostLikelyCommodity),
    match.departurePort,
    match.departureCountry,
    match.destinationPort,
    match.eta,
    match.estimatedDaysToMorocco,
    match.moroccoBoundScore,
    match.agriCargoScore,
    match.priorityScore,
  ]);

  return {
    name: watchlist.name,
    csv: buildCsv(
      [
        "Vessel",
        "Detection Phase",
        "Commodity",
        "Departure Port",
        "Departure Country",
        "Destination Port",
        "ETA",
        "Estimated Days To Morocco",
        "Morocco-Bound Score",
        "Agri-Cargo Score",
        "Priority Score",
      ],
      rows,
    ),
  };
}
