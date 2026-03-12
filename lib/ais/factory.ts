import { AISProvider } from "@/lib/ais/provider";
import { HybridAISProvider } from "@/lib/ais/hybrid-provider";
import { MarineTrafficProvider } from "@/lib/ais/marine-traffic-provider";
import { MockAISProvider } from "@/lib/ais/mock-provider";
import { VesselFinderProvider } from "@/lib/ais/vessel-finder-provider";
import { getProviderApiKey, getRadarSettingsStore } from "@/lib/settings/store";
import {
  getRadarRuntimeConfig,
  RadarDataMode,
  RadarProvider,
} from "@/lib/radar/runtime-config";

let providerSingleton: AISProvider | null = null;
let providerSingletonKey = "";
let loggedSelectionKey = "";

interface ProviderOptions {
  forceMode?: RadarDataMode;
  forceProvider?: RadarProvider;
}

function resolveProviderSelection(options: ProviderOptions = {}) {
  const runtime = getRadarRuntimeConfig();
  const mode = options.forceMode ?? runtime.mode;
  const provider = options.forceProvider ?? runtime.provider;
  return { mode, provider };
}

function logProviderSelection(mode: RadarDataMode, provider: RadarProvider) {
  const aisstreamKey = getProviderApiKey("aisstream");
  const datalasticKey = getProviderApiKey("datalastic");
  const vesselfinderKey = getProviderApiKey("vesselfinder");
  const marinetrafficKey = getProviderApiKey("marinetraffic");
  const gfwToken = getProviderApiKey("globalFishingWatch");

  const selectionKey = `${mode}:${provider}`;
  if (selectionKey === loggedSelectionKey) {
    return;
  }

  loggedSelectionKey = selectionKey;
  console.info(`RADAR DATA MODE: ${mode}`);
  console.info(`AIS PROVIDER: ${provider}`);
  console.log("GFW token detected:", Boolean(gfwToken));

  if (provider === "hybrid") {
    console.info(`AISSTREAM: ${aisstreamKey ? "connected" : "missing API key"}`);
    console.info(`DATALASTIC: ${datalasticKey ? "connected" : "missing API key"}`);
  }

  if (provider === "vesselfinder") {
    console.info(`VESSELFINDER: ${vesselfinderKey ? "connected" : "missing API key"}`);
  }

  if (provider === "marinetraffic") {
    console.info(`MARINETRAFFIC: ${marinetrafficKey ? "connected" : "missing API key"}`);
  }
}

function createProvider(options: ProviderOptions = {}): AISProvider {
  const { mode, provider } = resolveProviderSelection(options);
  const settings = getRadarSettingsStore();
  const aisstreamKey = getProviderApiKey("aisstream");
  const datalasticKey = getProviderApiKey("datalastic");
  const marinetrafficKey = getProviderApiKey("marinetraffic");
  const vesselfinderKey = getProviderApiKey("vesselfinder");
  const gfwToken = getProviderApiKey("globalFishingWatch");

  logProviderSelection(mode, provider);

  if (mode === "mock") {
    return new MockAISProvider();
  }

  if (provider === "hybrid") {
    process.env.RADAR_ROLLING_WINDOW_HOURS = String(settings.core.rollingWindowHours);
    process.env.WATCHLIST_RETENTION_HOURS = String(settings.core.watchlistRetentionHours);
    process.env.WATCHLIST_REENRICH_HOURS = String(settings.core.reEnrichmentCadenceHours);
    process.env.GFW_API_TOKEN = gfwToken;
    return new HybridAISProvider(aisstreamKey, datalasticKey);
  }

  if (provider === "marinetraffic") {
    return new MarineTrafficProvider(marinetrafficKey);
  }

  if (provider === "vesselfinder") {
    return new VesselFinderProvider(vesselfinderKey);
  }

  return new MockAISProvider();
}

export function getAISProvider(): AISProvider {
  const { mode, provider } = resolveProviderSelection();
  const key = `${mode}:${provider}`;

  if (providerSingleton && providerSingletonKey === key) {
    return providerSingleton;
  }

  providerSingleton = createProvider({ forceMode: mode, forceProvider: provider });
  providerSingletonKey = key;
  return providerSingleton;
}

export function getMockAISProvider(): AISProvider {
  return createProvider({ forceMode: "mock", forceProvider: "mock" });
}

export function resetAISProviderCache() {
  providerSingleton = null;
  providerSingletonKey = "";
  loggedSelectionKey = "";
}

export function getAISProviderForSelection(options: ProviderOptions): AISProvider {
  return createProvider(options);
}
