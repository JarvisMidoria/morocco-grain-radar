import { AISProvider } from "@/lib/ais/provider";
import {
  extractRecords,
  normalizeExpectedArrivalRecord,
  normalizePortCallRecord,
} from "@/lib/ais/vessel-finder-normalizer";
import { MOROCCO_PORT_KEYWORDS, PORTS } from "@/lib/data/mock-dataset";
import { LatestPosition, PortCallRecord, PortRecord, VesselRecord, VoyageRecord } from "@/lib/types";

const DEFAULT_BASE_URL = "https://api.vesselfinder.com";
const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_EXPECTED_ARRIVALS_LIMIT = 150;
const DEFAULT_EXPECTED_ARRIVALS_INTERVAL_MINUTES = 14_400;
const DEFAULT_PORT_CALLS_INTERVAL_MINUTES = 1_440;
const DEFAULT_WATCHLIST_TTL_MINUTES = 720;
const DEFAULT_USAGE_PROFILE = "low";

const PROFILE_INTERVAL_DEFAULTS = {
  low: {
    slowRefreshMinutes: 180,
    shortlistRefreshMinutes: 30,
  },
  medium: {
    slowRefreshMinutes: 60,
    shortlistRefreshMinutes: 10,
  },
} as const;

interface CacheEntry<T> {
  fetchedAt: number;
  value: T;
}

interface WatchlistEntry {
  vesselId: string;
  destinationPortCode: string;
  shortlisted: boolean;
  updatedAt: number;
}

function toPortLookupKey(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function toNumber(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  if (Number.isFinite(parsed)) {
    return parsed;
  }
  return fallback;
}

function normalizePortCode(value: string) {
  return value.trim().toUpperCase();
}

function isCacheFresh(entry: CacheEntry<unknown> | undefined, ttlMs: number) {
  if (!entry) {
    return false;
  }

  return Date.now() - entry.fetchedAt <= ttlMs;
}

function stringIncludesMoroccoHint(value: string) {
  const lower = value.toLowerCase();
  return MOROCCO_PORT_KEYWORDS.some((keyword) => lower.includes(keyword));
}

function toRouteHistory(
  existing: string[] | undefined,
  voyage: VoyageRecord,
) {
  const sequence = [
    ...(existing ?? []),
    voyage.departurePortId,
    voyage.previousPortId,
    voyage.destinationPortId,
  ];

  return sequence.filter((item, index) => Boolean(item) && sequence.indexOf(item) === index);
}

export class VesselFinderProvider implements AISProvider {
  private readonly baseUrl: string;
  private readonly requestTimeoutMs: number;
  private readonly expectedArrivalsLimit: number;
  private readonly expectedArrivalsIntervalMinutes: number;
  private readonly portCallsIntervalMinutes: number;
  private readonly usageProfile: "low" | "medium";
  private readonly slowRefreshMs: number;
  private readonly shortlistRefreshMs: number;
  private readonly watchlistTtlMs: number;
  private readonly usageLogEnabled: boolean;

  private readonly portsById = new Map<string, PortRecord>();
  private readonly portsByCode = new Map<string, PortRecord>();
  private readonly portsByName = new Map<string, PortRecord>();
  private readonly selectedExportPortIds = new Set<string>();

  private readonly vesselCache = new Map<string, VesselRecord>();
  private readonly voyageCache = new Map<string, VoyageRecord>();
  private readonly positionCache = new Map<string, LatestPosition>();
  private readonly historyCache = new Map<string, string[]>();
  private readonly watchlist = new Map<string, WatchlistEntry>();
  private readonly endpointUsageCounter = new Map<string, number>();

  private readonly expectedArrivalsCache = new Map<string, CacheEntry<VoyageRecord[]>>();
  private readonly portCallsCache = new Map<string, CacheEntry<PortCallRecord[]>>();

  constructor(private readonly apiKey: string) {
    this.baseUrl = process.env.VESSELFINDER_API_BASE_URL?.trim() || DEFAULT_BASE_URL;
    this.requestTimeoutMs = toNumber(process.env.VESSELFINDER_REQUEST_TIMEOUT_MS, DEFAULT_TIMEOUT_MS);
    this.expectedArrivalsLimit = toNumber(
      process.env.VESSELFINDER_EXPECTED_ARRIVALS_LIMIT,
      DEFAULT_EXPECTED_ARRIVALS_LIMIT,
    );
    this.expectedArrivalsIntervalMinutes = toNumber(
      process.env.VESSELFINDER_EXPECTED_ARRIVALS_INTERVAL_MINUTES,
      DEFAULT_EXPECTED_ARRIVALS_INTERVAL_MINUTES,
    );
    this.portCallsIntervalMinutes = toNumber(
      process.env.VESSELFINDER_PORT_CALLS_INTERVAL_MINUTES,
      DEFAULT_PORT_CALLS_INTERVAL_MINUTES,
    );
    const usageProfileCandidate = (process.env.RADAR_LIVE_USAGE_PROFILE ?? DEFAULT_USAGE_PROFILE).toLowerCase();
    this.usageProfile = usageProfileCandidate === "medium" ? "medium" : "low";
    const defaults = PROFILE_INTERVAL_DEFAULTS[this.usageProfile];
    const slowRefreshMinutes = toNumber(process.env.VESSELFINDER_SLOW_REFRESH_MINUTES, defaults.slowRefreshMinutes);
    const shortlistRefreshMinutes = toNumber(
      process.env.VESSELFINDER_SHORTLIST_REFRESH_MINUTES,
      defaults.shortlistRefreshMinutes,
    );
    this.slowRefreshMs = Math.max(1, slowRefreshMinutes) * 60 * 1000;
    this.shortlistRefreshMs = Math.max(1, shortlistRefreshMinutes) * 60 * 1000;
    this.watchlistTtlMs =
      Math.max(5, toNumber(process.env.VESSELFINDER_WATCHLIST_TTL_MINUTES, DEFAULT_WATCHLIST_TTL_MINUTES)) *
      60 *
      1000;
    this.usageLogEnabled = (process.env.RADAR_LOG_API_USAGE ?? "true").toLowerCase() !== "false";

    for (const port of PORTS) {
      const registered = this.registerDynamicPort(port);
      if (registered.isLikelyGrainOrigin) {
        this.selectedExportPortIds.add(registered.id);
      }
    }
  }

  private assertConfigured() {
    if (!this.apiKey) {
      throw new Error("VesselFinder API key is missing. Set VESSELFINDER_API_KEY.");
    }
  }

  private registerDynamicPort(port: PortRecord) {
    const normalizedCode = normalizePortCode(port.code);
    const normalizedName = toPortLookupKey(port.name);

    const existing = this.portsById.get(port.id) ?? this.portsByCode.get(normalizedCode);
    if (existing) {
      this.portsById.set(existing.id, existing);
      this.portsByCode.set(normalizedCode, existing);
      this.portsByName.set(normalizedName, existing);
      return existing;
    }

    const registered: PortRecord = {
      ...port,
      code: normalizedCode,
    };

    this.portsById.set(registered.id, registered);
    this.portsByCode.set(normalizedCode, registered);
    this.portsByName.set(normalizedName, registered);

    return registered;
  }

  private getPortByCode(portCode: string) {
    return this.portsByCode.get(normalizePortCode(portCode));
  }

  private pruneWatchlist() {
    const now = Date.now();
    for (const [vesselId, entry] of Array.from(this.watchlist.entries())) {
      if (now - entry.updatedAt > this.watchlistTtlMs) {
        this.watchlist.delete(vesselId);
      }
    }
  }

  private hasShortlistedVesselForPort(portCode: string) {
    const normalized = normalizePortCode(portCode);
    this.pruneWatchlist();
    for (const entry of Array.from(this.watchlist.values())) {
      if (entry.destinationPortCode === normalized && entry.shortlisted) {
        return true;
      }
    }
    return false;
  }

  private getPortRefreshMs(portCode: string) {
    return this.hasShortlistedVesselForPort(portCode) ? this.shortlistRefreshMs : this.slowRefreshMs;
  }

  private logApiUsage(endpoint: string, context: string) {
    if (!this.usageLogEnabled) {
      return;
    }

    const key = `${endpoint}:${context}`;
    const count = (this.endpointUsageCounter.get(key) ?? 0) + 1;
    this.endpointUsageCounter.set(key, count);

    console.info(
      `[RadarUsage] provider=vesselfinder endpoint=${endpoint} context="${context}" count=${count}`,
    );
  }

  private isPriorityVesselType(vesselType: string) {
    const normalized = vesselType.toLowerCase();
    return normalized.includes("bulk") || normalized.includes("general cargo") || normalized.includes("cargo");
  }

  private isSelectedExportPort(port: PortRecord | undefined) {
    if (!port) {
      return false;
    }
    return this.selectedExportPortIds.has(port.id) || port.isLikelyGrainOrigin;
  }

  private updateWatchlist(entry: WatchlistEntry) {
    this.watchlist.set(entry.vesselId, {
      ...entry,
      destinationPortCode: normalizePortCode(entry.destinationPortCode),
      updatedAt: Date.now(),
    });
  }

  private async request(pathname: string, params: Record<string, string | number>, context: string) {
    this.assertConfigured();
    this.logApiUsage(pathname, context);

    const url = new URL(pathname.replace(/^\//, ""), this.baseUrl.endsWith("/") ? this.baseUrl : `${this.baseUrl}/`);
    url.searchParams.set("userkey", this.apiKey);
    url.searchParams.set("format", "json");

    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, String(value));
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.requestTimeoutMs);

    try {
      const response = await fetch(url.toString(), {
        method: "GET",
        cache: "no-store",
        signal: controller.signal,
      });

      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          throw new Error("VesselFinder authentication failed (invalid API key or permissions).");
        }
        if (response.status === 429) {
          throw new Error("VesselFinder rate limit reached. Reduce refresh frequency or wait before retrying.");
        }
        throw new Error(`VesselFinder request failed (${response.status} ${response.statusText}).`);
      }

      const payload = (await response.json()) as unknown;
      if (payload && typeof payload === "object") {
        const objectPayload = payload as Record<string, unknown>;
        const error = objectPayload.error ?? objectPayload.ERROR ?? objectPayload.message;
        if (typeof error === "string" && error.trim()) {
          throw new Error(`VesselFinder API error: ${error}`);
        }
      }

      return payload;
    } finally {
      clearTimeout(timeout);
    }
  }

  async getExpectedArrivals(portCode: string): Promise<VoyageRecord[]> {
    const normalizedCode = normalizePortCode(portCode);
    const refreshMs = this.getPortRefreshMs(normalizedCode);
    const cached = this.expectedArrivalsCache.get(normalizedCode);
    if (isCacheFresh(cached, refreshMs)) {
      return cached?.value ?? [];
    }

    const queryPort = this.getPortByCode(normalizedCode);
    if (!queryPort) {
      return [];
    }

    // Strategy A (destination-scoped): only request real arrivals for Morocco destinations.
    if (!queryPort.isMoroccoDestination) {
      return [];
    }

    const hasShortlist = this.hasShortlistedVesselForPort(queryPort.code);
    const usageContext = `port=${queryPort.code} refresh=${hasShortlist ? "shortlist" : "slow"} profile=${this.usageProfile}`;
    const payload = await this.request(
      "expectedarrivals",
      {
        locode: queryPort.code,
        interval: this.expectedArrivalsIntervalMinutes,
        limit: this.expectedArrivalsLimit,
        extradata: "voyage,master",
      },
      usageContext,
    );

    const now = new Date();
    const records = extractRecords(payload);
    const voyages: VoyageRecord[] = [];

    for (const record of records) {
      const normalized = normalizeExpectedArrivalRecord(record, {
        knownPortsByCode: this.portsByCode,
        knownPortsByName: this.portsByName,
        registerDynamicPort: (port) => this.registerDynamicPort(port),
        queryPort,
        now,
      });

      if (!normalized) {
        continue;
      }

      const destinationPort = this.portsById.get(normalized.voyage.destinationPortId);
      const departurePort = this.portsById.get(normalized.voyage.departurePortId);
      const previousPort = this.portsById.get(normalized.voyage.previousPortId);
      const candidateDestinationText = normalized.voyage.destinationText;
      const destinationLooksMorocco =
        Boolean(destinationPort?.isMoroccoDestination) || stringIncludesMoroccoHint(candidateDestinationText);
      const fromSelectedExport =
        this.isSelectedExportPort(departurePort) || this.isSelectedExportPort(previousPort);
      const priorityType = this.isPriorityVesselType(normalized.vessel.vesselType);

      if (!destinationLooksMorocco) {
        continue;
      }

      // Cost-aware prioritization: ingest mostly dry cargo lanes.
      if (!priorityType && !fromSelectedExport) {
        continue;
      }

      const shortlisted = priorityType && (fromSelectedExport || destinationLooksMorocco);
      this.updateWatchlist({
        vesselId: normalized.vessel.id,
        destinationPortCode: queryPort.code,
        shortlisted,
        updatedAt: Date.now(),
      });

      this.vesselCache.set(normalized.vessel.id, normalized.vessel);
      this.voyageCache.set(normalized.voyage.vesselId, normalized.voyage);
      this.positionCache.set(normalized.position.vesselId, normalized.position);
      this.historyCache.set(
        normalized.vessel.id,
        toRouteHistory(this.historyCache.get(normalized.vessel.id), normalized.voyage),
      );

      voyages.push(normalized.voyage);
    }

    this.expectedArrivalsCache.set(normalizedCode, {
      fetchedAt: Date.now(),
      value: voyages,
    });

    return voyages;
  }

  async getPortCalls(portCode: string): Promise<PortCallRecord[]> {
    const normalizedCode = normalizePortCode(portCode);
    if (!this.hasShortlistedVesselForPort(normalizedCode)) {
      return [];
    }

    const cached = this.portCallsCache.get(normalizedCode);
    const portCallRefreshMs = Math.max(1, this.portCallsIntervalMinutes) * 60 * 1000;
    if (isCacheFresh(cached, portCallRefreshMs)) {
      return cached?.value ?? [];
    }

    const port = this.getPortByCode(normalizedCode);
    if (!port) {
      return [];
    }

    try {
      const payload = await this.request(
        "portcalls",
        {
          locode: port.code,
          interval: this.portCallsIntervalMinutes,
          limit: 60,
          extradata: "ais",
        },
        `port=${port.code} shortlist-only`,
      );

      const records = extractRecords(payload);
      const now = new Date();
      const portCalls = records.map((record) => normalizePortCallRecord({ record, port, now }));

      this.portCallsCache.set(normalizedCode, {
        fetchedAt: Date.now(),
        value: portCalls,
      });

      return portCalls;
    } catch {
      return [];
    }
  }

  async getVesselDetails(vesselId: string): Promise<VesselRecord | null> {
    this.assertConfigured();
    return this.vesselCache.get(vesselId) ?? null;
  }

  async getLatestPositions(vesselIds: string[]): Promise<LatestPosition[]> {
    this.assertConfigured();
    return vesselIds
      .map((vesselId) => this.positionCache.get(vesselId))
      .filter((position): position is LatestPosition => Boolean(position));
  }

  async getVoyageData(vesselIds: string[]): Promise<VoyageRecord[]> {
    this.assertConfigured();
    return vesselIds
      .map((vesselId) => this.voyageCache.get(vesselId))
      .filter((voyage): voyage is VoyageRecord => Boolean(voyage));
  }

  async getPorts(): Promise<PortRecord[]> {
    this.assertConfigured();
    return Array.from(this.portsById.values());
  }

  async getHistoricalRoutePattern(vesselId: string): Promise<string[]> {
    this.assertConfigured();
    return this.historyCache.get(vesselId) ?? [];
  }
}
