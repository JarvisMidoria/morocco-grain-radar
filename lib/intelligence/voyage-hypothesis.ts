import {
  destinationLooksMorocco,
  SeededCorridorId,
  TerminalType,
} from "@/lib/data/live-intelligence-config";
import {
  CommodityScores,
  CommodityType,
  VoyageHypothesisAlternative,
  VoyageHypothesisConfidence,
  VoyageHypothesisEvidenceStyle,
  VoyageHypothesisId,
} from "@/lib/types";

export interface VoyageHypothesisInput {
  vesselType: string;
  deadweight?: number | null;
  departurePortId?: string | null;
  departurePortCode?: string | null;
  departurePortName?: string | null;
  destinationPortId?: string | null;
  destinationText?: string | null;
  matchedTerminalType?: TerminalType | null;
  corridorId?: SeededCorridorId | null;
  currentMaritimeZone?: string | null;
  loadingSignalScore?: number;
  loadingConfidence?: "low" | "medium" | "high";
  moroccoBoundScore?: number;
  agriCargoScore?: number;
  knowledgeSupportScore?: number;
  commodityScores?: CommodityScores | null;
  mostLikelyCommodity?: CommodityType | null;
  historicalRoutePortIds?: string[];
  routeConsistent?: boolean;
  timeSinceDepartureHours?: number;
  observationCount?: number;
  evidenceImproving?: boolean;
  scoreTrendDirection?: "up" | "flat" | "down";
  gfwMoroccoVisitCount?: number;
  gfwExportPortVisitCount?: number;
  gfwHistoricalRouteHints?: string[];
  gfwEvidenceConfidence?: "low" | "medium" | "high";
  operationalSupportScore?: number;
  waitingPatternSignal?: number;
  berthProximitySignal?: number;
  loadingQueuePlausibility?: number;
  operationalEvidenceConfidence?: "low" | "medium" | "high";
}

export interface VoyageHypothesisResult {
  topVoyageHypothesis: VoyageHypothesisId;
  topVoyageHypothesisScore: number;
  topVoyageHypothesisConfidence: VoyageHypothesisConfidence;
  alternativeVoyageHypotheses: VoyageHypothesisAlternative[];
  voyageHypothesisReasons: string[];
  missingSignalsForVoyageConfirmation: string[];
  voyageHypothesisEvidenceStyle: VoyageHypothesisEvidenceStyle;
  hypothesisScores: Record<VoyageHypothesisId, number>;
}

interface VoyageTemplateResult {
  id: VoyageHypothesisId;
  label: string;
  score: number;
  reasons: string[];
  missingSignals: string[];
  alignmentCount: number;
}

interface VoyageContext {
  dryBulkCompatible: boolean;
  vesselClass: "bulk" | "general_cargo" | "dry_cargo_other" | "other";
  originCluster: "western_europe" | "black_sea" | "south_atlantic" | "us_gulf" | "unknown";
  corridorCluster:
    | "western_europe"
    | "black_sea"
    | "south_atlantic"
    | "us_gulf"
    | "gibraltar"
    | "western_mediterranean"
    | "unknown";
  moroccoExplicit: boolean;
  moroccoCandidate: boolean;
  loadingSignalScore: number;
  loadingConfidence: "low" | "medium" | "high";
  moroccoBoundScore: number;
  agriCargoScore: number;
  knowledgeSupportScore: number;
  matchedTerminalType: TerminalType;
  commodityScores: CommodityScores;
  mostLikelyCommodity: CommodityType;
  historicalMoroccoEvidence: boolean;
  routeConsistent: boolean;
  timeSinceDepartureHours: number;
  observationCount: number;
  evidenceImproving: boolean;
  scoreTrendDirection: "up" | "flat" | "down";
  gfwMoroccoVisitCount: number;
  gfwExportPortVisitCount: number;
  gfwHistoricalRouteHints: string[];
  gfwEvidenceConfidence: "low" | "medium" | "high";
  operationalSupportScore: number;
  waitingPatternSignal: number;
  berthProximitySignal: number;
  loadingQueuePlausibility: number;
  operationalEvidenceConfidence: "low" | "medium" | "high";
}

interface TemplateDefinition {
  id: VoyageHypothesisId;
  label: string;
  originCluster: VoyageContext["originCluster"] | "any";
  corridorClusters: VoyageContext["corridorCluster"][];
  commodityFocus: Array<CommodityType>;
  terminalPreference: TerminalType[];
  candidateTemplate: boolean;
}

const TEMPLATE_DEFINITIONS: TemplateDefinition[] = [
  {
    id: "western_europe_wheat_to_morocco",
    label: "Western Europe wheat to Morocco",
    originCluster: "western_europe",
    corridorClusters: ["western_europe", "gibraltar", "western_mediterranean"],
    commodityFocus: ["wheat", "barley"],
    terminalPreference: ["grain_terminal", "agri_bulk_terminal", "mixed_bulk_terminal"],
    candidateTemplate: false,
  },
  {
    id: "western_europe_feed_to_morocco",
    label: "Western Europe feed to Morocco",
    originCluster: "western_europe",
    corridorClusters: ["western_europe", "gibraltar", "western_mediterranean"],
    commodityFocus: ["barley", "corn", "soybeanMeal"],
    terminalPreference: ["feed_terminal", "agri_bulk_terminal", "mixed_bulk_terminal"],
    candidateTemplate: false,
  },
  {
    id: "black_sea_mixed_grain_to_morocco",
    label: "Black Sea mixed grain to Morocco",
    originCluster: "black_sea",
    corridorClusters: ["black_sea", "western_mediterranean", "gibraltar"],
    commodityFocus: ["wheat", "barley", "corn"],
    terminalPreference: ["grain_terminal", "agri_bulk_terminal", "mixed_bulk_terminal"],
    candidateTemplate: false,
  },
  {
    id: "south_atlantic_feed_to_morocco",
    label: "South Atlantic feed to Morocco",
    originCluster: "south_atlantic",
    corridorClusters: ["south_atlantic", "gibraltar", "western_mediterranean"],
    commodityFocus: ["soybeanMeal", "corn"],
    terminalPreference: ["feed_terminal", "agri_bulk_terminal", "mixed_bulk_terminal"],
    candidateTemplate: false,
  },
  {
    id: "us_gulf_feed_to_morocco",
    label: "US Gulf feed to Morocco",
    originCluster: "us_gulf",
    corridorClusters: ["us_gulf", "gibraltar", "western_mediterranean"],
    commodityFocus: ["corn", "soybeanMeal"],
    terminalPreference: ["feed_terminal", "agri_bulk_terminal", "grain_terminal"],
    candidateTemplate: false,
  },
  {
    id: "western_europe_grain_morocco_candidate",
    label: "Western Europe grain Morocco candidate",
    originCluster: "western_europe",
    corridorClusters: ["western_europe", "gibraltar", "western_mediterranean"],
    commodityFocus: ["wheat", "barley", "corn"],
    terminalPreference: ["grain_terminal", "agri_bulk_terminal", "mixed_bulk_terminal"],
    candidateTemplate: true,
  },
  {
    id: "black_sea_grain_morocco_candidate",
    label: "Black Sea grain Morocco candidate",
    originCluster: "black_sea",
    corridorClusters: ["black_sea", "western_mediterranean", "gibraltar"],
    commodityFocus: ["wheat", "barley", "corn"],
    terminalPreference: ["grain_terminal", "agri_bulk_terminal", "mixed_bulk_terminal"],
    candidateTemplate: true,
  },
  {
    id: "south_atlantic_feed_morocco_candidate",
    label: "South Atlantic feed Morocco candidate",
    originCluster: "south_atlantic",
    corridorClusters: ["south_atlantic", "gibraltar", "western_mediterranean"],
    commodityFocus: ["soybeanMeal", "corn"],
    terminalPreference: ["feed_terminal", "agri_bulk_terminal", "mixed_bulk_terminal"],
    candidateTemplate: true,
  },
  {
    id: "ambiguous_dry_bulk_non_morocco",
    label: "Ambiguous dry bulk non-Morocco",
    originCluster: "any",
    corridorClusters: ["western_europe", "black_sea", "south_atlantic", "us_gulf", "gibraltar", "western_mediterranean", "unknown"],
    commodityFocus: ["wheat", "barley", "corn", "soybeanMeal"],
    terminalPreference: ["unknown_terminal", "mixed_bulk_terminal", "agri_bulk_terminal", "feed_terminal", "grain_terminal"],
    candidateTemplate: true,
  },
];

function clampScore(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function toHypothesisConfidence(score: number, gapFromSecond: number): VoyageHypothesisConfidence {
  if (score >= 84 && gapFromSecond >= 10) {
    return "strong";
  }
  if ((score >= 72 && gapFromSecond >= 6) || (score >= 82 && gapFromSecond >= 3)) {
    return "moderate";
  }
  return "weak";
}

function normalizeText(value: string | null | undefined) {
  return (value ?? "").toLowerCase().trim();
}

function inferVesselClass(vesselType: string) {
  const normalized = normalizeText(vesselType);
  if (normalized.includes("bulk")) {
    return "bulk" as const;
  }
  if (normalized.includes("general cargo")) {
    return "general_cargo" as const;
  }
  if (normalized.includes("dry cargo") || normalized.includes("freighter") || normalized.includes("cargo")) {
    return "dry_cargo_other" as const;
  }
  return "other" as const;
}

function isDryBulkCompatible(vesselType: string) {
  const normalized = normalizeText(vesselType);
  return (
    normalized.includes("bulk") ||
    normalized.includes("general cargo") ||
    normalized.includes("dry cargo") ||
    normalized.includes("freighter")
  );
}

function inferOriginCluster(input: VoyageHypothesisInput): VoyageContext["originCluster"] {
  const id = normalizeText(input.departurePortId);
  const code = normalizeText(input.departurePortCode).replace(/[^a-z0-9]/g, "");
  const name = normalizeText(input.departurePortName);
  const joined = `${id} ${code} ${name}`;

  if (
    joined.includes("rouen") ||
    joined.includes("larochelle") ||
    joined.includes("la rochelle") ||
    joined.includes("dunkerque") ||
    joined.includes("dunkirk") ||
    joined.includes("nantes") ||
    joined.includes("saint nazaire") ||
    joined.includes("montoir") ||
    code === "fruro" ||
    code === "frlar" ||
    code === "frdkk" ||
    code === "frnsn" ||
    code === "frsnr"
  ) {
    return "western_europe";
  }

  if (
    joined.includes("odessa") ||
    joined.includes("odesa") ||
    joined.includes("chornomorsk") ||
    joined.includes("chernomorsk") ||
    joined.includes("illichivsk") ||
    joined.includes("pivdennyi") ||
    joined.includes("yuzh") ||
    joined.includes("constanta") ||
    joined.includes("constanța") ||
    joined.includes("varna") ||
    joined.includes("novorossiysk") ||
    code === "uaods" ||
    code === "uaode" ||
    code === "uachr" ||
    code === "uailk" ||
    code === "uapiv" ||
    code === "uayuz" ||
    code === "rocnd" ||
    code === "bgvar" ||
    code === "runvs"
  ) {
    return "black_sea";
  }

  if (
    joined.includes("rosario") ||
    joined.includes("santos") ||
    code === "arror" ||
    code === "brssz"
  ) {
    return "south_atlantic";
  }

  if (
    joined.includes("new orleans") ||
    joined.includes("nola") ||
    joined.includes("houston") ||
    code === "usmsy" ||
    code === "ushou"
  ) {
    return "us_gulf";
  }

  return "unknown";
}

function inferCorridorCluster(input: VoyageHypothesisInput): VoyageContext["corridorCluster"] {
  const corridorId = input.corridorId;
  if (corridorId === "western_europe_to_morocco_atlantic") {
    return "western_europe";
  }
  if (corridorId === "black_sea_to_morocco_via_bosphorus_and_med") {
    return "black_sea";
  }
  if (corridorId === "south_atlantic_agri_to_morocco") {
    return "south_atlantic";
  }
  if (corridorId === "us_gulf_to_morocco_atlantic") {
    return "us_gulf";
  }
  if (corridorId === "gibraltar_approach_to_morocco") {
    return "gibraltar";
  }
  if (corridorId === "western_mediterranean_to_morocco") {
    return "western_mediterranean";
  }

  const zone = normalizeText(input.currentMaritimeZone);
  if (zone.includes("gibraltar")) {
    return "gibraltar";
  }
  if (zone.includes("western mediterranean") || zone.includes("mediterranean")) {
    return "western_mediterranean";
  }
  if (zone.includes("south atlantic")) {
    return "south_atlantic";
  }
  if (zone.includes("us gulf")) {
    return "us_gulf";
  }
  if (zone.includes("black sea") || zone.includes("bosphorus")) {
    return "black_sea";
  }
  if (zone.includes("north atlantic") || zone.includes("atlantic")) {
    return "western_europe";
  }

  return "unknown";
}

function hasHistoricalMoroccoEvidence(historicalRoutePortIds: string[]) {
  const normalized = historicalRoutePortIds.map((item) => item.toLowerCase());
  return normalized.some((item) =>
    item.includes("casablanca") ||
    item.includes("jorf") ||
    item.includes("agadir") ||
    item.includes("tanger") ||
    item.includes("nador") ||
    item.includes("safi") ||
    item.includes("port-casablanca") ||
    item.includes("port-jorf-lasfar") ||
    item.includes("port-agadir") ||
    item.includes("port-nador") ||
    item.includes("port-safi"),
  );
}

function normalizeCommodityScores(scores?: CommodityScores | null): CommodityScores {
  return {
    wheatScore: scores?.wheatScore ?? 0,
    barleyScore: scores?.barleyScore ?? 0,
    cornScore: scores?.cornScore ?? 0,
    soybeanMealScore: scores?.soybeanMealScore ?? 0,
  };
}

function topCommodityFromScores(scores: CommodityScores, fallback: CommodityType): CommodityType {
  const ranked = [
    { commodity: "wheat" as const, value: scores.wheatScore },
    { commodity: "barley" as const, value: scores.barleyScore },
    { commodity: "corn" as const, value: scores.cornScore },
    { commodity: "soybeanMeal" as const, value: scores.soybeanMealScore },
  ].sort((a, b) => b.value - a.value);
  return ranked[0]?.value > 0 ? ranked[0].commodity : fallback;
}

function hasExplicitMoroccoDestination(input: VoyageHypothesisInput) {
  const destinationId = normalizeText(input.destinationPortId);
  if (
    destinationId.includes("casablanca") ||
    destinationId.includes("jorf") ||
    destinationId.includes("agadir") ||
    destinationId.includes("tanger") ||
    destinationId.includes("nador") ||
    destinationId.includes("safi")
  ) {
    return true;
  }

  return destinationLooksMorocco(input.destinationText ?? "");
}

function buildContext(input: VoyageHypothesisInput): VoyageContext {
  const commodityScores = normalizeCommodityScores(input.commodityScores);
  const mostLikelyCommodity = input.mostLikelyCommodity ?? topCommodityFromScores(commodityScores, "wheat");
  const moroccoExplicit = hasExplicitMoroccoDestination(input);
  const originCluster = inferOriginCluster(input);
  let corridorCluster = inferCorridorCluster(input);
  const dryBulkCompatible = isDryBulkCompatible(input.vesselType);
  const loadingSignalScore = clampScore(input.loadingSignalScore ?? 0);
  const agriCargoScore = clampScore(input.agriCargoScore ?? 0);
  const moroccoBoundScore = clampScore(input.moroccoBoundScore ?? 0);
  const knowledgeSupportScore = clampScore(input.knowledgeSupportScore ?? 0);
  const routeConsistent = Boolean(input.routeConsistent);
  const historicalMoroccoEvidence = hasHistoricalMoroccoEvidence(input.historicalRoutePortIds ?? []);

  if (
    corridorCluster === "western_europe" &&
    (originCluster === "south_atlantic" || originCluster === "us_gulf")
  ) {
    corridorCluster = originCluster;
  }

  const moroccoCandidate =
    !moroccoExplicit &&
    dryBulkCompatible &&
    (originCluster !== "unknown" || corridorCluster !== "unknown") &&
    (routeConsistent || corridorCluster !== "unknown") &&
    (loadingSignalScore >= 42 || agriCargoScore >= 58 || knowledgeSupportScore >= 58);

  return {
    dryBulkCompatible,
    vesselClass: inferVesselClass(input.vesselType),
    originCluster,
    corridorCluster,
    moroccoExplicit,
    moroccoCandidate,
    loadingSignalScore,
    loadingConfidence: input.loadingConfidence ?? "low",
    moroccoBoundScore,
    agriCargoScore,
    knowledgeSupportScore,
    matchedTerminalType: input.matchedTerminalType ?? "unknown_terminal",
    commodityScores,
    mostLikelyCommodity,
    historicalMoroccoEvidence,
    routeConsistent,
    timeSinceDepartureHours: Math.max(0, input.timeSinceDepartureHours ?? 0),
    observationCount: Math.max(1, input.observationCount ?? 1),
    evidenceImproving: Boolean(input.evidenceImproving),
    scoreTrendDirection: input.scoreTrendDirection ?? "flat",
    gfwMoroccoVisitCount: Math.max(0, Math.round(input.gfwMoroccoVisitCount ?? 0)),
    gfwExportPortVisitCount: Math.max(0, Math.round(input.gfwExportPortVisitCount ?? 0)),
    gfwHistoricalRouteHints: (input.gfwHistoricalRouteHints ?? []).filter(Boolean),
    gfwEvidenceConfidence: input.gfwEvidenceConfidence ?? "low",
    operationalSupportScore: clampScore(input.operationalSupportScore ?? 0),
    waitingPatternSignal: clampScore(input.waitingPatternSignal ?? 0),
    berthProximitySignal: clampScore(input.berthProximitySignal ?? 0),
    loadingQueuePlausibility: clampScore(input.loadingQueuePlausibility ?? 0),
    operationalEvidenceConfidence: input.operationalEvidenceConfidence ?? "low",
  };
}

function commodityAlignmentScore(context: VoyageContext, template: TemplateDefinition) {
  const scoresByCommodity: Record<CommodityType, number> = {
    wheat: context.commodityScores.wheatScore,
    barley: context.commodityScores.barleyScore,
    corn: context.commodityScores.cornScore,
    soybeanMeal: context.commodityScores.soybeanMealScore,
  };

  const focusedScores = template.commodityFocus.map((commodity) => scoresByCommodity[commodity]);
  const topFocus = focusedScores.length > 0 ? Math.max(...focusedScores) : 0;
  const avgFocus =
    focusedScores.length > 0
      ? focusedScores.reduce((sum, value) => sum + value, 0) / focusedScores.length
      : 0;
  const topCommodityAligned = template.commodityFocus.includes(context.mostLikelyCommodity);

  let score = 0;
  if (topCommodityAligned) {
    score += 8;
  }
  if (topFocus >= 70) {
    score += 10;
  } else if (topFocus >= 58) {
    score += 6;
  } else if (topFocus >= 45) {
    score += 3;
  } else {
    score -= 4;
  }

  if (avgFocus >= 55) {
    score += 4;
  } else if (avgFocus < 35) {
    score -= 3;
  }

  return score;
}

function scoreTemplate(context: VoyageContext, template: TemplateDefinition): VoyageTemplateResult {
  if (template.id === "ambiguous_dry_bulk_non_morocco") {
    return scoreAmbiguousTemplate(context, template);
  }

  let score = 6;
  const reasons: string[] = [];
  const missingSignals: string[] = [];
  let alignmentCount = 0;

  if (context.dryBulkCompatible) {
    score += 12;
    reasons.push("Dry-bulk compatible vessel class.");
    alignmentCount += 1;
  } else {
    score -= 26;
    missingSignals.push("Dry-bulk compatible vessel class");
  }

  if (template.originCluster === "any" || context.originCluster === template.originCluster) {
    score += 20;
    reasons.push("Origin-side export intelligence aligns with template.");
    alignmentCount += 1;
  } else {
    score -= 10;
    missingSignals.push("Aligned export origin intelligence");
  }

  if (template.corridorClusters.includes(context.corridorCluster)) {
    score += 14;
    reasons.push("Current corridor is compatible with template flow.");
    alignmentCount += 1;
  } else {
    score -= 8;
    missingSignals.push("Aligned corridor behavior");
  }

  if (template.terminalPreference.includes(context.matchedTerminalType)) {
    score += context.matchedTerminalType === "grain_terminal" || context.matchedTerminalType === "feed_terminal" ? 10 : 6;
    reasons.push("Terminal profile is compatible with template cargo flow.");
    alignmentCount += 1;
  } else if (context.matchedTerminalType === "unknown_terminal") {
    score -= 3;
    missingSignals.push("Terminal type confirmation");
  } else {
    score -= 5;
    missingSignals.push("Terminal profile compatibility");
  }

  const commodityScore = commodityAlignmentScore(context, template);
  score += commodityScore;
  if (commodityScore >= 10) {
    reasons.push("Commodity tendency strongly supports template.");
    alignmentCount += 1;
  } else if (commodityScore >= 4) {
    reasons.push("Commodity tendency moderately supports template.");
  } else if (commodityScore < 0) {
    missingSignals.push("Commodity tendency alignment");
  }

  if (context.loadingSignalScore >= 68 && context.loadingConfidence !== "low") {
    score += 12;
    reasons.push("Loading signal is strong for this voyage pattern.");
    alignmentCount += 1;
  } else if (context.loadingSignalScore >= 50) {
    score += 7;
    reasons.push("Loading signal is moderately supportive.");
  } else if (context.loadingSignalScore >= 38) {
    score += 3;
  } else {
    score -= 6;
    missingSignals.push("Stronger loading-event evidence");
  }

  if (context.knowledgeSupportScore >= 70) {
    score += 10;
    reasons.push("Commodity knowledge base strongly supports this voyage pattern.");
    alignmentCount += 1;
  } else if (context.knowledgeSupportScore >= 52) {
    score += 5;
    reasons.push("Commodity knowledge base moderately supports this voyage pattern.");
  } else {
    score -= 4;
    missingSignals.push("Knowledge-base support");
  }

  if (context.historicalMoroccoEvidence) {
    score += 6;
    reasons.push("Historical route evidence supports Morocco trade recurrence.");
    alignmentCount += 1;
  }

  if (context.routeConsistent) {
    score += 4;
    alignmentCount += 1;
  }

  if (template.candidateTemplate) {
    if (context.moroccoExplicit) {
      score += 8;
      reasons.push("Explicit Morocco signal upgrades candidate confidence.");
      alignmentCount += 1;
    } else if (context.moroccoCandidate) {
      score += 9;
      reasons.push("Candidate-style pre-confirmation evidence is aligned.");
      alignmentCount += 1;
    } else {
      score -= 8;
      missingSignals.push("Candidate-level Morocco routing support");
    }
    if (context.timeSinceDepartureHours <= 72) {
      score += 4;
      reasons.push("Early-voyage stage fits candidate template usage.");
    }
  } else {
    if (context.moroccoExplicit) {
      score += 14;
      reasons.push("Explicit Morocco destination support is present.");
      alignmentCount += 1;
    } else {
      score -= 16;
      missingSignals.push("Explicit Morocco destination support");
    }
  }

  if (context.evidenceImproving || context.scoreTrendDirection === "up") {
    score += 4;
    reasons.push("Rolling evidence trend is improving.");
  } else if (context.scoreTrendDirection === "down") {
    score -= 5;
  }

  if (context.observationCount >= 4) {
    score += 3;
  }

  const gfwSupportExists =
    context.gfwMoroccoVisitCount > 0 ||
    context.gfwExportPortVisitCount > 0 ||
    context.gfwHistoricalRouteHints.length > 0;
  if (gfwSupportExists) {
    const gfwWeight =
      context.gfwEvidenceConfidence === "high"
        ? 10
        : context.gfwEvidenceConfidence === "medium"
          ? 6
          : 3;

    if (context.gfwExportPortVisitCount >= 2) {
      score += gfwWeight;
      reasons.push("GFW historical export-port repetition supports this template.");
      alignmentCount += 1;
    } else if (context.gfwExportPortVisitCount >= 1) {
      score += Math.max(2, Math.round(gfwWeight * 0.5));
      reasons.push("GFW historical export-port visit supports this template.");
    }

    if (context.gfwMoroccoVisitCount >= 2) {
      score += gfwWeight;
      reasons.push("GFW repeated Morocco visits support this template.");
      alignmentCount += 1;
    } else if (context.gfwMoroccoVisitCount >= 1) {
      score += Math.max(2, Math.round(gfwWeight * 0.5));
      reasons.push("GFW Morocco visit support detected.");
    }

    if (context.gfwHistoricalRouteHints.length > 0) {
      score += Math.min(6, context.gfwHistoricalRouteHints.length * 2);
      reasons.push("GFW historical route hints align with the voyage pattern.");
    }
  } else {
    missingSignals.push("GFW historical pattern support");
  }

  if (
    context.operationalSupportScore >= 65 &&
    context.loadingQueuePlausibility >= 55 &&
    context.operationalEvidenceConfidence !== "low"
  ) {
    const operationalBoost =
      context.operationalEvidenceConfidence === "high"
        ? 9
        : 6;
    score += operationalBoost;
    reasons.push("Operational waiting/berth/queue pattern supports this voyage template.");
    alignmentCount += 1;
  } else if (context.operationalSupportScore >= 45) {
    score += 4;
    reasons.push("Operational signal moderately supports voyage template.");
  } else {
    missingSignals.push("Operational loading-queue evidence");
  }

  if (context.waitingPatternSignal >= 45 && context.berthProximitySignal >= 40) {
    score += 3;
  }

  if (alignmentCount < 3) {
    score = Math.min(score, 56);
  } else if (alignmentCount < 5) {
    score = Math.min(score, 72);
  }

  if (template.candidateTemplate) {
    score = Math.min(score, context.moroccoExplicit ? 86 : 78);
  } else {
    score = Math.min(score, context.moroccoExplicit ? 90 : 74);
  }

  return {
    id: template.id,
    label: template.label,
    score: clampScore(score),
    reasons,
    missingSignals: Array.from(new Set(missingSignals)),
    alignmentCount,
  };
}

function scoreAmbiguousTemplate(
  context: VoyageContext,
  template: TemplateDefinition,
): VoyageTemplateResult {
  let score = 8;
  const reasons: string[] = [];
  const missingSignals: string[] = [];
  let alignmentCount = 0;

  if (context.dryBulkCompatible) {
    score += 18;
    reasons.push("Dry-bulk compatible vessel can still represent non-Morocco ambiguity.");
    alignmentCount += 1;
  } else {
    score -= 14;
  }

  if (!context.moroccoExplicit && !context.moroccoCandidate) {
    score += 22;
    reasons.push("No explicit/candidate Morocco support keeps ambiguous scenario plausible.");
    alignmentCount += 1;
  } else {
    score -= 16;
    missingSignals.push("Lack of Morocco confirmation");
  }

  if (context.loadingSignalScore < 45 || context.loadingConfidence === "low") {
    score += 10;
    reasons.push("Loading evidence is limited, supporting ambiguity.");
    alignmentCount += 1;
  } else {
    score -= 7;
  }

  if (context.knowledgeSupportScore < 45) {
    score += 8;
    reasons.push("Knowledge support remains limited; template stays ambiguous.");
    alignmentCount += 1;
  } else {
    score -= 6;
  }

  if (context.moroccoBoundScore < 55) {
    score += 10;
    alignmentCount += 1;
  } else {
    score -= 8;
  }

  if (context.observationCount >= 4 && context.evidenceImproving) {
    score -= 6;
  }

  if (context.gfwMoroccoVisitCount >= 1 || context.gfwExportPortVisitCount >= 1) {
    score -= context.gfwEvidenceConfidence === "high" ? 10 : context.gfwEvidenceConfidence === "medium" ? 7 : 4;
    reasons.push("GFW historical matches reduce non-Morocco ambiguity.");
  }

  if (context.operationalSupportScore >= 65 && context.loadingQueuePlausibility >= 55) {
    score -= context.operationalEvidenceConfidence === "high" ? 9 : 6;
    reasons.push("Operational loading-queue pattern reduces ambiguous non-Morocco scenario.");
  } else if (context.operationalSupportScore >= 45) {
    score -= 4;
  }

  return {
    id: template.id,
    label: template.label,
    score: clampScore(score),
    reasons,
    missingSignals: Array.from(new Set(missingSignals)),
    alignmentCount,
  };
}

function inferEvidenceStyle(
  context: VoyageContext,
  topTemplate: VoyageTemplateResult,
): VoyageHypothesisEvidenceStyle {
  if (context.moroccoExplicit && !topTemplate.id.endsWith("_candidate")) {
    return "explicit_morocco_support";
  }
  if (context.moroccoExplicit && topTemplate.id.endsWith("_candidate")) {
    return "explicit_morocco_support";
  }
  return "candidate_pre_confirmation";
}

export function evaluateVoyageHypotheses(input: VoyageHypothesisInput): VoyageHypothesisResult {
  const context = buildContext(input);
  const results = TEMPLATE_DEFINITIONS.map((template) => scoreTemplate(context, template)).sort(
    (a, b) => b.score - a.score,
  );

  const top = results[0];
  const second = results[1];
  const gap = (top?.score ?? 0) - (second?.score ?? 0);
  const topConfidence = toHypothesisConfidence(top?.score ?? 0, gap);
  const evidenceStyle = inferEvidenceStyle(context, top);

  const alternatives: VoyageHypothesisAlternative[] = results
    .slice(1, 4)
    .map((item, index) => {
      const referenceScore = index === 0 ? top?.score ?? item.score : results[index]?.score ?? item.score;
      return {
        id: item.id,
        label: item.label,
        score: item.score,
        confidence: toHypothesisConfidence(item.score, Math.max(0, item.score - referenceScore)),
      };
    });

  const hypothesisScores = TEMPLATE_DEFINITIONS.reduce(
    (acc, template) => {
      const found = results.find((item) => item.id === template.id);
      acc[template.id] = found?.score ?? 0;
      return acc;
    },
    {} as Record<VoyageHypothesisId, number>,
  );

  const reasons = [
    `Top voyage hypothesis: ${top.label} (${top.score})`,
    ...top.reasons.slice(0, 6),
  ];
  if (evidenceStyle === "candidate_pre_confirmation") {
    reasons.push("Hypothesis currently relies on candidate-style pre-confirmation evidence.");
  } else {
    reasons.push("Hypothesis is supported by explicit Morocco destination evidence.");
  }

  return {
    topVoyageHypothesis: top.id,
    topVoyageHypothesisScore: top.score,
    topVoyageHypothesisConfidence: topConfidence,
    alternativeVoyageHypotheses: alternatives,
    voyageHypothesisReasons: reasons,
    missingSignalsForVoyageConfirmation: top.missingSignals.slice(0, 6),
    voyageHypothesisEvidenceStyle: evidenceStyle,
    hypothesisScores,
  };
}
