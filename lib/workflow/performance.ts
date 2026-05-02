import { RadarFeed } from "@/lib/types";
import {
  createWorkflowIds,
  getDefaultWorkspace,
  getWorkflowStoreAsync,
  updateWorkflowStoreAsync,
} from "@/lib/workflow/store";
import {
  ModelPerformanceBreakdownRow,
  ModelPerformanceDashboardPayload,
  ModelPerformanceSummaryMetrics,
  ValidatedVoyage,
  WorkflowScoringVersion,
  WorkflowStore,
} from "@/lib/workflow/types";

const MOROCCO_BOUND_POSITIVE_SCORE = 70;
const ACTIVE_SCORING_VERSION_SLUG = "hybrid-grain-radar-v1";
const ACTIVE_SCORING_VERSION_LABEL = "Hybrid Grain Radar v1";
const ACTIVE_SCORING_VERSION_DESCRIPTION =
  "Explainable hybrid scoring blend for Morocco-bound grain and feed detection.";

const PHASE_RANK: Record<string, number> = {
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

function daysBetween(from: string, to: string) {
  const start = safeDate(from);
  const end = safeDate(to);
  if (!start || !end) {
    return null;
  }

  return Number(Math.max(0, (end.getTime() - start.getTime()) / 86_400_000).toFixed(2));
}

function normalizeLabel(value: string) {
  return value.trim() || "Unknown";
}

function buildCorridorLabel(departureCountry: string, maritimeZone: string, destinationPort: string) {
  const origin = departureCountry.trim() || "Unknown origin";
  const route = maritimeZone.trim() || "unknown corridor";
  const destination = destinationPort.trim() || "Unknown destination";
  return `${origin} -> ${route} -> ${destination}`;
}

function isPredictedPositive(voyage: ValidatedVoyage) {
  return (
    voyage.predictedMoroccoBoundScore >= MOROCCO_BOUND_POSITIVE_SCORE ||
    (PHASE_RANK[voyage.predictedDetectionPhase] ?? 0) >= PHASE_RANK.morocco_bound_likely
  );
}

function isActualPositive(voyage: ValidatedVoyage) {
  return voyage.moroccoBoundVerdict === "confirmed";
}

function isReviewed(voyage: ValidatedVoyage) {
  return voyage.moroccoBoundVerdict !== "pending";
}

function buildDefaultScoringVersion(existing?: WorkflowScoringVersion | null): WorkflowScoringVersion {
  const timestamp = new Date().toISOString();
  return {
    id: existing?.id ?? "scorever_hybrid_grain_v1",
    slug: ACTIVE_SCORING_VERSION_SLUG,
    label: ACTIVE_SCORING_VERSION_LABEL,
    description: ACTIVE_SCORING_VERSION_DESCRIPTION,
    isActive: true,
    createdAt: existing?.createdAt ?? timestamp,
    updatedAt: existing?.updatedAt ?? timestamp,
  };
}

function ensureScoringVersions(store: WorkflowStore) {
  const existingActive = store.scoringVersions.find((version) => version.slug === ACTIVE_SCORING_VERSION_SLUG) ?? null;
  const activeVersion = buildDefaultScoringVersion(existingActive);

  const others = store.scoringVersions
    .filter((version) => version.slug !== ACTIVE_SCORING_VERSION_SLUG)
    .map((version) => ({ ...version, isActive: false }));

  const nextVersions = [activeVersion, ...others];
  return {
    activeVersion,
    scoringVersions: nextVersions,
  };
}

function materializeValidatedVoyage(
  feedback: WorkflowStore["analystFeedback"][number],
  existingVoyage: ValidatedVoyage | null,
  activeVersion: WorkflowScoringVersion,
  workspaceId: string,
) {
  return {
    id: existingVoyage?.id ?? createWorkflowIds().validatedVoyageId,
    workspaceId,
    feedbackId: feedback.id,
    vesselId: feedback.vesselId,
    vesselName: feedback.vesselName,
    scoringVersionId: existingVoyage?.scoringVersionId ?? activeVersion.id,
    predictedDetectionPhase: feedback.predictedDetectionPhase,
    predictedCommodity: feedback.predictedCommodity,
    actualCommodity: feedback.actualCommodity,
    moroccoBoundVerdict: feedback.moroccoBoundVerdict,
    commodityVerdict: feedback.commodityVerdict,
    predictedMoroccoBoundScore: feedback.predictedMoroccoBoundScore,
    predictedAgriCargoScore: feedback.predictedAgriCargoScore,
    departurePort: feedback.predictedDeparturePort,
    departureCountry: feedback.predictedDepartureCountry,
    destinationPort: feedback.predictedDestinationPort,
    corridor: buildCorridorLabel(
      feedback.predictedDepartureCountry,
      feedback.predictedCurrentMaritimeZone,
      feedback.predictedDestinationPort,
    ),
    predictedDepartureDetectedAt: feedback.predictedDepartureDetectedAt,
    predictedEta: feedback.predictedEta,
    leadTimeDays: daysBetween(
      feedback.predictedDepartureDetectedAt || feedback.feedbackCreatedAt,
      feedback.predictedEta,
    ),
    reviewRecordedAt: feedback.lastReviewedAt,
    note: feedback.note,
  } satisfies ValidatedVoyage;
}

async function stabilizePerformanceStore() {
  const current = await getWorkflowStoreAsync();
  const workspace = getDefaultWorkspace(current);
  const { activeVersion, scoringVersions } = ensureScoringVersions(current);
  const existingByFeedbackId = new Map(current.validatedVoyages.map((voyage) => [voyage.feedbackId, voyage]));
  const nextValidatedVoyages = current.analystFeedback
    .filter((feedback) => feedback.workspaceId === workspace.id)
    .map((feedback) =>
      materializeValidatedVoyage(
        feedback,
        existingByFeedbackId.get(feedback.id) ?? null,
        activeVersion,
        workspace.id,
      ),
    )
    .sort((a, b) => new Date(b.reviewRecordedAt).getTime() - new Date(a.reviewRecordedAt).getTime());

  const versionsChanged = JSON.stringify(scoringVersions) !== JSON.stringify(current.scoringVersions);
  const voyagesChanged = JSON.stringify(nextValidatedVoyages) !== JSON.stringify(current.validatedVoyages);

  if (!versionsChanged && !voyagesChanged) {
    return current;
  }

  return updateWorkflowStoreAsync((store) => ({
    ...store,
    scoringVersions,
    validatedVoyages: nextValidatedVoyages,
  }));
}

function average(values: number[]) {
  if (values.length === 0) {
    return null;
  }
  return Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(2));
}

function rate(numerator: number, denominator: number) {
  if (denominator === 0) {
    return null;
  }
  return Number((numerator / denominator).toFixed(3));
}

function buildSummaryMetrics(voyages: ValidatedVoyage[]): ModelPerformanceSummaryMetrics {
  let truePositives = 0;
  let falsePositives = 0;
  let falseNegatives = 0;
  let trueNegatives = 0;

  for (const voyage of voyages) {
    if (!isReviewed(voyage)) {
      continue;
    }

    const predictedPositive = isPredictedPositive(voyage);
    const actualPositive = isActualPositive(voyage);

    if (predictedPositive && actualPositive) {
      truePositives += 1;
    } else if (predictedPositive && !actualPositive) {
      falsePositives += 1;
    } else if (!predictedPositive && actualPositive) {
      falseNegatives += 1;
    } else {
      trueNegatives += 1;
    }
  }

  const reviewedMoroccoCases = truePositives + falsePositives + falseNegatives + trueNegatives;
  const leadTimes = voyages
    .map((voyage) => voyage.leadTimeDays)
    .filter((value): value is number => typeof value === "number");
  const comparableCommodityVoyages = voyages.filter((voyage) => voyage.actualCommodity !== null);
  const commodityExactMatches = comparableCommodityVoyages.filter(
    (voyage) => voyage.actualCommodity === voyage.predictedCommodity,
  ).length;

  return {
    totalValidatedVoyages: voyages.length,
    reviewedMoroccoCases,
    truePositives,
    falsePositives,
    falseNegatives,
    trueNegatives,
    precision: rate(truePositives, truePositives + falsePositives),
    recall: rate(truePositives, truePositives + falseNegatives),
    averageLeadTimeDays: average(leadTimes),
    commodityExactRate: rate(commodityExactMatches, comparableCommodityVoyages.length),
  };
}

function buildBreakdownRow(key: string, label: string, voyages: ValidatedVoyage[]): ModelPerformanceBreakdownRow {
  const metrics = buildSummaryMetrics(voyages);
  return {
    key,
    label,
    totalCases: voyages.length,
    reviewedCases: metrics.reviewedMoroccoCases,
    truePositives: metrics.truePositives,
    falsePositives: metrics.falsePositives,
    falseNegatives: metrics.falseNegatives,
    precision: metrics.precision,
    recall: metrics.recall,
    averageLeadTimeDays: metrics.averageLeadTimeDays,
    commodityExactRate: metrics.commodityExactRate,
  };
}

function buildBreakdown(
  voyages: ValidatedVoyage[],
  selector: (voyage: ValidatedVoyage) => { key: string; label: string },
) {
  const map = new Map<string, ValidatedVoyage[]>();

  for (const voyage of voyages) {
    const target = selector(voyage);
    const bucket = map.get(target.key) ?? [];
    bucket.push(voyage);
    map.set(target.key, bucket);
  }

  return Array.from(map.entries())
    .map(([key, group]) => buildBreakdownRow(key, selector(group[0]).label, group))
    .sort((a, b) => {
      if (b.totalCases !== a.totalCases) {
        return b.totalCases - a.totalCases;
      }
      return (b.precision ?? -1) - (a.precision ?? -1);
    });
}

function buildModelPerformanceDashboardFromStore(
  feed: RadarFeed,
  store: WorkflowStore,
): ModelPerformanceDashboardPayload {
  const scoringVersionById = new Map(store.scoringVersions.map((version) => [version.id, version]));
  const activeScoringVersion = store.scoringVersions.find((version) => version.isActive) ?? null;
  const voyages = store.validatedVoyages.slice();
  const notes: string[] = [
    "Historical performance is derived from analyst-reviewed vessel cases saved in the product.",
  ];

  if (voyages.length === 0) {
    notes.push("No validated voyages yet. Save reviews from vessel pages to build historical performance.");
  }
  if (store.scoringVersions.length <= 1) {
    notes.push("Version comparison will become meaningful once a new scoring version is introduced.");
  }
  if (voyages.every((voyage) => voyage.actualCommodity === null)) {
    notes.push("Commodity exact-match rate stays empty until analysts confirm actual cargoes.");
  }

  return {
    source: store.lastSource ?? feed.source,
    generatedAt: new Date().toISOString(),
    activeScoringVersion,
    scoringVersions: store.scoringVersions
      .slice()
      .sort((a, b) => Number(b.isActive) - Number(a.isActive) || new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    metrics: buildSummaryMetrics(voyages),
    thresholds: {
      moroccoBoundPositiveScore: MOROCCO_BOUND_POSITIVE_SCORE,
    },
    byOriginCountry: buildBreakdown(voyages, (voyage) => ({
      key: voyage.departureCountry || "unknown",
      label: normalizeLabel(voyage.departureCountry),
    })),
    byDestinationPort: buildBreakdown(voyages, (voyage) => ({
      key: voyage.destinationPort || "unknown",
      label: normalizeLabel(voyage.destinationPort),
    })),
    byCommodity: buildBreakdown(voyages, (voyage) => ({
      key: voyage.actualCommodity ?? voyage.predictedCommodity,
      label: normalizeLabel(voyage.actualCommodity ?? voyage.predictedCommodity),
    })),
    byCorridor: buildBreakdown(voyages, (voyage) => ({
      key: voyage.corridor || "unknown",
      label: normalizeLabel(voyage.corridor),
    })),
    byScoringVersion: buildBreakdown(voyages, (voyage) => ({
      key: voyage.scoringVersionId,
      label: scoringVersionById.get(voyage.scoringVersionId)?.label ?? voyage.scoringVersionId,
    })),
    recentCases: voyages
      .slice()
      .sort((a, b) => new Date(b.reviewRecordedAt).getTime() - new Date(a.reviewRecordedAt).getTime())
      .slice(0, 24),
    notes,
  };
}

export async function buildModelPerformanceDashboard(feed: RadarFeed): Promise<ModelPerformanceDashboardPayload> {
  const store = await stabilizePerformanceStore();
  return buildModelPerformanceDashboardFromStore(feed, store);
}
