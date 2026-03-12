import { DashboardView } from "@/components/dashboard/dashboard-view";
import {
  getDashboardMetrics,
  getLiveValidationPayload,
  getMoroccoDestinationPorts,
  getRadarFeed,
  LiveVesselValidationEntry,
} from "@/lib/radar/service";
import { WatchlistFallbackCandidate } from "@/lib/types";

export const dynamic = "force-dynamic";

const AMBIGUOUS_WATCHLIST_HYPOTHESIS = "ambiguous_dry_bulk_non_morocco";

interface RankedWatchlistFallbackCandidate extends WatchlistFallbackCandidate {
  fallbackRelevanceScore: number;
}

function buildWatchlistFallbackCandidate(
  entry: LiveVesselValidationEntry,
  nowMs: number,
): RankedWatchlistFallbackCandidate | null {
  const referenceTime = entry.lastSeenAt ?? entry.watchlistLastUpdatedAt ?? entry.watchlistEnteredAt;
  const evidenceAgeHours = referenceTime
    ? Math.max(0, Number(((nowMs - new Date(referenceTime).getTime()) / 3_600_000).toFixed(1)))
    : 999;

  const hasExportRelevance = entry.exportPortRelevant;
  const hasExplicitMoroccoRelevance = entry.destinationTextMoroccoHint || entry.normalizedMoroccoDestination;
  const hasStrongCorridorRelevance =
    entry.corridorRelevant && (entry.routeCorridorCompatible || entry.acquisitionCorridorRelevant);
  const hasLoadingSignal =
    entry.loadingSignalScore >= 45 || entry.loadingConfidence !== "low" || entry.loadingEvidenceStrength !== "weak";
  const hasKnowledgeSignal =
    entry.knowledgeSupportScore >= 40 ||
    entry.knowledgeMatchedCommodityProfile ||
    entry.knowledgeMatchedTerminalIntelligence ||
    entry.knowledgeDestinationIntelligenceSupport;
  const hasNonAmbiguousVoyage =
    entry.topVoyageHypothesis !== AMBIGUOUS_WATCHLIST_HYPOTHESIS && entry.topVoyageHypothesisScore >= 55;
  const hasRepeatedObservations = entry.observationCount >= 2;
  const hasReadiness = entry.promotionReadinessScore >= 58;

  const meaningfulSignalCount = [
    hasExportRelevance,
    hasExplicitMoroccoRelevance,
    hasStrongCorridorRelevance,
    hasLoadingSignal,
    hasKnowledgeSignal,
    hasNonAmbiguousVoyage,
    hasRepeatedObservations,
    hasReadiness,
  ].filter(Boolean).length;

  const weakAmbiguousCandidate =
    entry.topVoyageHypothesis === AMBIGUOUS_WATCHLIST_HYPOTHESIS &&
    entry.observationCount <= 1 &&
    !hasExportRelevance &&
    !hasExplicitMoroccoRelevance &&
    !hasLoadingSignal &&
    !hasKnowledgeSignal &&
    entry.watchlistPriorityScore < 45 &&
    entry.promotionReadinessScore < 65;

  const weakSingleObservationCandidate =
    entry.observationCount <= 1 &&
    !hasExportRelevance &&
    !hasExplicitMoroccoRelevance &&
    !hasStrongCorridorRelevance &&
    !hasLoadingSignal &&
    !hasKnowledgeSignal &&
    entry.watchlistPriorityScore < 50 &&
    entry.promotionReadinessScore < 65;

  if (weakAmbiguousCandidate || weakSingleObservationCandidate) {
    return null;
  }

  const ambiguousWithWeakEvidence =
    entry.topVoyageHypothesis === AMBIGUOUS_WATCHLIST_HYPOTHESIS &&
    entry.commodityConfidenceLabel === "weak hypothesis" &&
    entry.observationCount < 2 &&
    entry.loadingSignalScore < 50 &&
    entry.knowledgeSupportScore < 45 &&
    !hasExportRelevance &&
    !hasExplicitMoroccoRelevance;

  const ambiguousWithoutSupplementaryEvidence =
    entry.topVoyageHypothesis === AMBIGUOUS_WATCHLIST_HYPOTHESIS &&
    !(
      hasExportRelevance ||
      hasExplicitMoroccoRelevance ||
      hasLoadingSignal ||
      hasKnowledgeSignal ||
      hasRepeatedObservations ||
      entry.promotionReadinessScore >= 70
    );

  if (ambiguousWithWeakEvidence || ambiguousWithoutSupplementaryEvidence) {
    return null;
  }

  const eligibleForFallback =
    (hasReadiness && meaningfulSignalCount >= 3) ||
    (hasNonAmbiguousVoyage && meaningfulSignalCount >= 2) ||
    ((hasExportRelevance || hasExplicitMoroccoRelevance || hasStrongCorridorRelevance) &&
      (hasLoadingSignal || hasKnowledgeSignal || hasRepeatedObservations) &&
      entry.watchlistPriorityScore >= 38);

  if (!eligibleForFallback) {
    return null;
  }

  const fallbackRelevanceScore = Number(
    (
      entry.promotionReadinessScore * 0.34 +
      entry.watchlistPriorityScore * 0.26 +
      Math.min(100, entry.knowledgeSupportScore) * 0.16 +
      Math.min(100, entry.loadingSignalScore) * 0.14 +
      (hasRepeatedObservations ? Math.min(12, entry.observationCount * 2) : 0) +
      (hasExportRelevance ? 8 : 0) +
      (hasExplicitMoroccoRelevance ? 8 : 0) +
      (hasStrongCorridorRelevance ? 6 : 0) +
      (hasNonAmbiguousVoyage ? 6 : 0)
    ).toFixed(1),
  );

  return {
    vesselId: entry.vesselId,
    vesselName: entry.vesselName,
    departurePort: entry.inferredDeparturePort,
    currentCorridor: entry.corridorClassification,
    topVoyageHypothesis: entry.topVoyageHypothesis,
    mostLikelyCommodity: entry.mostLikelyCommodity,
    commodityConfidenceLabel: entry.commodityConfidenceLabel,
    watchlistPriorityScore: entry.watchlistPriorityScore,
    promotionReadinessScore: entry.promotionReadinessScore,
    observationCount: entry.observationCount,
    evidenceAgeHours,
    missingSignalsForPromotion: entry.missingSignalsForPromotion.slice(0, 3),
    fallbackRelevanceScore,
  };
}

export default async function DashboardPage() {
  const [feed, moroccoPorts] = await Promise.all([getRadarFeed(), getMoroccoDestinationPorts()]);
  const metrics = getDashboardMetrics(feed.vessels);

  let watchlistFallbackCandidates: WatchlistFallbackCandidate[] = [];
  if (feed.vessels.length === 0) {
    const validation = await getLiveValidationPayload(feed);
    const nowMs = Date.now();
    watchlistFallbackCandidates = validation.watchlistTopCandidates
      .map((entry) => buildWatchlistFallbackCandidate(entry, nowMs))
      .filter((candidate): candidate is RankedWatchlistFallbackCandidate => candidate !== null)
      .sort((a, b) => {
        if (b.fallbackRelevanceScore !== a.fallbackRelevanceScore) {
          return b.fallbackRelevanceScore - a.fallbackRelevanceScore;
        }
        if (b.promotionReadinessScore !== a.promotionReadinessScore) {
          return b.promotionReadinessScore - a.promotionReadinessScore;
        }
        if (b.watchlistPriorityScore !== a.watchlistPriorityScore) {
          return b.watchlistPriorityScore - a.watchlistPriorityScore;
        }
        if (a.evidenceAgeHours !== b.evidenceAgeHours) {
          return a.evidenceAgeHours - b.evidenceAgeHours;
        }
        return b.observationCount - a.observationCount;
      })
      .slice(0, 8);
  }

  return (
    <DashboardView
      vessels={feed.vessels}
      metrics={metrics}
      moroccoPorts={moroccoPorts}
      watchlistFallbackCandidates={watchlistFallbackCandidates}
      sourceMode={feed.source.mode}
    />
  );
}
