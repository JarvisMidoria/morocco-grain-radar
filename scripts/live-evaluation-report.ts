import { getLiveEvaluationPayload, getRadarFeed } from "../lib/radar/service";

function parseArgs(argv: string[]) {
  const args = {
    windowHours: 48,
    json: false,
  };

  for (const item of argv) {
    if (item === "--json") {
      args.json = true;
      continue;
    }

    if (item.startsWith("--window=")) {
      const value = Number(item.split("=")[1]);
      if (Number.isFinite(value) && value > 0) {
        args.windowHours = value;
      }
    }
  }

  return args;
}

function formatReasonList(reasons: Array<{ reason: string; count: number }>, limit = 5) {
  if (reasons.length === 0) {
    return "none";
  }

  return reasons
    .slice(0, limit)
    .map((item) => `${item.reason} (${item.count})`)
    .join(" | ");
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  const feed = await getRadarFeed();
  const evaluation = await getLiveEvaluationPayload(feed, {
    windowHours: args.windowHours,
  });

  if (args.json) {
    console.log(JSON.stringify(evaluation, null, 2));
    return;
  }

  console.log(`Live Evaluation Window: ${evaluation.windowHours}h`);
  console.log(`Mode/Provider: ${evaluation.mode}/${evaluation.provider}`);
  console.log(`Generated At: ${evaluation.generatedAt}`);
  console.log(`Window Start: ${evaluation.windowStart}`);
  console.log("");
  console.log("Totals");
  console.log(`- raw detections: ${evaluation.totals.totalRawDetections}`);
  console.log(`- dry-bulk compatible detections: ${evaluation.totals.dryBulkCompatibleDetections}`);
  console.log(`- watchlist entries: ${evaluation.totals.watchlistEntries}`);
  console.log(`- re-enrichments: ${evaluation.totals.reEnrichments}`);
  console.log(`- promoted vessels: ${evaluation.totals.promotedVessels}`);
  console.log(`- admitted radar vessels: ${evaluation.totals.admittedRadarVessels}`);
  console.log(`- export knowledge match vessels: ${evaluation.totals.vesselsWithExportKnowledgeMatch}`);
  console.log(`- terminal match vessels: ${evaluation.totals.vesselsWithTerminalMatch}`);
  console.log(`- destination intelligence vessels: ${evaluation.totals.vesselsWithDestinationIntelligence}`);
  console.log(`- usable loading evidence vessels: ${evaluation.totals.vesselsWithUsableLoadingEvidence}`);
  console.log(`- improving evidence vessels: ${evaluation.totals.vesselsWithImprovingEvidenceOverTime}`);
  console.log(`- improved by operational signals: ${evaluation.totals.vesselsImprovedByOperationalSignals}`);
  console.log(`- operational help (watchlist): ${evaluation.totals.operationalSignalsHelpedWatchlistPriorityCount}`);
  console.log(`- operational help (promotion): ${evaluation.totals.operationalSignalsHelpedPromotionReadinessCount}`);
  console.log("");
  console.log("Time Metrics");
  console.log(`- tracked vessels: ${evaluation.timeMetrics.trackedVessels}`);
  console.log(`- avg observations per vessel: ${evaluation.timeMetrics.averageObservationCountPerTrackedVessel}`);
  console.log(`- avg watchlist duration (h): ${evaluation.timeMetrics.averageWatchlistDurationHours}`);
  console.log(`- avg re-enrichment count: ${evaluation.timeMetrics.averageReEnrichmentCount}`);
  console.log(`- avg evidence age (h): ${evaluation.timeMetrics.averageEvidenceAgeHours}`);
  console.log(`- confidence improved vessels: ${evaluation.timeMetrics.confidenceImprovedVessels}`);
  console.log(`- confidence weakened vessels: ${evaluation.timeMetrics.confidenceWeakenedVessels}`);
  console.log("");
  console.log(`Top blockers: ${formatReasonList(evaluation.rankedOutputs.topBlockersPreventingPromotion)}`);
  console.log(`Top exclusions: ${formatReasonList(evaluation.totals.excludedVesselsByReason)}`);
  console.log(
    `Top alias/terminal gaps: ${
      evaluation.rankedOutputs.topMissingAliasOrTerminalGaps
        .slice(0, 5)
        .map((item) => `${item.gapType}:${item.gapKey} (${item.count})`)
        .join(" | ") || "none"
    }`,
  );
  console.log("");
  console.log(
    `Top watchlist candidates: ${
      evaluation.rankedOutputs.topWatchlistCandidates
        .slice(0, 5)
        .map(
          (item) =>
            `${item.vesselName} [priority ${item.watchlistPriorityScore}, readiness ${item.promotionReadinessScore}]`,
        )
        .join(" | ") || "none"
    }`,
  );
  console.log(
    `Top promoted/admitted: ${
      evaluation.rankedOutputs.topPromotedOrAdmittedVessels
        .slice(0, 5)
        .map(
          (item) =>
            `${item.vesselName} [score ${item.maxAdmissionScore}, promoted ${item.promoted ? "yes" : "no"}]`,
        )
        .join(" | ") || "none"
    }`,
  );
  console.log(
    `Top knowledge impact: ${
      evaluation.rankedOutputs.topKnowledgeImpactCases
        .slice(0, 5)
        .map(
          (item) =>
            `${item.vesselName} [support ${item.maxKnowledgeSupportScore}, commodity +${item.maxCommodityBoost}]`,
        )
        .join(" | ") || "none"
    }`,
  );
  console.log(
    `Top voyage hypotheses: ${
      evaluation.rankedOutputs.topVoyageHypothesesObserved
        .slice(0, 5)
        .map(
          (item) =>
            `${item.hypothesisId} [count ${item.count}, avg ${item.averageScore}]`,
        )
        .join(" | ") || "none"
    }`,
  );
  console.log(
    `Voyage missing signals: ${formatReasonList(
      evaluation.rankedOutputs.mostCommonMissingSignalsForVoyageConfirmation,
    )}`,
  );
  console.log(
    `Operational port patterns: ${
      evaluation.rankedOutputs.portsWithWaitingOrCongestionPatterns
        .slice(0, 5)
        .map(
          (item) =>
            `${item.portName} [obs ${item.observations}, wait ${item.averageWaitingPatternSignal}, cong ${item.averagePortCongestionSignal}]`,
        )
        .join(" | ") || "none"
    }`,
  );
  console.log(
    `Departures after waiting: ${
      evaluation.rankedOutputs.departuresMadeMeaningfulAfterWaiting
        .slice(0, 5)
        .map(
          (item) =>
            `${item.vesselName} [queue ${item.loadingQueuePlausibility}, wait ${item.waitingPatternSignal}, port ${item.portName ?? "n/a"}]`,
        )
        .join(" | ") || "none"
    }`,
  );

  if (evaluation.notes.length > 0) {
    console.log("");
    console.log(`Notes: ${evaluation.notes.join(" | ")}`);
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : "Unknown live evaluation error";
  console.error(`Live evaluation failed: ${message}`);
  process.exit(1);
});
