import fs from "node:fs";
import path from "node:path";
import type {
  ExportCommodityKnowledgeNode,
  MoroccoDestinationKnowledgeProfile,
  SeededCorridorId,
  TerminalCommodityKnowledgeNode,
  TerminalType,
} from "@/lib/data/live-intelligence-config";
import { getRadarLocalStoreDir } from "@/lib/storage/local-store";

export type KnowledgeOverrideKind = "export_origins" | "terminals" | "morocco_destinations";
export type KnowledgeOverrideMode = "append" | "replace";

interface KnowledgeOverrideStore {
  version: number;
  updatedAt: string | null;
  exportOrigins: ExportCommodityKnowledgeNode[];
  terminals: TerminalCommodityKnowledgeNode[];
  moroccoDestinations: MoroccoDestinationKnowledgeProfile[];
}

export interface KnowledgeOverrideSummary {
  updatedAt: string | null;
  exportOrigins: number;
  terminals: number;
  moroccoDestinations: number;
}

const CACHE_TTL_MS = 2_000;
const VALID_CORRIDOR_IDS = new Set<SeededCorridorId>([
  "western_europe_to_morocco_atlantic",
  "black_sea_to_morocco_via_bosphorus_and_med",
  "us_gulf_to_morocco_atlantic",
  "south_atlantic_agri_to_morocco",
  "gibraltar_approach_to_morocco",
  "western_mediterranean_to_morocco",
]);
const VALID_TERMINAL_TYPES = new Set<TerminalType>([
  "grain_terminal",
  "feed_terminal",
  "agri_bulk_terminal",
  "mixed_bulk_terminal",
  "unknown_terminal",
]);
const VALID_RELEVANCE_VALUES = new Set(["high", "medium", "low"]);

let cache: { loadedAt: number; store: KnowledgeOverrideStore } | null = null;

function nowIso() {
  return new Date().toISOString();
}

function getKnowledgeDir() {
  return getRadarLocalStoreDir();
}

function getKnowledgeOverridesFile() {
  return path.join(getKnowledgeDir(), "knowledge-overrides.json");
}

function ensureKnowledgeDir() {
  const knowledgeDir = getKnowledgeDir();
  if (!fs.existsSync(knowledgeDir)) {
    fs.mkdirSync(knowledgeDir, { recursive: true });
  }
}

function defaultStore(): KnowledgeOverrideStore {
  return {
    version: 1,
    updatedAt: null,
    exportOrigins: [],
    terminals: [],
    moroccoDestinations: [],
  };
}

function writeStore(store: KnowledgeOverrideStore) {
  ensureKnowledgeDir();
  fs.writeFileSync(getKnowledgeOverridesFile(), JSON.stringify(store, null, 2), "utf-8");
  cache = { loadedAt: Date.now(), store };
}

function sanitizeText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function sanitizeList(value: unknown) {
  if (Array.isArray(value)) {
    return Array.from(new Set(value.map((item) => sanitizeText(item)).filter(Boolean)));
  }
  return sanitizeText(value)
    .split(/[|;]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function sanitizeNumber(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function sanitizeCommodityProfile(raw: unknown) {
  const typed = raw as Partial<{
    wheatScore: number;
    barleyScore: number;
    cornScore: number;
    soybeanMealScore: number;
  }>;

  return {
    wheatScore: sanitizeNumber(typed?.wheatScore, 0),
    barleyScore: sanitizeNumber(typed?.barleyScore, 0),
    cornScore: sanitizeNumber(typed?.cornScore, 0),
    soybeanMealScore: sanitizeNumber(typed?.soybeanMealScore, 0),
  };
}

function normalizeExportOrigin(raw: unknown): ExportCommodityKnowledgeNode | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const typed = raw as Partial<ExportCommodityKnowledgeNode>;
  const portName = sanitizeText(typed.portName);
  const portId = sanitizeText(typed.portId) || `override-port-${portName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
  const exportPortId =
    sanitizeText(typed.exportPortId) || `override-export-${portName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
  if (!portName) {
    return null;
  }

  return {
    id: sanitizeText(typed.id) || `override-kb-export-${portName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
    exportPortId,
    portId,
    portName,
    portAliases: sanitizeList(typed.portAliases),
    country: sanitizeText(typed.country) || "Unknown",
    region: sanitizeText(typed.region) || "unknown_region",
    likelyCommodities: sanitizeCommodityProfile(typed.likelyCommodities),
    likelyVesselClasses: sanitizeList(typed.likelyVesselClasses),
    likelyCorridors: sanitizeList(typed.likelyCorridors).filter((item): item is SeededCorridorId =>
      VALID_CORRIDOR_IDS.has(item as SeededCorridorId),
    ),
    likelyMoroccoDestinations: sanitizeList(typed.likelyMoroccoDestinations),
    confidenceWeight: sanitizeNumber(typed.confidenceWeight, 0.7),
  };
}

function normalizeTerminal(raw: unknown): TerminalCommodityKnowledgeNode | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const typed = raw as Partial<TerminalCommodityKnowledgeNode>;
  const terminalName = sanitizeText(typed.terminalName);
  const portName = sanitizeText(typed.portName);
  if (!terminalName || !portName) {
    return null;
  }

  return {
    id:
      sanitizeText(typed.id) ||
      `override-kb-terminal-${terminalName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
    exportPortId:
      sanitizeText(typed.exportPortId) ||
      `override-export-${portName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
    portId: sanitizeText(typed.portId) || `override-port-${portName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
    portName,
    portAliases: sanitizeList(typed.portAliases),
    terminalName,
    terminalAliases: sanitizeList(typed.terminalAliases),
    terminalType: VALID_TERMINAL_TYPES.has(typed.terminalType as TerminalType)
      ? (typed.terminalType as TerminalType)
      : "unknown_terminal",
    country: sanitizeText(typed.country) || "Unknown",
    region: sanitizeText(typed.region) || "unknown_region",
    likelyCommodities: sanitizeCommodityProfile(typed.likelyCommodities),
    likelyVesselClasses: sanitizeList(typed.likelyVesselClasses),
    likelyCorridors: sanitizeList(typed.likelyCorridors).filter((item): item is SeededCorridorId =>
      VALID_CORRIDOR_IDS.has(item as SeededCorridorId),
    ),
    likelyMoroccoDestinations: sanitizeList(typed.likelyMoroccoDestinations),
    confidenceWeight: sanitizeNumber(typed.confidenceWeight, 0.7),
  };
}

function normalizeMoroccoDestination(raw: unknown): MoroccoDestinationKnowledgeProfile | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const typed = raw as Partial<MoroccoDestinationKnowledgeProfile>;
  const portName = sanitizeText(typed.portName);
  if (!portName) {
    return null;
  }

  const grainRelevance = sanitizeText(typed.grainRelevance);
  const feedRelevance = sanitizeText(typed.feedRelevance);

  return {
    id: sanitizeText(typed.id) || `override-kb-dest-${portName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
    portId: sanitizeText(typed.portId) || `override-dest-${portName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
    portName,
    aliases: sanitizeList(typed.aliases),
    grainRelevance: VALID_RELEVANCE_VALUES.has(grainRelevance) ? (grainRelevance as "high" | "medium" | "low") : "low",
    feedRelevance: VALID_RELEVANCE_VALUES.has(feedRelevance) ? (feedRelevance as "high" | "medium" | "low") : "low",
    likelyImportCommodities: sanitizeCommodityProfile(typed.likelyImportCommodities),
    confidenceWeight: sanitizeNumber(typed.confidenceWeight, 0.7),
    likelySourceRegions: sanitizeList(typed.likelySourceRegions),
  };
}

function normalizeStore(raw: unknown): KnowledgeOverrideStore {
  if (!raw || typeof raw !== "object") {
    return defaultStore();
  }

  const typed = raw as Partial<KnowledgeOverrideStore>;
  return {
    version: 1,
    updatedAt: sanitizeText(typed.updatedAt) || null,
    exportOrigins: Array.isArray(typed.exportOrigins)
      ? typed.exportOrigins.map((entry) => normalizeExportOrigin(entry)).filter((entry): entry is ExportCommodityKnowledgeNode => entry !== null)
      : [],
    terminals: Array.isArray(typed.terminals)
      ? typed.terminals.map((entry) => normalizeTerminal(entry)).filter((entry): entry is TerminalCommodityKnowledgeNode => entry !== null)
      : [],
    moroccoDestinations: Array.isArray(typed.moroccoDestinations)
      ? typed.moroccoDestinations
          .map((entry) => normalizeMoroccoDestination(entry))
          .filter((entry): entry is MoroccoDestinationKnowledgeProfile => entry !== null)
      : [],
  };
}

export function getKnowledgeOverrideStore() {
  const now = Date.now();
  if (cache && now - cache.loadedAt <= CACHE_TTL_MS) {
    return cache.store;
  }

  ensureKnowledgeDir();
  const knowledgeOverridesFile = getKnowledgeOverridesFile();
  if (!fs.existsSync(knowledgeOverridesFile)) {
    const store = defaultStore();
    writeStore(store);
    return store;
  }

  try {
    const raw = fs.readFileSync(knowledgeOverridesFile, "utf-8");
    const parsed = raw ? JSON.parse(raw) : {};
    const store = normalizeStore(parsed);
    cache = { loadedAt: now, store };
    return store;
  } catch {
    const store = defaultStore();
    writeStore(store);
    return store;
  }
}

export function getKnowledgeOverrideSummary(): KnowledgeOverrideSummary {
  const store = getKnowledgeOverrideStore();
  return {
    updatedAt: store.updatedAt,
    exportOrigins: store.exportOrigins.length,
    terminals: store.terminals.length,
    moroccoDestinations: store.moroccoDestinations.length,
  };
}

export function mergeKnowledgeNodes<T>(base: T[], overrides: T[], buildKey: (entry: T) => string) {
  const merged = new Map<string, T>();

  for (const entry of base) {
    merged.set(buildKey(entry), entry);
  }

  for (const entry of overrides) {
    merged.set(buildKey(entry), entry);
  }

  return Array.from(merged.values());
}

function keyForKind(kind: KnowledgeOverrideKind, entry: ExportCommodityKnowledgeNode | TerminalCommodityKnowledgeNode | MoroccoDestinationKnowledgeProfile) {
  if (kind === "export_origins") {
    const typed = entry as ExportCommodityKnowledgeNode;
    return typed.exportPortId || typed.portId || typed.portName.toLowerCase();
  }
  if (kind === "terminals") {
    const typed = entry as TerminalCommodityKnowledgeNode;
    return `${typed.portName.toLowerCase()}::${typed.terminalName.toLowerCase()}`;
  }
  const typed = entry as MoroccoDestinationKnowledgeProfile;
  return typed.portId || typed.portName.toLowerCase();
}

function clearStoreKind(store: KnowledgeOverrideStore, kind: KnowledgeOverrideKind) {
  if (kind === "export_origins") {
    return { ...store, exportOrigins: [] };
  }
  if (kind === "terminals") {
    return { ...store, terminals: [] };
  }
  return { ...store, moroccoDestinations: [] };
}

export function clearKnowledgeOverrides(kind: KnowledgeOverrideKind | "all") {
  const current = getKnowledgeOverrideStore();
  const next =
    kind === "all"
      ? { ...defaultStore(), updatedAt: nowIso() }
      : { ...clearStoreKind(current, kind), updatedAt: nowIso() };
  writeStore(next);
  return getKnowledgeOverrideSummary();
}

function parseCsvLine(line: string) {
  const values: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];

    if (char === "\"") {
      const next = line[index + 1];
      if (inQuotes && next === "\"") {
        current += "\"";
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      values.push(current);
      current = "";
      continue;
    }

    current += char;
  }

  values.push(current);
  return values.map((value) => value.trim());
}

function parseCsvRecords(csv: string) {
  const lines = csv
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length < 2) {
    return [];
  }

  const headers = parseCsvLine(lines[0]).map((header, index) =>
    index === 0 ? header.replace(/^\uFEFF/, "").trim() : header.trim(),
  );

  return lines.slice(1).map((line) => {
    const cells = parseCsvLine(line);
    return Object.fromEntries(headers.map((header, index) => [header, cells[index] ?? ""]));
  });
}

function parseExportOriginCsv(csv: string) {
  return parseCsvRecords(csv)
    .map((row) =>
      normalizeExportOrigin({
        id: row.id,
        exportPortId: row.exportPortId,
        portId: row.portId,
        portName: row.portName,
        portAliases: row.portAliases,
        country: row.country,
        region: row.region,
        likelyCommodities: {
          wheatScore: row.wheatScore,
          barleyScore: row.barleyScore,
          cornScore: row.cornScore,
          soybeanMealScore: row.soybeanMealScore,
        },
        likelyVesselClasses: row.likelyVesselClasses,
        likelyCorridors: row.likelyCorridors,
        likelyMoroccoDestinations: row.likelyMoroccoDestinations,
        confidenceWeight: row.confidenceWeight,
      }),
    )
    .filter((entry): entry is ExportCommodityKnowledgeNode => entry !== null);
}

function parseTerminalCsv(csv: string) {
  return parseCsvRecords(csv)
    .map((row) =>
      normalizeTerminal({
        id: row.id,
        exportPortId: row.exportPortId,
        portId: row.portId,
        portName: row.portName,
        portAliases: row.portAliases,
        terminalName: row.terminalName,
        terminalAliases: row.terminalAliases,
        terminalType: row.terminalType,
        country: row.country,
        region: row.region,
        likelyCommodities: {
          wheatScore: row.wheatScore,
          barleyScore: row.barleyScore,
          cornScore: row.cornScore,
          soybeanMealScore: row.soybeanMealScore,
        },
        likelyVesselClasses: row.likelyVesselClasses,
        likelyCorridors: row.likelyCorridors,
        likelyMoroccoDestinations: row.likelyMoroccoDestinations,
        confidenceWeight: row.confidenceWeight,
      }),
    )
    .filter((entry): entry is TerminalCommodityKnowledgeNode => entry !== null);
}

function parseMoroccoDestinationCsv(csv: string) {
  return parseCsvRecords(csv)
    .map((row) =>
      normalizeMoroccoDestination({
        id: row.id,
        portId: row.portId,
        portName: row.portName,
        aliases: row.aliases,
        grainRelevance: row.grainRelevance,
        feedRelevance: row.feedRelevance,
        likelyImportCommodities: {
          wheatScore: row.wheatScore,
          barleyScore: row.barleyScore,
          cornScore: row.cornScore,
          soybeanMealScore: row.soybeanMealScore,
        },
        confidenceWeight: row.confidenceWeight,
        likelySourceRegions: row.likelySourceRegions,
      }),
    )
    .filter((entry): entry is MoroccoDestinationKnowledgeProfile => entry !== null);
}

export function buildKnowledgeCsvTemplate(kind: KnowledgeOverrideKind) {
  if (kind === "export_origins") {
    return [
      "id,exportPortId,portId,portName,portAliases,country,region,wheatScore,barleyScore,cornScore,soybeanMealScore,likelyVesselClasses,likelyCorridors,likelyMoroccoDestinations,confidenceWeight",
      'override-kb-export-sines,override-export-sines,override-port-sines,Sines,"sines|ptsin",Portugal,western_europe,8,3,4,2,"supramax|panamax","western_europe_to_morocco_atlantic","Casablanca|Jorf Lasfar",0.82',
    ].join("\n");
  }

  if (kind === "terminals") {
    return [
      "id,exportPortId,portId,portName,portAliases,terminalName,terminalAliases,terminalType,country,region,wheatScore,barleyScore,cornScore,soybeanMealScore,likelyVesselClasses,likelyCorridors,likelyMoroccoDestinations,confidenceWeight",
      'override-kb-terminal-sines-cereal,override-export-sines,override-port-sines,Sines,"sines|ptsin",Sines Cereal Berth,"sines cereal|cereal berth",grain_terminal,Portugal,western_europe,9,4,4,1,"supramax|panamax","western_europe_to_morocco_atlantic","Casablanca|Jorf Lasfar",0.86',
    ].join("\n");
  }

  return [
    "id,portId,portName,aliases,grainRelevance,feedRelevance,wheatScore,barleyScore,cornScore,soybeanMealScore,confidenceWeight,likelySourceRegions",
    'override-kb-dest-kenitra,override-dest-kenitra,Kenitra,"kenitra|mehdiya",medium,low,7,4,5,2,0.68,"western_europe|western_mediterranean"',
  ].join("\n");
}

export function importKnowledgeOverrideCsv(input: {
  kind: KnowledgeOverrideKind;
  mode: KnowledgeOverrideMode;
  csv: string;
}) {
  const csv = input.csv.trim();
  if (!csv) {
    throw new Error("CSV payload is empty.");
  }

  const current = getKnowledgeOverrideStore();
  const next = { ...current };

  if (input.kind === "export_origins") {
    const imported = parseExportOriginCsv(csv);
    next.exportOrigins =
      input.mode === "replace"
        ? imported
        : mergeKnowledgeNodes(current.exportOrigins, imported, (entry) => keyForKind(input.kind, entry));
    next.updatedAt = nowIso();
    writeStore(next);
    return { importedCount: imported.length, summary: getKnowledgeOverrideSummary() };
  }

  if (input.kind === "terminals") {
    const imported = parseTerminalCsv(csv);
    next.terminals =
      input.mode === "replace"
        ? imported
        : mergeKnowledgeNodes(current.terminals, imported, (entry) => keyForKind(input.kind, entry));
    next.updatedAt = nowIso();
    writeStore(next);
    return { importedCount: imported.length, summary: getKnowledgeOverrideSummary() };
  }

  const imported = parseMoroccoDestinationCsv(csv);
  next.moroccoDestinations =
    input.mode === "replace"
      ? imported
      : mergeKnowledgeNodes(current.moroccoDestinations, imported, (entry) => keyForKind(input.kind, entry));
  next.updatedAt = nowIso();
  writeStore(next);
  return { importedCount: imported.length, summary: getKnowledgeOverrideSummary() };
}
