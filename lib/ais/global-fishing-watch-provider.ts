import "@/lib/env";

import {
  MOROCCO_PORT_VARIANTS_BY_CODE,
  matchSeededExportPort,
  normalizeLooseText,
  SEEDED_EXPORT_PORTS,
} from "@/lib/data/live-intelligence-config";

const DEFAULT_GFW_BASE_URL = "https://gateway.api.globalfishingwatch.org";
const DEFAULT_TIMEOUT_MS = 12_000;
const DEFAULT_LOOKBACK_DAYS = 120;
const DEFAULT_CACHE_TTL_MS = 6 * 60 * 60 * 1000;

export type GfwEvidenceConfidence = "low" | "medium" | "high";

export interface GfwHistoricalProfile {
  enrichmentAttempted: boolean;
  enrichmentSuccess: boolean;
  endpointUsed: string | null;
  gfwHistoricalPortMatches: string[];
  gfwMoroccoVisitCount: number;
  gfwExportPortVisitCount: number;
  gfwHistoricalRouteHints: string[];
  gfwEvidenceConfidence: GfwEvidenceConfidence;
  gfwReasons: string[];
}

interface GfwRawPortVisit {
  portName: string;
  startTime: string | null;
  endTime: string | null;
}

interface CacheEntry {
  expiresAtMs: number;
  value: GfwHistoricalProfile;
}

function toNumber(value: unknown, fallback = 0) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return fallback;
}

function normalizeToken(value: string | undefined | null) {
  return (value ?? "").trim();
}

function normalizePortName(value: string) {
  return normalizeLooseText(value);
}

function hasMoroccoPortHint(portName: string) {
  const normalized = normalizePortName(portName);
  if (!normalized) {
    return false;
  }

  const moroccoTerms = Object.values(MOROCCO_PORT_VARIANTS_BY_CODE)
    .flat()
    .map((item) => normalizeLooseText(item));

  for (const term of moroccoTerms) {
    if (term && normalized.includes(term)) {
      return true;
    }
  }

  return normalized.includes("morocco") || normalized.includes("maroc");
}

function parseEventArray(payload: unknown): unknown[] {
  if (Array.isArray(payload)) {
    return payload;
  }

  if (!payload || typeof payload !== "object") {
    return [];
  }

  const root = payload as Record<string, unknown>;
  const candidates = [root.data, root.events, root.items, root.results];

  for (const item of candidates) {
    if (Array.isArray(item)) {
      return item;
    }
    if (item && typeof item === "object") {
      const objectItem = item as Record<string, unknown>;
      if (Array.isArray(objectItem.events)) {
        return objectItem.events;
      }
      if (Array.isArray(objectItem.items)) {
        return objectItem.items;
      }
      if (Array.isArray(objectItem.data)) {
        return objectItem.data;
      }
    }
  }

  return [];
}

function extractPortVisitFromEvent(event: unknown): GfwRawPortVisit | null {
  if (!event || typeof event !== "object") {
    return null;
  }

  const node = event as Record<string, unknown>;
  const portNameCandidates = [
    node.portName,
    node.port,
    node.port_label,
    node.portNameLabel,
    (node.port as Record<string, unknown> | undefined)?.name,
    (node.port as Record<string, unknown> | undefined)?.label,
    (node.location as Record<string, unknown> | undefined)?.name,
    (node.location as Record<string, unknown> | undefined)?.label,
    node.label,
    node.title,
    node.place,
    node.site,
  ];

  let portName = "";
  for (const candidate of portNameCandidates) {
    if (typeof candidate === "string" && candidate.trim()) {
      portName = candidate.trim();
      break;
    }
  }

  if (!portName) {
    return null;
  }

  const startTimeCandidates = [
    node.start,
    node.startTime,
    node.startDate,
    node.start_timestamp,
    node.date,
    node.timestamp,
  ];
  const endTimeCandidates = [
    node.end,
    node.endTime,
    node.endDate,
    node.end_timestamp,
  ];

  const firstValidTime = (values: unknown[]) => {
    for (const value of values) {
      if (typeof value === "string" && !Number.isNaN(new Date(value).getTime())) {
        return new Date(value).toISOString();
      }
    }
    return null;
  };

  return {
    portName,
    startTime: firstValidTime(startTimeCandidates),
    endTime: firstValidTime(endTimeCandidates),
  };
}

function confidenceFromCounts(params: {
  exportVisits: number;
  moroccoVisits: number;
  routeHints: number;
  matchedPorts: number;
}) {
  const support =
    params.exportVisits * 2 + params.moroccoVisits * 2 + params.routeHints + params.matchedPorts;

  if (params.exportVisits >= 2 && params.moroccoVisits >= 2 && support >= 9) {
    return "high" as const;
  }
  if ((params.exportVisits >= 1 && params.moroccoVisits >= 1) || support >= 5) {
    return "medium" as const;
  }
  return "low" as const;
}

export class GlobalFishingWatchProvider {
  private readonly token: string;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly cacheTtlMs: number;
  private readonly usageLogEnabled: boolean;
  private readonly cache = new Map<string, CacheEntry>();
  private readonly endpointUsage = new Map<string, number>();
  private loggedMissingToken = false;

  constructor(token = process.env.GFW_API_TOKEN ?? "") {
    this.token = normalizeToken(token);
    this.baseUrl = process.env.GFW_API_BASE_URL?.trim() || DEFAULT_GFW_BASE_URL;
    this.timeoutMs = Math.max(
      3_000,
      toNumber(process.env.GFW_REQUEST_TIMEOUT_MS, DEFAULT_TIMEOUT_MS),
    );
    this.cacheTtlMs = Math.max(
      30 * 60 * 1000,
      toNumber(process.env.GFW_CACHE_TTL_MINUTES, DEFAULT_CACHE_TTL_MS / 60_000) * 60_000,
    );
    this.usageLogEnabled = (process.env.RADAR_LOG_API_USAGE ?? "true").toLowerCase() !== "false";

    if (!this.token) {
      this.warnMissingTokenOnce();
    }
  }

  private warnMissingTokenOnce() {
    if (this.loggedMissingToken) {
      return;
    }
    this.loggedMissingToken = true;
    console.warn("Global Fishing Watch token not configured. GFW enrichment disabled.");
  }

  private logUsage(endpoint: string, context: string) {
    if (!this.usageLogEnabled) {
      return;
    }
    const key = `${endpoint}:${context}`;
    const count = (this.endpointUsage.get(key) ?? 0) + 1;
    this.endpointUsage.set(key, count);
    console.info(`[RadarUsage] provider=gfw endpoint=${endpoint} context="${context}" count=${count}`);
  }

  isEnabled() {
    return Boolean(this.token);
  }

  getToken() {
    return this.token;
  }

  private async requestJson(params: {
    path: string;
    method: "GET" | "POST";
    query?: Record<string, string | number>;
    body?: Record<string, unknown>;
    context: string;
  }) {
    if (!this.token) {
      this.warnMissingTokenOnce();
      throw new Error("GFW token missing.");
    }

    this.logUsage(params.path, params.context);

    const url = new URL(
      params.path.startsWith("http")
        ? params.path
        : `${this.baseUrl.replace(/\/+$/, "")}/${params.path.replace(/^\/+/, "")}`,
    );

    for (const [key, value] of Object.entries(params.query ?? {})) {
      url.searchParams.set(key, String(value));
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(url.toString(), {
        method: params.method,
        headers: {
          Authorization: `Bearer ${this.token}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: params.body ? JSON.stringify(params.body) : undefined,
        signal: controller.signal,
        cache: "no-store",
      });

      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          throw new Error("GFW authentication failed.");
        }
        if (response.status === 429) {
          throw new Error("GFW rate limit reached.");
        }
        throw new Error(`GFW request failed (${response.status} ${response.statusText}).`);
      }

      return await response.json();
    } finally {
      clearTimeout(timeout);
    }
  }

  private async fetchPortVisitEvents(params: {
    mmsi?: string | null;
    imo?: string | null;
    vesselName?: string | null;
    lookbackDays: number;
  }): Promise<{ events: GfwRawPortVisit[]; endpointUsed: string | null }> {
    const endDate = new Date().toISOString();
    const startDate = new Date(Date.now() - params.lookbackDays * 24 * 3_600_000).toISOString();
    const vesselQuery = params.mmsi?.trim() || params.imo?.trim() || params.vesselName?.trim() || "";

    if (!vesselQuery) {
      return { events: [], endpointUsed: null };
    }

    const candidates: Array<{
      path: string;
      method: "GET" | "POST";
      query?: Record<string, string | number>;
      body?: Record<string, unknown>;
    }> = [
      {
        path: "/v3/events",
        method: "GET",
        query: {
          mmsi: params.mmsi ?? "",
          imo: params.imo ?? "",
          vesselName: params.vesselName ?? "",
          startDate,
          endDate,
          limit: 250,
        },
      },
      {
        path: "/v2/events",
        method: "GET",
        query: {
          mmsi: params.mmsi ?? "",
          imo: params.imo ?? "",
          vesselName: params.vesselName ?? "",
          startDate,
          endDate,
          limit: 250,
        },
      },
      {
        path: "/v3/events/search",
        method: "POST",
        body: {
          mmsi: params.mmsi ?? undefined,
          imo: params.imo ?? undefined,
          vesselName: params.vesselName ?? undefined,
          startDate,
          endDate,
          limit: 250,
          eventType: "port_visit",
        },
      },
    ];

    for (const candidate of candidates) {
      try {
        const payload = await this.requestJson({
          ...candidate,
          context: `query=${vesselQuery}`,
        });
        const rawEvents = parseEventArray(payload);
        const visits = rawEvents
          .map((event) => extractPortVisitFromEvent(event))
          .filter((item): item is GfwRawPortVisit => Boolean(item));

        if (visits.length > 0) {
          return {
            events: visits,
            endpointUsed: candidate.path,
          };
        }
      } catch {
        continue;
      }
    }

    return {
      events: [],
      endpointUsed: null,
    };
  }

  async getHistoricalProfile(params: {
    mmsi?: string | null;
    imo?: string | null;
    vesselName?: string | null;
    lookbackDays?: number;
  }): Promise<GfwHistoricalProfile> {
    if (!this.token) {
      this.warnMissingTokenOnce();
      return {
        enrichmentAttempted: false,
        enrichmentSuccess: false,
        endpointUsed: null,
        gfwHistoricalPortMatches: [],
        gfwMoroccoVisitCount: 0,
        gfwExportPortVisitCount: 0,
        gfwHistoricalRouteHints: [],
        gfwEvidenceConfidence: "low",
        gfwReasons: ["GFW token missing; enrichment skipped."],
      };
    }

    const lookbackDays = Math.max(30, Math.min(365, params.lookbackDays ?? DEFAULT_LOOKBACK_DAYS));
    const identityKey = (params.mmsi ?? params.imo ?? params.vesselName ?? "").trim().toLowerCase();
    if (!identityKey) {
      return {
        enrichmentAttempted: false,
        enrichmentSuccess: false,
        endpointUsed: null,
        gfwHistoricalPortMatches: [],
        gfwMoroccoVisitCount: 0,
        gfwExportPortVisitCount: 0,
        gfwHistoricalRouteHints: [],
        gfwEvidenceConfidence: "low",
        gfwReasons: ["No vessel identity available for GFW lookup."],
      };
    }

    const cacheKey = `${identityKey}:${lookbackDays}`;
    const cached = this.cache.get(cacheKey);
    if (cached && cached.expiresAtMs > Date.now()) {
      return cached.value;
    }

    const reasons: string[] = [];
    try {
      const { events, endpointUsed } = await this.fetchPortVisitEvents({
        ...params,
        lookbackDays,
      });

      if (events.length === 0) {
        const emptyResult: GfwHistoricalProfile = {
          enrichmentAttempted: true,
          enrichmentSuccess: false,
          endpointUsed,
          gfwHistoricalPortMatches: [],
          gfwMoroccoVisitCount: 0,
          gfwExportPortVisitCount: 0,
          gfwHistoricalRouteHints: [],
          gfwEvidenceConfidence: "low",
          gfwReasons: ["No usable GFW port-visit events found for this vessel identity."],
        };
        this.cache.set(cacheKey, {
          expiresAtMs: Date.now() + this.cacheTtlMs,
          value: emptyResult,
        });
        return emptyResult;
      }

      const exportPortHits = new Map<string, number>();
      const moroccoHits = new Map<string, number>();
      const matchedPorts = new Set<string>();

      for (const event of events) {
        const exportMatch = matchSeededExportPort({
          name: event.portName,
        });
        if (exportMatch) {
          exportPortHits.set(
            exportMatch.port.id,
            (exportPortHits.get(exportMatch.port.id) ?? 0) + 1,
          );
          matchedPorts.add(exportMatch.port.name);
          continue;
        }

        if (hasMoroccoPortHint(event.portName)) {
          const normalizedPort = normalizePortName(event.portName);
          moroccoHits.set(normalizedPort, (moroccoHits.get(normalizedPort) ?? 0) + 1);
          matchedPorts.add(event.portName);
        }
      }

      const exportVisitCount = Array.from(exportPortHits.values()).reduce((sum, value) => sum + value, 0);
      const moroccoVisitCount = Array.from(moroccoHits.values()).reduce((sum, value) => sum + value, 0);

      const routeHints: string[] = [];
      const exportPortIds = Array.from(exportPortHits.keys());
      const corridorIds = new Set<string>();
      for (const exportPortId of exportPortIds) {
        const seeded = SEEDED_EXPORT_PORTS.find((port) => port.id === exportPortId);
        for (const corridorId of seeded?.corridorIds ?? []) {
          corridorIds.add(corridorId);
        }
      }

      if (exportVisitCount >= 2) {
        routeHints.push("Repeated seeded export-port visits detected via GFW.");
      } else if (exportVisitCount >= 1) {
        routeHints.push("Single seeded export-port visit detected via GFW.");
      }

      if (moroccoVisitCount >= 2) {
        routeHints.push("Repeated Morocco-side port visits detected via GFW.");
      } else if (moroccoVisitCount >= 1) {
        routeHints.push("At least one Morocco-side port visit detected via GFW.");
      }

      if (corridorIds.has("western_europe_to_morocco_atlantic")) {
        routeHints.push("Historical Western Europe corridor relevance detected via GFW.");
      }
      if (corridorIds.has("black_sea_to_morocco_via_bosphorus_and_med")) {
        routeHints.push("Historical Black Sea corridor relevance detected via GFW.");
      }
      if (corridorIds.has("south_atlantic_agri_to_morocco")) {
        routeHints.push("Historical South Atlantic corridor relevance detected via GFW.");
      }
      if (corridorIds.has("us_gulf_to_morocco_atlantic")) {
        routeHints.push("Historical US Gulf corridor relevance detected via GFW.");
      }

      const evidenceConfidence = confidenceFromCounts({
        exportVisits: exportVisitCount,
        moroccoVisits: moroccoVisitCount,
        routeHints: routeHints.length,
        matchedPorts: matchedPorts.size,
      });

      if (exportVisitCount > 0) {
        reasons.push(`GFW matched ${exportVisitCount} seeded export-port visit(s).`);
      }
      if (moroccoVisitCount > 0) {
        reasons.push(`GFW matched ${moroccoVisitCount} Morocco visit(s).`);
      }
      if (routeHints.length > 0) {
        reasons.push(...routeHints);
      }
      if (reasons.length === 0) {
        reasons.push("GFW returned events but they did not match seeded radar port intelligence.");
      }

      const normalizedResult: GfwHistoricalProfile = {
        enrichmentAttempted: true,
        enrichmentSuccess: true,
        endpointUsed,
        gfwHistoricalPortMatches: Array.from(matchedPorts).slice(0, 20),
        gfwMoroccoVisitCount: moroccoVisitCount,
        gfwExportPortVisitCount: exportVisitCount,
        gfwHistoricalRouteHints: routeHints.slice(0, 12),
        gfwEvidenceConfidence: evidenceConfidence,
        gfwReasons: reasons.slice(0, 16),
      };

      this.cache.set(cacheKey, {
        expiresAtMs: Date.now() + this.cacheTtlMs,
        value: normalizedResult,
      });

      return normalizedResult;
    } catch (error) {
      const message = error instanceof Error ? error.message : "unknown GFW error";
      return {
        enrichmentAttempted: true,
        enrichmentSuccess: false,
        endpointUsed: null,
        gfwHistoricalPortMatches: [],
        gfwMoroccoVisitCount: 0,
        gfwExportPortVisitCount: 0,
        gfwHistoricalRouteHints: [],
        gfwEvidenceConfidence: "low",
        gfwReasons: [`GFW enrichment failed: ${message}`],
      };
    }
  }
}
