import { NextRequest, NextResponse } from "next/server";
import {
  LiveVesselValidationEntry,
  getLiveEvaluationPayload,
  getLiveValidationPayload,
  getRadarFeedForMode,
} from "@/lib/radar/service";
import { CommodityType } from "@/lib/types";

export const dynamic = "force-dynamic";

interface ValidationRequestPayload {
  mode?: "mock" | "live";
  windowHours?: number;
}

interface MissingInformationSummary {
  signal: string;
  count: number;
  averageValue: number;
}

function normalizeWindowHours(value: number | undefined) {
  if (value === 24 || value === 48 || value === 72) {
    return value;
  }
  return 48;
}

function topCommodity(entry: LiveVesselValidationEntry) {
  const probabilities = entry.commodityPosteriorProbabilities;
  const candidates: Array<{ commodity: CommodityType; probability: number }> = [
    { commodity: "wheat", probability: probabilities.wheat },
    { commodity: "barley", probability: probabilities.barley },
    { commodity: "corn", probability: probabilities.corn },
    { commodity: "soybeanMeal", probability: probabilities.soybeanMeal },
  ];
  return candidates.sort((a, b) => b.probability - a.probability)[0];
}

function entryStrengthScore(entry: LiveVesselValidationEntry) {
  const top = topCommodity(entry);
  return (
    top.probability * 100 -
    entry.predictionEntropy * 12 -
    entry.uncertaintyPenalty * 0.7 +
    entry.evidenceCoverageScore * 0.2
  );
}

function summarizeMissingInformation(
  entries: LiveVesselValidationEntry[],
): MissingInformationSummary[] {
  const map = new Map<string, { count: number; total: number }>();

  for (const entry of entries) {
    for (const signal of entry.missingInformationValueRanking) {
      if (!signal.currentlyMissing) {
        continue;
      }
      const current = map.get(signal.signal) ?? { count: 0, total: 0 };
      current.count += 1;
      current.total += signal.value;
      map.set(signal.signal, current);
    }
  }

  return Array.from(map.entries())
    .map(([signal, stats]) => ({
      signal,
      count: stats.count,
      averageValue: stats.total / Math.max(1, stats.count),
    }))
    .sort((a, b) => {
      if (b.count !== a.count) {
        return b.count - a.count;
      }
      return b.averageValue - a.averageValue;
    })
    .slice(0, 10);
}

export async function POST(request: NextRequest) {
  const payload = (await request.json()) as ValidationRequestPayload;
  const mode = payload.mode === "live" ? "live" : "mock";
  const windowHours = normalizeWindowHours(payload.windowHours);

  const feed = await getRadarFeedForMode(mode);
  const [validation, evaluation] = await Promise.all([
    getLiveValidationPayload(feed),
    getLiveEvaluationPayload(feed, { windowHours }),
  ]);

  const candidates = validation.rawDetections.length > 0 ? validation.rawDetections : validation.vessels;
  const ranked = candidates
    .map((entry) => ({ entry, strengthScore: entryStrengthScore(entry), top: topCommodity(entry) }))
    .sort((a, b) => b.strengthScore - a.strengthScore);

  const strongestCandidates = ranked.slice(0, 6).map((candidate) => ({
    vesselId: candidate.entry.vesselId,
    vesselName: candidate.entry.vesselName,
    commodity: candidate.top.commodity,
    topPosteriorProbability: candidate.top.probability * 100,
    entropy: candidate.entry.predictionEntropy,
    uncertaintyPenalty: candidate.entry.uncertaintyPenalty,
    predictionConfidenceBand: candidate.entry.predictionConfidenceBand,
  }));

  const weakestCandidates = [...ranked]
    .sort((a, b) => a.strengthScore - b.strengthScore)
    .slice(0, 6)
    .map((candidate) => ({
      vesselId: candidate.entry.vesselId,
      vesselName: candidate.entry.vesselName,
      commodity: candidate.top.commodity,
      topPosteriorProbability: candidate.top.probability * 100,
      entropy: candidate.entry.predictionEntropy,
      uncertaintyPenalty: candidate.entry.uncertaintyPenalty,
      predictionConfidenceBand: candidate.entry.predictionConfidenceBand,
    }));

  const falsePositives = ranked
    .filter(
      ({ entry }) =>
        entry.admissionDecision === "included" &&
        (entry.contradictionScore >= 55 ||
          entry.topVoyageHypothesis === "ambiguous_dry_bulk_non_morocco" ||
          entry.predictionConfidenceBand === "weak"),
    )
    .slice(0, 6)
    .map(({ entry }) => ({
      vesselId: entry.vesselId,
      vesselName: entry.vesselName,
      reason:
        entry.contradictionReasons[0] ??
        entry.missingSignalsForPromotion[0] ??
        "Included despite weak probabilistic support",
    }));

  const aggregateTopPosterior =
    ranked.length > 0
      ? ranked.reduce((sum, item) => sum + item.top.probability * 100, 0) / ranked.length
      : 0;
  const aggregateEntropy =
    ranked.length > 0
      ? ranked.reduce((sum, item) => sum + item.entry.predictionEntropy, 0) / ranked.length
      : 0;
  const aggregateUncertaintyPenalty =
    ranked.length > 0
      ? ranked.reduce((sum, item) => sum + item.entry.uncertaintyPenalty, 0) / ranked.length
      : 0;
  const aggregateCoverage =
    ranked.length > 0
      ? ranked.reduce((sum, item) => sum + item.entry.evidenceCoverageScore, 0) / ranked.length
      : 0;

  return NextResponse.json({
    report: {
      generatedAt: new Date().toISOString(),
      mode,
      windowHours,
      feedWarning: feed.warning ?? null,
      evaluationNotes: evaluation.notes,
      aggregates: {
        vesselCount: ranked.length,
        avgTopPosteriorProbability: Number(aggregateTopPosterior.toFixed(2)),
        avgEntropy: Number(aggregateEntropy.toFixed(3)),
        avgUncertaintyPenalty: Number(aggregateUncertaintyPenalty.toFixed(2)),
        avgEvidenceCoverage: Number(aggregateCoverage.toFixed(2)),
      },
      strongestCandidates,
      weakestCandidates,
      falsePositives,
      missingInformationSignals: summarizeMissingInformation(candidates),
    },
  });
}
