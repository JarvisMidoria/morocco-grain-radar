export type SeededCorridorId =
  | "western_europe_to_morocco_atlantic"
  | "black_sea_to_morocco_via_bosphorus_and_med"
  | "us_gulf_to_morocco_atlantic"
  | "south_atlantic_agri_to_morocco"
  | "gibraltar_approach_to_morocco"
  | "western_mediterranean_to_morocco";

export type CorridorBoundingBox = [[number, number], [number, number]];

export interface SeededCorridorDefinition {
  id: SeededCorridorId;
  label: string;
  boundingBoxes: CorridorBoundingBox[];
}

export interface SeededExportPortDefinition {
  id: string;
  name: string;
  country: string;
  unlocodes: string[];
  aliases: string[];
  corridorIds: SeededCorridorId[];
}

export interface SeededExportPortMatch {
  port: SeededExportPortDefinition;
  confidence: "high" | "medium" | "low";
  confidenceBand: MatchConfidenceBand;
  matchedBy: "code" | "alias_exact" | "alias_compact" | "loose_inclusion" | "token_overlap";
  matchedAlias: string | null;
  reason: string;
}

export type TerminalType =
  | "grain_terminal"
  | "feed_terminal"
  | "agri_bulk_terminal"
  | "mixed_bulk_terminal"
  | "unknown_terminal";

export type MatchConfidenceBand = "exact" | "high" | "medium" | "low";

export interface GrainTerminalMatchResult {
  matched: boolean;
  matchedTerminal: string | null;
  matchedTerminalName: string | null;
  matchedTerminalType: TerminalType;
  terminalMatchConfidence: "high" | "medium" | "low";
  matchConfidenceBand: MatchConfidenceBand;
  matchedBy:
    | "terminal_alias_exact"
    | "terminal_alias_compact"
    | "terminal_loose_inclusion"
    | "terminal_token_overlap"
    | "terminal_partial"
    | "port_fallback"
    | "none";
  matchedAlias: string | null;
  fallbackLevel: "terminal" | "port" | "none";
  exportPortName: string | null;
  exportPortMatched: boolean;
  grainTerminalMatch: boolean;
  reason: string;
}

export function normalizeLooseText(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function normalizeCompactText(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function extractEmbeddedUnlocodes(value: string) {
  const upper = value.toUpperCase();
  if (!upper.trim()) {
    return [];
  }

  const candidates = new Set<string>();
  const regexMatches = upper.match(/[A-Z]{2}[\s\-_/]?[A-Z0-9]{3}/g) ?? [];
  for (const token of regexMatches) {
    const normalized = normalizeUnlocode(token);
    if (normalized.length === 5) {
      candidates.add(normalized);
    }
  }

  for (const part of upper.split(/\s+/g)) {
    const normalized = normalizeUnlocode(part);
    if (normalized.length === 5) {
      candidates.add(normalized);
    }
  }

  return Array.from(candidates);
}

function bandToSignalConfidence(band: "exact" | "high" | "medium" | "low") {
  if (band === "exact" || band === "high") {
    return "high" as const;
  }
  if (band === "medium") {
    return "medium" as const;
  }
  return "low" as const;
}

export function normalizeUnlocode(value: string) {
  return value.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export const SEEDED_EXPORT_PORTS: SeededExportPortDefinition[] = [
  {
    id: "export-rouen",
    name: "Rouen",
    country: "France",
    unlocodes: ["FRURO"],
    aliases: [
      "rouen",
      "rouen france",
      "port rouen",
      "rouen/fr",
      "rouen seine",
      "grand couronne",
      "grand-couronne",
      "grd couronne",
      "fr rouen",
      "fr uro",
      "fruro",
      "rouen mt",
      "rouen grain",
      "rouen grain terminal",
      "silo rouen",
    ],
    corridorIds: ["western_europe_to_morocco_atlantic"],
  },
  {
    id: "export-la-rochelle",
    name: "La Rochelle",
    country: "France",
    unlocodes: ["FRLAR"],
    aliases: [
      "la rochelle",
      "la-rochelle",
      "larochelle",
      "port la rochelle",
      "la pallice",
      "la rochelle pallice",
      "la rochelle-pallice",
      "pallice",
      "pallice la rochelle",
      "la pallice france",
      "lr pallice",
      "fr lar",
      "frlar",
    ],
    corridorIds: ["western_europe_to_morocco_atlantic"],
  },
  {
    id: "export-dunkerque",
    name: "Dunkerque",
    country: "France",
    unlocodes: ["FRDKK"],
    aliases: [
      "dunkerque",
      "dunkerque fr",
      "dunkerque-france",
      "port dunkerque",
      "dunkirk",
      "dunkirk fr",
      "fr dkk",
      "frdkk",
      "dkk",
      "dunkerque grain",
      "dunkerque grt",
    ],
    corridorIds: ["western_europe_to_morocco_atlantic"],
  },
  {
    id: "export-nantes-saint-nazaire",
    name: "Nantes Saint-Nazaire",
    country: "France",
    unlocodes: ["FRNSN", "FRSNR"],
    aliases: [
      "nantes saint nazaire",
      "nantes st nazaire",
      "saint nazaire",
      "st nazaire",
      "saint-nazaire",
      "nantes",
      "nantes sn",
      "montoir",
      "montoir de bretagne",
      "montoir-de-bretagne",
      "port montoir",
      "fr nsn",
      "fr snr",
      "frnsn",
      "frsnr",
    ],
    corridorIds: ["western_europe_to_morocco_atlantic"],
  },
  {
    id: "export-odessa",
    name: "Odessa",
    country: "Ukraine",
    unlocodes: ["UAODS", "UAODE"],
    aliases: [
      "odessa",
      "odesa",
      "odessa ua",
      "odesa ua",
      "odesa ukraine",
      "odessa ukr",
      "port of odessa",
      "port of odesa",
      "odessa port",
      "odesa port",
      "ua ods",
      "ua ode",
      "uaods",
      "uaode",
    ],
    corridorIds: ["black_sea_to_morocco_via_bosphorus_and_med"],
  },
  {
    id: "export-chornomorsk",
    name: "Chornomorsk",
    country: "Ukraine",
    unlocodes: ["UACHR", "UAILK"],
    aliases: [
      "chornomorsk",
      "chornomorsk ua",
      "chernomorsk",
      "chernomorsk ua",
      "port chornomorsk",
      "illichivsk",
      "illichevsk",
      "ilyichevsk",
      "port illichivsk",
      "ua chr",
      "ua ilk",
      "uachr",
      "uailk",
    ],
    corridorIds: ["black_sea_to_morocco_via_bosphorus_and_med"],
  },
  {
    id: "export-pivdennyi",
    name: "Pivdennyi",
    country: "Ukraine",
    unlocodes: ["UAPIV", "UAYUZ"],
    aliases: [
      "pivdennyi",
      "pivdennyi ua",
      "pivdenny",
      "pivdennyy",
      "yuzhny",
      "yuzhnyi",
      "yuzhne",
      "yuzhnyy",
      "yuzni",
      "port yuzhny",
      "port yuzhnyi",
      "yuzhny ukraine",
      "ua piv",
      "ua yuz",
      "uapiv",
      "uayuz",
    ],
    corridorIds: ["black_sea_to_morocco_via_bosphorus_and_med"],
  },
  {
    id: "export-constanta",
    name: "Constanta",
    country: "Romania",
    unlocodes: ["ROCND"],
    aliases: [
      "constanta",
      "constanta ro",
      "constanta romania",
      "constanta-ro",
      "port constanta",
      "constanta port",
      "constanta harbour",
      "constanța",
      "constanta ro cnd",
      "ro cnd",
      "rocnd",
    ],
    corridorIds: ["black_sea_to_morocco_via_bosphorus_and_med"],
  },
  {
    id: "export-varna",
    name: "Varna",
    country: "Bulgaria",
    unlocodes: ["BGVAR"],
    aliases: [
      "varna",
      "varna bg",
      "varna bulgaria",
      "port varna",
      "varna east",
      "bg var",
      "bgvar",
      "varna grain",
    ],
    corridorIds: ["black_sea_to_morocco_via_bosphorus_and_med"],
  },
  {
    id: "export-novorossiysk",
    name: "Novorossiysk",
    country: "Russia",
    unlocodes: ["RUNVS"],
    aliases: [
      "novorossiysk",
      "novorossiysk ru",
      "novorossiisk",
      "novorossiisk ru",
      "port novorossiysk",
      "novorossiysk commercial sea port",
      "ru nvs",
      "runvs",
      "runvs ru",
      "novorossiysk grain",
    ],
    corridorIds: ["black_sea_to_morocco_via_bosphorus_and_med"],
  },
  {
    id: "export-new-orleans",
    name: "New Orleans",
    country: "United States",
    unlocodes: ["USMSY"],
    aliases: [
      "new orleans",
      "neworleans",
      "new orleans la",
      "new orleans us",
      "new orleans usa",
      "port new orleans",
      "port of new orleans",
      "nola",
      "us msy",
      "usmsy",
      "gramercy",
      "gramercy la",
      "lower mississippi",
      "mississippi river nola",
    ],
    corridorIds: ["us_gulf_to_morocco_atlantic"],
  },
  {
    id: "export-houston",
    name: "Houston",
    country: "United States",
    unlocodes: ["USHOU"],
    aliases: [
      "houston",
      "houston tx",
      "houston us",
      "houston usa",
      "port houston",
      "port of houston",
      "houston ship channel",
      "hou tx",
      "us hou",
      "ushou",
      "galveston bay",
    ],
    corridorIds: ["us_gulf_to_morocco_atlantic"],
  },
  {
    id: "export-rosario",
    name: "Rosario",
    country: "Argentina",
    unlocodes: ["ARROR"],
    aliases: [
      "rosario",
      "rosario ar",
      "rosario argentina",
      "port rosario",
      "rosario santa fe",
      "rosario-santa fe",
      "upriver rosario",
      "up river rosario",
      "san lorenzo",
      "san lorenzo ar",
      "ar ror",
      "arrior",
    ],
    corridorIds: ["south_atlantic_agri_to_morocco"],
  },
  {
    id: "export-santos",
    name: "Santos",
    country: "Brazil",
    unlocodes: ["BRSSZ"],
    aliases: [
      "santos",
      "santos br",
      "santos brazil",
      "port santos",
      "santos sp",
      "santos-sp",
      "tiplam",
      "tiplam santos",
      "br ssz",
      "brssz",
    ],
    corridorIds: ["south_atlantic_agri_to_morocco"],
  },
  {
    id: "export-vancouver",
    name: "Vancouver",
    country: "Canada",
    unlocodes: ["CAVAN"],
    aliases: [
      "vancouver",
      "vancouver bc",
      "vancouver ca",
      "vancouver canada",
      "vancouver bc ca",
      "port vancouver",
      "ca van",
      "cavan",
      "pacific elevators",
      "pacific elevator vancouver",
      "viterra vancouver",
    ],
    corridorIds: ["western_europe_to_morocco_atlantic"],
  },
  {
    id: "export-thunder-bay",
    name: "Thunder Bay",
    country: "Canada",
    unlocodes: ["CATHB"],
    aliases: [
      "thunder bay",
      "thunder-bay",
      "thunderbay",
      "thunder bay ca",
      "thunder bay canada",
      "port thunder bay",
      "ca thb",
      "cathb",
      "cathb ca",
      "tbay",
      "t bay",
    ],
    corridorIds: ["western_europe_to_morocco_atlantic"],
  },
];

export interface GrainTerminalDefinition {
  id: string;
  exportPortId: string;
  name: string;
  terminalType: TerminalType;
  grainFeedRelevance: "high" | "medium" | "low";
  terminalKeywords: string[];
  aliases: string[];
}

export const GRAIN_TERMINALS: GrainTerminalDefinition[] = [
  {
    id: "term-rouen-senalia",
    exportPortId: "export-rouen",
    name: "Senalia Rouen",
    terminalType: "grain_terminal",
    grainFeedRelevance: "high",
    terminalKeywords: [
      "senalia",
      "senalia rouen",
      "senalia grand couronne",
      "grand couronne",
      "grand-couronne",
      "rouen",
      "silo",
      "elevator",
    ],
    aliases: [
      "senalia rouen",
      "rouen grain terminal",
      "senalia gc",
      "senalia gct",
      "senalia berth",
      "rouen cereals",
      "rouen grain berth",
      "terminal cerealier rouen",
    ],
  },
  {
    id: "term-larochelle-pallice",
    exportPortId: "export-la-rochelle",
    name: "La Pallice Grain Berth",
    terminalType: "grain_terminal",
    grainFeedRelevance: "high",
    terminalKeywords: [
      "la pallice",
      "la rochelle",
      "la rochelle pallice",
      "pallice",
      "pallice terminal",
      "grain berth",
    ],
    aliases: [
      "larochelle grain",
      "la rochelle grain",
      "pallice grain",
      "frlar grain",
      "pallice berth",
      "la pallice berth",
      "terminal pallice cereals",
    ],
  },
  {
    id: "term-dunkerque-cereal",
    exportPortId: "export-dunkerque",
    name: "Dunkerque Cereal Terminal",
    terminalType: "grain_terminal",
    grainFeedRelevance: "high",
    terminalKeywords: [
      "dunkerque",
      "dunkerque grain",
      "dunkirk",
      "cereal terminal",
      "terminal cerealier",
      "dkk",
    ],
    aliases: [
      "dunkirk cereal",
      "dkk grain",
      "frdkk cereal",
      "dunkerque cereal terminal",
      "port ouest cereals",
    ],
  },
  {
    id: "term-nantes-saintnazaire",
    exportPortId: "export-nantes-saint-nazaire",
    name: "Montoir Grain Terminal",
    terminalType: "mixed_bulk_terminal",
    grainFeedRelevance: "medium",
    terminalKeywords: [
      "saint nazaire",
      "st nazaire",
      "montoir",
      "montoir de bretagne",
      "nantes",
      "snaz",
      "terminal agro vrac",
    ],
    aliases: [
      "montoir",
      "montoir grain",
      "nantes grain",
      "frnsn terminal",
      "montoir grain berth",
      "nantes saint nazaire terminal",
      "montoir cereal berth",
    ],
  },
  {
    id: "term-odessa-grain",
    exportPortId: "export-odessa",
    name: "Odessa Grain Terminal",
    terminalType: "grain_terminal",
    grainFeedRelevance: "high",
    terminalKeywords: [
      "odessa grain",
      "odesa grain",
      "odessa",
      "odesa",
      "uaods",
      "uaode",
      "grain elevator",
    ],
    aliases: [
      "odessa terminal",
      "odesa grain berth",
      "odessa cereals",
      "odessa grain elevator",
      "odesa grain terminal",
      "odessa terminal berth",
    ],
  },
  {
    id: "term-chornomorsk-grain",
    exportPortId: "export-chornomorsk",
    name: "Chornomorsk Grain Terminal",
    terminalType: "grain_terminal",
    grainFeedRelevance: "high",
    terminalKeywords: [
      "chornomorsk",
      "chernomorsk",
      "illichivsk",
      "illichevsk",
      "ilyichevsk",
      "uachr",
      "uailk",
      "grain terminal",
    ],
    aliases: [
      "illichevsk grain",
      "ilk grain",
      "chornomorsk cereals",
      "chornomorsk grain berth",
      "chernomorsk grain terminal",
      "port illichivsk grain",
    ],
  },
  {
    id: "term-pivdennyi-tisb",
    exportPortId: "export-pivdennyi",
    name: "TISB Pivdennyi",
    terminalType: "mixed_bulk_terminal",
    grainFeedRelevance: "high",
    terminalKeywords: [
      "pivdennyi",
      "pivdenny",
      "yuzhny",
      "yuzhnyi",
      "tisb",
      "tis",
      "uapiv",
      "uayuz",
    ],
    aliases: [
      "yuzhny grain",
      "pivdennyi tisb",
      "yuzhny tisb",
      "tisb grain terminal",
      "tisb berth",
      "pivdennyi terminal",
    ],
  },
  {
    id: "term-constanta-comvex",
    exportPortId: "export-constanta",
    name: "Comvex Constanta",
    terminalType: "grain_terminal",
    grainFeedRelevance: "high",
    terminalKeywords: [
      "constanta",
      "constanța",
      "comvex",
      "comvex ro",
      "rocnd",
      "grain terminal",
    ],
    aliases: [
      "constanta grain",
      "constanța comvex",
      "comvex terminal",
      "comvex grain terminal",
      "constanta comvex berth",
    ],
  },
  {
    id: "term-varna-grain",
    exportPortId: "export-varna",
    name: "Varna Grain Terminal",
    terminalType: "grain_terminal",
    grainFeedRelevance: "medium",
    terminalKeywords: ["varna", "varna east", "grain terminal", "bgvar", "grain berth"],
    aliases: [
      "varna grain berth",
      "varna cereals",
      "varna grain terminal",
      "varna east grain",
    ],
  },
  {
    id: "term-novorossiysk-ksk",
    exportPortId: "export-novorossiysk",
    name: "KSK Novorossiysk",
    terminalType: "grain_terminal",
    grainFeedRelevance: "high",
    terminalKeywords: [
      "novorossiysk",
      "novorossiisk",
      "ksk",
      "runvs",
      "grain terminal",
      "commercial sea port",
    ],
    aliases: [
      "novorossiysk grain",
      "nvs ksk",
      "ksk terminal",
      "ksk grain terminal",
      "novorossiysk ksk berth",
    ],
  },
  {
    id: "term-neworleans-grain",
    exportPortId: "export-new-orleans",
    name: "Gramercy Grain Elevator",
    terminalType: "grain_terminal",
    grainFeedRelevance: "high",
    terminalKeywords: [
      "new orleans",
      "nola",
      "gramercy",
      "usmsy",
      "grain elevator",
      "elevator",
      "lower mississippi",
    ],
    aliases: [
      "nola grain",
      "msy grain",
      "gramercy elevator",
      "gramercy grain elevator",
      "new orleans grain terminal",
      "lower mississippi grain berth",
    ],
  },
  {
    id: "term-houston-grain",
    exportPortId: "export-houston",
    name: "Houston Grain Elevator",
    terminalType: "feed_terminal",
    grainFeedRelevance: "medium",
    terminalKeywords: [
      "houston",
      "port houston",
      "galveston",
      "ship channel",
      "ushou",
      "grain elevator",
      "feed terminal",
    ],
    aliases: [
      "houston feed terminal",
      "hou grain",
      "houston elevator",
      "houston grain elevator",
      "houston grain berth",
      "galveston bay grain terminal",
    ],
  },
  {
    id: "term-rosario-upriver",
    exportPortId: "export-rosario",
    name: "Rosario Upriver Terminal",
    terminalType: "feed_terminal",
    grainFeedRelevance: "high",
    terminalKeywords: [
      "rosario",
      "upriver",
      "up river",
      "san lorenzo",
      "timbues",
      "grain berth",
      "feed berth",
    ],
    aliases: [
      "rosario feed berth",
      "rosario agri terminal",
      "rosario upriver",
      "rosario up river terminal",
      "san lorenzo grain terminal",
      "rosario cereal terminal",
    ],
  },
  {
    id: "term-santos-tiplam",
    exportPortId: "export-santos",
    name: "Tiplam Santos",
    terminalType: "feed_terminal",
    grainFeedRelevance: "high",
    terminalKeywords: [
      "santos",
      "tiplam",
      "tiplam santos",
      "brssz",
      "feed terminal",
      "meal terminal",
    ],
    aliases: [
      "santos feed",
      "tiplam terminal",
      "tiplam berth",
      "tiplam grain berth",
      "santos tiplam terminal",
      "santos meal terminal",
    ],
  },
  {
    id: "term-vancouver-grain",
    exportPortId: "export-vancouver",
    name: "Pacific Elevators Vancouver",
    terminalType: "grain_terminal",
    grainFeedRelevance: "medium",
    terminalKeywords: [
      "vancouver",
      "vancouver bc",
      "viterra",
      "pacific elevators",
      "grain terminal",
      "cavan",
    ],
    aliases: [
      "vancouver grain",
      "van grain terminal",
      "pacific terminal",
      "pacific elevators vancouver",
      "viterra vancouver terminal",
      "north shore grain",
    ],
  },
  {
    id: "term-thunderbay-grain",
    exportPortId: "export-thunder-bay",
    name: "Thunder Bay Grain Terminal",
    terminalType: "grain_terminal",
    grainFeedRelevance: "medium",
    terminalKeywords: [
      "thunder bay",
      "thunderbay",
      "richardson",
      "grain terminal",
      "cathb",
      "elevators",
    ],
    aliases: [
      "thunderbay grain",
      "tbay terminal",
      "thunder bay elevators",
      "thunder bay grain terminal",
      "richardson thunder bay",
      "thunder bay grain berth",
    ],
  },
];

const SEEDED_EXPORT_CODES = new Map<string, SeededExportPortDefinition>();
const SEEDED_EXPORT_ALIASES = new Map<string, SeededExportPortDefinition>();
const SEEDED_EXPORT_COMPACT_ALIASES = new Map<string, SeededExportPortDefinition>();

for (const port of SEEDED_EXPORT_PORTS) {
  for (const code of port.unlocodes) {
    SEEDED_EXPORT_CODES.set(normalizeUnlocode(code), port);
  }

  const aliasSet = new Set([port.name, ...port.aliases]);
  for (const alias of Array.from(aliasSet)) {
    const normalizedAlias = normalizeLooseText(alias);
    const compactAlias = normalizeCompactText(alias);
    if (normalizedAlias && normalizedAlias.length >= 4) {
      SEEDED_EXPORT_ALIASES.set(normalizedAlias, port);
    }
    if (compactAlias && compactAlias.length >= 4) {
      SEEDED_EXPORT_COMPACT_ALIASES.set(compactAlias, port);
    }
  }
}

export function matchSeededExportPort(options: {
  unlocode?: string | null;
  name?: string | null;
  contextText?: string | null;
}): SeededExportPortMatch | null {
  const code = normalizeUnlocode(options.unlocode ?? "");
  if (code) {
    const byCode = SEEDED_EXPORT_CODES.get(code);
    if (byCode) {
      return {
        port: byCode,
        confidence: "high",
        confidenceBand: "exact",
        matchedBy: "code",
        matchedAlias: code,
        reason: `UN/LOCODE match (${code})`,
      };
    }
  }

  const embeddedCodes = new Set<string>([
    ...extractEmbeddedUnlocodes(options.name ?? ""),
    ...extractEmbeddedUnlocodes(options.contextText ?? ""),
  ]);
  for (const embeddedCode of Array.from(embeddedCodes)) {
    const byCode = SEEDED_EXPORT_CODES.get(embeddedCode);
    if (byCode) {
      return {
        port: byCode,
        confidence: "high",
        confidenceBand: "high",
        matchedBy: "code",
        matchedAlias: embeddedCode,
        reason: `Embedded UN/LOCODE-like token match (${embeddedCode})`,
      };
    }
  }

  const normalizedName = normalizeLooseText(options.name ?? "");
  const normalizedContext = normalizeLooseText(options.contextText ?? "");
  const searchableName = [normalizedName, normalizedContext].filter(Boolean).join(" ").trim();
  if (!searchableName) {
    return null;
  }

  for (const candidate of [normalizedName, normalizedContext, searchableName]) {
    if (!candidate) {
      continue;
    }
    const exact = SEEDED_EXPORT_ALIASES.get(candidate);
    if (exact) {
      return {
        port: exact,
        confidence: "high",
        confidenceBand: "exact",
        matchedBy: "alias_exact",
        matchedAlias: candidate,
        reason: `Name alias match (${exact.name})`,
      };
    }
  }

  const compactName = normalizeCompactText(searchableName);
  const compactContext = normalizeCompactText(normalizedContext);
  const compactDirectName = normalizeCompactText(normalizedName);
  for (const compactCandidate of [compactDirectName, compactContext, compactName]) {
    if (!compactCandidate) {
      continue;
    }
    const compactExact = SEEDED_EXPORT_COMPACT_ALIASES.get(compactCandidate);
    if (compactExact) {
      return {
        port: compactExact,
        confidence: "high",
        confidenceBand: "high",
        matchedBy: "alias_compact",
        matchedAlias: compactCandidate,
        reason: `Compact alias match (${compactExact.name})`,
      };
    }
  }

  let bestLooseMatch: {
    port: SeededExportPortDefinition;
    confidenceBand: "exact" | "high" | "medium" | "low";
    matchedBy: "loose_inclusion" | "token_overlap";
    matchedAlias: string;
    reason: string;
    score: number;
  } | null = null;

  for (const [alias, port] of Array.from(SEEDED_EXPORT_ALIASES.entries())) {
    if (alias.length < 4) {
      continue;
    }
    const aliasCompact = normalizeCompactText(alias);
    const compactInclusion =
      compactName &&
      compactName.length >= 4 &&
      aliasCompact &&
      aliasCompact.length >= 4 &&
      (compactName.includes(aliasCompact) || aliasCompact.includes(compactName));
    const looseInclusion =
      searchableName.length >= 6 &&
      alias.length >= 6 &&
      (searchableName.includes(alias) || alias.includes(searchableName));

    const aliasTokens = new Set(alias.split(" ").filter(Boolean));
    const nameTokens = new Set(searchableName.split(" ").filter(Boolean));
    const allAliasTokensShort = Array.from(aliasTokens).every((token) => token.length <= 2);
    if (allAliasTokensShort) {
      continue;
    }
    let overlap = 0;
    for (const token of Array.from(nameTokens)) {
      if (aliasTokens.has(token)) {
        overlap += 1;
      }
    }

    let score = 0;
    if (looseInclusion) {
      score += 2;
    }
    if (compactInclusion) {
      score += 2;
    }
    if (overlap >= 2) {
      score += 1;
    }
    if (overlap >= 3) {
      score += 1;
    }

    if (score > 0) {
      const matchedBy: "loose_inclusion" | "token_overlap" =
        compactInclusion || looseInclusion ? "loose_inclusion" : "token_overlap";
      const confidenceBand: "exact" | "high" | "medium" | "low" =
        score >= 5 ? "high" : score >= 3 ? "medium" : "low";
      const reason =
        matchedBy === "loose_inclusion"
          ? `Loose inclusion match (${port.name})`
          : `Token overlap match (${port.name})`;
      if (!bestLooseMatch || score > bestLooseMatch.score) {
        bestLooseMatch = {
          port,
          confidenceBand,
          matchedBy,
          matchedAlias: alias,
          reason,
          score,
        };
      }
    }
  }

  if (bestLooseMatch) {
    return {
      port: bestLooseMatch.port,
      confidence: bandToSignalConfidence(bestLooseMatch.confidenceBand),
      confidenceBand: bestLooseMatch.confidenceBand,
      matchedBy: bestLooseMatch.matchedBy,
      matchedAlias: bestLooseMatch.matchedAlias,
      reason: bestLooseMatch.reason,
    };
  }

  return null;
}

export function matchGrainLoadingTerminal(options: {
  departurePortCode?: string | null;
  departurePortName?: string | null;
  terminalText?: string | null;
}): GrainTerminalMatchResult {
  const exportMatch = matchSeededExportPort({
    unlocode: options.departurePortCode,
    name: options.departurePortName,
    contextText: options.terminalText,
  });

  if (!exportMatch) {
    return {
      matched: false,
      matchedTerminal: null,
      matchedTerminalName: null,
      matchedTerminalType: "unknown_terminal",
      terminalMatchConfidence: "low",
      matchConfidenceBand: "low",
      matchedBy: "none",
      matchedAlias: null,
      fallbackLevel: "none",
      exportPortName: null,
      exportPortMatched: false,
      grainTerminalMatch: false,
      reason: "No seeded export-port match for loading-terminal detection.",
    };
  }

  const candidates = GRAIN_TERMINALS.filter((terminal) => terminal.exportPortId === exportMatch.port.id);
  const combinedRawText = `${options.departurePortName ?? ""} ${options.terminalText ?? ""}`;
  const combinedText = normalizeLooseText(combinedRawText);
  const combinedCompactText = normalizeCompactText(combinedRawText);
  const terminalOnlyText = normalizeLooseText(options.terminalText ?? "");
  const terminalOnlyCompact = normalizeCompactText(options.terminalText ?? "");

  if (combinedText) {
    let bestMatch:
      | {
          terminal: GrainTerminalDefinition;
          matchedKeyword: string;
          matchedBy:
            | "terminal_alias_exact"
            | "terminal_alias_compact"
            | "terminal_loose_inclusion"
            | "terminal_token_overlap"
            | "terminal_partial";
          confidenceBand: "exact" | "high" | "medium" | "low";
          score: number;
        }
      | null = null;

    for (const terminal of candidates) {
      const aliasPool = [...terminal.terminalKeywords, ...terminal.aliases, terminal.name];
      for (const keyword of aliasPool) {
        const normalizedKeyword = normalizeLooseText(keyword);
        const compactKeyword = normalizeCompactText(keyword);
        if (!normalizedKeyword && !compactKeyword) {
          continue;
        }

        const inTerminalText =
          Boolean(normalizedKeyword && terminalOnlyText.includes(normalizedKeyword)) ||
          Boolean(compactKeyword && terminalOnlyCompact.includes(compactKeyword));
        const inCombinedText =
          Boolean(normalizedKeyword && combinedText.includes(normalizedKeyword)) ||
          Boolean(compactKeyword && combinedCompactText.includes(compactKeyword));
        const exactAliasHit =
          Boolean(normalizedKeyword && terminalOnlyText === normalizedKeyword) ||
          Boolean(normalizedKeyword && combinedText === normalizedKeyword);
        const compactExactHit =
          Boolean(compactKeyword && terminalOnlyCompact === compactKeyword) ||
          Boolean(compactKeyword && combinedCompactText === compactKeyword);
        const partialTerminalHit =
          normalizedKeyword.length >= 5 &&
          (terminalOnlyText.includes(normalizedKeyword.slice(0, Math.min(8, normalizedKeyword.length))) ||
            normalizedKeyword.includes(terminalOnlyText));

        const terminalTokens = new Set(normalizedKeyword.split(" ").filter(Boolean));
        const sourceTokens = new Set(combinedText.split(" ").filter(Boolean));
        let overlap = 0;
        for (const token of Array.from(sourceTokens)) {
          if (terminalTokens.has(token)) {
            overlap += 1;
          }
        }

        let score = 0;
        if (exactAliasHit) {
          score += 8;
        }
        if (compactExactHit) {
          score += 6;
        }
        if (inTerminalText) {
          score += 4;
        }
        if (inCombinedText) {
          score += 2;
        }
        if (overlap >= 2) {
          score += 1;
        }
        if (partialTerminalHit) {
          score += 1;
        }

        if (score <= 0) {
          continue;
        }

        let matchedBy:
          | "terminal_alias_exact"
          | "terminal_alias_compact"
          | "terminal_loose_inclusion"
          | "terminal_token_overlap"
          | "terminal_partial" = "terminal_partial";
        let confidenceBand: "exact" | "high" | "medium" | "low" = "low";

        if (exactAliasHit) {
          matchedBy = "terminal_alias_exact";
          confidenceBand = "exact";
        } else if (compactExactHit) {
          matchedBy = "terminal_alias_compact";
          confidenceBand = "high";
        } else if (inTerminalText || inCombinedText) {
          matchedBy = "terminal_loose_inclusion";
          confidenceBand = inTerminalText ? "high" : "medium";
        } else if (overlap >= 2) {
          matchedBy = "terminal_token_overlap";
          confidenceBand = "medium";
        } else {
          matchedBy = "terminal_partial";
          confidenceBand = "low";
        }

        if (!bestMatch || score > bestMatch.score) {
          bestMatch = {
            terminal,
            matchedKeyword: keyword,
            matchedBy,
            confidenceBand,
            score,
          };
        }
      }
    }

    if (bestMatch) {
      return {
        matched: true,
        matchedTerminal: bestMatch.terminal.id,
        matchedTerminalName: bestMatch.terminal.name,
        matchedTerminalType: bestMatch.terminal.terminalType,
        terminalMatchConfidence: bandToSignalConfidence(bestMatch.confidenceBand),
        matchConfidenceBand: bestMatch.confidenceBand,
        matchedBy: bestMatch.matchedBy,
        matchedAlias: bestMatch.matchedKeyword,
        fallbackLevel: "terminal",
        exportPortName: exportMatch.port.name,
        exportPortMatched: true,
        grainTerminalMatch:
          bestMatch.terminal.terminalType === "grain_terminal" ||
          bestMatch.terminal.terminalType === "feed_terminal" ||
          bestMatch.terminal.terminalType === "agri_bulk_terminal" ||
          bestMatch.terminal.terminalType === "mixed_bulk_terminal",
        reason: `Matched terminal keyword "${bestMatch.matchedKeyword}" at ${exportMatch.port.name}.`,
      };
    }
  }

  if (candidates.length > 0) {
    const fallbackTerminal = candidates[0] ?? null;
    return {
      matched: Boolean(fallbackTerminal),
      matchedTerminal: fallbackTerminal?.id ?? null,
      matchedTerminalName: fallbackTerminal?.name ?? `${exportMatch.port.name} terminal (unknown)`,
      matchedTerminalType: fallbackTerminal?.terminalType ?? "unknown_terminal",
      terminalMatchConfidence: "low",
      matchConfidenceBand: "low",
      matchedBy: "port_fallback",
      matchedAlias: exportMatch.matchedAlias ?? exportMatch.port.name,
      fallbackLevel: "port",
      exportPortName: exportMatch.port.name,
      exportPortMatched: true,
      grainTerminalMatch: Boolean(
        fallbackTerminal &&
          (fallbackTerminal.terminalType === "grain_terminal" ||
            fallbackTerminal.terminalType === "feed_terminal" ||
            fallbackTerminal.terminalType === "agri_bulk_terminal" ||
            fallbackTerminal.terminalType === "mixed_bulk_terminal"),
      ),
      reason: `Port-level terminal fallback at ${exportMatch.port.name}; exact terminal unresolved.`,
    };
  }

  return {
    matched: false,
    matchedTerminal: null,
    matchedTerminalName: null,
    matchedTerminalType: "unknown_terminal",
    terminalMatchConfidence: "low",
    matchConfidenceBand: "low",
    matchedBy: "port_fallback",
    matchedAlias: exportMatch.matchedAlias ?? exportMatch.port.name,
    fallbackLevel: "port",
    exportPortName: exportMatch.port.name,
    exportPortMatched: true,
    grainTerminalMatch: false,
    reason: `Export port ${exportMatch.port.name} has no configured terminal hints.`,
  };
}

export function isSeededExportUnlocode(unlocode: string | null | undefined) {
  return SEEDED_EXPORT_CODES.has(normalizeUnlocode(unlocode ?? ""));
}

export interface CommodityWeightProfile {
  wheatScore: number;
  barleyScore: number;
  cornScore: number;
  soybeanMealScore: number;
}

export interface ExportCommodityKnowledgeNode {
  id: string;
  exportPortId: string;
  portId: string;
  portName: string;
  portAliases: string[];
  country: string;
  region: string;
  likelyCommodities: CommodityWeightProfile;
  likelyVesselClasses: string[];
  likelyCorridors: SeededCorridorId[];
  likelyMoroccoDestinations: string[];
  confidenceWeight: number;
}

export interface TerminalCommodityKnowledgeNode {
  id: string;
  exportPortId: string;
  portId: string;
  portName: string;
  portAliases: string[];
  terminalName: string;
  terminalAliases: string[];
  terminalType: TerminalType;
  country: string;
  region: string;
  likelyCommodities: CommodityWeightProfile;
  likelyVesselClasses: string[];
  likelyCorridors: SeededCorridorId[];
  likelyMoroccoDestinations: string[];
  confidenceWeight: number;
}

export interface MoroccoDestinationKnowledgeProfile {
  id: string;
  portId: string;
  portName: string;
  aliases: string[];
  grainRelevance: "high" | "medium" | "low";
  feedRelevance: "high" | "medium" | "low";
  likelyImportCommodities: CommodityWeightProfile;
  confidenceWeight: number;
  likelySourceRegions: string[];
}

export interface VesselClassKnowledgeProfile {
  id: string;
  label: string;
  typicalCargoCompatibility: "high" | "medium" | "low";
  typicalRoutePatterns: string[];
  moroccoTradeRelevance: "high" | "medium" | "low";
  commodityBias: CommodityWeightProfile;
}

export interface CommodityKnowledgeSnapshot {
  matchedCommodityKnowledgeNode: string | null;
  terminalCommodityProfile: string | null;
  vesselClassKnowledgeProfile: string;
  destinationKnowledgeProfile: string | null;
  knowledgeBasedCommodityReasons: string[];
  commodityBias: CommodityWeightProfile;
  agriSupportBoost: number;
  commoditySupportBoost: number;
  knowledgeSupportScore: number;
  matchedTerminalIntelligence: boolean;
  matchedCommodityProfile: boolean;
  destinationIntelligenceSupport: boolean;
}

function emptyCommodityProfile(): CommodityWeightProfile {
  return {
    wheatScore: 0,
    barleyScore: 0,
    cornScore: 0,
    soybeanMealScore: 0,
  };
}

function applyCommodityProfile(
  target: CommodityWeightProfile,
  source: CommodityWeightProfile,
  factor: number,
) {
  target.wheatScore += source.wheatScore * factor;
  target.barleyScore += source.barleyScore * factor;
  target.cornScore += source.cornScore * factor;
  target.soybeanMealScore += source.soybeanMealScore * factor;
}

function normalizeCommodityProfile(profile: CommodityWeightProfile) {
  return {
    wheatScore: Math.round(profile.wheatScore),
    barleyScore: Math.round(profile.barleyScore),
    cornScore: Math.round(profile.cornScore),
    soybeanMealScore: Math.round(profile.soybeanMealScore),
  };
}

const EXPORT_PORT_ID_BY_SEEDED_EXPORT_ID: Record<string, string> = {
  "export-rouen": "port-rouen",
  "export-la-rochelle": "port-la-rochelle",
  "export-dunkerque": "port-dunkerque",
  "export-nantes-saint-nazaire": "port-nantes",
  "export-odessa": "port-odessa",
  "export-chornomorsk": "port-chornomorsk",
  "export-pivdennyi": "port-pivdennyi",
  "export-constanta": "port-constanta",
  "export-varna": "port-varna",
  "export-novorossiysk": "port-novorossiysk",
  "export-new-orleans": "port-new-orleans",
  "export-houston": "port-houston",
  "export-rosario": "port-rosario",
  "export-santos": "port-santos",
  "export-vancouver": "port-vancouver",
  "export-thunder-bay": "port-thunder-bay",
};

const EXPORT_REGION_BY_ID: Record<string, string> = {
  "export-rouen": "western_europe",
  "export-la-rochelle": "western_europe",
  "export-dunkerque": "western_europe",
  "export-nantes-saint-nazaire": "western_europe",
  "export-odessa": "black_sea",
  "export-chornomorsk": "black_sea",
  "export-pivdennyi": "black_sea",
  "export-constanta": "black_sea",
  "export-varna": "black_sea",
  "export-novorossiysk": "black_sea",
  "export-new-orleans": "us_gulf",
  "export-houston": "us_gulf",
  "export-rosario": "south_atlantic",
  "export-santos": "south_atlantic",
  "export-vancouver": "canada",
  "export-thunder-bay": "canada",
};

const EXPORT_PORT_COMMODITY_WEIGHTS: Record<string, CommodityWeightProfile> = {
  "export-rouen": { wheatScore: 22, barleyScore: 10, cornScore: 6, soybeanMealScore: 4 },
  "export-la-rochelle": { wheatScore: 20, barleyScore: 9, cornScore: 6, soybeanMealScore: 4 },
  "export-dunkerque": { wheatScore: 19, barleyScore: 9, cornScore: 5, soybeanMealScore: 3 },
  "export-nantes-saint-nazaire": { wheatScore: 17, barleyScore: 10, cornScore: 7, soybeanMealScore: 5 },
  "export-odessa": { wheatScore: 17, barleyScore: 13, cornScore: 13, soybeanMealScore: 4 },
  "export-chornomorsk": { wheatScore: 16, barleyScore: 12, cornScore: 13, soybeanMealScore: 4 },
  "export-pivdennyi": { wheatScore: 14, barleyScore: 12, cornScore: 14, soybeanMealScore: 5 },
  "export-constanta": { wheatScore: 13, barleyScore: 16, cornScore: 12, soybeanMealScore: 4 },
  "export-varna": { wheatScore: 11, barleyScore: 16, cornScore: 10, soybeanMealScore: 3 },
  "export-novorossiysk": { wheatScore: 12, barleyScore: 15, cornScore: 9, soybeanMealScore: 3 },
  "export-new-orleans": { wheatScore: 8, barleyScore: 4, cornScore: 20, soybeanMealScore: 16 },
  "export-houston": { wheatScore: 7, barleyScore: 4, cornScore: 19, soybeanMealScore: 17 },
  "export-rosario": { wheatScore: 6, barleyScore: 3, cornScore: 16, soybeanMealScore: 22 },
  "export-santos": { wheatScore: 5, barleyScore: 3, cornScore: 15, soybeanMealScore: 23 },
  "export-vancouver": { wheatScore: 17, barleyScore: 9, cornScore: 8, soybeanMealScore: 4 },
  "export-thunder-bay": { wheatScore: 19, barleyScore: 10, cornScore: 8, soybeanMealScore: 3 },
};

const EXPORT_PORT_VESSEL_CLASSES: Record<string, string[]> = {
  western_europe: ["handysize", "supramax", "panamax", "general_cargo"],
  black_sea: ["supramax", "panamax", "handysize", "general_cargo"],
  us_gulf: ["supramax", "panamax", "general_cargo"],
  south_atlantic: ["supramax", "panamax", "handysize"],
  canada: ["panamax", "supramax", "handysize"],
};

const DEFAULT_MOROCCO_DESTINATIONS = [
  "port-casablanca",
  "port-jorf-lasfar",
  "port-agadir",
  "port-nador",
  "port-safi",
];

export const EXPORT_PORT_COMMODITY_KNOWLEDGE: ExportCommodityKnowledgeNode[] = SEEDED_EXPORT_PORTS.map((port) => {
  const region = EXPORT_REGION_BY_ID[port.id] ?? "unknown_region";
  const vesselClasses = EXPORT_PORT_VESSEL_CLASSES[region] ?? ["supramax", "general_cargo"];
  return {
    id: `kb-${port.id}`,
    exportPortId: port.id,
    portId: EXPORT_PORT_ID_BY_SEEDED_EXPORT_ID[port.id] ?? `port-${port.id.replace("export-", "")}`,
    portName: port.name,
    portAliases: port.aliases,
    country: port.country,
    region,
    likelyCommodities:
      EXPORT_PORT_COMMODITY_WEIGHTS[port.id] ?? { wheatScore: 10, barleyScore: 10, cornScore: 10, soybeanMealScore: 10 },
    likelyVesselClasses: vesselClasses,
    likelyCorridors: port.corridorIds,
    likelyMoroccoDestinations: DEFAULT_MOROCCO_DESTINATIONS,
    confidenceWeight: region === "unknown_region" ? 0.6 : 0.8,
  };
});

const TERMINAL_TYPE_COMMODITY_ADJUSTMENT: Record<TerminalType, CommodityWeightProfile> = {
  grain_terminal: { wheatScore: 4, barleyScore: 3, cornScore: 2, soybeanMealScore: 1 },
  feed_terminal: { wheatScore: 1, barleyScore: 2, cornScore: 4, soybeanMealScore: 5 },
  agri_bulk_terminal: { wheatScore: 3, barleyScore: 3, cornScore: 3, soybeanMealScore: 3 },
  mixed_bulk_terminal: { wheatScore: 2, barleyScore: 2, cornScore: 2, soybeanMealScore: 2 },
  unknown_terminal: { wheatScore: 0, barleyScore: 0, cornScore: 0, soybeanMealScore: 0 },
};

const TERMINAL_CONFIDENCE_WEIGHT_BY_RELEVANCE: Record<"high" | "medium" | "low", number> = {
  high: 0.9,
  medium: 0.75,
  low: 0.6,
};

const EXPORT_KNOWLEDGE_BY_EXPORT_ID = new Map(
  EXPORT_PORT_COMMODITY_KNOWLEDGE.map((node) => [node.exportPortId, node]),
);

export const TERMINAL_COMMODITY_KNOWLEDGE: TerminalCommodityKnowledgeNode[] = GRAIN_TERMINALS.map((terminal) => {
  const exportNode = EXPORT_KNOWLEDGE_BY_EXPORT_ID.get(terminal.exportPortId);
  const baseProfile = exportNode?.likelyCommodities ?? {
    wheatScore: 10,
    barleyScore: 10,
    cornScore: 10,
    soybeanMealScore: 10,
  };
  const terminalAdjustment = TERMINAL_TYPE_COMMODITY_ADJUSTMENT[terminal.terminalType];
  const blended = normalizeCommodityProfile({
    wheatScore: baseProfile.wheatScore + terminalAdjustment.wheatScore,
    barleyScore: baseProfile.barleyScore + terminalAdjustment.barleyScore,
    cornScore: baseProfile.cornScore + terminalAdjustment.cornScore,
    soybeanMealScore: baseProfile.soybeanMealScore + terminalAdjustment.soybeanMealScore,
  });

  return {
    id: `kb-${terminal.id}`,
    exportPortId: terminal.exportPortId,
    portId: exportNode?.portId ?? "unknown-port",
    portName: exportNode?.portName ?? terminal.exportPortId,
    portAliases: exportNode?.portAliases ?? [],
    terminalName: terminal.name,
    terminalAliases: [...terminal.aliases, ...terminal.terminalKeywords],
    terminalType: terminal.terminalType,
    country: exportNode?.country ?? "Unknown",
    region: exportNode?.region ?? "unknown_region",
    likelyCommodities: blended,
    likelyVesselClasses: exportNode?.likelyVesselClasses ?? ["supramax", "general_cargo"],
    likelyCorridors: exportNode?.likelyCorridors ?? [],
    likelyMoroccoDestinations: exportNode?.likelyMoroccoDestinations ?? DEFAULT_MOROCCO_DESTINATIONS,
    confidenceWeight:
      TERMINAL_CONFIDENCE_WEIGHT_BY_RELEVANCE[terminal.grainFeedRelevance],
  };
});

export const MOROCCO_DESTINATION_KNOWLEDGE: MoroccoDestinationKnowledgeProfile[] = [
  {
    id: "kb-dest-casablanca",
    portId: "port-casablanca",
    portName: "Casablanca",
    aliases: ["casablanca", "casa blanca", "macas", "casa"],
    grainRelevance: "high",
    feedRelevance: "high",
    likelyImportCommodities: { wheatScore: 18, barleyScore: 10, cornScore: 14, soybeanMealScore: 11 },
    confidenceWeight: 0.88,
    likelySourceRegions: ["western_europe", "black_sea", "us_gulf"],
  },
  {
    id: "kb-dest-jorf-lasfar",
    portId: "port-jorf-lasfar",
    portName: "Jorf Lasfar",
    aliases: ["jorf", "jorf lasfar", "majlf", "el jadida"],
    grainRelevance: "high",
    feedRelevance: "high",
    likelyImportCommodities: { wheatScore: 12, barleyScore: 10, cornScore: 16, soybeanMealScore: 14 },
    confidenceWeight: 0.86,
    likelySourceRegions: ["us_gulf", "south_atlantic", "black_sea"],
  },
  {
    id: "kb-dest-agadir",
    portId: "port-agadir",
    portName: "Agadir",
    aliases: ["agadir", "maaga"],
    grainRelevance: "medium",
    feedRelevance: "medium",
    likelyImportCommodities: { wheatScore: 8, barleyScore: 12, cornScore: 12, soybeanMealScore: 10 },
    confidenceWeight: 0.74,
    likelySourceRegions: ["western_europe", "south_atlantic"],
  },
  {
    id: "kb-dest-nador",
    portId: "port-nador",
    portName: "Nador",
    aliases: ["nador", "mandr"],
    grainRelevance: "medium",
    feedRelevance: "low",
    likelyImportCommodities: { wheatScore: 7, barleyScore: 10, cornScore: 9, soybeanMealScore: 7 },
    confidenceWeight: 0.66,
    likelySourceRegions: ["western_mediterranean", "black_sea"],
  },
  {
    id: "kb-dest-safi",
    portId: "port-safi",
    portName: "Safi",
    aliases: ["safi", "masfi"],
    grainRelevance: "medium",
    feedRelevance: "medium",
    likelyImportCommodities: { wheatScore: 8, barleyScore: 11, cornScore: 11, soybeanMealScore: 9 },
    confidenceWeight: 0.7,
    likelySourceRegions: ["western_europe", "south_atlantic", "black_sea"],
  },
  {
    id: "kb-dest-tanger-med",
    portId: "port-tanger-med",
    portName: "Tanger Med",
    aliases: ["tanger", "tangier", "matng", "tanger med"],
    grainRelevance: "low",
    feedRelevance: "low",
    likelyImportCommodities: { wheatScore: 6, barleyScore: 8, cornScore: 9, soybeanMealScore: 7 },
    confidenceWeight: 0.58,
    likelySourceRegions: ["western_mediterranean", "western_europe"],
  },
];

export const VESSEL_CLASS_KNOWLEDGE: VesselClassKnowledgeProfile[] = [
  {
    id: "handysize",
    label: "Handysize",
    typicalCargoCompatibility: "medium",
    typicalRoutePatterns: ["short-med dry bulk", "regional grain lots", "mixed feed cargoes"],
    moroccoTradeRelevance: "medium",
    commodityBias: { wheatScore: 2, barleyScore: 4, cornScore: 3, soybeanMealScore: 4 },
  },
  {
    id: "supramax",
    label: "Supramax",
    typicalCargoCompatibility: "high",
    typicalRoutePatterns: ["black sea to med", "western europe to morocco", "us gulf atlantic"],
    moroccoTradeRelevance: "high",
    commodityBias: { wheatScore: 4, barleyScore: 4, cornScore: 5, soybeanMealScore: 4 },
  },
  {
    id: "panamax",
    label: "Panamax",
    typicalCargoCompatibility: "high",
    typicalRoutePatterns: ["long-haul grain/feed parcels", "atlantic agri corridors"],
    moroccoTradeRelevance: "high",
    commodityBias: { wheatScore: 5, barleyScore: 3, cornScore: 6, soybeanMealScore: 5 },
  },
  {
    id: "general_cargo",
    label: "General Cargo",
    typicalCargoCompatibility: "medium",
    typicalRoutePatterns: ["mixed breakbulk routes", "smaller parcels toward morocco"],
    moroccoTradeRelevance: "medium",
    commodityBias: { wheatScore: 2, barleyScore: 2, cornScore: 2, soybeanMealScore: 2 },
  },
  {
    id: "other",
    label: "Other/Unknown",
    typicalCargoCompatibility: "low",
    typicalRoutePatterns: ["non-specific routing"],
    moroccoTradeRelevance: "low",
    commodityBias: { wheatScore: -2, barleyScore: -2, cornScore: -2, soybeanMealScore: -2 },
  },
];

const VESSEL_CLASS_BY_ID = new Map(
  VESSEL_CLASS_KNOWLEDGE.map((profile) => [profile.id, profile]),
);

const EXPORT_NODE_BY_PORT_ID = new Map(
  EXPORT_PORT_COMMODITY_KNOWLEDGE.map((node) => [node.portId, node]),
);

const EXPORT_NODE_BY_SEEDED_EXPORT_ID = new Map(
  EXPORT_PORT_COMMODITY_KNOWLEDGE.map((node) => [node.exportPortId, node]),
);

const TERMINAL_NODE_BY_TERMINAL_NAME = new Map(
  TERMINAL_COMMODITY_KNOWLEDGE.map((node) => [normalizeLooseText(node.terminalName), node]),
);

const DESTINATION_NODE_BY_PORT_ID = new Map(
  MOROCCO_DESTINATION_KNOWLEDGE.map((node) => [node.portId, node]),
);

const CORRIDOR_COMMODITY_KNOWLEDGE: Partial<Record<SeededCorridorId, CommodityWeightProfile>> = {
  western_europe_to_morocco_atlantic: { wheatScore: 7, barleyScore: 4, cornScore: 2, soybeanMealScore: 2 },
  black_sea_to_morocco_via_bosphorus_and_med: { wheatScore: 5, barleyScore: 6, cornScore: 5, soybeanMealScore: 2 },
  us_gulf_to_morocco_atlantic: { wheatScore: 2, barleyScore: 1, cornScore: 7, soybeanMealScore: 7 },
  south_atlantic_agri_to_morocco: { wheatScore: 1, barleyScore: 1, cornScore: 6, soybeanMealScore: 8 },
  gibraltar_approach_to_morocco: { wheatScore: 2, barleyScore: 2, cornScore: 2, soybeanMealScore: 2 },
  western_mediterranean_to_morocco: { wheatScore: 3, barleyScore: 3, cornScore: 3, soybeanMealScore: 2 },
};

function inferKnowledgeVesselClass(deadweight: number | null | undefined, vesselType: string) {
  const normalizedType = normalizeLooseText(vesselType);
  if (
    normalizedType.includes("container") ||
    normalizedType.includes("tanker") ||
    normalizedType.includes("passenger") ||
    normalizedType.includes("ro ro") ||
    normalizedType.includes("roro") ||
    normalizedType.includes("tug") ||
    normalizedType.includes("pusher") ||
    normalizedType.includes("inland") ||
    normalizedType.includes("fishing") ||
    normalizedType.includes("service") ||
    normalizedType.includes("support")
  ) {
    return "other";
  }
  if (normalizedType.includes("general cargo")) {
    return "general_cargo";
  }
  if (normalizedType.includes("panamax")) {
    return "panamax";
  }
  if (normalizedType.includes("supramax")) {
    return "supramax";
  }
  if (normalizedType.includes("handysize")) {
    return "handysize";
  }

  const dwt = typeof deadweight === "number" && Number.isFinite(deadweight) ? deadweight : 0;
  if (dwt >= 60_000 && dwt <= 95_000) {
    return "panamax";
  }
  if (dwt >= 35_000 && dwt < 60_000) {
    return "supramax";
  }
  if (dwt >= 10_000 && dwt < 35_000) {
    return "handysize";
  }
  return "other";
}

function matchExportKnowledgeNode(options: {
  departurePortId?: string | null;
  departurePortCode?: string | null;
  departurePortName?: string | null;
}) {
  if (options.departurePortId) {
    const byPortId = EXPORT_NODE_BY_PORT_ID.get(options.departurePortId);
    if (byPortId) {
      return byPortId;
    }
  }

  const exportMatch = matchSeededExportPort({
    unlocode: options.departurePortCode,
    name: options.departurePortName,
  });
  if (!exportMatch) {
    return null;
  }

  return EXPORT_NODE_BY_SEEDED_EXPORT_ID.get(exportMatch.port.id) ?? null;
}

function matchTerminalKnowledgeNode(options: {
  departurePortCode?: string | null;
  departurePortName?: string | null;
  departureTerminalText?: string | null;
  matchedTerminalName?: string | null;
}) {
  const terminalMatch = matchGrainLoadingTerminal({
    departurePortCode: options.departurePortCode,
    departurePortName: options.departurePortName,
    terminalText: options.departureTerminalText,
  });

  let terminalNode =
    terminalMatch.matchedTerminal
      ? TERMINAL_COMMODITY_KNOWLEDGE.find((node) => node.id === `kb-${terminalMatch.matchedTerminal}`) ?? null
      : null;

  if (!terminalNode && options.matchedTerminalName) {
    terminalNode = TERMINAL_NODE_BY_TERMINAL_NAME.get(normalizeLooseText(options.matchedTerminalName)) ?? null;
  }

  return {
    terminalNode,
    terminalMatch,
  };
}

function matchDestinationKnowledgeNode(options: {
  destinationPortId?: string | null;
  destinationText?: string | null;
}) {
  if (options.destinationPortId) {
    const byPortId = DESTINATION_NODE_BY_PORT_ID.get(options.destinationPortId);
    if (byPortId) {
      return byPortId;
    }
  }

  const normalizedDestinationText = normalizeLooseText(options.destinationText ?? "");
  if (!normalizedDestinationText) {
    return null;
  }

  return (
    MOROCCO_DESTINATION_KNOWLEDGE.find((node) =>
      node.aliases.some((alias) => normalizedDestinationText.includes(normalizeLooseText(alias))),
    ) ?? null
  );
}

export function deriveCommodityKnowledgeSnapshot(input: {
  departurePortId?: string | null;
  departurePortCode?: string | null;
  departurePortName?: string | null;
  departureTerminalText?: string | null;
  matchedTerminalName?: string | null;
  destinationPortId?: string | null;
  destinationText?: string | null;
  vesselType: string;
  deadweight?: number | null;
  corridorId?: SeededCorridorId | null;
}): CommodityKnowledgeSnapshot {
  const reasons: string[] = [];
  const commodityBias = emptyCommodityProfile();
  const vesselClassId = inferKnowledgeVesselClass(input.deadweight, input.vesselType);
  const vesselClassProfile = VESSEL_CLASS_BY_ID.get(vesselClassId) ?? VESSEL_CLASS_BY_ID.get("other");
  const vesselClassRelevance = vesselClassProfile?.moroccoTradeRelevance ?? "low";
  const classMultiplier =
    vesselClassRelevance === "high" ? 1 : vesselClassRelevance === "medium" ? 0.82 : 0.32;

  const exportNode = matchExportKnowledgeNode({
    departurePortId: input.departurePortId,
    departurePortCode: input.departurePortCode,
    departurePortName: input.departurePortName,
  });
  if (exportNode) {
    applyCommodityProfile(
      commodityBias,
      exportNode.likelyCommodities,
      exportNode.confidenceWeight * 0.7 * classMultiplier,
    );
    reasons.push(
      `${exportNode.portName} export profile supports ${exportNode.region.replaceAll("_", " ")} agri cargo tendencies.`,
    );
  }

  const terminalKnowledge = matchTerminalKnowledgeNode({
    departurePortCode: input.departurePortCode,
    departurePortName: input.departurePortName,
    departureTerminalText: input.departureTerminalText,
    matchedTerminalName: input.matchedTerminalName,
  });
  if (terminalKnowledge.terminalNode) {
    applyCommodityProfile(
      commodityBias,
      terminalKnowledge.terminalNode.likelyCommodities,
      terminalKnowledge.terminalNode.confidenceWeight * 0.75 * classMultiplier,
    );
    reasons.push(
      `${terminalKnowledge.terminalNode.terminalName} terminal profile favors weighted agri commodities.`,
    );
  } else if (terminalKnowledge.terminalMatch.exportPortMatched) {
    reasons.push("Terminal match is unresolved; using port-level commodity profile only.");
  }

  if (vesselClassProfile) {
    applyCommodityProfile(
      commodityBias,
      vesselClassProfile.commodityBias,
      vesselClassRelevance === "low" ? 1.1 : vesselClassRelevance === "medium" ? 0.9 : 1,
    );
    reasons.push(
      `Vessel class profile ${vesselClassProfile.label} matches typical ${vesselClassProfile.typicalCargoCompatibility} compatibility dry-bulk routes.`,
    );
  }

  const destinationNode = matchDestinationKnowledgeNode({
    destinationPortId: input.destinationPortId,
    destinationText: input.destinationText,
  });
  if (destinationNode) {
    applyCommodityProfile(
      commodityBias,
      destinationNode.likelyImportCommodities,
      destinationNode.confidenceWeight * (vesselClassRelevance === "low" ? 0.3 : 0.65),
    );
    reasons.push(
      `${destinationNode.portName} destination profile supports Morocco import-side commodity demand.`,
    );
  }

  const corridorNode = input.corridorId ? CORRIDOR_COMMODITY_KNOWLEDGE[input.corridorId] : null;
  if (input.corridorId && corridorNode) {
    applyCommodityProfile(
      commodityBias,
      corridorNode as CommodityWeightProfile,
      0.6 * Math.max(0.45, classMultiplier),
    );
    reasons.push(
      `${input.corridorId.replaceAll("_", " ")} corridor profile contributes commodity context.`,
    );
  }
  if (vesselClassRelevance === "low") {
    reasons.push("Knowledge weighting kept conservative because vessel class is not dry-bulk oriented.");
  }

  const normalizedBias = normalizeCommodityProfile(commodityBias);
  const biasMagnitude =
    (Math.abs(normalizedBias.wheatScore) +
      Math.abs(normalizedBias.barleyScore) +
      Math.abs(normalizedBias.cornScore) +
      Math.abs(normalizedBias.soybeanMealScore)) /
    4;

  const evidenceCoverage =
    (exportNode ? 1 : 0) +
    (terminalKnowledge.terminalNode ? 1 : 0) +
    (destinationNode ? 1 : 0) +
    (corridorNode ? 1 : 0);
  const structureSignal =
    (exportNode ? 3 : 0) +
    (terminalKnowledge.terminalNode ? 5 : 0) +
    (destinationNode ? 2 : 0) +
    (corridorNode ? 2 : 0);
  const classSignal = vesselClassRelevance === "high" ? 4 : vesselClassRelevance === "medium" ? 2 : -6;

  let agriSupportBoost = Math.round(structureSignal + classSignal);
  if (vesselClassRelevance === "low" && structureSignal <= 4) {
    agriSupportBoost -= 3;
  }
  agriSupportBoost = Math.max(-12, Math.min(14, agriSupportBoost));

  let commoditySupportBoost = -6;
  if (vesselClassRelevance === "low") {
    commoditySupportBoost = Math.round(biasMagnitude * 0.08) - 5;
  } else if (evidenceCoverage >= 3) {
    commoditySupportBoost = Math.round(biasMagnitude * 0.28) + 2;
  } else if (evidenceCoverage === 2) {
    commoditySupportBoost = Math.round(biasMagnitude * 0.16) - 1;
  } else if (evidenceCoverage === 1) {
    commoditySupportBoost = Math.round(biasMagnitude * 0.07) - 4;
  }
  commoditySupportBoost = Math.max(-10, Math.min(16, commoditySupportBoost));

  const knowledgeBase =
    (exportNode ? 30 : 0) +
    (terminalKnowledge.terminalNode ? 30 : 0) +
    (destinationNode ? 20 : 0) +
    (corridorNode ? 10 : 0) +
    (vesselClassRelevance === "high" ? 20 : vesselClassRelevance === "medium" ? 12 : 4);
  const knowledgeSupportScore = Math.max(
    0,
    Math.min(
      100,
      Math.round(knowledgeBase * (vesselClassRelevance === "low" ? 0.65 : 1)),
    ),
  );

  return {
    matchedCommodityKnowledgeNode:
      terminalKnowledge.terminalNode?.id ?? exportNode?.id ?? destinationNode?.id ?? null,
    terminalCommodityProfile: terminalKnowledge.terminalNode
      ? `${terminalKnowledge.terminalNode.terminalName} (${terminalKnowledge.terminalNode.terminalType})`
      : null,
    vesselClassKnowledgeProfile:
      vesselClassProfile?.label ?? "Other/Unknown",
    destinationKnowledgeProfile: destinationNode
      ? `${destinationNode.portName} (${destinationNode.grainRelevance}/${destinationNode.feedRelevance})`
      : null,
    knowledgeBasedCommodityReasons: reasons,
    commodityBias: normalizedBias,
    agriSupportBoost,
    commoditySupportBoost,
    knowledgeSupportScore,
    matchedTerminalIntelligence: Boolean(terminalKnowledge.terminalNode),
    matchedCommodityProfile: Boolean(exportNode || terminalKnowledge.terminalNode),
    destinationIntelligenceSupport: Boolean(destinationNode),
  };
}

export const MOROCCO_PORT_VARIANTS_BY_CODE: Record<string, string[]> = {
  MACAS: ["casablanca", "casa blanca", "ma cas", "macas", "casa"],
  MAJLF: ["jorf", "jorf lasfar", "jorf-lasfar", "el jadida", "ma jlf", "majlf"],
  MAAGA: ["agadir", "ma aga", "maaga"],
  MATNG: ["tanger med", "tanger", "tangier", "matng", "ma tng"],
  MANDR: ["nador", "mandr"],
  MASFI: ["safi", "masfi"],
};

const MOROCCO_DESTINATION_TERMS = new Set(
  Object.values(MOROCCO_PORT_VARIANTS_BY_CODE).flat().map((term) => normalizeLooseText(term)),
);
MOROCCO_DESTINATION_TERMS.add("morocco");
MOROCCO_DESTINATION_TERMS.add("maroc");

export function destinationLooksMorocco(text: string) {
  const normalized = normalizeLooseText(text);
  if (!normalized) {
    return false;
  }

  for (const term of Array.from(MOROCCO_DESTINATION_TERMS)) {
    if (normalized.includes(term)) {
      return true;
    }
  }
  return false;
}

export function destinationMatchesMoroccoCode(text: string, portCode: string) {
  const terms = MOROCCO_PORT_VARIANTS_BY_CODE[normalizeUnlocode(portCode)] ?? [];
  const normalizedText = normalizeLooseText(text);
  return terms.some((term) => normalizedText.includes(normalizeLooseText(term)));
}

export const SEEDED_CORRIDORS: SeededCorridorDefinition[] = [
  {
    id: "gibraltar_approach_to_morocco",
    label: "Gibraltar approach to Morocco",
    boundingBoxes: [
      [[34.7, -7.8], [36.8, -4.0]],
    ],
  },
  {
    id: "western_mediterranean_to_morocco",
    label: "Western Mediterranean to Morocco",
    boundingBoxes: [
      [[33.0, -2.5], [43.8, 16.0]],
    ],
  },
  {
    id: "black_sea_to_morocco_via_bosphorus_and_med",
    label: "Black Sea to Morocco via Bosphorus and Mediterranean",
    boundingBoxes: [
      [[40.0, 27.0], [47.2, 42.2]],
      [[38.0, 24.0], [41.8, 30.2]],
    ],
  },
  {
    id: "western_europe_to_morocco_atlantic",
    label: "Western Europe to Morocco Atlantic",
    boundingBoxes: [
      [[30.0, -14.5], [52.5, 2.8]],
    ],
  },
  {
    id: "us_gulf_to_morocco_atlantic",
    label: "US Gulf to Morocco Atlantic",
    boundingBoxes: [
      [[20.0, -99.0], [32.5, -75.0]],
      [[14.0, -78.0], [38.0, -20.0]],
    ],
  },
  {
    id: "south_atlantic_agri_to_morocco",
    label: "South Atlantic agri to Morocco",
    boundingBoxes: [
      [[-38.0, -66.0], [-10.0, -20.0]],
    ],
  },
];

export const AISSTREAM_SEEDED_BOUNDING_BOXES: CorridorBoundingBox[] = SEEDED_CORRIDORS.flatMap(
  (corridor) => corridor.boundingBoxes,
);
