import { AISProvider } from "@/lib/ais/provider";
import { HybridAISProvider } from "@/lib/ais/hybrid-provider";
import { MarineTrafficProvider } from "@/lib/ais/marine-traffic-provider";
import { MockAISProvider } from "@/lib/ais/mock-provider";
import { VesselFinderProvider } from "@/lib/ais/vessel-finder-provider";
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
  const selectionKey = `${mode}:${provider}`;
  if (selectionKey === loggedSelectionKey) {
    return;
  }

  loggedSelectionKey = selectionKey;
  console.info(`RADAR DATA MODE: ${mode}`);
  console.info(`AIS PROVIDER: ${provider}`);
  console.log("GFW token detected:", Boolean(process.env.GFW_API_TOKEN));

  if (provider === "hybrid") {
    console.info(`AISSTREAM: ${process.env.AISSTREAM_API_KEY ? "connected" : "missing API key"}`);
    console.info(`DATALASTIC: ${process.env.DATALASTIC_API_KEY ? "connected" : "missing API key"}`);
  }

  if (provider === "vesselfinder") {
    console.info(`VESSELFINDER: ${process.env.VESSELFINDER_API_KEY ? "connected" : "missing API key"}`);
  }

  if (provider === "marinetraffic") {
    console.info(`MARINETRAFFIC: ${process.env.MARINETRAFFIC_API_KEY ? "connected" : "missing API key"}`);
  }
}

function createProvider(options: ProviderOptions = {}): AISProvider {
  const { mode, provider } = resolveProviderSelection(options);

  logProviderSelection(mode, provider);

  if (mode === "mock") {
    return new MockAISProvider();
  }

  if (provider === "hybrid") {
    return new HybridAISProvider(
      process.env.AISSTREAM_API_KEY ?? "",
      process.env.DATALASTIC_API_KEY ?? "",
    );
  }

  if (provider === "marinetraffic") {
    return new MarineTrafficProvider(process.env.MARINETRAFFIC_API_KEY ?? "");
  }

  if (provider === "vesselfinder") {
    return new VesselFinderProvider(process.env.VESSELFINDER_API_KEY ?? "");
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
