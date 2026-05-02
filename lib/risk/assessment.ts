import { RadarVessel } from "@/lib/types";

export interface VesselRiskFlag {
  id: string;
  category: "data_quality" | "route_consistency" | "commercial_confidence" | "compliance_watch";
  severity: "info" | "warning" | "critical";
  title: string;
  detail: string;
}

export interface VesselRiskSnapshot {
  vesselId: string;
  vesselName: string;
  score: number;
  highestSeverity: "info" | "warning" | "critical" | "none";
  flags: VesselRiskFlag[];
}

export interface PortfolioRiskDashboardPayload {
  generatedAt: string;
  summary: {
    vesselsWithAnyFlags: number;
    criticalVessels: number;
    warningVessels: number;
    infoOnlyVessels: number;
  };
  byCategory: Array<{
    category: VesselRiskFlag["category"];
    count: number;
  }>;
  topRiskVessels: VesselRiskSnapshot[];
  notes: string[];
  complianceReferences: Array<{
    label: string;
    url: string;
    description: string;
  }>;
}

const SENSITIVE_COUNTRIES = new Set(["Iran", "Syria", "North Korea"]);
const CONVENIENCE_CHECK_FLAGS = new Set(["IR", "SY", "KP"]);
const SEVERITY_WEIGHT = { critical: 28, warning: 16, info: 8 } as const;

function normalizeText(value: string) {
  return value.trim().toLowerCase();
}

function hoursSince(isoDate: string) {
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return (Date.now() - date.getTime()) / 3_600_000;
}

function pushFlag(flags: VesselRiskFlag[], flag: VesselRiskFlag) {
  if (flags.some((item) => item.id === flag.id)) {
    return;
  }
  flags.push(flag);
}

export function buildVesselRiskSnapshot(vessel: RadarVessel): VesselRiskSnapshot {
  const flags: VesselRiskFlag[] = [];
  const staleHours = hoursSince(vessel.lastSignalAt);
  const genericDestinationText = normalizeText(vessel.destinationText);

  if (vessel.contradictionScore >= 65 || vessel.destinationContradictionScore >= 55) {
    pushFlag(flags, {
      id: "destination-inconsistency",
      category: "route_consistency",
      severity: vessel.contradictionScore >= 75 ? "critical" : "warning",
      title: "Destination inconsistency",
      detail:
        vessel.contradictionReasons[0] ??
        "The destination and route evidence currently conflict with the Morocco import thesis.",
    });
  }

  if (vessel.predictionConfidenceBand === "weak" || vessel.confidencePenalty >= 45 || vessel.uncertaintyPenalty >= 35) {
    pushFlag(flags, {
      id: "weak-prediction-confidence",
      category: "commercial_confidence",
      severity: vessel.predictionConfidenceBand === "weak" ? "warning" : "info",
      title: "Weak prediction confidence",
      detail:
        "Commercial usefulness is reduced because the current cargo or destination hypothesis remains weak or penalized by uncertainty.",
    });
  }

  if (vessel.evidenceCoverageScore < 45 || (vessel.observationCount ?? 1) <= 1) {
    pushFlag(flags, {
      id: "thin-evidence-coverage",
      category: "data_quality",
      severity: vessel.evidenceCoverageScore < 35 ? "warning" : "info",
      title: "Thin evidence coverage",
      detail:
        "The case is being carried by too few supporting signals or too few observations to trust it at desk level.",
    });
  }

  if ((typeof vessel.evidenceAgeHours === "number" && vessel.evidenceAgeHours >= 18) || (typeof staleHours === "number" && staleHours >= 18)) {
    pushFlag(flags, {
      id: "stale-tracking",
      category: "data_quality",
      severity: (vessel.evidenceAgeHours ?? staleHours ?? 0) >= 30 ? "warning" : "info",
      title: "Tracking may be stale",
      detail:
        "Recent AIS or supporting observations are aging, so the live state may lag the actual vessel behavior.",
    });
  }

  if (
    vessel.moroccoBoundScore >= 60 &&
    vessel.topVoyageHypothesis === "ambiguous_dry_bulk_non_morocco"
  ) {
    pushFlag(flags, {
      id: "ambiguous-trade-hypothesis",
      category: "commercial_confidence",
      severity: "warning",
      title: "Ambiguous trade hypothesis",
      detail:
        "The route may still be dry bulk but the voyage template remains materially ambiguous versus a true Morocco cereal flow.",
    });
  }

  if (
    vessel.missingCriticalPredictionSignals.length >= 3 ||
    genericDestinationText.length === 0 ||
    genericDestinationText === "orders" ||
    genericDestinationText === "tbn"
  ) {
    pushFlag(flags, {
      id: "missing-key-signals",
      category: "data_quality",
      severity: "info",
      title: "Key signals still missing",
      detail:
        vessel.missingCriticalPredictionSignals[0] ??
        "Several high-value confirmation signals are still missing from the case.",
    });
  }

  if (
    SENSITIVE_COUNTRIES.has(vessel.departureCountry) ||
    SENSITIVE_COUNTRIES.has(vessel.destinationPortCountry) ||
    CONVENIENCE_CHECK_FLAGS.has(vessel.flag.toUpperCase())
  ) {
    pushFlag(flags, {
      id: "sensitive-geography-watch",
      category: "compliance_watch",
      severity: "critical",
      title: "Sensitive geography / compliance watch",
      detail:
        "This case touches a jurisdiction commonly referenced in shipping sanctions guidance. Treat it as enhanced due diligence, not as a legal conclusion.",
    });
  }

  const score = Math.min(
    100,
    flags.reduce((sum, flag) => sum + SEVERITY_WEIGHT[flag.severity], 0),
  );

  const highestSeverity =
    flags.some((flag) => flag.severity === "critical")
      ? "critical"
      : flags.some((flag) => flag.severity === "warning")
        ? "warning"
        : flags.some((flag) => flag.severity === "info")
          ? "info"
          : "none";

  return {
    vesselId: vessel.id,
    vesselName: vessel.name,
    score,
    highestSeverity,
    flags,
  };
}

export function buildPortfolioRiskDashboard(vessels: RadarVessel[]): PortfolioRiskDashboardPayload {
  const snapshots = vessels
    .map((vessel) => buildVesselRiskSnapshot(vessel))
    .filter((snapshot) => snapshot.flags.length > 0)
    .sort((a, b) => b.score - a.score || b.flags.length - a.flags.length);

  const categoryCounts = new Map<VesselRiskFlag["category"], number>();
  for (const snapshot of snapshots) {
    for (const flag of snapshot.flags) {
      categoryCounts.set(flag.category, (categoryCounts.get(flag.category) ?? 0) + 1);
    }
  }

  const notes: string[] = [
    "Risk flags are operational screening signals. They are designed to trigger review, not to replace legal or compliance diligence.",
  ];
  if (snapshots.length === 0) {
    notes.push("No vessels currently cross the baseline operational risk heuristics.");
  }

  return {
    generatedAt: new Date().toISOString(),
    summary: {
      vesselsWithAnyFlags: snapshots.length,
      criticalVessels: snapshots.filter((snapshot) => snapshot.highestSeverity === "critical").length,
      warningVessels: snapshots.filter((snapshot) => snapshot.highestSeverity === "warning").length,
      infoOnlyVessels: snapshots.filter((snapshot) => snapshot.highestSeverity === "info").length,
    },
    byCategory: Array.from(categoryCounts.entries()).map(([category, count]) => ({ category, count })),
    topRiskVessels: snapshots.slice(0, 24),
    notes,
    complianceReferences: [
      {
        label: "OFAC shipping sanctions guidance",
        url: "https://ofac.treasury.gov/recent-actions/20200514",
        description: "Official U.S. guidance on deceptive shipping practices and sanctions-evasion controls.",
      },
      {
        label: "OFAC sanctions list service",
        url: "https://ofac.treasury.gov/ofac-sanctions-lists",
        description: "Official sanctions list entry point for vessel and counterparty screening.",
      },
    ],
  };
}
