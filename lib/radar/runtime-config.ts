import "@/lib/env";
import { getProviderApiKey, getRuntimeSelectionFromSettings } from "@/lib/settings/store";

export type RadarDataMode = "mock" | "live";

export type RadarProvider = "mock" | "vesselfinder" | "marinetraffic" | "hybrid";

export interface RadarRuntimeConfig {
  mode: RadarDataMode;
  provider: RadarProvider;
  liveProviderImplemented: boolean;
  validationError: string | null;
}

interface RuntimeOverrides {
  forceMode?: RadarDataMode;
  forceProvider?: RadarProvider;
}

function normalizeMode(value?: string | null): RadarDataMode {
  return value?.toLowerCase() === "live" ? "live" : "mock";
}

function normalizeProvider(value?: string | null): RadarProvider {
  const provider = value?.toLowerCase();

  if (provider === "vesselfinder") {
    return "vesselfinder";
  }

  if (provider === "marinetraffic") {
    return "marinetraffic";
  }

  if (provider === "hybrid") {
    return "hybrid";
  }

  return "mock";
}

export function getRadarRuntimeConfig(overrides: RuntimeOverrides = {}): RadarRuntimeConfig {
  const selection = getRuntimeSelectionFromSettings();
  const mode = overrides.forceMode ?? normalizeMode(selection.mode);
  const selectedProvider =
    overrides.forceProvider ??
    normalizeProvider(selection.provider) ??
    normalizeProvider(process.env.AIS_PROVIDER);
  const provider =
    mode === "mock"
      ? "mock"
      : selectedProvider === "mock"
        ? normalizeProvider(process.env.AIS_PROVIDER) === "mock"
          ? "hybrid"
          : normalizeProvider(process.env.AIS_PROVIDER)
        : selectedProvider;

  if (mode === "mock") {
    return {
      mode,
      provider,
      liveProviderImplemented: false,
      validationError: null,
    };
  }

  if (provider === "marinetraffic") {
    return {
      mode,
      provider,
      liveProviderImplemented: false,
      validationError:
        "Live mode is enabled but MarineTraffic integration is not implemented yet. Set AIS_PROVIDER=hybrid, AIS_PROVIDER=vesselfinder, or RADAR_DATA_MODE=mock.",
    };
  }

  if (provider === "hybrid") {
    if (!getProviderApiKey("aisstream")) {
      return {
        mode,
        provider,
        liveProviderImplemented: true,
        validationError:
          "Live mode with AIS_PROVIDER=hybrid requires AISSTREAM_API_KEY. Set it in settings or switch to RADAR_DATA_MODE=mock.",
      };
    }

    if (!getProviderApiKey("datalastic")) {
      return {
        mode,
        provider,
        liveProviderImplemented: true,
        validationError:
          "Live mode with AIS_PROVIDER=hybrid requires DATALASTIC_API_KEY. Set it in settings or switch to RADAR_DATA_MODE=mock.",
      };
    }

    return {
      mode,
      provider,
      liveProviderImplemented: true,
      validationError: null,
    };
  }

  if (provider === "vesselfinder") {
    if (!getProviderApiKey("vesselfinder")) {
      return {
        mode,
        provider,
        liveProviderImplemented: true,
        validationError:
          "Live mode requires VESSELFINDER_API_KEY. Set it in settings or switch to RADAR_DATA_MODE=mock.",
      };
    }

    return {
      mode,
      provider,
      liveProviderImplemented: true,
      validationError: null,
    };
  }

  return {
    mode,
    provider,
    liveProviderImplemented: false,
    validationError:
      "Live mode is enabled but AIS_PROVIDER is invalid. Supported live providers are hybrid and vesselfinder. Set AIS_PROVIDER=hybrid, AIS_PROVIDER=vesselfinder, or RADAR_DATA_MODE=mock.",
  };
}

export function getRuntimeSourceLabel(config = getRadarRuntimeConfig()) {
  if (config.mode === "mock") {
    return "Mock data";
  }

  if (config.provider === "hybrid") {
    return "Live AIS data · Hybrid (AISStream + Datalastic)";
  }

  if (config.provider === "vesselfinder") {
    return "Live AIS data · VesselFinder";
  }

  if (config.provider === "marinetraffic") {
    return "Live AIS data · MarineTraffic";
  }

  return "Live AIS data";
}
