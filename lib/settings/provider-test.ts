import { getProviderApiKey, ProviderId, ProviderStatus } from "@/lib/settings/store";

export interface ProviderTestResult {
  provider: ProviderId;
  status: ProviderStatus;
  message: string;
  testedAt: string;
}

function hasValue(value: string | null | undefined) {
  return Boolean(value && value.trim().length > 0);
}

function defaultInvalidMessage(provider: ProviderId) {
  return `${provider} API key format looks invalid.`;
}

function looksValidApiKey(provider: ProviderId, key: string) {
  const normalized = key.trim();
  if (!normalized) {
    return false;
  }

  if (provider === "datalastic") {
    return /^[a-z0-9-]{24,}$/i.test(normalized);
  }

  if (provider === "globalFishingWatch") {
    return normalized.startsWith("eyJ") && normalized.length > 120;
  }

  return normalized.length >= 12;
}

async function fetchWithTimeout(url: string, init: RequestInit = {}, timeoutMs = 8_000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function testDatalastic(key: string): Promise<ProviderTestResult> {
  const testedAt = new Date().toISOString();
  const url = `https://api.datalastic.com/api/v0/port_find?api-key=${encodeURIComponent(key)}&name=casablanca&limit=1`;
  try {
    const response = await fetchWithTimeout(url, {}, 10_000);
    if (response.status === 401 || response.status === 403) {
      return {
        provider: "datalastic",
        status: "invalid",
        message: "Datalastic key rejected (unauthorized).",
        testedAt,
      };
    }
    if (!response.ok) {
      return {
        provider: "datalastic",
        status: "error",
        message: `Datalastic test failed (${response.status}).`,
        testedAt,
      };
    }
    return {
      provider: "datalastic",
      status: "connected",
      message: "Datalastic connection successful.",
      testedAt,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown connection error";
    return {
      provider: "datalastic",
      status: "error",
      message: `Datalastic test error: ${message}`,
      testedAt,
    };
  }
}

async function testGlobalFishingWatch(key: string): Promise<ProviderTestResult> {
  const testedAt = new Date().toISOString();
  const url =
    "https://gateway.api.globalfishingwatch.org/v3/events?datasets[0]=public-global-port-visits:latest&limit=1";

  try {
    const response = await fetchWithTimeout(
      url,
      {
        headers: {
          Authorization: `Bearer ${key}`,
        },
      },
      10_000,
    );

    if (response.status === 401 || response.status === 403) {
      return {
        provider: "globalFishingWatch",
        status: "invalid",
        message: "GFW token rejected (unauthorized).",
        testedAt,
      };
    }

    if (!response.ok) {
      return {
        provider: "globalFishingWatch",
        status: "error",
        message: `GFW test failed (${response.status}).`,
        testedAt,
      };
    }

    return {
      provider: "globalFishingWatch",
      status: "connected",
      message: "Global Fishing Watch connection successful.",
      testedAt,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown connection error";
    return {
      provider: "globalFishingWatch",
      status: "error",
      message: `GFW test error: ${message}`,
      testedAt,
    };
  }
}

function basicConfiguredResult(provider: ProviderId, label: string): ProviderTestResult {
  return {
    provider,
    status: "connected",
    message: `${label} key configured.`,
    testedAt: new Date().toISOString(),
  };
}

export async function testProviderConnection(
  provider: ProviderId,
  inputKey?: string,
): Promise<ProviderTestResult> {
  const key = inputKey?.trim() || getProviderApiKey(provider);
  if (!hasValue(key)) {
    return {
      provider,
      status: "missing_key",
      message: "Missing API key.",
      testedAt: new Date().toISOString(),
    };
  }

  if (!looksValidApiKey(provider, key)) {
    return {
      provider,
      status: "invalid",
      message: defaultInvalidMessage(provider),
      testedAt: new Date().toISOString(),
    };
  }

  if (provider === "datalastic") {
    return testDatalastic(key);
  }

  if (provider === "globalFishingWatch") {
    return testGlobalFishingWatch(key);
  }

  if (provider === "aisstream") {
    return basicConfiguredResult(provider, "AISStream");
  }

  if (provider === "vesselfinder") {
    return basicConfiguredResult(provider, "VesselFinder");
  }

  return basicConfiguredResult(provider, "MarineTraffic");
}
