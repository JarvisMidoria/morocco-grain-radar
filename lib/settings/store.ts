import fs from "fs";
import path from "path";
import "@/lib/env";

export type ThemePreference = "light" | "dark" | "system";
export type ProviderStatus = "connected" | "missing_key" | "invalid" | "error";
export type ProviderId =
  | "aisstream"
  | "globalFishingWatch"
  | "vesselfinder"
  | "datalastic"
  | "marinetraffic";
export type CoreRadarMode = "mock" | "live" | "hybrid";
export type RuntimeMode = "mock" | "live";
export type RuntimeProvider = "mock" | "vesselfinder" | "marinetraffic" | "hybrid";

interface ProviderSettings {
  enabled: boolean;
  apiKey: string;
  status: ProviderStatus;
  lastError: string | null;
  lastTestedAt: string | null;
}

interface FavoriteVessel {
  vesselId: string;
  timestamp: string;
}

export interface RadarSettingsStore {
  appearance: {
    theme: ThemePreference;
  };
  core: {
    radarDataMode: CoreRadarMode;
    refreshIntervalSeconds: number;
    rollingWindowHours: number;
    watchlistRetentionHours: number;
    reEnrichmentCadenceHours: number;
  };
  providers: Record<ProviderId, ProviderSettings>;
  favorites: FavoriteVessel[];
  updatedAt: string;
}

export interface PublicProviderSettings {
  enabled: boolean;
  hasKey: boolean;
  status: ProviderStatus;
  lastError: string | null;
  lastTestedAt: string | null;
}

export interface PublicRadarSettings {
  appearance: RadarSettingsStore["appearance"];
  core: RadarSettingsStore["core"];
  providers: Record<ProviderId, PublicProviderSettings>;
  favorites: FavoriteVessel[];
  updatedAt: string;
}

interface UpdateSettingsInput {
  appearance?: Partial<RadarSettingsStore["appearance"]>;
  core?: Partial<RadarSettingsStore["core"]>;
  providers?: Partial<Record<ProviderId, Partial<ProviderSettings>>>;
}

const SETTINGS_DIR = path.join(process.cwd(), ".radar");
const SETTINGS_FILE = path.join(SETTINGS_DIR, "settings.json");
const CACHE_TTL_MS = 2_000;

let cache: { loadedAt: number; settings: RadarSettingsStore } | null = null;

function normalizeCoreRadarMode(value?: string | null): CoreRadarMode {
  const normalized = value?.toLowerCase();
  if (normalized === "hybrid") {
    return "hybrid";
  }
  if (normalized === "live") {
    return "live";
  }
  return "mock";
}

function toNumber(value: unknown, fallback: number) {
  const parsed = Number(value);
  if (Number.isFinite(parsed)) {
    return parsed;
  }
  return fallback;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function hasValue(value: string | null | undefined) {
  return Boolean(value && value.trim().length > 0);
}

function getDefaultCoreMode(): CoreRadarMode {
  const envMode = (process.env.RADAR_DATA_MODE ?? "mock").toLowerCase();
  const envProvider = (process.env.AIS_PROVIDER ?? "mock").toLowerCase();
  if (envMode !== "live") {
    return "mock";
  }
  if (envProvider === "hybrid") {
    return "hybrid";
  }
  return "live";
}

function defaultProviderSettings(): Record<ProviderId, ProviderSettings> {
  return {
    aisstream: {
      enabled: true,
      apiKey: process.env.AISSTREAM_API_KEY ?? "",
      status: hasValue(process.env.AISSTREAM_API_KEY) ? "connected" : "missing_key",
      lastError: null,
      lastTestedAt: null,
    },
    globalFishingWatch: {
      enabled: true,
      apiKey: process.env.GFW_API_TOKEN ?? "",
      status: hasValue(process.env.GFW_API_TOKEN) ? "connected" : "missing_key",
      lastError: null,
      lastTestedAt: null,
    },
    vesselfinder: {
      enabled: false,
      apiKey: process.env.VESSELFINDER_API_KEY ?? "",
      status: hasValue(process.env.VESSELFINDER_API_KEY) ? "connected" : "missing_key",
      lastError: null,
      lastTestedAt: null,
    },
    datalastic: {
      enabled: true,
      apiKey: process.env.DATALASTIC_API_KEY ?? "",
      status: hasValue(process.env.DATALASTIC_API_KEY) ? "connected" : "missing_key",
      lastError: null,
      lastTestedAt: null,
    },
    marinetraffic: {
      enabled: false,
      apiKey: process.env.MARINETRAFFIC_API_KEY ?? "",
      status: hasValue(process.env.MARINETRAFFIC_API_KEY) ? "connected" : "missing_key",
      lastError: null,
      lastTestedAt: null,
    },
  };
}

function getDefaultSettingsStore(): RadarSettingsStore {
  return {
    appearance: {
      theme: "system",
    },
    core: {
      radarDataMode: getDefaultCoreMode(),
      refreshIntervalSeconds: clamp(toNumber(process.env.RADAR_REFRESH_INTERVAL_SECONDS, 40), 15, 300),
      rollingWindowHours: clamp(toNumber(process.env.RADAR_ROLLING_WINDOW_HOURS, 120), 24, 168),
      watchlistRetentionHours: clamp(toNumber(process.env.WATCHLIST_RETENTION_HOURS, 72), 24, 240),
      reEnrichmentCadenceHours: clamp(toNumber(process.env.WATCHLIST_REENRICH_HOURS, 8), 1, 48),
    },
    providers: defaultProviderSettings(),
    favorites: [],
    updatedAt: new Date().toISOString(),
  };
}

function normalizeTheme(value: unknown): ThemePreference {
  if (value === "light" || value === "dark" || value === "system") {
    return value;
  }
  return "system";
}

function normalizeProviderSettings(
  base: ProviderSettings,
  incoming: Partial<ProviderSettings> | undefined,
): ProviderSettings {
  if (!incoming) {
    return base;
  }

  const rawKey = typeof incoming.apiKey === "string" ? incoming.apiKey.trim() : null;
  const nextKey = rawKey !== null && rawKey.length > 0 ? rawKey : base.apiKey;
  const status = incoming.status ?? (hasValue(nextKey) ? "connected" : "missing_key");

  return {
    enabled: typeof incoming.enabled === "boolean" ? incoming.enabled : base.enabled,
    apiKey: nextKey,
    status,
    lastError: incoming.lastError ?? base.lastError ?? null,
    lastTestedAt: incoming.lastTestedAt ?? base.lastTestedAt ?? null,
  };
}

function normalizeFavorites(value: unknown): FavoriteVessel[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const favorites: FavoriteVessel[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object") {
      continue;
    }
    const vesselId = typeof (entry as FavoriteVessel).vesselId === "string"
      ? (entry as FavoriteVessel).vesselId.trim()
      : "";
    if (!vesselId) {
      continue;
    }
    favorites.push({
      vesselId,
      timestamp:
        typeof (entry as FavoriteVessel).timestamp === "string"
          ? (entry as FavoriteVessel).timestamp
          : new Date().toISOString(),
    });
  }

  const deduped = new Map<string, FavoriteVessel>();
  for (const favorite of favorites) {
    deduped.set(favorite.vesselId, favorite);
  }
  return Array.from(deduped.values()).sort((a, b) => b.timestamp.localeCompare(a.timestamp));
}

function normalizeSettings(raw: unknown): RadarSettingsStore {
  const defaults = getDefaultSettingsStore();
  if (!raw || typeof raw !== "object") {
    return defaults;
  }

  const typed = raw as Partial<RadarSettingsStore>;
  const providers = (typed.providers ?? {}) as Partial<Record<ProviderId, Partial<ProviderSettings>>>;

  return {
    appearance: {
      theme: normalizeTheme(typed.appearance?.theme),
    },
    core: {
      radarDataMode: normalizeCoreRadarMode(typed.core?.radarDataMode),
      refreshIntervalSeconds: clamp(
        toNumber(typed.core?.refreshIntervalSeconds, defaults.core.refreshIntervalSeconds),
        15,
        300,
      ),
      rollingWindowHours: clamp(toNumber(typed.core?.rollingWindowHours, defaults.core.rollingWindowHours), 24, 168),
      watchlistRetentionHours: clamp(
        toNumber(typed.core?.watchlistRetentionHours, defaults.core.watchlistRetentionHours),
        24,
        240,
      ),
      reEnrichmentCadenceHours: clamp(
        toNumber(typed.core?.reEnrichmentCadenceHours, defaults.core.reEnrichmentCadenceHours),
        1,
        48,
      ),
    },
    providers: {
      aisstream: normalizeProviderSettings(defaults.providers.aisstream, providers.aisstream),
      globalFishingWatch: normalizeProviderSettings(
        defaults.providers.globalFishingWatch,
        providers.globalFishingWatch,
      ),
      vesselfinder: normalizeProviderSettings(defaults.providers.vesselfinder, providers.vesselfinder),
      datalastic: normalizeProviderSettings(defaults.providers.datalastic, providers.datalastic),
      marinetraffic: normalizeProviderSettings(defaults.providers.marinetraffic, providers.marinetraffic),
    },
    favorites: normalizeFavorites(typed.favorites),
    updatedAt: typeof typed.updatedAt === "string" ? typed.updatedAt : new Date().toISOString(),
  };
}

function ensureSettingsDir() {
  if (!fs.existsSync(SETTINGS_DIR)) {
    fs.mkdirSync(SETTINGS_DIR, { recursive: true });
  }
}

function readFileSettings(): RadarSettingsStore {
  const now = Date.now();
  if (cache && now - cache.loadedAt <= CACHE_TTL_MS) {
    return cache.settings;
  }

  const defaults = getDefaultSettingsStore();
  ensureSettingsDir();

  if (!fs.existsSync(SETTINGS_FILE)) {
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(defaults, null, 2), "utf-8");
    cache = { loadedAt: now, settings: defaults };
    return defaults;
  }

  try {
    const raw = fs.readFileSync(SETTINGS_FILE, "utf-8");
    const parsed = raw ? JSON.parse(raw) : {};
    const normalized = normalizeSettings(parsed);
    cache = { loadedAt: now, settings: normalized };
    return normalized;
  } catch {
    cache = { loadedAt: now, settings: defaults };
    return defaults;
  }
}

function writeFileSettings(settings: RadarSettingsStore) {
  ensureSettingsDir();
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2), "utf-8");
  cache = { loadedAt: Date.now(), settings };
}

function toPublicProviderSettings(value: ProviderSettings): PublicProviderSettings {
  return {
    enabled: value.enabled,
    hasKey: hasValue(value.apiKey),
    status: value.status,
    lastError: value.lastError,
    lastTestedAt: value.lastTestedAt,
  };
}

function applyEnvOverrides(settings: RadarSettingsStore) {
  process.env.RADAR_REFRESH_INTERVAL_SECONDS = String(settings.core.refreshIntervalSeconds);
  process.env.RADAR_ROLLING_WINDOW_HOURS = String(settings.core.rollingWindowHours);
  process.env.WATCHLIST_RETENTION_HOURS = String(settings.core.watchlistRetentionHours);
  process.env.WATCHLIST_REENRICH_HOURS = String(settings.core.reEnrichmentCadenceHours);
  process.env.GFW_API_TOKEN = settings.providers.globalFishingWatch.apiKey;
}

export function getRadarSettingsStore() {
  const settings = readFileSettings();
  applyEnvOverrides(settings);
  return settings;
}

export function getPublicRadarSettings(): PublicRadarSettings {
  const settings = getRadarSettingsStore();

  return {
    appearance: settings.appearance,
    core: settings.core,
    providers: {
      aisstream: toPublicProviderSettings(settings.providers.aisstream),
      globalFishingWatch: toPublicProviderSettings(settings.providers.globalFishingWatch),
      vesselfinder: toPublicProviderSettings(settings.providers.vesselfinder),
      datalastic: toPublicProviderSettings(settings.providers.datalastic),
      marinetraffic: toPublicProviderSettings(settings.providers.marinetraffic),
    },
    favorites: settings.favorites,
    updatedAt: settings.updatedAt,
  };
}

export function updateRadarSettings(input: UpdateSettingsInput) {
  const current = getRadarSettingsStore();

  const next: RadarSettingsStore = {
    ...current,
    appearance: {
      theme: normalizeTheme(input.appearance?.theme ?? current.appearance.theme),
    },
    core: {
      radarDataMode: normalizeCoreRadarMode(input.core?.radarDataMode ?? current.core.radarDataMode),
      refreshIntervalSeconds: clamp(
        toNumber(input.core?.refreshIntervalSeconds, current.core.refreshIntervalSeconds),
        15,
        300,
      ),
      rollingWindowHours: clamp(toNumber(input.core?.rollingWindowHours, current.core.rollingWindowHours), 24, 168),
      watchlistRetentionHours: clamp(
        toNumber(input.core?.watchlistRetentionHours, current.core.watchlistRetentionHours),
        24,
        240,
      ),
      reEnrichmentCadenceHours: clamp(
        toNumber(input.core?.reEnrichmentCadenceHours, current.core.reEnrichmentCadenceHours),
        1,
        48,
      ),
    },
    providers: {
      aisstream: normalizeProviderSettings(current.providers.aisstream, input.providers?.aisstream),
      globalFishingWatch: normalizeProviderSettings(
        current.providers.globalFishingWatch,
        input.providers?.globalFishingWatch,
      ),
      vesselfinder: normalizeProviderSettings(current.providers.vesselfinder, input.providers?.vesselfinder),
      datalastic: normalizeProviderSettings(current.providers.datalastic, input.providers?.datalastic),
      marinetraffic: normalizeProviderSettings(current.providers.marinetraffic, input.providers?.marinetraffic),
    },
    favorites: current.favorites,
    updatedAt: new Date().toISOString(),
  };

  writeFileSettings(next);
  applyEnvOverrides(next);
  return next;
}

export function updateProviderStatus(
  providerId: ProviderId,
  status: ProviderStatus,
  options: { error?: string | null; testedAt?: string } = {},
) {
  const current = getRadarSettingsStore();
  const provider = current.providers[providerId];
  const nextProvider: ProviderSettings = {
    ...provider,
    status,
    lastError: options.error ?? null,
    lastTestedAt: options.testedAt ?? new Date().toISOString(),
  };

  const next: RadarSettingsStore = {
    ...current,
    providers: {
      ...current.providers,
      [providerId]: nextProvider,
    },
    updatedAt: new Date().toISOString(),
  };

  writeFileSettings(next);
  return next;
}

export function getProviderApiKey(providerId: ProviderId) {
  const settings = getRadarSettingsStore();
  const value = settings.providers[providerId].apiKey.trim();
  return value;
}

export function getFavoriteVessels() {
  return getRadarSettingsStore().favorites;
}

export function getFavoriteVesselIds() {
  return new Set(getRadarSettingsStore().favorites.map((favorite) => favorite.vesselId));
}

export function toggleFavoriteVessel(vesselId: string, favorite?: boolean) {
  const normalizedId = vesselId.trim();
  if (!normalizedId) {
    return {
      isFavorite: false,
      favorites: getFavoriteVessels(),
    };
  }

  const current = getRadarSettingsStore();
  const existing = new Set(current.favorites.map((entry) => entry.vesselId));
  const currentlyFavorite = existing.has(normalizedId);
  const shouldFavorite = typeof favorite === "boolean" ? favorite : !currentlyFavorite;

  const nextFavorites = current.favorites.filter((entry) => entry.vesselId !== normalizedId);
  if (shouldFavorite) {
    nextFavorites.unshift({ vesselId: normalizedId, timestamp: new Date().toISOString() });
  }

  const next: RadarSettingsStore = {
    ...current,
    favorites: nextFavorites,
    updatedAt: new Date().toISOString(),
  };

  writeFileSettings(next);

  return {
    isFavorite: shouldFavorite,
    favorites: next.favorites,
  };
}

export function getRuntimeSelectionFromSettings(): { mode: RuntimeMode; provider: RuntimeProvider } {
  const settings = getRadarSettingsStore();
  const mode = settings.core.radarDataMode;

  const aisstreamReady =
    settings.providers.aisstream.enabled && hasValue(settings.providers.aisstream.apiKey);
  const datalasticReady =
    settings.providers.datalastic.enabled && hasValue(settings.providers.datalastic.apiKey);
  const vesselfinderReady =
    settings.providers.vesselfinder.enabled && hasValue(settings.providers.vesselfinder.apiKey);
  const marinetrafficReady =
    settings.providers.marinetraffic.enabled && hasValue(settings.providers.marinetraffic.apiKey);

  if (mode === "mock") {
    return { mode: "mock", provider: "mock" };
  }

  if (mode === "hybrid") {
    return { mode: "live", provider: "hybrid" };
  }

  if (vesselfinderReady) {
    return { mode: "live", provider: "vesselfinder" };
  }

  if (marinetrafficReady) {
    return { mode: "live", provider: "marinetraffic" };
  }

  if (aisstreamReady && datalasticReady) {
    return { mode: "live", provider: "hybrid" };
  }

  const envMode = (process.env.RADAR_DATA_MODE ?? "mock").toLowerCase();
  const envProvider = (process.env.AIS_PROVIDER ?? "mock").toLowerCase();
  if (envMode === "live" && envProvider === "vesselfinder") {
    return { mode: "live", provider: "vesselfinder" };
  }
  if (envMode === "live" && envProvider === "marinetraffic") {
    return { mode: "live", provider: "marinetraffic" };
  }
  if (envMode === "live") {
    return { mode: "live", provider: "hybrid" };
  }
  return { mode: "mock", provider: "mock" };
}
