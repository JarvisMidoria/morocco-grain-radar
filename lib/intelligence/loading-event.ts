import {
  GrainTerminalMatchResult,
  matchGrainLoadingTerminal,
  MatchConfidenceBand,
  TerminalType,
} from "@/lib/data/live-intelligence-config";

export type LoadingConfidence = "low" | "medium" | "high";
export type SignalConfidence = "low" | "medium" | "high";
export type LoadingEvidenceStrength = "weak" | "moderate" | "strong";

export interface LoadingBehaviorSample {
  timestamp: string;
  draft: number | null;
  speed: number | null;
  departurePortCode?: string | null;
  nearDeparturePort?: boolean;
}

export interface LoadingSignalInput {
  vesselType: string;
  departurePortCode?: string | null;
  departurePortName?: string | null;
  departurePortIsLikelyGrainOrigin?: boolean;
  departureTerminalText?: string | null;
  arrivalDraft?: number | null;
  departureDraft?: number | null;
  portStayHours?: number | null;
  routeTowardMorocco?: boolean;
  loadingTerminalMatchOverride?: boolean | null;
  departureDetectedAt?: string | null;
  departureAt?: string | null;
  arrivalAt?: string | null;
  timeSinceDepartureHours?: number | null;
  departureTimestampConfidence?: SignalConfidence;
  arrivalTimestampConfidence?: SignalConfidence;
  terminalMatchConfidenceHint?: SignalConfidence;
  historicalSamples?: LoadingBehaviorSample[];
}

export interface LoadingSignalAssessment {
  loadingSignalScore: number;
  draftDelta: number | null;
  portStayHours: number | null;
  loadingTerminalMatch: boolean;
  loadingConfidence: LoadingConfidence;
  loadingSignalReasons: string[];
  loadingEvidenceStrength: LoadingEvidenceStrength;
  missingCriticalSignals: string[];
  matchedTerminalName: string | null;
  matchedTerminalType: TerminalType;
  terminalMatchConfidence: SignalConfidence;
  terminalMatchConfidenceBand: MatchConfidenceBand;
  matchedAlias: string | null;
  matchedBy: GrainTerminalMatchResult["matchedBy"];
  fallbackLevel: GrainTerminalMatchResult["fallbackLevel"];
  portStayConfidence: SignalConfidence;
  arrivalDraftEstimate: number | null;
  departureDraftEstimate: number | null;
  arrivalDraftConfidence: SignalConfidence;
  departureDraftConfidence: SignalConfidence;
  draftDeltaConfidence: SignalConfidence;
  grainTerminalMatch: boolean;
}

function clampScore(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function normalizeNullableNumber(value: number | null | undefined) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  return null;
}

function parseIso(value: string | null | undefined) {
  if (!value) {
    return null;
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return parsed;
}

function isDryBulkCompatible(vesselType: string) {
  const normalized = vesselType.toLowerCase();
  return (
    normalized.includes("bulk") ||
    normalized.includes("general cargo") ||
    normalized.includes("dry cargo") ||
    normalized.includes("freighter")
  );
}

function classifyDryCargoSize(vesselType: string) {
  const normalized = vesselType.toLowerCase();
  if (normalized.includes("bulk")) {
    return "bulk";
  }
  if (normalized.includes("general cargo")) {
    return "general_cargo";
  }
  if (normalized.includes("dry cargo") || normalized.includes("freighter")) {
    return "dry_cargo_other";
  }
  return "other";
}

function inferLoadingStayHours(vesselType: string) {
  const category = classifyDryCargoSize(vesselType);
  if (category === "bulk") {
    return 20;
  }
  if (category === "general_cargo") {
    return 14;
  }
  if (category === "dry_cargo_other") {
    return 12;
  }
  return 10;
}

function estimateFallbackArrivalDraft(departureDraft: number, vesselType: string) {
  const type = vesselType.toLowerCase();
  if (type.includes("bulk")) {
    return Math.max(2, Number((departureDraft - 1.4).toFixed(2)));
  }
  if (type.includes("general cargo")) {
    return Math.max(2, Number((departureDraft - 1.0).toFixed(2)));
  }
  return Math.max(2, Number((departureDraft - 0.8).toFixed(2)));
}

function reconstructDepartureDraft(input: LoadingSignalInput, reasons: string[]) {
  const direct = normalizeNullableNumber(input.departureDraft);
  if (direct !== null) {
    reasons.push(`Departure draft available from live snapshot (${direct}m).`);
    const timeSinceDeparture = normalizeNullableNumber(input.timeSinceDepartureHours);
    let confidence: SignalConfidence = "high";
    if (timeSinceDeparture !== null && timeSinceDeparture > 72) {
      confidence = "medium";
      reasons.push("Departure draft confidence reduced because last departure was not recent.");
    } else if (timeSinceDeparture === null) {
      confidence = "medium";
    }
    return {
      value: direct,
      confidence,
    };
  }

  const fromHistory = (input.historicalSamples ?? [])
    .slice()
    .reverse()
    .find((sample) => normalizeNullableNumber(sample.draft) !== null);

  if (fromHistory && normalizeNullableNumber(fromHistory.draft) !== null) {
    const draft = normalizeNullableNumber(fromHistory.draft) as number;
    reasons.push(`Departure draft inferred from latest historical sample (${draft}m).`);
    return {
      value: draft,
      confidence: "medium" as SignalConfidence,
    };
  }

  reasons.push("Departure draft unavailable.");
  return {
    value: null,
    confidence: "low" as SignalConfidence,
  };
}

function reconstructArrivalDraft(
  input: LoadingSignalInput,
  departureDraft: number | null,
  terminalMatchConfidence: SignalConfidence,
  reasons: string[],
) {
  const direct = normalizeNullableNumber(input.arrivalDraft);
  if (direct !== null) {
    reasons.push(`Arrival draft available from live snapshot (${direct}m).`);
    const confidence = input.arrivalTimestampConfidence ?? "high";
    return {
      value: direct,
      confidence,
    };
  }

  const departureCode = (input.departurePortCode ?? "").toUpperCase();
  const candidateHistory = (input.historicalSamples ?? [])
    .filter((sample) => {
      const draft = normalizeNullableNumber(sample.draft);
      if (draft === null) {
        return false;
      }
      if (sample.speed !== null && typeof sample.speed === "number" && sample.speed > 2) {
        return false;
      }
      if (sample.nearDeparturePort === false) {
        return false;
      }
      if (departureCode && (sample.departurePortCode ?? "").toUpperCase() && (sample.departurePortCode ?? "").toUpperCase() !== departureCode) {
        return false;
      }
      return true;
    })
    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

  if (candidateHistory.length > 0) {
    const baseline = candidateHistory[0];
    const value = normalizeNullableNumber(baseline.draft);
    if (value !== null) {
      reasons.push(`Arrival draft reconstructed from historical low-speed sample (${value}m).`);
      return {
        value,
        confidence: candidateHistory.length >= 2 ? ("medium" as SignalConfidence) : ("low" as SignalConfidence),
      };
    }
  }

  if (departureDraft !== null) {
    const inferred = estimateFallbackArrivalDraft(departureDraft, input.vesselType);
    const strongerContext =
      Boolean(input.departurePortIsLikelyGrainOrigin) &&
      (terminalMatchConfidence === "high" || terminalMatchConfidence === "medium");
    reasons.push(`Arrival draft estimated heuristically from departure draft (${inferred}m).`);
    return {
      value: inferred,
      confidence: strongerContext ? ("medium" as SignalConfidence) : ("low" as SignalConfidence),
    };
  }

  reasons.push("Arrival draft unavailable.");
  return {
    value: null,
    confidence: "low" as SignalConfidence,
  };
}

function reconstructPortStayHours(
  input: LoadingSignalInput,
  terminalMatchConfidence: SignalConfidence,
  reasons: string[],
) {
  const direct = normalizeNullableNumber(input.portStayHours);
  if (direct !== null && direct > 0) {
    reasons.push(`Port stay available from direct signal (${direct.toFixed(1)}h).`);
    return {
      value: direct,
      confidence: "high" as SignalConfidence,
    };
  }

  const atd = parseIso(input.departureAt ?? input.departureDetectedAt ?? null);
  const ata = parseIso(input.arrivalAt ?? null);
  if (atd && ata && atd.getTime() >= ata.getTime()) {
    const value = Number(((atd.getTime() - ata.getTime()) / 3_600_000).toFixed(1));
    if (value > 0) {
      const departureConfidence = input.departureTimestampConfidence ?? "medium";
      const arrivalConfidence = input.arrivalTimestampConfidence ?? "medium";
      const confidence =
        departureConfidence === "high" && arrivalConfidence === "high"
          ? ("high" as SignalConfidence)
          : ("medium" as SignalConfidence);
      reasons.push(`Port stay reconstructed from arrival/departure timestamps (${value.toFixed(1)}h).`);
      return {
        value,
        confidence,
      };
    }
  }

  const history = (input.historicalSamples ?? [])
    .filter((sample) => {
      const timestamp = parseIso(sample.timestamp);
      if (!timestamp) {
        return false;
      }
      const speed = normalizeNullableNumber(sample.speed ?? null);
      if (speed !== null && speed > 1.2) {
        return false;
      }
      if (sample.nearDeparturePort === false) {
        return false;
      }
      return true;
    })
    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

  if (history.length >= 2) {
    const first = parseIso(history[0]?.timestamp ?? null);
    const last = parseIso(history[history.length - 1]?.timestamp ?? null);
    if (first && last && last.getTime() > first.getTime()) {
      const value = Number(((last.getTime() - first.getTime()) / 3_600_000).toFixed(1));
      if (value >= 2) {
        reasons.push(`Port stay reconstructed from low-speed transition window (${value.toFixed(1)}h).`);
        return {
          value,
          confidence: "medium" as SignalConfidence,
        };
      }
    }
  }

  if (
    input.departurePortIsLikelyGrainOrigin &&
    (terminalMatchConfidence === "high" || terminalMatchConfidence === "medium")
  ) {
    const fallbackHours = inferLoadingStayHours(input.vesselType);
    const confidence = isDryBulkCompatible(input.vesselType)
      ? ("medium" as SignalConfidence)
      : ("low" as SignalConfidence);
    reasons.push(`Port stay estimated from export-terminal context (${fallbackHours}h).`);
    return {
      value: fallbackHours,
      confidence,
    };
  }

  if (isDryBulkCompatible(input.vesselType) && input.departurePortIsLikelyGrainOrigin) {
    const fallbackHours = inferLoadingStayHours(input.vesselType);
    const confidence =
      terminalMatchConfidence === "high" || terminalMatchConfidence === "medium"
        ? ("medium" as SignalConfidence)
        : ("low" as SignalConfidence);
    reasons.push(`Port stay estimated with vessel-class fallback (${fallbackHours}h).`);
    return {
      value: fallbackHours,
      confidence,
    };
  }

  reasons.push("Port stay unavailable.");
  return {
    value: null,
    confidence: "low" as SignalConfidence,
  };
}

function confidenceRank(value: SignalConfidence) {
  if (value === "high") {
    return 3;
  }
  if (value === "medium") {
    return 2;
  }
  return 1;
}

export function detectLoadingSignal(input: LoadingSignalInput): LoadingSignalAssessment {
  let score = 0;
  const reasons: string[] = [];
  const missingCriticalSignals: string[] = [];

  const terminalMatchResult = matchGrainLoadingTerminal({
    departurePortCode: input.departurePortCode,
    departurePortName: input.departurePortName,
    terminalText: input.departureTerminalText,
  });

  const departureDraftSignal = reconstructDepartureDraft(input, reasons);
  const hintedTerminalConfidence = input.terminalMatchConfidenceHint;
  const terminalConfidence =
    hintedTerminalConfidence &&
    confidenceRank(hintedTerminalConfidence) > confidenceRank(terminalMatchResult.terminalMatchConfidence)
      ? hintedTerminalConfidence
      : terminalMatchResult.terminalMatchConfidence;
  const arrivalDraftSignal = reconstructArrivalDraft(
    input,
    departureDraftSignal.value,
    terminalConfidence,
    reasons,
  );
  const portStaySignal = reconstructPortStayHours(input, terminalConfidence, reasons);

  const draftDelta =
    arrivalDraftSignal.value !== null && departureDraftSignal.value !== null
      ? Number((departureDraftSignal.value - arrivalDraftSignal.value).toFixed(2))
      : null;

  if (draftDelta !== null) {
    if (draftDelta >= 1.8) {
      score += 30;
      reasons.push(`Draft increased strongly after port call (+${draftDelta}m).`);
    } else if (draftDelta >= 1.0) {
      score += 22;
      reasons.push(`Draft increased moderately after port call (+${draftDelta}m).`);
    } else if (draftDelta >= 0.4) {
      score += 12;
      reasons.push(`Draft increase is weak but positive (+${draftDelta}m).`);
    } else {
      score -= 12;
      reasons.push(`No meaningful loading draft increase detected (delta ${draftDelta}m).`);
    }
  } else {
    score -= 12;
    missingCriticalSignals.push("missing_draft_delta");
    reasons.push("Draft delta unavailable (arrival or departure draft missing).");
  }

  const loadingTerminalMatch =
    input.loadingTerminalMatchOverride ?? terminalMatchResult.grainTerminalMatch;

  if (loadingTerminalMatch) {
    if (terminalMatchResult.matchedTerminalType === "mixed_bulk_terminal") {
      score += 14;
      reasons.push(`${terminalMatchResult.reason} Mixed-bulk terminal treated as moderate loading evidence.`);
    } else {
      score += 25;
      reasons.push(terminalMatchResult.reason);
    }
  } else if (terminalMatchResult.exportPortMatched) {
    score += 8;
    missingCriticalSignals.push("missing_grain_terminal_match");
    reasons.push("Export port matched but no grain/feed terminal resolved.");
  } else if (input.departurePortIsLikelyGrainOrigin) {
    score += 6;
    missingCriticalSignals.push("missing_terminal_context");
    reasons.push("Departure port is grain-export oriented, but terminal evidence is weak.");
  } else {
    missingCriticalSignals.push("missing_terminal_context");
    reasons.push("No known grain terminal match detected.");
  }

  const portStayHours = portStaySignal.value;
  if (portStayHours !== null) {
    if (portStayHours >= 12 && portStayHours <= 72) {
      score += 20;
      reasons.push(`Port stay duration is consistent with loading (${portStayHours.toFixed(1)}h).`);
    } else if (portStayHours >= 8 && portStayHours < 12) {
      score += 12;
      reasons.push(`Port stay duration is plausible but short (${portStayHours.toFixed(1)}h).`);
    } else if (portStayHours > 72 && portStayHours <= 120) {
      score += 8;
      reasons.push(`Long port stay still compatible with loading (${portStayHours.toFixed(1)}h).`);
    } else if (portStayHours > 0 && portStayHours < 5) {
      score -= 10;
      reasons.push(`Port stay appears too short for bulk loading (${portStayHours.toFixed(1)}h).`);
    } else {
      reasons.push(`Port stay duration is ambiguous for loading (${portStayHours.toFixed(1)}h).`);
    }
  } else {
    score -= 8;
    missingCriticalSignals.push("missing_port_stay");
    reasons.push("Port stay duration unavailable.");
  }

  if (isDryBulkCompatible(input.vesselType)) {
    score += 15;
    reasons.push("Vessel class is dry-bulk compatible.");
  } else {
    score -= 20;
    reasons.push("Vessel class is not dry-bulk compatible.");
  }

  if (input.routeTowardMorocco) {
    if (input.departurePortIsLikelyGrainOrigin) {
      score += 10;
      reasons.push("Export corridor and route are compatible with Morocco-bound flow.");
    } else {
      score += 6;
      reasons.push("Route is Morocco-compatible, but export-port signal is weaker.");
    }
  }

  const loadingSignalScore = clampScore(score);
  let loadingConfidence: LoadingConfidence = "low";
  const confidenceFloor = Math.min(
    confidenceRank(arrivalDraftSignal.confidence),
    confidenceRank(departureDraftSignal.confidence),
    confidenceRank(portStaySignal.confidence),
  );

  if (
    loadingSignalScore >= 75 &&
    draftDelta !== null &&
    draftDelta >= 1 &&
    portStayHours !== null &&
    portStayHours >= 8 &&
    loadingTerminalMatch &&
    confidenceFloor >= 2
  ) {
    loadingConfidence = "high";
  } else if (loadingSignalScore >= 50) {
    loadingConfidence = "medium";
  }

  let draftDeltaConfidence: SignalConfidence = "low";
  if (draftDelta !== null) {
    if (arrivalDraftSignal.confidence === "high" && departureDraftSignal.confidence === "high") {
      draftDeltaConfidence = "high";
    } else if (
      confidenceRank(arrivalDraftSignal.confidence) >= 2 &&
      confidenceRank(departureDraftSignal.confidence) >= 2
    ) {
      draftDeltaConfidence = "medium";
    } else {
      draftDeltaConfidence = "low";
    }
  }

  let loadingEvidenceStrength: LoadingEvidenceStrength = "weak";
  if (loadingSignalScore >= 75 && loadingConfidence === "high") {
    loadingEvidenceStrength = "strong";
  } else if (loadingSignalScore >= 50) {
    loadingEvidenceStrength = "moderate";
  }

  if (arrivalDraftSignal.value === null) {
    missingCriticalSignals.push("missing_arrival_draft");
  }
  if (departureDraftSignal.value === null) {
    missingCriticalSignals.push("missing_departure_draft");
  }
  if (portStaySignal.value === null) {
    missingCriticalSignals.push("missing_port_stay");
  }

  return {
    loadingSignalScore,
    draftDelta,
    portStayHours,
    loadingTerminalMatch,
    loadingConfidence,
    loadingSignalReasons: reasons,
    loadingEvidenceStrength,
    missingCriticalSignals: Array.from(new Set(missingCriticalSignals)),
    matchedTerminalName: terminalMatchResult.matchedTerminalName,
    matchedTerminalType: terminalMatchResult.matchedTerminalType,
    terminalMatchConfidence: terminalMatchResult.terminalMatchConfidence,
    terminalMatchConfidenceBand: terminalMatchResult.matchConfidenceBand,
    matchedAlias: terminalMatchResult.matchedAlias,
    matchedBy: terminalMatchResult.matchedBy,
    fallbackLevel: terminalMatchResult.fallbackLevel,
    portStayConfidence: portStaySignal.confidence,
    arrivalDraftEstimate: arrivalDraftSignal.value,
    departureDraftEstimate: departureDraftSignal.value,
    arrivalDraftConfidence: arrivalDraftSignal.confidence,
    departureDraftConfidence: departureDraftSignal.confidence,
    draftDeltaConfidence,
    grainTerminalMatch: terminalMatchResult.grainTerminalMatch,
  };
}
