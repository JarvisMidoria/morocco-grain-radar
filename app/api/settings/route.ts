import { NextRequest, NextResponse } from "next/server";
import { resetAISProviderCache } from "@/lib/ais/factory";
import {
  getPublicRadarSettings,
  ThemePreference,
  updateRadarSettings,
} from "@/lib/settings/store";

export const dynamic = "force-dynamic";

interface SettingsUpdatePayload {
  appearance?: {
    theme?: ThemePreference;
  };
  core?: {
    radarDataMode?: "mock" | "live" | "hybrid";
    refreshIntervalSeconds?: number;
    rollingWindowHours?: number;
    watchlistRetentionHours?: number;
    reEnrichmentCadenceHours?: number;
  };
  providers?: Record<
    string,
    {
      enabled?: boolean;
      apiKey?: string;
    }
  >;
}

function normalizeProviders(payload: SettingsUpdatePayload["providers"]) {
  if (!payload) {
    return undefined;
  }

  return {
    aisstream: payload.aisstream,
    globalFishingWatch: payload.globalFishingWatch,
    vesselfinder: payload.vesselfinder,
    datalastic: payload.datalastic,
    marinetraffic: payload.marinetraffic,
  };
}

export async function GET() {
  return NextResponse.json({
    settings: getPublicRadarSettings(),
  });
}

export async function POST(request: NextRequest) {
  const payload = (await request.json()) as SettingsUpdatePayload;

  const updated = updateRadarSettings({
    appearance: payload.appearance,
    core: payload.core,
    providers: normalizeProviders(payload.providers),
  });

  resetAISProviderCache();

  const response = NextResponse.json({
    ok: true,
    settings: getPublicRadarSettings(),
  });

  response.cookies.set("radar_theme", updated.appearance.theme, {
    path: "/",
    httpOnly: false,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 365,
  });

  return response;
}
